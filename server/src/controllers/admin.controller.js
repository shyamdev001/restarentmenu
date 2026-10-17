import QRCode from 'qrcode';
import { Category, Dish, Order, ServiceCall, Setting, getSettings } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { createOrder, moveOrder, toPublicOrder } from '../services/order.service.js';
import { openTables, settleTable, tableCode } from '../services/tables.js';
import { buildReport, exportCsv, ordersIn, rangeOf, todayIn, zoneOf } from '../services/reports.js';
import { gameOf, saveGame } from '../services/waiting.js';
import { ROLES, STEP_NEEDS, addStaff, canDo, changeStaff, listStaff, removeStaff } from '../services/staff.js';
import { realtime } from '../services/socket.js';
import { push, saveSubscription } from '../services/push.js';
import { removePhoto, savePhoto } from '../services/photos.js';

const found = (doc, what) => { if (!doc) throw ApiError.notFound(`${what} not found.`); return doc; };

/* ---------------------------------- Orders ---------------------------------- */
export const listOrders = asyncHandler(async (req, res) => {
  const filter = req.query.active === '1' ? { status: { $in: ['new', 'cooking', 'ready'] } } : {};
  res.json(await Order.find(filter).sort({ createdAt: -1 }).limit(200));
});

/** POST /orders : staff enter an order themselves, for a guest who will not scan, a phone order or a takeaway. */
export const createStaffOrder = asyncHandler(async (req, res) => {
  const { order } = await createOrder(req.body, { staff: true, by: req.staff.name });
  realtime.orderCreated(order.toJSON());
  push.orderCreated(order.toJSON());
  res.status(201).json(order);
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  // Each step needs its own permission: the kitchen starts and finishes, a waiter serves, a manager cancels.
  const needs = STEP_NEEDS[req.body.status];
  if (needs && !canDo(req.staff.role, needs)) throw new ApiError(403, `Your role cannot mark orders ${req.body.status}. Ask the owner if you need it.`);
  const { order, changed } = await moveOrder(req.params.id, req.body.status, req.staff.name);
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
  if (!Number.isInteger(table) || table < 0) throw ApiError.badRequest('Unknown table.');
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

/* ------------------------------------ Staff ------------------------------------ */
export const staffList = asyncHandler(async (_req, res) => res.json({ staff: await listStaff(), roles: ROLES }));
export const staffAdd = asyncHandler(async (req, res) => res.status(201).json(await addStaff(req.body)));
export const staffChange = asyncHandler(async (req, res) => res.json(await changeStaff(req.params.id, req.body, req.staff.id)));
export const staffRemove = asyncHandler(async (req, res) => { await removeStaff(req.params.id, req.staff.id); res.json({ ok: true }); });

/* ----------------------------------- History ---------------------------------- */
/** GET /history?tz= : one line per day for the last 60 days that had orders. */
export const historyDays = asyncHandler(async (req, res) => {
  const zone = zoneOf(req.query.tz);
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const days = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: zone } },
      orders: { $sum: 1 }, revenue: { $sum: '$total' }, plates: { $sum: { $sum: '$items.qty' } }
    } },
    { $sort: { _id: -1 } }
  ]);
  res.json(days.map((d) => ({ day: d._id, orders: d.orders, plates: d.plates, revenue: Math.round(d.revenue * 100) / 100 })));
});

/** GET /history/:day?tz= (YYYY-MM-DD) : every order placed that day. */
export const historyDay = asyncHandler(async (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.day)) throw ApiError.badRequest('Use a date like 2026-01-31.');
  const orders = await ordersIn({ from: req.params.day, to: req.params.day, zone: zoneOf(req.query.tz) }, 1000);
  res.json(orders.map(({ _id, __v, day, hour, ...order }) => ({ ...order, id: String(_id) })));
});

export const getStats = asyncHandler(async (req, res) => {
  // "Today" is the restaurant's day (its time zone comes from the admin's browser), not the server's.
  const zone = zoneOf(req.query.tz);
  const day = todayIn(zone);
  const [report, active] = await Promise.all([
    buildReport({ from: day, to: day, zone }),
    Order.countDocuments({ status: { $in: ['new', 'cooking', 'ready'] } })
  ]);
  res.json({ orders: report.totals.orders, revenue: report.totals.revenue, items: report.totals.plates, active });
});

/* ----------------------------------- Reports ---------------------------------- */
/** GET /reports?from=&to=&tz= : sales, busiest hours and best sellers for a range of days. */
export const report = asyncHandler(async (req, res) => res.json(await buildReport(rangeOf(req.query))));

/** GET /reports/export?kind=orders|dishes|days&from=&to=&tz= : the range as a spreadsheet file. */
export const reportCsv = asyncHandler(async (req, res) => {
  const range = rangeOf(req.query);
  const kind = ['orders', 'dishes', 'days'].includes(req.query.kind) ? req.query.kind : 'orders';
  res.set('Content-Disposition', `attachment; filename="${kind}-${range.from}-to-${range.to}.csv"`)
    .type('text/csv').send('\uFEFF' + await exportCsv(range, kind)); // the mark makes Excel read accents correctly
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
  // Whatever was uploaded is stored as WebP, in a large and a small size.
  res.status(201).json({ url: await savePhoto(req.file.buffer) });
});

/* --------------------------------- Settings --------------------------------- */
export const readSettings = asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  res.json({ ...settings.toJSON(), game: gameOf(settings) });
});

/** PUT /settings/game : switch the wheel on or off and set its prizes. Guests see the change at once. */
export const updateGame = asyncHandler(async (req, res) => {
  const game = await saveGame(req.body);
  realtime.menuChanged();
  res.json(game);
});

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
