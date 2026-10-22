import crypto from 'node:crypto';
import { Guest, Order, getSettings } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { sendTo } from './push.js';

/**
 * The guest club: guests who chose to leave their name and WhatsApp number so
 * the restaurant can send them offers, remind them to come back, and keep a
 * stamp card. Nobody is added without ticking the box themselves, and leaving
 * deletes them (India's DPDP Act asks for both).
 *
 * A phone that joined keeps a private key, so on that phone the guest's
 * orders are linked to them without asking again. A visit is counted, and a
 * stamp given, when the table is marked paid.
 */

export const ZONE = process.env.RESTAURANT_TZ || 'Asia/Kolkata';
const newKey = () => crypto.randomBytes(12).toString('hex');

/** Mobile numbers in one form: country code and digits. A 10-digit number is taken as Indian. */
export function normalisePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  if (digits.startsWith('91') && !/^91[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const personal = (text, guest) => String(text || '').replaceAll('{name}', firstName(guest.name));

/** The club and loyalty settings, with defaults for a restaurant that never opened them. */
export function clubOf(settings) {
  const c = settings.club || {};
  return {
    on: c.on !== false,
    loyalty: c.loyalty !== false,
    stamps: c.stamps || 5,
    reward: c.reward || 'A dessert on us',
    minSpend: c.minSpend || 0,
    remind: !!c.remind,
    remindDays: c.remindDays || 30,
    missYou: c.missYou || 'We miss you, {name}! Come back this week and the chai is on us.',
    birthday: c.birthday || 'Happy birthday, {name}! Visit us this month for a treat on the house.'
  };
}

/** What the guest's own phone shows: their stamp card. Only the first name, never the number. */
export function cardOf(guest, settings) {
  const club = clubOf(settings);
  return {
    name: firstName(guest.name), visits: guest.visits, stamps: guest.stamps, rewardsReady: guest.rewardsReady,
    target: club.stamps, reward: club.reward, loyalty: club.loyalty, minSpend: club.minSpend,
    offers: !!guest.offers?.endpoint
  };
}

/** How staff see a guest. The phone keys and push address stay on the server. */
export const staffView = (g, favourite = '') => ({
  id: String(g._id), name: g.name, phone: g.phone, birthday: g.birthday?.day ? g.birthday : null,
  visits: g.visits, spent: Math.round(g.spent * 100) / 100, lastVisitAt: g.lastVisitAt || null,
  stamps: g.stamps, rewardsReady: g.rewardsReady, rewardsUsed: g.rewardsUsed,
  offers: !!g.offers?.endpoint, joinedAt: g.createdAt, favourite
});

/**
 * Count each visit once for each club member who ordered in it: the visit,
 * what they spent, and a stamp when the visit reached the minimum spend.
 * Safe to call more than once for the same orders.
 */
export async function creditOrders(orders) {
  const mine = orders.filter((o) => o.guest && o.status !== 'cancelled');
  if (!mine.length) return;
  const settings = await getSettings();
  const club = clubOf(settings);
  const groups = new Map();
  for (const o of mine) {
    const key = `${o.guest}|${o.visit || o.publicId}`;
    const group = groups.get(key) || { guest: o.guest, visit: o.visit || o.publicId, total: 0, at: o.paidAt || o.updatedAt || new Date() };
    group.total += o.total;
    groups.set(key, group);
  }
  for (const g of groups.values()) {
    const stamp = club.loyalty && g.total >= club.minSpend ? 1 : 0;
    const guest = await Guest.findOneAndUpdate(
      { _id: g.guest, seenVisits: { $ne: g.visit } },
      { $push: { seenVisits: { $each: [g.visit], $slice: -300 } }, $inc: { visits: 1, spent: g.total, stamps: stamp }, $max: { lastVisitAt: g.at } },
      { new: true }
    );
    if (!guest || !stamp) continue;
    // A full card becomes a reward ready to use, and the card starts again.
    const full = guest.stamps >= club.stamps
      ? await Guest.findOneAndUpdate({ _id: guest._id, stamps: { $gte: club.stamps } }, { $inc: { stamps: -club.stamps, rewardsReady: 1 } }, { new: true })
      : null;
    const now = full || guest;
    if (now.offers?.endpoint) {
      await notify(now, full
        ? { title: 'Your reward is ready', body: `${club.reward}. Show your card to your server on your next visit.`, tag: 'club-card' }
        : { title: `Stamp ${now.stamps} of ${club.stamps}`, body: `${club.stamps - now.stamps} more ${club.stamps - now.stamps === 1 ? 'visit' : 'visits'} for ${club.reward.toLowerCase()}.`, tag: 'club-card' });
    }
  }
}

/** Push to one member's phone. A dropped subscription is forgotten. */
async function notify(guest, message) {
  const status = await sendTo(guest.offers, { ...message, url: '/?club=card' });
  if (status === 'gone') await Guest.updateOne({ _id: guest._id }, { $unset: { offers: 1 } });
  return status === 'sent';
}

/**
 * A guest joins (or a member joins from another phone). Their orders on this
 * phone are linked to them, and any visit already paid for is counted.
 */
export async function join({ name, phone, birthday, orders = [], subscription }) {
  const settings = await getSettings();
  if (!clubOf(settings).on) throw new ApiError(403, 'The guest club is not open.');
  const number = normalisePhone(phone);
  if (!number) throw ApiError.badRequest('Please enter a valid mobile number.');
  const key = newKey();
  const now = new Date();
  const update = {
    $setOnInsert: { name, phone: number, consentAt: now, ...(birthday?.day ? { birthday } : {}) },
    $push: { keys: { $each: [key], $slice: -5 } },
    ...(subscription ? { $set: { offers: subscription } } : {})
  };
  let guest;
  let fresh;
  try {
    const before = await Guest.exists({ phone: number });
    guest = await Guest.findOneAndUpdate({ phone: number }, update, { upsert: true, new: true });
    fresh = !before;
  } catch (err) {
    if (err?.code !== 11000) throw err;
    guest = await Guest.findOneAndUpdate({ phone: number }, { $push: update.$push, ...(update.$set ? { $set: update.$set } : {}) }, { new: true });
    fresh = false;
  }
  if (orders.length) {
    await Order.updateMany({ publicId: { $in: orders }, guest: { $exists: false } }, { guest: guest._id });
    await creditOrders(await Order.find({ publicId: { $in: orders }, guest: guest._id, settled: true }));
    guest = await Guest.findById(guest._id);
  }
  return { key, welcomeBack: !fresh, card: cardOf(guest, settings) };
}

const memberBy = async (key) => {
  const guest = /^[a-f0-9]{24}$/.test(key || '') ? await Guest.findOne({ keys: key }) : null;
  if (!guest) throw ApiError.notFound('This phone is not in the club any more.');
  return guest;
};

export const card = async (key) => cardOf(await memberBy(key), await getSettings());

/** Offers on this phone: the guest allowed notifications after joining. */
export async function saveOffersPush(key, subscription) {
  const guest = await memberBy(key);
  await Guest.updateOne({ _id: guest._id }, { offers: subscription });
}

/** The guest leaves: everything about them is deleted; their past orders stay, unnamed. */
export async function leave(key) {
  const guest = await memberBy(key);
  await Order.updateMany({ guest: guest._id }, { $unset: { guest: 1 } });
  await Guest.deleteOne({ _id: guest._id });
}

/** Staff hand over a reward. */
export async function redeem(id) {
  const guest = await Guest.findOneAndUpdate({ _id: id, rewardsReady: { $gte: 1 } }, { $inc: { rewardsReady: -1, rewardsUsed: 1 } }, { new: true });
  if (!guest) throw ApiError.conflict('No reward is waiting for this guest.');
  return staffView(guest);
}

/** Staff delete a guest who asked to be removed. */
export async function remove(id) {
  await Order.updateMany({ guest: id }, { $unset: { guest: 1 } });
  await Guest.deleteOne({ _id: id });
}

const monthNow = () => Number(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, month: 'numeric' }).format(new Date()));

