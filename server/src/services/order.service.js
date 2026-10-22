import crypto from 'node:crypto';
import { Dish, Order, Setting, getSettings } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { assertTable, visitFor } from './tables.js';

/** What a customer is allowed to see of an order. */
export function toPublicOrder(order) {
  const o = order.toJSON ? order.toJSON() : order;
  return {
    id: o.publicId, number: o.number, table: o.table, status: o.status, settled: !!o.settled,
    items: o.items.map(({ name, qty, unitPrice, spice, addons, note, lineTotal }) => ({ name, qty, unitPrice, spice, addons, note, lineTotal })),
    subtotal: o.subtotal, taxPercent: o.taxPercent, tax: o.tax, total: o.total,
    etaMin: o.etaMin, createdAt: o.createdAt,
    // While-you-wait: whether the table has spun, what it won, and the guest's rating.
    spun: !!o.spunAt, prize: o.prize?.label ? { label: o.prize.label, win: !!o.prize.win } : null,
    stars: o.rating?.stars || 0
  };
}

const MAX_WAITING = 6;  // unstarted guest orders a table may have at once

/** The steps an order may take. Nothing moves backwards, and a finished order stays finished. */
const MAY_COME_FROM = {
  cooking: ['new'],
  ready: ['cooking'],
  served: ['ready'],
  cancelled: ['new', 'cooking']
};

/**
 * Move an order on. Two staff tapping at once cannot undo each other: the
 * change only happens if the order is still where the tap expected it to be.
 * Returns { order, changed }.
 */
export async function moveOrder(id, next, by = '') {
  const from = MAY_COME_FROM[next];
  if (!from) throw ApiError.badRequest('An order cannot be moved back to new.');

  const at = new Date();
  const order = await Order.findOneAndUpdate(
    { _id: id, status: { $in: from } },
    { status: next, [next + 'At']: at, $push: { trail: { status: next, by, at } } },
    { new: true }
  );
  if (order) return { order, changed: true };

  const current = await Order.findById(id);
  if (!current) throw ApiError.notFound('Order not found.');
  if (current.status === next) return { order: current, changed: false }; // the same tap twice
  throw ApiError.conflict(`Order #${current.number} is already ${current.status}, so it cannot be marked ${next}.`);
}

/**
 * Build and save an order. Prices, add-ons and tax are always taken from the
 * database: nothing the browser sends about money is trusted.
 *
 *   clientKey  made by the phone for this basket. Sending the same basket twice
 *              (a retry on a bad connection) returns the first order instead of
 *              making a second one.
 *   expected   the subtotal the guest was shown. If the menu has changed since,
 *              the order is refused so they can look again before paying more.
 *
 *   staff      true when a signed-in member of staff entered it from the admin
 *              panel: no QR code is needed, and table 0 (the counter) is allowed.
 *
 * Returns { order, created }.
 */
