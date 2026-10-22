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
const { Order, ServiceCall, Dish, TableVisit, Admin, PushSub } = await import('../src/models/index.js');

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
  // A new install's owner must choose their own password before anything else.
  assert.equal((await login.json()).mustChange, true);
  assert.equal((await call('GET', '/admin/orders', null, { admin: true })).status, 403);
  assert.equal((await call('PUT', '/auth/password', { current: env.adminPassword, next: env.adminPassword + '-x' }, { admin: true })).status, 200);
  codes = (await call('GET', '/admin/table-codes', null, { admin: true })).body.codes;

  // The QR rule is off on a new install. Most tests here are about that rule, so switch it on.
  const fresh = (await call('GET', '/menu')).body.settings;
  assert.equal(fresh.requireQr, false, 'a new install takes orders from any link');
  const { name, tagline, welcome, currency, taxPercent, tables, publicUrl } = (await call('GET', '/admin/settings', null, { admin: true })).body;
  // More tables than the sample menu has, so each test can use a table of its own.
  await call('PUT', '/admin/settings', { name, tagline, welcome, currency, taxPercent, tables: Math.max(tables, 30), publicUrl, requireQr: true }, { admin: true });
  codes = (await call('GET', '/admin/table-codes', null, { admin: true })).body.codes;
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

  assert.equal((await call('POST', '/admin/tables/8/settle', { method: 'cash' }, { admin: true })).status, 409, 'food still in the kitchen');
  for (const placed of [a, b]) {
    const order = await Order.findOne({ publicId: placed.body.id });
    for (const status of ['cooking', 'ready', 'served']) await call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });
  }
  assert.equal((await call('POST', '/admin/tables/8/settle', { method: 'cash' }, { admin: true })).status, 200);
  assert.equal((await call('GET', `/tables/8/bill?code=${codes[8]}`)).body.length, 0);
  const mine = await call('GET', `/orders?ids=${a.body.id}`);
  assert.equal(mine.body[0].settled, true);
});

test('a new party at a table nobody marked paid starts with a clean bill', async () => {
  const { liveVisit } = await import('../src/services/tables.js');
  const placed = await call('POST', '/orders', basket(10));
  const order = await Order.findOne({ publicId: placed.body.id });
  for (const status of ['cooking', 'ready', 'served']) await call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });

  assert.ok(await liveVisit(10, Date.now() + 60 * 60 * 1000), 'an hour after the food, the party is still at the table');
  assert.equal(await liveVisit(10, Date.now() + 2 * 3600 * 1000), null, 'two quiet hours on, the table is free');

  // Two hours pass, then new guests sit down and order.
  const past = new Date(Date.now() - 2 * 3600 * 1000);
  await Order.collection.updateMany({ table: 10 }, { $set: { updatedAt: past } });
  await TableVisit.updateOne({ table: 10 }, { openedAt: past });
  const next = await call('POST', '/orders', basket(10));
  const bill = (await call('GET', `/tables/10/bill?code=${codes[10]}`)).body;
  assert.deepEqual(bill.map((o) => o.number), [next.body.number], 'they do not see the last party\'s meal');
  assert.equal((await Order.findById(order.id)).settled, false, 'nothing is marked paid behind the staff\'s back');
  const open = (await call('GET', '/admin/tables/open', null, { admin: true })).body.find((t) => t.table === 10);
  assert.equal(open.orders, 2);
  assert.equal(open.parties, 2, 'staff see that an earlier party was never marked paid');
  assert.equal((await call('GET', '/admin/tables/10/bill', null, { admin: true })).body.length, 2, 'the printed bill has everything unpaid');
});

