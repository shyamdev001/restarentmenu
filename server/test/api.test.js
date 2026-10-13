// End-to-end checks of the rules that protect money and the kitchen.
// They run against a throwaway database on the same MongoDB:  npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const base = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/saffron_menu';
process.env.MONGODB_URI = base.replace(/\/([^/?]+)(\?.*)?$/, (_m, name, query = '') => `/${name}_test_${process.pid}${query}`);
process.env.NODE_ENV = 'test';

const { default: mongoose } = await import('mongoose');
const { connectDb } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const { ensureSeed } = await import('../src/seed/seed.js');
const { env } = await import('../src/config/env.js');
const { Order, ServiceCall, Dish } = await import('../src/models/index.js');

let server; let url; let cookie = ''; let codes = {}; let dish;

/** A small fetch helper: JSON in and out, optionally signed in as the admin. */
async function call(method, path, body, { admin = false } = {}) {
  const res = await fetch(url + '/api' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const key = () => 'test-' + Math.random().toString(36).slice(2).padEnd(16, 'x');
const basket = (table, extra = {}) => ({ table, code: codes[table], items: [{ dishId: dish.id, qty: 2 }], ...extra });

before(async () => {
  await connectDb();
  await ensureSeed();
  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${server.address().port}`;

  const login = await fetch(url + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.adminUsername, password: env.adminPassword })
  });
  cookie = login.headers.get('set-cookie').split(';')[0];
  codes = (await call('GET', '/admin/table-codes', null, { admin: true })).body.codes;

  // The QR rule is off on a new install. Most tests here are about that rule, so switch it on.
  const fresh = (await call('GET', '/menu')).body.settings;
  assert.equal(fresh.requireQr, false, 'a new install takes orders from any link');
  const { name, tagline, welcome, currency, taxPercent, tables, publicUrl } = (await call('GET', '/admin/settings', null, { admin: true })).body;
  await call('PUT', '/admin/settings', { name, tagline, welcome, currency, taxPercent, tables, publicUrl, requireQr: true }, { admin: true });
  dish = (await Dish.findOne({ available: true, 'addons.0': { $exists: true } })).toJSON();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

test('an order needs the code from the table\'s QR', async () => {
  const without = await call('POST', '/orders', { table: 3, items: [{ dishId: dish.id, qty: 1 }] });
  assert.equal(without.status, 403);
  const wrong = await call('POST', '/orders', { ...basket(3), code: codes[4] });
  assert.equal(wrong.status, 403);
  const right = await call('POST', '/orders', basket(3));
  assert.equal(right.status, 201);
  assert.equal(right.body.subtotal, dish.price * 2);
  assert.equal(right.body.total, Math.round(dish.price * 2 * 1.05 * 100) / 100); // sample menu: 5% tax
});

test('sending the same basket twice makes one order', async () => {
  const clientKey = key();
  const first = await call('POST', '/orders', basket(1, { clientKey }));
  const again = await call('POST', '/orders', basket(1, { clientKey }));
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, first.body.id);

  const together = key();
  const results = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/orders', basket(1, { clientKey: together }))));
  assert.equal(new Set(results.map((r) => r.body.id)).size, 1);
  assert.equal(await Order.countDocuments({ clientKey: together }), 1);
});

test('a changed price or a withdrawn extra stops the order', async () => {
  const stale = await call('POST', '/orders', basket(2, { expected: dish.price * 2 + 50 }));
  assert.equal(stale.status, 409);
  assert.match(stale.body.message, /Prices have changed/);

  const gone = await call('POST', '/orders', { table: 2, code: codes[2], items: [{ dishId: dish.id, qty: 1, addons: ['Not on the menu'] }] });
  assert.equal(gone.status, 409);

  const fine = await call('POST', '/orders', basket(2, { expected: dish.price * 2 }));
  assert.equal(fine.status, 201);
});

test('an order only moves forward', async () => {
  const { body: placed } = await call('POST', '/orders', basket(5));
  const order = await Order.findOne({ publicId: placed.id });
  const move = (status) => call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });

  assert.equal((await move('ready')).status, 409, 'cannot skip cooking');
  assert.equal((await move('cooking')).status, 200);
  assert.equal((await move('new')).status, 400, 'cannot go back to new');
  assert.equal((await move('ready')).status, 200);
  assert.equal((await move('cancelled')).status, 409, 'cannot cancel once it has left the kitchen');
  assert.equal((await move('served')).status, 200);
  assert.equal((await move('served')).status, 200, 'the same tap twice is harmless');
  assert.equal((await move('cooking')).status, 409, 'a served order stays served');
  assert.equal((await Order.findById(order.id)).status, 'served');
});

test('staff can enter an order themselves, including for the counter', async () => {
  // No QR code is needed from the admin panel, even while the QR rule is on.
  const atTable = await call('POST', '/admin/orders', { table: 7, items: [{ dishId: dish.id, qty: 3 }] }, { admin: true });
  assert.equal(atTable.status, 201);
  assert.equal(atTable.body.source, 'staff');
  assert.equal(atTable.body.subtotal, dish.price * 3);

  const counter = await call('POST', '/admin/orders', { table: 0, items: [{ dishId: dish.id, qty: 1 }] }, { admin: true });
  assert.equal(counter.status, 201);
  assert.equal(counter.body.table, 0);

  assert.equal((await call('POST', '/admin/orders', { table: 3, items: [{ dishId: dish.id, qty: 1 }] })).status, 401, 'only signed-in staff');
  assert.equal((await call('POST', '/admin/orders', { table: 999, items: [{ dishId: dish.id, qty: 1 }] }, { admin: true })).status, 400);
  assert.equal((await call('POST', '/orders', { table: 0, code: codes[1], items: [{ dishId: dish.id, qty: 1 }] })).status, 400, 'guests cannot order to the counter');

  // A staff order shows on the table's bill like any other.
  const bill = await call('GET', `/tables/7/bill?code=${codes[7]}`);
  assert.equal(bill.body.length, 1);
});

test('many phones calling at once make one call', async () => {
  const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => call('POST', '/calls', { table: 6, code: codes[6], type: 'waiter' })));
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(await ServiceCall.countDocuments({ table: 6, type: 'waiter', status: 'open' }), 1);
  assert.equal((await call('POST', '/calls', { table: 6, type: 'bill' })).status, 403, 'calls need the table code too');
});

test('the bill is for the whole table, until the table pays', async () => {
  const a = await call('POST', '/orders', basket(8));
  const b = await call('POST', '/orders', basket(8)); // a second phone at the same table
  assert.equal((await call('GET', '/tables/8/bill')).status, 403);

  const bill = await call('GET', `/tables/8/bill?code=${codes[8]}`);
  assert.equal(bill.body.length, 2);
  assert.ok(bill.body.every((o) => o.id === undefined), 'the bill does not hand out order ids');

  const open = await call('GET', '/admin/tables/open', null, { admin: true });
  assert.equal(open.body.find((t) => t.table === 8).orders, 2);

  assert.equal((await call('POST', '/admin/tables/8/settle', null, { admin: true })).status, 409, 'food still in the kitchen');
  for (const placed of [a, b]) {
    const order = await Order.findOne({ publicId: placed.body.id });
    for (const status of ['cooking', 'ready', 'served']) await call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });
  }
  assert.equal((await call('POST', '/admin/tables/8/settle', null, { admin: true })).status, 200);
  assert.equal((await call('GET', `/tables/8/bill?code=${codes[8]}`)).body.length, 0);
  const mine = await call('GET', `/orders?ids=${a.body.id}`);
  assert.equal(mine.body[0].settled, true);
});

test('a table left unpaid closes itself after three quiet hours', async () => {
  const { closeQuietTables } = await import('../src/services/tables.js');
  const placed = await call('POST', '/orders', basket(10));
  const order = await Order.findOne({ publicId: placed.body.id });
  for (const status of ['cooking', 'ready', 'served']) await call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });

  await closeQuietTables(Date.now() + 2 * 3600 * 1000);
  assert.equal((await Order.findById(order.id)).settled, false, 'two hours on, the bill is still open');
  await closeQuietTables(Date.now() + 4 * 3600 * 1000);
  assert.equal((await Order.findById(order.id)).settled, true, 'four hours on, the table has been closed');
});

test('categories are reordered in one step', async () => {
  const before = (await call('GET', '/menu')).body.categories.map((c) => c.id);
  const reversed = before.slice().reverse();
  assert.equal((await call('PUT', '/admin/categories/order', { ids: reversed }, { admin: true })).status, 200);
  assert.deepEqual((await call('GET', '/menu')).body.categories.map((c) => c.id), reversed);
});

test('an uploaded photo is kept in the database and served back', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'dish.png');
  const res = await fetch(url + '/api/admin/upload', { method: 'POST', headers: { cookie }, body: form });
  assert.equal(res.status, 201);
  const { url: photo } = await res.json();
  assert.match(photo, /^\/uploads\/[a-f0-9]{24}\.webp$/, 'a PNG upload is stored as WebP');
  for (const address of [photo, photo.replace('.webp', '-s.webp')]) {
    const served = await fetch(url + address);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/webp');
    assert.equal(Buffer.from(await served.arrayBuffer()).subarray(8, 12).toString(), 'WEBP');
  }
  const junk = new FormData();
  junk.append('image', new Blob([Buffer.from('not a picture')], { type: 'image/jpeg' }), 'x.jpg');
  assert.equal((await fetch(url + '/api/admin/upload', { method: 'POST', headers: { cookie }, body: junk })).status, 400);

  // The sample menu uses the WebP samples, and an old .jpg address is moved over at start-up.
  const sample = await Dish.findOne({ image: /^\/uploads\/seed\// });
  assert.match(sample.image, /\.webp$/);
  await Dish.updateOne({ _id: sample._id }, { image: sample.image.replace('.webp', '.jpg') });
  const { modernisePhotos } = await import('../src/services/photos.js');
  await modernisePhotos();
  assert.equal((await Dish.findById(sample._id)).image, sample.image);
  assert.equal((await fetch(url + '/uploads/aaaaaaaaaaaaaaaaaaaaaaaa.png')).status, 404);
});

test('reports add up, in the time zone of the restaurant', async () => {
  const zone = 'Asia/Kolkata';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const { body: report } = await call('GET', `/admin/reports?from=${today}&to=${today}&tz=${zone}`, null, { admin: true });

  const sold = await Order.find({ status: { $ne: 'cancelled' } });
  assert.equal(report.totals.orders, sold.length);
  assert.equal(report.totals.revenue, Math.round(sold.reduce((n, o) => n + o.total, 0) * 100) / 100);
  assert.equal(report.byDay.length, 1);
  assert.equal(report.byDay[0].day, today);
  assert.equal(report.byHour.reduce((n, h) => n + h.orders, 0), sold.length);
  assert.equal(report.sellers[0].qty, sold.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0), 'every test order was the same dish');
  assert.ok(report.unsold.length > 0, 'the rest of the menu is listed as not sold');
  assert.equal(report.byCategory.reduce((n, c) => n + c.qty, 0), report.totals.plates);

  const stats = await call('GET', `/admin/stats?tz=${zone}`, null, { admin: true });
  assert.equal(stats.body.orders, report.totals.orders);

  const csv = await fetch(url + `/api/admin/reports/export?from=${today}&to=${today}&tz=${zone}`, { headers: { cookie } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-disposition'), /attachment; filename="orders-/);
  const lines = (await csv.text()).trim().split('\r\n');
  assert.equal(lines.length, 1 + (await Order.countDocuments()), 'a heading plus one line per order');

  // The wider picture: every breakdown accounts for the same orders.
  assert.equal(report.byWeekday.reduce((n, w) => n + w.orders, 0), sold.length);
  assert.equal(report.heat.reduce((n, h) => n + h.orders, 0), sold.length);
  assert.equal(report.byTable.reduce((n, t) => n + t.orders, 0), sold.length);
  assert.equal(report.sizes.reduce((n, s) => n + s.orders, 0), sold.length);
  assert.equal(report.totals.tax, Math.round(sold.reduce((n, o) => n + o.tax, 0) * 100) / 100);
  assert.equal(report.previous.orders, 0, 'nothing was sold in the previous period');
  assert.ok(Math.abs(report.sellers.reduce((n, d) => n + d.share, 0) - 100) < 0.5, 'shares of sales add up to 100%');
  const timed = await Order.countDocuments({ status: 'served', servedAt: { $type: 'date' } });
  assert.equal(report.kitchen.timed, timed, 'orders moved through the board are timed');
  assert.ok(report.kitchen.total >= 0);
  assert.equal(report.calls.waiter, await ServiceCall.countDocuments({ type: 'waiter' }));

  for (const kind of ['dishes', 'days']) {
    const file = await fetch(url + `/api/admin/reports/export?kind=${kind}&from=${today}&to=${today}&tz=${zone}`, { headers: { cookie } });
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-disposition'), new RegExp(`filename="${kind}-`));
  }

  assert.equal((await call('GET', '/admin/reports?from=2026-02-01&to=2026-01-01', null, { admin: true })).status, 400);
  assert.equal((await call('GET', '/admin/reports')).status, 401, 'reports are for signed-in staff only');
});

test('history lists today, and the QR rule can be switched off', async () => {
  const days = await call('GET', '/admin/history', null, { admin: true });
  assert.ok(days.body[0].orders >= 1);
  const day = await call('GET', `/admin/history/${days.body[0].day}`, null, { admin: true });
  assert.ok(day.body.length >= days.body[0].orders);

  const settings = (await call('GET', '/admin/settings', null, { admin: true })).body;
  const { name, tagline, welcome, currency, taxPercent, tables, publicUrl } = settings;
  const saved = await call('PUT', '/admin/settings', { name, tagline, welcome, currency, taxPercent, tables, publicUrl, requireQr: false }, { admin: true });
  assert.equal(saved.status, 200);
  assert.equal((await call('POST', '/orders', { table: 9, items: [{ dishId: dish.id, qty: 1 }] })).status, 201);
});
