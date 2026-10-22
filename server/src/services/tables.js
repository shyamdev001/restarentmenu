import crypto from 'node:crypto';
import { Order, Secret, ServiceCall, TableVisit } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Tables. Each table's QR code carries a short code that only this server can
 * make, so an order can prove it came from a scan of that table's card and not
 * from someone typing a table number into the address bar.
 */

let secret = null;

/** The key the codes are made from: created once, kept in the database so printed QR codes stay valid. */
async function tableSecret() {
  if (!secret) {
    let doc = await Secret.findOne({ key: 'tables' });
    if (!doc) {
      doc = await Secret.create({ key: 'tables', value: crypto.randomBytes(32).toString('hex') })
        .catch(() => Secret.findOne({ key: 'tables' })); // another request created it first
    }
    secret = doc.value;
  }
  return secret;
}

export async function tableCode(table) {
  return crypto.createHmac('sha256', await tableSecret()).update(String(table)).digest('base64url').slice(0, 10);
}

/** Throws unless the table exists and, when the restaurant requires it, the QR code matches. */
export async function assertTable(table, code, settings) {
  if (table > settings.tables) throw ApiError.badRequest(`Table ${table} does not exist.`);
  if (!settings.requireQr) return;
  const want = Buffer.from(await tableCode(table));
  const got = Buffer.from(typeof code === 'string' ? code : '');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    throw new ApiError(403, 'Please scan the QR code on your table to order.');
  }
}

const VISIT_MS = 12 * 3600 * 1000;  // nothing older than this is part of anyone's bill
const GAP_MS = 90 * 60 * 1000;      // a table with everything served and nothing new for this long has a new party
const LIVE = ['new', 'cooking', 'ready'];

/**
 * Visits. Each party at a table is one visit: every phone at the table shares
 * it, so they share one bill and one spin of the wheel. A visit ends when staff
 * mark the table paid. If they forget, it also ends once everything has been
 * served and the table has been quiet for 90 minutes, so the next party never
 * sees the last one's meal; those orders stay on the staff board as unpaid
 * until someone marks them paid.
 *
 * The table's current visit is kept in one small document per table, changed
 * only by compare-and-swap, so two phones ordering first at the same moment
 * still join the same visit.
 */
const newVisitId = () => crypto.randomBytes(8).toString('hex');

/** The visit sitting at the table now, or null if the table is free. */
export async function liveVisit(table, now = Date.now()) {
  const state = await TableVisit.findOne({ table });
  if (!state?.visit) return null;
  const orders = await Order.find({ table, visit: state.visit, settled: false, status: { $ne: 'cancelled' } }, 'status updatedAt');
  if (orders.some((o) => LIVE.includes(o.status))) return state.visit;
  const last = Math.max(state.openedAt.getTime(), ...orders.map((o) => o.updatedAt.getTime()));
  return now - last < GAP_MS ? state.visit : null;
}

/** The visit a new order joins: the party at the table, or a new one. The counter's orders are each their own. */
export async function visitFor(table, now = Date.now()) {
  if (table === 0) return newVisitId();
  const live = await liveVisit(table, now);
  if (live) return live;
  const before = (await TableVisit.findOne({ table }))?.visit ?? null;
  try {
    const won = await TableVisit.findOneAndUpdate(
      { table, visit: before },
      { visit: newVisitId(), openedAt: new Date(now) },
      { upsert: true, new: true }
    );
    return won.visit;
  } catch (err) {
    // Another phone opened the visit a moment earlier: join theirs.
    if (err?.code === 11000) return (await TableVisit.findOne({ table })).visit;
    throw err;
  }
}

/** The table is free: the next order starts a new visit. */
const endVisit = (table) => TableVisit.updateOne({ table }, { visit: null });

/** The current party's orders: what a guest's bill shows, whichever phone each came from. */
export async function openOrders(table) {
  const visit = await liveVisit(table);
  if (!visit) return [];
  return Order.find({ table, visit, settled: false, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 });
}

/** One line per table that still has an unpaid order, for the admin board. */
export async function openTables() {
  const rows = await Order.aggregate([
    { $match: { settled: false, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(Date.now() - VISIT_MS) } } },
    { $group: {
      _id: '$table', orders: { $sum: 1 }, total: { $sum: '$total' },
      visits: { $addToSet: '$visit' },
      active: { $sum: { $cond: [{ $in: ['$status', LIVE] }, 1, 0] } }
    } },
    { $sort: { _id: 1 } }
  ]);
  return rows.map((r) => ({
    table: r._id, orders: r.orders, total: Math.round(r.total * 100) / 100, active: r.active,
    parties: r._id === 0 ? 1 : r.visits.length   // more than one: an earlier party left without being marked paid
  }));
}

/** Everything a table has not paid for, for the printed bill. */
export const unpaidOrders = (table) => Order.find({
  table, settled: false, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(Date.now() - VISIT_MS) }
}).sort({ createdAt: 1 });

/** The table has paid, by cash, UPI or card: close its orders so the next guests start clean. */
export async function settleTable(table, method) {
  const active = await Order.countDocuments({ table, settled: false, status: { $in: LIVE } });
  if (active) throw ApiError.conflict(`${table === 0 ? 'The counter' : 'Table ' + table} still has an order in the kitchen.`);
  // Cancelled orders were never paid for, so they only close; the rest record how the bill was paid.
  await Order.updateMany({ table, settled: false, status: 'cancelled' }, { settled: true });
  const result = await Order.updateMany({ table, settled: false }, { settled: true, paidBy: method, paidAt: new Date() });
  await endVisit(table);
  return result.modifiedCount;
}

/**
 * The party has moved to another table. Their unpaid orders go with them and
 * join whoever is already at the new table; open calls follow too.
 */
export async function moveTable(from, to, settings) {
  if (from === to) throw ApiError.badRequest('That is the same table.');
  if (!Number.isInteger(to) || to < 1 || to > settings.tables) throw ApiError.badRequest(`Table ${to} does not exist.`);
  const orders = await unpaidOrders(from);
  if (!orders.length) throw ApiError.notFound(`Table ${from} has nothing open to move.`);
  const visit = await visitFor(to);
  await Order.updateMany({ _id: { $in: orders.map((o) => o._id) } }, { table: to, visit });
  await endVisit(from);
  for (const call of await ServiceCall.find({ table: from, status: 'open' })) {
    // The new table may already have the same request open: then this one is answered by it.
    await ServiceCall.updateOne({ _id: call._id }, { table: to }).catch(() => ServiceCall.updateOne({ _id: call._id }, { status: 'done' }));
  }
  return Order.find({ _id: { $in: orders.map((o) => o._id) } });
}

/**
 * Orders placed before visits existed: give each table's open orders one
 * visit, so their bills carry on as they were. Runs once at start-up and is
 * quick when there is nothing to do.
 */
export async function adoptOldOrders() {
  const tables = await Order.distinct('table', {
    visit: { $exists: false }, settled: false, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(Date.now() - VISIT_MS) }, table: { $gt: 0 }
  });
  for (const table of tables) {
    const visit = await visitFor(table);
    await Order.updateMany({ table, visit: { $exists: false }, settled: false }, { visit });
  }
}