test('the wheel gives one spin per table, and a meal is rated once after it is served', async () => {
  const a = await call('POST', '/orders', basket(11));
  const b = await call('POST', '/orders', basket(11));   // a second phone at the same table
  assert.equal((await call('POST', `/orders/${a.body.id}/spin`)).status, 403, 'the wheel is off until the owner switches it on');

  const prizes = [{ label: 'Free chai', weight: 1, win: true }, { label: 'Not this time', weight: 3, win: false }];
  assert.equal((await call('PUT', '/admin/settings/game', { on: true, prizes: [prizes[0]] }, { admin: true })).status, 400, 'needs two segments');
  assert.equal((await call('PUT', '/admin/settings/game', { on: true, prizes }, { admin: true })).status, 200);

  const game = (await call('GET', '/menu')).body.settings.game;
  assert.equal(game.on, true);
  assert.deepEqual(game.prizes.map((p) => Object.keys(p).sort()), [['label', 'win'], ['label', 'win']], 'the odds are not sent to phones');

  const both = await Promise.all([call('POST', `/orders/${a.body.id}/spin`), call('POST', `/orders/${b.body.id}/spin`)]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409], 'two phones tapping together: only one spin');
  const won = both.find((r) => r.status === 200).body;
  assert.equal(won.order.prize.label, prizes[won.index].label);
  const other = won.order.id === a.body.id ? b.body.id : a.body.id;
  const seen = (await call('GET', `/orders?ids=${other}`)).body[0].tableSpin;
  assert.equal(seen.prize.label, won.order.prize.label, 'the other phone at the table sees what the table won');
  assert.equal((await call('POST', `/orders/${a.body.id}/spin`)).status, 409);

  // The order behind another one knows it is second in line.
  const mine = await call('GET', `/orders?ids=${a.body.id},${b.body.id}`);
  assert.ok(mine.body[1].ahead > mine.body[0].ahead);

  assert.equal((await call('POST', `/orders/${a.body.id}/rating`, { stars: 5 })).status, 409, 'not before it is served');
  const order = await Order.findOne({ publicId: a.body.id });
  for (const status of ['cooking', 'ready', 'served']) await call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });
  assert.equal((await call('POST', `/orders/${a.body.id}/rating`, { stars: 9 })).status, 400);
  const rated = await call('POST', `/orders/${a.body.id}/rating`, { stars: 4, comment: 'Lovely biryani' });
  assert.equal(rated.status, 200);
  assert.equal(rated.body.stars, 4);
  assert.equal((await call('POST', `/orders/${a.body.id}/rating`, { stars: 1 })).status, 409, 'only once');

  // Saving the ordinary settings must not wipe the wheel.
  const { name, tagline, welcome, currency, taxPercent, tables, publicUrl } = (await call('GET', '/admin/settings', null, { admin: true })).body;
  await call('PUT', '/admin/settings', { name, tagline, welcome, currency, taxPercent, tables, publicUrl, requireQr: true }, { admin: true });
  assert.equal((await call('GET', '/menu')).body.settings.game.on, true);
});

test('staff roles decide who can do what', async () => {
  const signIn = async (username, password) => {
    const r = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const out = { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0], body: await r.json() };
    // The owner chose this password: the person picks their own before they can do anything.
    if (out.body.mustChange) {
      const blocked = await fetch(url + '/api/admin/orders', { headers: { cookie: out.cookie } });
      assert.equal(blocked.status, 403);
      const own = await fetch(url + '/api/auth/password', { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: out.cookie }, body: JSON.stringify({ current: password, next: password + '-own' }) });
      assert.equal(own.status, 200);
    }
    return out;
  };
  const as = (who) => async (method, path, body) => {
    const r = await fetch(url + '/api' + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), cookie: who }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  const add = (u, role) => call('POST', '/admin/staff', { name: u, username: u, role, password: 'password-' + u }, { admin: true });
  assert.equal((await add('cook1', 'kitchen')).status, 201);
  assert.equal((await add('wait1', 'waiter')).status, 201);
  assert.equal((await add('cook1', 'kitchen')).status, 409, 'usernames are unique');

  const cook = await signIn('cook1', 'password-cook1');
  assert.equal(cook.body.role, 'kitchen');
  assert.ok(cook.body.can.includes('cook') && !cook.body.can.includes('reports'));
  const kitchen = as(cook.cookie);
  const waiter = as((await signIn('wait1', 'password-wait1')).cookie);

  const placed = await call('POST', '/orders', basket(12));
  const order = await Order.findOne({ publicId: placed.body.id });
  assert.equal((await waiter('PATCH', `/admin/orders/${order.id}`, { status: 'cooking' })).status, 403, 'a waiter does not start cooking');
  assert.equal((await kitchen('PATCH', `/admin/orders/${order.id}`, { status: 'cooking' })).status, 200);
  assert.equal((await kitchen('PATCH', `/admin/orders/${order.id}`, { status: 'ready' })).status, 200);
  assert.equal((await kitchen('PATCH', `/admin/orders/${order.id}`, { status: 'served' })).status, 403, 'the kitchen does not serve');
  assert.equal((await waiter('PATCH', `/admin/orders/${order.id}`, { status: 'served' })).status, 200);
  const trail = (await Order.findById(order.id)).trail.map((t) => `${t.status}:${t.by}`);
  assert.deepEqual(trail, ['cooking:cook1', 'ready:cook1', 'served:wait1'], 'every step remembers who took it');

  assert.equal((await kitchen('GET', '/admin/reports')).status, 403, 'the kitchen cannot see sales');
  assert.equal((await waiter('PUT', `/admin/dishes/${dish.id}`, {})).status, 403, 'a waiter cannot edit the menu');
  assert.equal((await kitchen('PATCH', `/admin/dishes/${dish.id}/availability`, { available: true })).status, 200, 'the kitchen can mark a dish sold out');
  assert.equal((await waiter('GET', '/admin/staff')).status, 403);
  const entered = await waiter('POST', '/admin/orders', { table: 2, items: [{ dishId: dish.id, qty: 1 }] });
  assert.equal(entered.body.enteredBy, 'wait1');

  // The last owner stays; a switched-off account is signed out at once.
  const { body: list } = await call('GET', '/admin/staff', null, { admin: true });
  const owner = list.staff.find((x) => x.role === 'owner');
  assert.equal((await call('PUT', `/admin/staff/${owner.id}`, { role: 'waiter' }, { admin: true })).status, 409);
  const w = list.staff.find((x) => x.username === 'wait1');
  assert.equal((await call('PUT', `/admin/staff/${w.id}`, { active: false }, { admin: true })).status, 200);
  assert.equal((await waiter('GET', '/admin/orders')).status, 401);
  assert.equal((await signIn('wait1', 'password-wait1-own')).status, 401);
  assert.equal((await call('DELETE', `/admin/staff/${w.id}`, null, { admin: true })).status, 200);
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
  assert.equal(report.ratings.count, 1);
  assert.equal(report.ratings.average, 4);
  assert.equal(report.ratings.notes[0].comment, 'Lovely biryani');

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

