import { Category, Dish, Order } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Sales reports. Days and hours are counted in the restaurant's own time zone
 * (sent by the admin's browser), not the server's: a host's clock is usually
 * UTC, which would put a late dinner on the wrong day.
 */

const SERVER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const round = (n) => Math.round((n || 0) * 100) / 100;

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
 * The first stages of every report: orders in the range, each tagged with its
 * local day and hour. The rough date window lets the database use its index
 * before the exact local-day match.
 */
function inRange({ from, to, zone }) {
  return [
    { $match: { createdAt: { $gte: new Date(shift(from, -1) + 'T00:00:00Z'), $lt: new Date(shift(to, 2) + 'T00:00:00Z') } } },
    { $addFields: {
      day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: zone } },
      hour: { $hour: { date: '$createdAt', timezone: zone } }
    } },
    { $match: { day: { $gte: from, $lte: to } } }
  ];
}

/** Every order in a range, newest first, with its local day. */
export const ordersIn = (range, limit = 5000) => Order.aggregate([...inRange(range), { $sort: { createdAt: -1 } }, { $limit: limit }]);

export async function buildReport(range) {
  const sold = [...inRange(range), { $match: { status: { $ne: 'cancelled' } } }];

  const [totals, cancelled, byDay, byHour, dishRows, dishes, categories] = await Promise.all([
    Order.aggregate([...sold, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' }, plates: { $sum: { $sum: '$items.qty' } } } }]),
    Order.aggregate([...inRange(range), { $match: { status: 'cancelled' } }, { $count: 'n' }]),
    Order.aggregate([...sold, { $group: { _id: '$day', orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([...sold, { $group: { _id: '$hour', orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { _id: 1 } }]),
    Order.aggregate([...sold, { $unwind: '$items' },
      { $group: { _id: { dish: '$items.dish', name: '$items.name' }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
      { $sort: { qty: -1, revenue: -1 } }]),
    Dish.find().select('name accent category available').lean(),
    Category.find().select('name').lean()
  ]);

  const total = totals[0] || { orders: 0, revenue: 0, plates: 0 };
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
  const dishById = new Map(dishes.map((d) => [String(d._id), d]));

  // A dish keeps its sales even if it was renamed since: rows are joined on the dish, not the name.
  const perDish = new Map();
  for (const row of dishRows) {
    const key = row._id.dish ? String(row._id.dish) : 'name:' + row._id.name;
    const current = dishById.get(key);
    const entry = perDish.get(key) || { name: current ? `${current.name} ${current.accent || ''}`.trim() : row._id.name, qty: 0, revenue: 0, category: current ? categoryName.get(String(current.category)) || 'Other' : 'No longer on the menu' };
    entry.qty += row.qty;
    entry.revenue += row.revenue;
    perDish.set(key, entry);
  }
  const sellers = [...perDish.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).map((d) => ({ ...d, revenue: round(d.revenue) }));

  const perCategory = new Map();
  for (const d of sellers) {
    const entry = perCategory.get(d.category) || { name: d.category, qty: 0, revenue: 0 };
    entry.qty += d.qty;
    entry.revenue += d.revenue;
    perCategory.set(d.category, entry);
  }

  return {
    from: range.from, to: range.to, zone: range.zone,
    totals: {
      orders: total.orders, plates: total.plates, revenue: round(total.revenue),
      average: total.orders ? round(total.revenue / total.orders) : 0,
      cancelled: cancelled[0]?.n || 0
    },
    byDay: byDay.map((d) => ({ day: d._id, orders: d.orders, revenue: round(d.revenue) })),
    byHour: byHour.map((h) => ({ hour: h._id, orders: h.orders, revenue: round(h.revenue) })),
    sellers,
    unsold: dishes.filter((d) => !perDish.has(String(d._id))).map((d) => ({ name: `${d.name} ${d.accent || ''}`.trim(), category: categoryName.get(String(d.category)) || 'Other' })),
    byCategory: [...perCategory.values()].sort((a, b) => b.revenue - a.revenue).map((c) => ({ ...c, revenue: round(c.revenue) }))
  };
}

/** One line per order, for a spreadsheet. */
export async function ordersCsv(range) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = "'" + text; // a note must never run as a spreadsheet formula
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: range.zone, hour: '2-digit', minute: '2-digit', hour12: false });
  const rows = (await ordersIn(range, 20000)).reverse().map((o) => [
    o.number, o.day, time.format(o.createdAt), o.table, o.status,
    o.items.map((i) => `${i.qty}x ${i.name}`).join('; '),
    o.items.reduce((n, i) => n + i.qty, 0), o.subtotal, o.tax, o.total
  ]);
  return [['Order', 'Date', 'Time', 'Table', 'Status', 'Items', 'Plates', 'Subtotal', 'Tax', 'Total'], ...rows]
    .map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
