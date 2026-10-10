import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import { Category, Dish, Image, Order, ServiceCall, Setting, getSettings } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { moveOrder, toPublicOrder } from '../services/order.service.js';
import { openTables, settleTable, tableCode } from '../services/tables.js';
import { realtime } from '../services/socket.js';
import { push, saveSubscription } from '../services/push.js';
import { IMAGE_TYPES, UPLOAD_DIR } from '../middleware/index.js';

const found = (doc, what) => { if (!doc) throw ApiError.notFound(`${what} not found.`); return doc; };

/* ---------------------------------- Orders ---------------------------------- */
export const listOrders = asyncHandler(async (req, res) => {
  const filter = req.query.active === '1' ? { status: { $in: ['new', 'cooking', 'ready'] } } : {};
  res.json(await Order.find(filter).sort({ createdAt: -1 }).limit(200));
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { order, changed } = await moveOrder(req.params.id, req.body.status);
  if (changed) {
    realtime.orderUpdated(order.toJSON(), toPublicOrder(order));
    push.orderUpdated(order.toJSON());
  }
  res.json(order);
});

/* ------------------------------- Tables and bills ------------------------------ */
/** GET /tables/open : tables with something ordered and not yet paid. */
export const listOpenTables = asyncHandler(async (_req, res) => res.json(await openTables()));

/** POST /tables/:table/settle : the table has paid. Its guests' phones start a fresh visit. */
export const settle = asyncHandler(async (req, res) => {
  const table = Number.parseInt(req.params.table, 10);
  if (!Number.isInteger(table) || table < 1) throw ApiError.badRequest('Unknown table.');
  const closed = await settleTable(table);
  realtime.tableSettled(table);
  res.json({ ok: true, closed });
});

/** GET /table-codes : the code inside each table's QR link. */
export const tableCodes = asyncHandler(async (_req, res) => {
  const { tables } = await getSettings();
  const codes = {};
  for (let n = 1; n <= tables; n += 1) codes[n] = await tableCode(n);
  res.json({ codes });
});

/* ----------------------------------- History ---------------------------------- */
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** GET /history : one line per day for the last 60 days that had orders. */
export const historyDays = asyncHandler(async (_req, res) => {
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const days = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ZONE } },
      orders: { $sum: 1 }, revenue: { $sum: '$total' }, plates: { $sum: { $sum: '$items.qty' } }
    } },
    { $sort: { _id: -1 } }
  ]);
  res.json(days.map((d) => ({ day: d._id, orders: d.orders, plates: d.plates, revenue: Math.round(d.revenue * 100) / 100 })));
});

/** GET /history/:day (YYYY-MM-DD) : every order placed that day. */
export const historyDay = asyncHandler(async (req, res) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(req.params.day);
  if (!match) throw ApiError.badRequest('Use a date like 2026-01-31.');
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const end = new Date(start); end.setDate(end.getDate() + 1);
  res.json(await Order.find({ createdAt: { $gte: start, $lt: end } }).sort({ createdAt: -1 }).limit(1000));
});

export const getStats = asyncHandler(async (_req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [today, active] = await Promise.all([
    Order.find({ createdAt: { $gte: start }, status: { $ne: 'cancelled' } }).select('total items.qty').lean(),
    Order.countDocuments({ status: { $in: ['new', 'cooking', 'ready'] } })
  ]);
  res.json({
    orders: today.length,
    revenue: Math.round(today.reduce((sum, o) => sum + (o.total || 0), 0) * 100) / 100,
    items: today.reduce((sum, o) => sum + o.items.reduce((n, i) => n + (i.qty || 0), 0), 0),
    active
  });
});

/* ----------------------------------- Calls ---------------------------------- */
export const listCalls = asyncHandler(async (_req, res) => {
  res.json(await ServiceCall.find({ status: 'open' }).sort({ createdAt: 1 }));
});

export const resolveCall = asyncHandler(async (req, res) => {
  const call = found(await ServiceCall.findByIdAndUpdate(req.params.id, { status: 'done' }, { new: true }), 'Call');
  realtime.callUpdated(call.toJSON());
  push.callAnswered(call.toJSON());
  res.json(call);
});

