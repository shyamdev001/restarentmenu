import { Category, Dish, Order, ServiceCall } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Sales reports. Days and hours are counted in the restaurant's own time zone
 * (sent by the admin's browser), not the server's: a host's clock is usually
 * UTC, which would put a late dinner on the wrong day.
 */

const SERVER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round = (n) => Math.round((n || 0) * 100) / 100;
const minutes = (ms) => (ms == null ? null : Math.round(ms / 6000) / 10);

/** A time zone name the database will accept, or the server's own. */
export function zoneOf(value) {
  try {
    if (typeof value === 'string' && value.length < 64) { new Intl.DateTimeFormat('en', { timeZone: value }); return value; }
  } catch { /* not a zone */ }
  return SERVER_ZONE;
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export const todayIn = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const shift = (day, days) => {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from, to) => Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000) + 1;

/** Check a from/to pair and return it with its time zone. At most a year at a time. */
export function rangeOf({ from, to, tz }) {
  const zone = zoneOf(tz);
  const end = DAY.test(to || '') ? to : todayIn(zone);
  const start = DAY.test(from || '') ? from : shift(end, -29);
  if (start > end) throw ApiError.badRequest('The start date is after the end date.');
  if (shift(start, 366) < end) throw ApiError.badRequest('Choose a range of one year or less.');
  return { from: start, to: end, zone };
}

/**
 * The first stages of every report: records in the range, each tagged with its
 * local day, hour and weekday. The rough date window lets the database use its
 * index before the exact local-day match.
 */
function inRange({ from, to, zone }) {
  return [
    { $match: { createdAt: { $gte: new Date(shift(from, -1) + 'T00:00:00Z'), $lt: new Date(shift(to, 2) + 'T00:00:00Z') } } },
    { $addFields: {
      day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: zone } },
      hour: { $hour: { date: '$createdAt', timezone: zone } },
      weekday: { $isoDayOfWeek: { date: '$createdAt', timezone: zone } } // 1 = Monday … 7 = Sunday
    } },
    { $match: { day: { $gte: from, $lte: to } } }
  ];
}

/** Every order in a range, newest first, with its local day. */
export const ordersIn = (range, limit = 5000) => Order.aggregate([...inRange(range), { $sort: { createdAt: -1 } }, { $limit: limit }]);

const sums = { orders: { $sum: 1 }, revenue: { $sum: '$total' }, plates: { $sum: { $sum: '$items.qty' } } };

/** Orders, plates, sales and average bill for a range. Cancelled orders are left out. */
async function totalsOf(range) {
  const [row] = await Order.aggregate([...inRange(range), { $match: { status: { $ne: 'cancelled' } } },
    { $group: { _id: null, ...sums, subtotal: { $sum: '$subtotal' }, tax: { $sum: '$tax' } } }]);
  const t = row || { orders: 0, revenue: 0, plates: 0, subtotal: 0, tax: 0 };
  return {
    orders: t.orders, plates: t.plates, revenue: round(t.revenue), subtotal: round(t.subtotal), tax: round(t.tax),
    average: t.orders ? round(t.revenue / t.orders) : 0,
    platesPerOrder: t.orders ? Math.round((t.plates / t.orders) * 10) / 10 : 0
  };
}

