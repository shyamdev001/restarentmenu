import crypto from 'node:crypto';
import { Order, Setting, getSettings } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * What a guest can do while their food is being made: see how many orders are
 * ahead of theirs, spin the wheel for a prize the owner has set, and rate the
 * meal once it is on the table.
 */

/** The prizes a new restaurant starts with. The wheel itself stays off until the owner switches it on. */
export const DEFAULT_PRIZES = [
  { label: 'Free masala chai', weight: 2, win: true },
  { label: 'Not this time', weight: 5, win: false },
  { label: '10% off dessert', weight: 2, win: true },
  { label: 'So close', weight: 5, win: false },
  { label: 'Free papad basket', weight: 2, win: true },
  { label: 'Next time', weight: 5, win: false }
];

/** The wheel as stored, with the starting prizes filled in when the owner has never touched it. */
export function gameOf(settings) {
  const prizes = settings.game?.prizes?.length ? settings.game.prizes : DEFAULT_PRIZES;
  return { on: !!settings.game?.on, prizes: prizes.map((p) => ({ label: p.label, weight: p.weight, win: !!p.win })) };
}

/** What a guest's phone is told about the wheel: the labels in order, never the odds. */
export function publicGame(settings) {
  const game = gameOf(settings);
  return { on: game.on, prizes: game.prizes.map((p) => ({ label: p.label, win: p.win })) };
}

export async function saveGame({ on, prizes }) {
  const settings = await Setting.findOneAndUpdate({ key: 'main' }, { game: { on, prizes } }, { new: true, upsert: true, runValidators: true });
  return gameOf(settings);
}

/** How many orders the kitchen will reach before this one. */
export const ordersAhead = (order) => Order.countDocuments({ status: { $in: ['new', 'cooking'] }, createdAt: { $lt: order.createdAt } });

const mine = async (publicId) => {
  const order = /^[a-f0-9]{24}$/.test(publicId) ? await Order.findOne({ publicId }) : null;
  if (!order) throw ApiError.notFound('Order not found.');
  return order;
};

/**
 * Spin the wheel. The server picks the prize, so a phone cannot choose its own,
 * and a table gets one spin per visit however many orders or phones it has.
 * Returns { order, index } where index is the segment the wheel must stop on.
 */
export async function spin(publicId) {
  const order = await mine(publicId);
  const game = gameOf(await getSettings());
  if (!game.on) throw new ApiError(403, 'The wheel is not running today.');
  if (order.status === 'cancelled') throw ApiError.conflict('This order was cancelled.');

  // Claim the table's one spin in a single step, so two phones tapping together cannot both win.
  const first = await Order.findOne({ table: order.table, settled: false, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 });
  const claimed = await Order.findOneAndUpdate({ _id: first._id, spunAt: { $exists: false } }, { spunAt: new Date() }, { new: true });
  if (!claimed) throw ApiError.conflict('Your table has already had its spin this visit.');

  const total = game.prizes.reduce((n, p) => n + p.weight, 0);
  let pick = crypto.randomInt(total);
  let index = 0;
  while (pick >= game.prizes[index].weight) { pick -= game.prizes[index].weight; index += 1; }
  const prize = game.prizes[index];

  const saved = await Order.findOneAndUpdate(
    { _id: order._id },
    { spunAt: claimed.spunAt, prize: { label: prize.label, win: prize.win } },
    { new: true }
  );
  return { order: saved, index };
}

/** Rate the meal, once, after it has been served. */
export async function rate(publicId, { stars, comment }) {
  const order = await mine(publicId);
  if (order.status !== 'served') throw ApiError.conflict('You can rate your meal once it has been served.');
  const saved = await Order.findOneAndUpdate(
    { _id: order._id, 'rating.stars': { $exists: false } },
    { rating: { stars, comment, at: new Date() } },
    { new: true }
  );
  if (!saved) throw ApiError.conflict('Thank you, you have already rated this order.');
  return saved;
}