/**
 * The guest list for the admin, with ready-made groups:
 *   all · lapsed (no visit for N days) · birthday (this month) · top (spent most) · reward (one waiting) · dish (ever ordered it)
 */
export async function listGuests({ filter = 'all', q = '', dish = '', days } = {}) {
  const settings = await getSettings();
  const club = clubOf(settings);
  const lapse = Number(days) || club.remindDays;
  const where = {};
  if (filter === 'lapsed') where.lastVisitAt = { $lt: new Date(Date.now() - lapse * 86400000) };
  if (filter === 'birthday') where['birthday.month'] = monthNow();
  if (filter === 'reward') where.rewardsReady = { $gte: 1 };
  if (filter === 'dish' && dish) {
    const pattern = new RegExp(dish.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    where._id = { $in: await Order.distinct('guest', { 'items.name': pattern, guest: { $exists: true }, status: { $ne: 'cancelled' } }) };
  }
  if (q) {
    const text = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    where.$or = [{ name: new RegExp(text, 'i') }, { phone: new RegExp(text.replace(/\D/g, '') || text) }];
  }
  const sort = filter === 'top' ? { spent: -1 } : filter === 'lapsed' ? { lastVisitAt: 1 } : { lastVisitAt: -1, createdAt: -1 };
  const guests = await Guest.find(where).sort(sort).limit(1000);

  // Each guest's favourite dish: what they have ordered most.
  const rows = guests.length ? await Order.aggregate([
    { $match: { guest: { $in: guests.map((g) => g._id) }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $group: { _id: { guest: '$guest', name: '$items.name' }, qty: { $sum: '$items.qty' } } },
    { $sort: { qty: -1 } }
  ]) : [];
  const favourite = new Map();
  for (const r of rows) if (!favourite.has(String(r._id.guest))) favourite.set(String(r._id.guest), r._id.name);

  const [total, reachable, lapsed, birthdays, rewards] = await Promise.all([
    Guest.countDocuments(),
    Guest.countDocuments({ 'offers.endpoint': { $exists: true } }),
    Guest.countDocuments({ lastVisitAt: { $lt: new Date(Date.now() - lapse * 86400000) } }),
    Guest.countDocuments({ 'birthday.month': monthNow() }),
    Guest.countDocuments({ rewardsReady: { $gte: 1 } })
  ]);
  return {
    guests: guests.map((g) => staffView(g, favourite.get(String(g._id)) || '')),
    summary: { total, reachable, lapsed, birthdays, rewards, lapseDays: lapse }
  };
}

/** Send an offer as a notification to the chosen guests who can get one. */
export async function sendOffer({ ids, title, body }) {
  const guests = await Guest.find({ _id: { $in: ids }, 'offers.endpoint': { $exists: true } });
  let sent = 0;
  for (const guest of guests) {
    if (await notify(guest, { title: personal(title, guest), body: personal(body, guest), tag: 'offer' })) sent += 1;
  }
  await Guest.updateMany({ _id: { $in: guests.map((g) => g._id) } }, { $inc: { sent: 1 } });
  return { sent, unreachable: ids.length - sent };
}

/** The members sitting at each open table, with any reward waiting, for the staff board. */
export async function membersAt(tables) {
  if (!tables.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { table: { $in: tables }, settled: false, status: { $ne: 'cancelled' }, guest: { $exists: true } } },
    { $group: { _id: '$table', guests: { $addToSet: '$guest' } } }
  ]);
  const ids = rows.flatMap((r) => r.guests);
  const guests = new Map((await Guest.find({ _id: { $in: ids } })).map((g) => [String(g._id), g]));
  return new Map(rows.map((r) => [r._id, r.guests.map((id) => guests.get(String(id))).filter(Boolean)
    .map((g) => ({ id: String(g._id), name: g.name, stamps: g.stamps, rewardsReady: g.rewardsReady }))]));
}