test('staff can take dishes off an order, and the totals follow', async () => {
  const placed = await call('POST', '/orders', { table: 14, code: codes[14], items: [{ dishId: dish.id, qty: 3 }, { dishId: dish.id, qty: 1, spice: 'Mild' }] });
  const order = await Order.findOne({ publicId: placed.body.id });
  assert.equal((await call('PATCH', `/admin/orders/${order.id}/items`, { items: [{ index: 0, qty: 5 }] }, { admin: true })).status, 400, 'only fewer');
  const trimmed = await call('PATCH', `/admin/orders/${order.id}/items`, { items: [{ index: 0, qty: 1 }] }, { admin: true });
  assert.equal(trimmed.status, 200);
  assert.equal(trimmed.body.subtotal, dish.price * 2);
  assert.equal(trimmed.body.total, Math.round(dish.price * 2 * 1.05 * 100) / 100);
  assert.equal(trimmed.body.trail.at(-1).status, 'edited');
  const gone = await call('PATCH', `/admin/orders/${order.id}/items`, { items: [{ index: 0, qty: 0 }, { index: 1, qty: 0 }] }, { admin: true });
  assert.equal(gone.body.status, 'cancelled', 'nothing left: the order is cancelled');
  assert.equal((await call('PATCH', `/admin/orders/${order.id}/items`, { items: [{ index: 0, qty: 0 }] }, { admin: true })).status, 409);
});

test('a party can move to another table, and joins whoever is there', async () => {
  const a = await call('POST', '/orders', basket(15));
  await call('POST', '/calls', { table: 15, type: 'waiter', code: codes[15] });
  const b = await call('POST', '/orders', basket(16));
  assert.equal((await call('POST', '/admin/tables/15/move', { to: 999 }, { admin: true })).status, 400);
  assert.equal((await call('POST', '/admin/tables/15/move', { to: 16 }, { admin: true })).status, 200);
  const bill = (await call('GET', `/tables/16/bill?code=${codes[16]}`)).body.map((o) => o.number).sort();
  assert.deepEqual(bill, [a.body.number, b.body.number].sort(), 'one bill for the joined party');
  assert.equal((await call('GET', `/tables/15/bill?code=${codes[15]}`)).body.length, 0);
  assert.equal(await ServiceCall.countDocuments({ table: 16, status: 'open' }), 1, 'the call followed them');
  assert.equal((await call('POST', '/admin/tables/15/move', { to: 17 }, { admin: true })).status, 404, 'nothing left to move');
});

