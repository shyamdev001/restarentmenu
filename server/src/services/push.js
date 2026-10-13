import webpush from 'web-push';
import { env } from '../config/env.js';
import { PushKey, PushSub } from '../models/index.js';

/**
 * Web Push: notifications that reach a phone or laptop even when the menu or
 * admin tab is closed. Each browser that says yes stores a subscription here;
 * the kitchen's events are then sent to the right ones.
 *
 *   admins  every new order and table call
 *   guests  their own orders moving on, and their table's calls being answered
 */

let keys = null;

/** The signing keys: from the environment, or generated once and kept in the database. */
function ready() {
  if (!keys) {
    keys = (async () => {
      let pair = env.vapidPublic && env.vapidPrivate ? { publicKey: env.vapidPublic, privateKey: env.vapidPrivate } : null;
      if (!pair) {
        pair = await PushKey.findOne({ key: 'main' });
        if (!pair) pair = await PushKey.create({ key: 'main', ...webpush.generateVAPIDKeys() });
      }
      webpush.setVapidDetails(env.vapidSubject, pair.publicKey, pair.privateKey);
      return pair.publicKey;
    })().catch((err) => { keys = null; throw err; });
  }
  return keys;
}

export const publicKey = () => ready();

/**
 * One browser can be both: the owner's phone may run the admin panel and also
 * order as a guest. Each call only touches its own side of the record.
 */
export async function saveSubscription({ subscription, role, orders = [], table = null }) {
  const scope = role === 'admin' ? { admin: true } : { orders, table };
  await PushSub.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { $set: { keys: subscription.keys, seenAt: new Date(), ...scope } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

export const removeSubscription = (endpoint) => PushSub.deleteOne({ endpoint });

/** Send one message to every matching subscription. Never throws: push is a nicety. */
async function send(filter, message) {
  try {
    await ready();
    const subs = await PushSub.find(filter);
    await Promise.all(subs.map((sub) => webpush
      .sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(message), { TTL: 600, urgency: 'high' })
      .catch((err) => {
        // The browser has dropped this subscription: forget it.
        if (err.statusCode === 404 || err.statusCode === 410) return PushSub.deleteOne({ _id: sub._id });
        return null;
      })));
  } catch (err) {
    console.error('Push failed:', err.message);
  }
}

const tableName = (n) => (n === 0 ? 'Counter' : `Table ${n}`);

const GUEST_NEWS = {
  cooking: (o) => ['Your order is on the fire', `Order #${o.number} · about ${o.etaMin} minutes to your table.`],
  ready: (o) => ['On its way to your table', `Order #${o.number} has just left the kitchen.`],
  served: (o) => ['Served. Enjoy.', `Order #${o.number} is on your table.`],
  cancelled: (o) => [`Order #${o.number} was cancelled`, 'Please ask your server what happened.']
};

export const push = {
  orderCreated(order) {
    const plates = order.items.reduce((n, i) => n + i.qty, 0);
    send({ admin: true }, {
      title: `New order · ${tableName(order.table)}`,
      body: `#${order.number} · ${plates} ${plates === 1 ? 'plate' : 'plates'}`,
      tag: 'order-' + order.id, url: '/admin'
    });
  },
  callCreated(call) {
    send({ admin: true }, {
      title: `Table ${call.table} ${call.type === 'bill' ? 'wants the bill' : 'needs a server'}`,
      body: 'Open the orders board.',
      tag: 'call-' + call.id, url: '/admin'
    });
  },
  orderUpdated(order) {
    const news = GUEST_NEWS[order.status]?.(order);
    if (!news) return;
    send({ orders: order.publicId }, {
      title: news[0], body: news[1], tag: 'order-' + order.publicId, url: `/?table=${order.table}`
    });
  },
  callAnswered(call) {
    send({ table: call.table }, {
      title: call.type === 'bill' ? 'Your bill is on its way' : 'A server is on the way',
      body: `Table ${call.table} · they have seen your request.`,
      tag: 'call-' + call.type, url: `/?table=${call.table}`
    });
  }
};