/** POST /api/admin/push/subscribe : this admin browser wants every new order and table call. */
export const pushSubscribe = asyncHandler(async (req, res) => {
  await saveSubscription({ subscription: req.body.subscription, role: 'admin' });
  res.status(201).json({ ok: true });
});

/* -------------------------------- Categories -------------------------------- */
export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  realtime.menuChanged();
  res.status(201).json(category);
});

/** PUT /categories/order : the whole list in its new order, saved in one step. */
export const reorderCategories = asyncHandler(async (req, res) => {
  await Category.bulkWrite(req.body.ids.map((id, sort) => ({ updateOne: { filter: { _id: id }, update: { sort } } })));
  realtime.menuChanged();
  res.json({ ok: true });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = found(await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }), 'Category');
  realtime.menuChanged();
  res.json(category);
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const inUse = await Dish.countDocuments({ category: req.params.id });
  if (inUse) throw ApiError.conflict(`Move or delete the ${inUse} dish(es) in this category first.`);
  found(await Category.findByIdAndDelete(req.params.id), 'Category');
  realtime.menuChanged();
  res.json({ ok: true });
});

/* ---------------------------------- Dishes ---------------------------------- */
async function assertCategory(id) {
  if (!(await Category.exists({ _id: id }))) throw ApiError.badRequest('Choose a category.');
}

export const createDish = asyncHandler(async (req, res) => {
  await assertCategory(req.body.category);
  const dish = await Dish.create(req.body);
  realtime.menuChanged();
  res.status(201).json(dish);
});

/** Remove an uploaded photo, wherever it is kept. The bundled sample images are left alone. */
async function removePhoto(url) {
  if (!url?.startsWith('/uploads/') || url.startsWith('/uploads/seed/')) return;
  const name = path.basename(url);
  await Promise.all([Image.deleteOne({ name }), fs.unlink(path.join(UPLOAD_DIR, name)).catch(() => {})]);
}

export const updateDish = asyncHandler(async (req, res) => {
  await assertCategory(req.body.category);
  const before = found(await Dish.findById(req.params.id), 'Dish');
  const dish = found(await Dish.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }), 'Dish');
  if (before.image !== dish.image) await removePhoto(before.image); // the old photo is no longer used
  realtime.menuChanged();
  res.json(dish);
});

/** PATCH /dishes/:id/availability : the one-tap "sold out" switch. */
export const setAvailability = asyncHandler(async (req, res) => {
  const dish = found(await Dish.findByIdAndUpdate(req.params.id, { available: !!req.body.available }, { new: true }), 'Dish');
  realtime.menuChanged();
  res.json(dish);
});

export const deleteDish = asyncHandler(async (req, res) => {
  const dish = found(await Dish.findByIdAndDelete(req.params.id), 'Dish');
  await removePhoto(dish.image);
  realtime.menuChanged();
  res.json({ ok: true });
});

export const uploadDishImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose an image.');
  const name = crypto.randomBytes(12).toString('hex') + IMAGE_TYPES[req.file.mimetype];
  await Image.create({ name, type: req.file.mimetype, data: req.file.buffer });
  res.status(201).json({ url: `/uploads/${name}` });
});

/* --------------------------------- Settings --------------------------------- */
export const readSettings = asyncHandler(async (_req, res) => res.json(await getSettings()));

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await Setting.findOneAndUpdate({ key: 'main' }, req.body, { new: true, upsert: true, runValidators: true });
  realtime.menuChanged();
  res.json(settings);
});

/** GET /qr/:table : an SVG QR code that opens the menu for that table. */
export const tableQr = asyncHandler(async (req, res) => {
  const table = Number.parseInt(req.params.table, 10);
  const settings = await getSettings();
  if (!Number.isInteger(table) || table < 1 || table > settings.tables) throw ApiError.badRequest('Unknown table.');
  const base = (settings.publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  const url = `${base}/?table=${table}&k=${await tableCode(table)}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#170F0A', light: '#FFFFFF' } });
  res.type('image/svg+xml').set('X-Menu-Url', url).send(svg);
});