test('a flood of orders from one table is held back', async () => {
  const sent = [];
  for (let i = 0; i < 7; i += 1) sent.push((await call('POST', '/orders', basket(18))).status);
  assert.deepEqual(sent, [201, 201, 201, 201, 201, 201, 429]);
  const staff = await call('POST', '/admin/orders', { table: 18, items: [{ dishId: dish.id, qty: 1 }] }, { admin: true });
  assert.equal(staff.status, 201, 'staff can still enter orders for the table');
});

test('a locked-out owner gets back in with a one-time reset', async () => {
  const { resetOwnerFromEnv } = await import('../src/services/staff.js');
  process.env.RESET_OWNER_PASSWORD = 'reset-pass-123';
  await resetOwnerFromEnv();
  const signIn = (password) => fetch(url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: env.adminUsername, password }) });
  const r = await signIn('reset-pass-123');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).mustChange, true, 'they must choose a new one at once');
  const back = r.headers.get('set-cookie').split(';')[0];
  const own = await fetch(url + '/api/auth/password', { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: back }, body: JSON.stringify({ current: 'reset-pass-123', next: 'my-own-pass-456' }) });
  assert.equal(own.status, 200);
  await resetOwnerFromEnv(); // the server restarts with the variable still set
  assert.equal((await signIn('my-own-pass-456')).status, 200, 'leaving the variable set does not undo their new password');
  delete process.env.RESET_OWNER_PASSWORD;
  assert.equal((await Admin.findOne({ username: env.adminUsername.toLowerCase() })).mustChange, false);
});

test('guest alerts follow the party and stop when the table has paid', async () => {
  const fake = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${n}-${Date.now()}`, keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) } });
  const placed = await call('POST', '/orders', basket(20));
  const phone = fake(1);
  assert.equal((await call('POST', '/push/subscribe', { subscription: phone, orders: [placed.body.id], table: 20 })).status, 201);

  // The browser swaps its push address: the new one keeps listening for the same order and table.
  const renewed = fake(2);
  assert.equal((await call('POST', '/push/renew', { old: phone.endpoint, subscription: renewed })).body.ok, true);
  const sub = await PushSub.findOne({ endpoint: renewed.endpoint });
  assert.deepEqual([sub.orders[0], sub.table], [placed.body.id, 20]);
  assert.equal(await PushSub.countDocuments({ endpoint: phone.endpoint }), 0);

  // The party moves: their phone hears about the new table's calls.
  assert.equal((await call('POST', '/admin/tables/20/move', { to: 21 }, { admin: true })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await PushSub.findOne({ endpoint: renewed.endpoint })).table, 21);

  // They pay: the next party's calls at that table are not this phone's news.
  const order = await Order.findOne({ publicId: placed.body.id });
  for (const status of ['cooking', 'ready', 'served']) await call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });
  assert.equal((await call('POST', '/admin/tables/21/settle', { method: 'cash' }, { admin: true })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal((await PushSub.findOne({ endpoint: renewed.endpoint })).table, null);
});

test('marking a table paid records cash, UPI or card, and reports add them up', async () => {
  const placed = await call('POST', '/orders', basket(22));
  const order = await Order.findOne({ publicId: placed.body.id });
  for (const status of ['cooking', 'ready', 'served']) await call('PATCH', `/admin/orders/${order.id}`, { status }, { admin: true });
  assert.equal((await call('POST', '/admin/tables/22/settle', {}, { admin: true })).status, 400, 'the method is required');
  assert.equal((await call('POST', '/admin/tables/22/settle', { method: 'cheque' }, { admin: true })).status, 400);
  assert.equal((await call('POST', '/admin/tables/22/settle', { method: 'upi' }, { admin: true })).status, 200);
  const saved = await Order.findById(order.id);
  assert.equal(saved.paidBy, 'upi');
  assert.ok(saved.paidAt instanceof Date);

  const report = (await call('GET', '/admin/reports?tz=UTC', null, { admin: true })).body;
  const upi = report.payments.find((p) => p.method === 'upi');
  assert.ok(upi.orders >= 1 && upi.revenue >= saved.total);
  assert.ok(report.byDay.at(-1).upi >= saved.total, 'each day shows its UPI total');
  const csv = await fetch(`${url}/api/admin/reports/export?kind=orders&tz=UTC`, { headers: { cookie } });
  assert.match(await csv.text(), /,UPI\r\n/);
});