export async function createOrder({ table, code, items, clientKey, expected }, { staff = false, by = '' } = {}) {
  const settings = await getSettings();
  if (staff) {
    if (table > settings.tables) throw ApiError.badRequest(`Table ${table} does not exist.`);
  } else {
    await assertTable(table, code, settings);
  }

  if (clientKey) {
    const earlier = await Order.findOne({ clientKey });
    if (earlier) return { order: earlier, created: false };
  }

  // Everyone at the table shares one visit: one bill, one spin of the wheel.
  const visit = await visitFor(table);
  // Guards against a flood of orders from a photo of a QR code: a real table rarely has this many waiting to be started.
  if (!staff) {
    const waiting = await Order.countDocuments({ table, visit, source: 'guest', status: 'new' });
    if (waiting >= MAX_WAITING) throw new ApiError(429, `Your table already has ${waiting} orders waiting for the kitchen. Please wait for them to start, or ask your server.`);
  }

  const dishes = await Dish.find({ _id: { $in: items.map((i) => i.dishId) } });
  const byId = new Map(dishes.map((d) => [String(d._id), d]));

  let etaMin = 0;
  const lines = items.map((item) => {
    const dish = byId.get(item.dishId);
    if (!dish) throw ApiError.conflict('A dish in your order is no longer on the menu. Please review your order.');
    const name = `${dish.name} ${dish.accent}`.trim();
    if (!dish.available) throw ApiError.conflict(`${name} is sold out.`);

    const addons = dish.addons.filter((a) => item.addons.includes(a.name)).map((a) => ({ name: a.name, price: a.price }));
    if (addons.length !== new Set(item.addons).size) {
      throw ApiError.conflict(`An extra you chose with ${name} is no longer offered. Please review your order.`);
    }
    const unitPrice = dish.price + addons.reduce((sum, a) => sum + a.price, 0);
    etaMin = Math.max(etaMin, dish.prepMin);
    return {
      dish: dish._id, name,
      qty: item.qty, unitPrice, spice: item.spice, addons, note: item.note,
      lineTotal: unitPrice * item.qty
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (typeof expected === 'number' && Math.abs(expected - subtotal) > 0.005) {
    throw ApiError.conflict(`Prices have changed since you chose these dishes. The new total is ${settings.currency}${subtotal} before tax. Please review and send again.`);
  }

  const tax = Math.round(subtotal * settings.taxPercent) / 100;
  const counter = await Setting.findOneAndUpdate({ key: 'main' }, { $inc: { orderCounter: 1 } }, { new: true });

  try {
    const order = await Order.create({
      publicId: crypto.randomBytes(12).toString('hex'),
      number: counter.orderCounter,
      table, visit, items: lines, subtotal,
      taxPercent: settings.taxPercent, tax,
      total: Math.round((subtotal + tax) * 100) / 100,
      etaMin,
      source: staff ? 'staff' : 'guest',
      ...(staff && by ? { enteredBy: by } : {}),
      ...(clientKey ? { clientKey } : {})
    });
    return { order, created: true };
  } catch (err) {
    // Two copies of the same request arrived together: the other one won.
    if (err?.code === 11000 && clientKey) {
      const earlier = await Order.findOne({ clientKey });
      if (earlier) return { order: earlier, created: false };
    }
    throw err;
  }
}

/**
 * Staff take something off an order before it is finished: a guest changed
 * their mind, or a dish ran out. Only lowering quantities is allowed (more food
 * is a new order), the totals are worked out again, and if nothing is left the
 * order is cancelled. If the order moved on while staff were editing, nothing
 * is changed and they are asked to look again.
 *
 *   changes  [{ index, qty }]: the line in order.items and its new quantity (0 removes it).
 */
export async function trimOrder(id, changes, by = '') {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found.');
  if (!['new', 'cooking'].includes(order.status)) throw ApiError.conflict(`Order #${order.number} is already ${order.status}, so it can no longer be changed.`);

  const items = order.items.map((i) => i.toObject());
  for (const { index, qty } of changes) {
    const line = items[index];
    if (!line) throw ApiError.badRequest('That line is not on the order.');
    if (qty > line.qty) throw ApiError.badRequest('Only fewer can be taken off. Add more as a new order.');
    line.qty = qty;
    line.lineTotal = line.unitPrice * qty;
  }
  const kept = items.filter((i) => i.qty > 0);
  if (!kept.length) return moveOrder(id, 'cancelled', by);

  const subtotal = kept.reduce((sum, l) => sum + l.lineTotal, 0);
  const tax = Math.round(subtotal * order.taxPercent) / 100;
  const at = new Date();
  const saved = await Order.findOneAndUpdate(
    { _id: id, status: order.status, updatedAt: order.updatedAt },
    { items: kept, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100, $push: { trail: { status: 'edited', by, at } } },
    { new: true }
  );
  if (!saved) throw ApiError.conflict(`Order #${order.number} changed while you were editing. Please look at it again.`);
  return { order: saved, changed: true };
}