/**
 * Reminders, sent as notifications to members who allowed them: "we miss you"
 * once after N days without a visit, and a birthday message once a year.
 * Only between 10 in the morning and 8 at night, restaurant time.
 */
export async function sendReminders(now = new Date()) {
  const settings = await getSettings();
  const club = clubOf(settings);
  if (!club.on || !club.remind) return { missYou: 0, birthday: 0 };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(now).map((p) => [p.type, Number(p.value)]));
  if (parts.hour < 10 || parts.hour >= 20) return { missYou: 0, birthday: 0 };
  let missYou = 0;
  let birthday = 0;

  const lapsed = await Guest.find({
    'offers.endpoint': { $exists: true },
    lastVisitAt: { $lt: new Date(now.getTime() - club.remindDays * 86400000) },
    $or: [{ lastMissYouAt: { $exists: false } }, { $expr: { $lt: ['$lastMissYouAt', '$lastVisitAt'] } }]
  }).limit(200);
  for (const guest of lapsed) {
    // Marked first, so a slow push can never send the same reminder twice.
    const claimed = await Guest.updateOne({ _id: guest._id, lastMissYouAt: guest.lastMissYouAt ?? { $exists: false } }, { lastMissYouAt: now });
    if (claimed.modifiedCount && await notify(guest, { title: settings.name, body: personal(club.missYou, guest), tag: 'miss-you' })) missYou += 1;
  }

  const born = await Guest.find({
    'offers.endpoint': { $exists: true }, 'birthday.day': parts.day, 'birthday.month': parts.month,
    $or: [{ lastBirthdayYear: { $exists: false } }, { lastBirthdayYear: { $lt: parts.year } }]
  }).limit(200);
  for (const guest of born) {
    const claimed = await Guest.updateOne({ _id: guest._id, lastBirthdayYear: guest.lastBirthdayYear ?? { $exists: false } }, { lastBirthdayYear: parts.year });
    if (claimed.modifiedCount && await notify(guest, { title: settings.name, body: personal(club.birthday, guest), tag: 'birthday' })) birthday += 1;
  }
  return { missYou, birthday };
}

/** Check for reminders every half hour while the server runs. */
export function startReminders() {
  const run = () => sendReminders().catch((err) => console.error('Reminders failed:', err.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, 30 * 60 * 1000).unref();
}