export async function buildReport(range) {
  const all = inRange(range);
  const sold = [...all, { $match: { status: { $ne: 'cancelled' } } }];
  const items = [...sold, { $unwind: '$items' }];
  const length = daysBetween(range.from, range.to);
  const before = { from: shift(range.from, -length), to: shift(range.from, -1), zone: range.zone };

  const [
    totals, previous, cancelled, byDay, byHour, byWeekday, heat, byTable, sizes,
    dishRows, addonRows, spiceRows, speed, calls, dishes, categories, rated, prizes
  ] = await Promise.all([
    totalsOf(range),
    totalsOf(before),
    Order.aggregate([...all, { $match: { status: 'cancelled' } }, { $group: { _id: null, n: { $sum: 1 }, value: { $sum: '$total' } } }]),
    Order.aggregate([...sold, { $group: { _id: '$day', ...sums } }, { $sort: { _id: 1 } }]),
    Order.aggregate([...sold, { $group: { _id: '$hour', ...sums } }, { $sort: { _id: 1 } }]),
    Order.aggregate([...sold, { $group: { _id: '$weekday', ...sums, days: { $addToSet: '$day' } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([...sold, { $group: { _id: { weekday: '$weekday', hour: '$hour' }, orders: { $sum: 1 } } }]),
    Order.aggregate([...sold, { $group: { _id: '$table', ...sums } }, { $sort: { revenue: -1 } }]),
    Order.aggregate([...sold, { $project: { plates: { $sum: '$items.qty' } } }, { $group: { _id: { $min: ['$plates', 6] }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([...items,
      { $group: { _id: { dish: '$items.dish', name: '$items.name' }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' }, orders: { $sum: 1 } } },
      { $sort: { qty: -1, revenue: -1 } }]),
    Order.aggregate([...items, { $unwind: '$items.addons' },
      { $group: { _id: '$items.addons.name', qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.addons.price', '$items.qty'] } } } },
      { $sort: { qty: -1 } }]),
    Order.aggregate([...items, { $match: { 'items.spice': { $nin: ['', null] } } }, { $group: { _id: '$items.spice', qty: { $sum: '$items.qty' } } }]),
    // How long the kitchen takes. Only orders moved through the board since timing was added have these marks.
    Order.aggregate([...all, { $match: { status: 'served', servedAt: { $type: 'date' } } }, { $group: {
      _id: null, timed: { $sum: 1 },
      total: { $avg: { $subtract: ['$servedAt', '$createdAt'] } },
      slowest: { $max: { $subtract: ['$servedAt', '$createdAt'] } },
      accept: { $avg: { $cond: [{ $eq: [{ $type: '$cookingAt' }, 'date'] }, { $subtract: ['$cookingAt', '$createdAt'] }, null] } },
      cook: { $avg: { $cond: [{ $and: [{ $eq: [{ $type: '$cookingAt' }, 'date'] }, { $eq: [{ $type: '$readyAt' }, 'date'] }] }, { $subtract: ['$readyAt', '$cookingAt'] }, null] } },
      carry: { $avg: { $cond: [{ $eq: [{ $type: '$readyAt' }, 'date'] }, { $subtract: ['$servedAt', '$readyAt'] }, null] } },
      late: { $sum: { $cond: [{ $gt: [{ $subtract: ['$servedAt', '$createdAt'] }, { $multiply: [{ $ifNull: ['$etaMin', 0] }, 60000] }] }, 1, 0] } }
    } }]),
    ServiceCall.aggregate([...all, { $group: {
      _id: '$type', n: { $sum: 1 },
      answer: { $avg: { $cond: [{ $eq: ['$status', 'done'] }, { $subtract: ['$updatedAt', '$createdAt'] }, null] } }
    } }]),
    Dish.find().select('name accent category available price').lean(),
    Category.find().select('name').lean(),
    // What guests said afterwards, and what the wheel gave away.
    Order.aggregate([...all, { $match: { 'rating.stars': { $gte: 1 } } }, { $sort: { 'rating.at': -1 } },
      { $group: { _id: null, n: { $sum: 1 }, average: { $avg: '$rating.stars' }, stars: { $push: '$rating.stars' },
        notes: { $push: { stars: '$rating.stars', comment: '$rating.comment', table: '$table', number: '$number', at: '$rating.at' } } } }]),
    Order.aggregate([...all, { $match: { 'prize.win': true } }, { $group: { _id: '$prize.label', n: { $sum: 1 } } }, { $sort: { n: -1 } }])
  ]);

  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
  const dishById = new Map(dishes.map((d) => [String(d._id), d]));
  const nameOf = (d) => `${d.name} ${d.accent || ''}`.trim();

  // A dish keeps its sales even if it was renamed since: rows are joined on the dish, not the name.
  const perDish = new Map();
  for (const row of dishRows) {
    const key = row._id.dish ? String(row._id.dish) : 'name:' + row._id.name;
    const current = dishById.get(key);
    const entry = perDish.get(key) || {
      name: current ? nameOf(current) : row._id.name, qty: 0, revenue: 0, orders: 0,
      category: current ? categoryName.get(String(current.category)) || 'Other' : 'No longer on the menu'
    };
    entry.qty += row.qty; entry.revenue += row.revenue; entry.orders += row.orders;
    perDish.set(key, entry);
  }
  const itemSales = [...perDish.values()].reduce((n, d) => n + d.revenue, 0);
  const sellers = [...perDish.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .map((d) => ({ ...d, revenue: round(d.revenue), share: itemSales ? Math.round((d.revenue / itemSales) * 1000) / 10 : 0 }));

  const perCategory = new Map();
  for (const d of sellers) {
    const entry = perCategory.get(d.category) || { name: d.category, qty: 0, revenue: 0 };
    entry.qty += d.qty; entry.revenue += d.revenue;
    perCategory.set(d.category, entry);
  }

  const lost = cancelled[0] || { n: 0, value: 0 };
  const everyOrder = totals.orders + lost.n;
  const kitchen = speed[0];
  const callOf = (type) => calls.find((c) => c._id === type);

  return {
    from: range.from, to: range.to, zone: range.zone, days: length,
    totals: { ...totals, cancelled: lost.n, cancelledValue: round(lost.value), cancelRate: everyOrder ? Math.round((lost.n / everyOrder) * 1000) / 10 : 0 },
    previous: { from: before.from, to: before.to, ...previous },
    byDay: byDay.map((d) => ({ day: d._id, orders: d.orders, plates: d.plates, revenue: round(d.revenue), average: d.orders ? round(d.revenue / d.orders) : 0 })),
    byHour: byHour.map((h) => ({ hour: h._id, orders: h.orders, revenue: round(h.revenue) })),
    // Averages per weekday use only the days that had orders, so one busy Saturday is not diluted by nothing.
    byWeekday: byWeekday.map((w) => ({ weekday: w._id, orders: w.orders, revenue: round(w.revenue), days: w.days.length, perDay: round(w.revenue / w.days.length) })),
    heat: heat.map((h) => ({ weekday: h._id.weekday, hour: h._id.hour, orders: h.orders })),
    byTable: byTable.map((t) => ({ table: t._id, orders: t.orders, plates: t.plates, revenue: round(t.revenue), average: t.orders ? round(t.revenue / t.orders) : 0 })),
    sizes: sizes.map((s) => ({ plates: s._id, orders: s.orders })),
    sellers,
    unsold: dishes.filter((d) => !perDish.has(String(d._id))).map((d) => ({ name: nameOf(d), category: categoryName.get(String(d.category)) || 'Other' })),
    byCategory: [...perCategory.values()].sort((a, b) => b.revenue - a.revenue).map((c) => ({ ...c, revenue: round(c.revenue) })),
    addons: addonRows.map((a) => ({ name: a._id, qty: a.qty, revenue: round(a.revenue) })),
    spice: ['Mild', 'Medium', 'Fiery'].map((level) => ({ level, qty: spiceRows.find((s) => s._id === level)?.qty || 0 })),
    kitchen: kitchen ? {
      timed: kitchen.timed, late: kitchen.late,
      total: minutes(kitchen.total), slowest: minutes(kitchen.slowest),
      accept: minutes(kitchen.accept), cook: minutes(kitchen.cook), carry: minutes(kitchen.carry)
    } : null,
    ratings: rated[0] ? {
      count: rated[0].n, average: Math.round(rated[0].average * 10) / 10,
      spread: [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: rated[0].stars.filter((s) => s === n).length })),
      notes: rated[0].notes.filter((n) => n.comment).slice(0, 8)
    } : null,
    prizes: prizes.map((p) => ({ label: p._id, count: p.n })),
    calls: {
      waiter: callOf('waiter')?.n || 0, bill: callOf('bill')?.n || 0,
      waiterAnswer: minutes(callOf('waiter')?.answer), billAnswer: minutes(callOf('bill')?.answer)
    }
  };
}

const csv = (rows) => {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = "'" + text; // a note must never run as a spreadsheet formula
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
};

/** A spreadsheet of the range: one line per order, per dish, or per day. */
export async function exportCsv(range, kind = 'orders') {
  if (kind === 'dishes') {
    const report = await buildReport(range);
    return csv([['Dish', 'Category', 'Plates', 'Orders', 'Sales', 'Share of sales %'],
      ...report.sellers.map((d) => [d.name, d.category, d.qty, d.orders, d.revenue, d.share]),
      ...report.unsold.map((d) => [d.name, d.category, 0, 0, 0, 0])]);
  }
  if (kind === 'days') {
    const report = await buildReport(range);
    return csv([['Date', 'Orders', 'Plates', 'Sales', 'Average bill'],
      ...report.byDay.map((d) => [d.day, d.orders, d.plates, d.revenue, d.average])]);
  }
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: range.zone, hour: '2-digit', minute: '2-digit', hour12: false });
  const orders = (await ordersIn(range, 20000)).reverse();
  return csv([['Order', 'Date', 'Time', 'Table', 'Status', 'Items', 'Plates', 'Subtotal', 'Tax', 'Total'],
    ...orders.map((o) => [
      o.number, o.day, time.format(o.createdAt), o.table, o.status,
      o.items.map((i) => `${i.qty}x ${i.name}`).join('; '),
      o.items.reduce((n, i) => n + i.qty, 0), o.subtotal, o.tax, o.total
    ])]);
}
