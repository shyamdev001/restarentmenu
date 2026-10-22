import { Category, Dish, Image, Order, ServiceCall, getSettings } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { createOrder, toPublicOrder } from '../services/order.service.js';
import { realtime } from '../services/socket.js';
import { push, publicKey, removeSubscription, renewSubscription, saveSubscription } from '../services/push.js';
import { assertTable, openOrders } from '../services/tables.js';
import { ordersAhead, publicGame, rate, spin, tableSpins } from '../services/waiting.js';

/** GET /api/menu : everything the customer app needs in one request. */
export const getMenu = asyncHandler(async (_req, res) => {
  const [settings, categories, dishes] = await Promise.all([
    getSettings(),
    Category.find().sort({ sort: 1, name: 1 }),
    Dish.find().sort({ sort: 1, name: 1 })
  ]);
  const { name, tagline, welcome, currency, taxPercent, tables, requireQr } = settings;
  res.set('Cache-Control', 'no-store');
  res.json({ settings: { name, tagline, welcome, currency, taxPercent, tables, requireQr, game: publicGame(settings) }, categories, dishes });
});

/** POST /api/orders */
export const placeOrder = asyncHandler(async (req, res) => {
  const { order, created } = await createOrder(req.body);
  // A retried send gets the first order back, and the kitchen is not told twice.
  if (created) {
    realtime.orderCreated(order.toJSON());
    push.orderCreated(order.toJSON());
  }
  res.status(created ? 201 : 200).json(toPublicOrder(order));
});

/** GET /api/orders?ids=a,b,c : a customer re-reading their own orders. */
export const getOrders = asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter((id) => /^[a-f0-9]{24}$/.test(id)).slice(-30);
  const orders = ids.length ? await Order.find({ publicId: { $in: ids } }).sort({ createdAt: 1 }) : [];
  const spins = await tableSpins(orders);
  // For an order still in the kitchen, say how many the cooks will reach first; and whether the table has had its spin.
  res.json(await Promise.all(orders.map(async (o) => ({
    ...toPublicOrder(o),
    ahead: ['new', 'cooking'].includes(o.status) ? await ordersAhead(o) : 0,
    tableSpin: spins.get(o.visit) || null
  }))));
});

/** POST /api/calls : "call a server" or "bring the bill". */
export const createCall = asyncHandler(async (req, res) => {
  const { table, type, code } = req.body;
  await assertTable(table, code, await getSettings());
  // One open call of each type per table is enough. Created in a single step, so
  // two phones asking in the same instant still make only one.
  const result = await ServiceCall.findOneAndUpdate(
    { table, type, status: 'open' },
    { $setOnInsert: { table, type, status: 'open' } },
    { upsert: true, new: true, includeResultMetadata: true }
  ).catch((err) => { if (err?.code === 11000) return null; throw err; });
  if (result?.lastErrorObject?.upserted) {
    realtime.callCreated(result.value.toJSON());
    push.callCreated(result.value.toJSON());
  }
  res.status(201).json({ ok: true });
});

/* ------------------------------ Push notifications ---------------------------- */
/** GET /api/push/key : the public key a browser needs to subscribe. */
export const pushKey = asyncHandler(async (_req, res) => res.json({ publicKey: await publicKey() }));

/** POST /api/push/subscribe : a guest's phone asks to hear about its orders and its table. */
export const pushSubscribe = asyncHandler(async (req, res) => {
  await saveSubscription({ ...req.body, role: 'guest' });
  res.status(201).json({ ok: true });
});

/** POST /api/push/renew : the browser swapped its push address; keep listening for the same things. */
export const pushRenew = asyncHandler(async (req, res) => {
  res.json({ ok: await renewSubscription(req.body) });
});

export const pushUnsubscribe = asyncHandler(async (req, res) => {
  await removeSubscription(req.body.endpoint);
  res.json({ ok: true });
});

/* ----------------------------------- Tables ----------------------------------- */
/** GET /api/tables/:table/bill?code= : everything the table has ordered and not yet paid for. */
export const tableBill = asyncHandler(async (req, res) => {
  const table = Number.parseInt(req.params.table, 10);
  if (!Number.isInteger(table) || table < 1) throw ApiError.badRequest('Unknown table.');
  await assertTable(table, req.query.code, await getSettings());
  const orders = await openOrders(table);
  res.set('Cache-Control', 'no-store');
  // No order ids here: seeing the table's bill does not let one phone follow another's order.
  res.json(orders.map((o) => ({ ...toPublicOrder(o), id: undefined })));
});

/** GET /uploads/:name : a dish photo kept in the database. */
export const serveImage = asyncHandler(async (req, res) => {
  const image = /^[a-f0-9]{24}(-s)?\.(jpg|png|webp)$/.test(req.params.name) ? await Image.findOne({ name: req.params.name }) : null;
  if (!image) return res.status(404).json({ message: 'Not found.' });
  res.set('Cache-Control', 'public, max-age=604800, immutable').type(image.type).send(image.data);
});

/* -------------------------------- While you wait ------------------------------- */
/** POST /api/orders/:id/spin : the table's one spin of the wheel. The server picks the prize. */
export const spinWheel = asyncHandler(async (req, res) => {
  const { order, index } = await spin(req.params.id);
  realtime.orderUpdated(order.toJSON(), toPublicOrder(order)); // staff see the prize on the order
  res.json({ index, order: toPublicOrder(order) });
});

/** POST /api/orders/:id/rating : stars and an optional line, once the meal has been served. */
export const rateOrder = asyncHandler(async (req, res) => {
  const order = await rate(req.params.id, req.body);
  realtime.orderUpdated(order.toJSON(), toPublicOrder(order));
  res.json(toPublicOrder(order));
});
