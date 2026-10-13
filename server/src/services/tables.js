import crypto from 'node:crypto';
import { Order, Secret } from '../models/index.js';
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

const VISIT_MS = 12 * 3600 * 1000;
const QUIET_MS = 3 * 3600 * 1000;

let lastSweep = 0;
/**
 * If staff forget to mark a table as paid, close it once everything was served
 * and nothing has happened there for three hours. Otherwise the next guests at
 * that table would open the bill and see the previous party's meal.
 */
export async function closeQuietTables(now = Date.now()) {
  if (now - lastSweep < 60 * 1000) return;
  lastSweep = now;
  const quiet = await Order.aggregate([
    { $match: { settled: false } },
    { $group: {
      _id: '$table', last: { $max: '$updatedAt' },
      active: { $sum: { $cond: [{ $in: ['$status', ['new', 'cooking', 'ready']] }, 1, 0] } }
    } },
    { $match: { active: 0, last: { $lt: new Date(now - QUIET_MS) } } }
  ]);
  if (quiet.length) await Order.updateMany({ settled: false, table: { $in: quiet.map((t) => t._id) } }, { settled: true });
}

/** Everything a table has ordered and not yet paid for, whichever phone it came from. */
export async function openOrders(table) {
  await closeQuietTables();
  return Order.find({
    table, settled: false, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(Date.now() - VISIT_MS) }
  }).sort({ createdAt: 1 });
}

/** One line per table that still has an unpaid order, for the admin board. */
export async function openTables() {
  await closeQuietTables();
  const rows = await Order.aggregate([
    { $match: { settled: false, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(Date.now() - VISIT_MS) } } },
    { $group: {
      _id: '$table', orders: { $sum: 1 }, total: { $sum: '$total' },
      active: { $sum: { $cond: [{ $in: ['$status', ['new', 'cooking', 'ready']] }, 1, 0] } }
    } },
    { $sort: { _id: 1 } }
  ]);
  return rows.map((r) => ({ table: r._id, orders: r.orders, total: Math.round(r.total * 100) / 100, active: r.active }));
}

/** The table has paid: close its orders so the next guests start clean. */
export async function settleTable(table) {
  const active = await Order.countDocuments({ table, settled: false, status: { $in: ['new', 'cooking', 'ready'] } });
  if (active) throw ApiError.conflict(`${table === 0 ? 'The counter' : 'Table ' + table} still has an order in the kitchen.`);
  const result = await Order.updateMany({ table, settled: false }, { settled: true });
  return result.modifiedCount;
}
