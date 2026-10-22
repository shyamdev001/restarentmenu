import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import mongoose from 'mongoose';
import { COOKIE_NAME } from '../middleware/index.js';

let io = null;

function readCookie(header = '', name) {
  const hit = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}

/**
 * Rooms:
 *   "admin"            every signed-in admin screen
 *   "order:<publicId>" the customer(s) who placed that order
 *   "table:<n>"        the phones sitting at that table (to hear a call was answered)
 *   (broadcast)        menu changes go to everyone
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: env.isProd ? undefined : { origin: env.clientOrigin, credentials: true }
  });

  io.on('connection', (socket) => {
    try {
      jwt.verify(readCookie(socket.handshake.headers.cookie, COOKIE_NAME), env.jwtSecret);
      socket.join('admin');
    } catch { /* not an admin: customer socket */ }

    socket.on('table:watch', (table) => {
      const n = Number(table);
      if (!Number.isInteger(n) || n < 1 || n > 500) return;
      [...socket.rooms].filter((room) => room.startsWith('table:')).forEach((room) => socket.leave(room));
      socket.join('table:' + n);
    });

    socket.on('orders:watch', (ids) => {
      if (!Array.isArray(ids)) return;
      ids.slice(-30).forEach((id) => {
        if (typeof id === 'string' && /^[a-f0-9]{24}$/.test(id)) socket.join('order:' + id);
      });
    });
  });
  return io;
}

/**
 * With several copies of the server, an event raised on one must reach the
 * browsers connected to the others. This passes events through MongoDB.
 * It relies on change streams, so the database must be a replica set
 * (MongoDB Atlas is one; a plain local MongoDB is not).
 */
export async function shareAcrossServers() {
  if (env.socketAdapter !== 'mongo' || !io) return;
  const { createAdapter } = await import('@socket.io/mongo-adapter');
  const events = mongoose.connection.db.collection('socket.io-adapter-events');
  await events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 }).catch(() => {});
  io.adapter(createAdapter(events, { addCreatedAtField: true }));
  console.log('Live updates are shared between server copies through MongoDB (needs a replica set, e.g. Atlas).');
}

/** A table's orders changed: its phones re-read the bill, and admin screens re-read open tables. */
const tableChanged = (table) => {
  io?.to('table:' + table).emit('table:update');
  io?.to('admin').emit('tables:update');
};

export const realtime = {
  orderCreated: (order) => { io?.to('admin').emit('order:new', order); tableChanged(order.table); },
  orderUpdated: (order, publicView) => {
    io?.to('admin').emit('order:update', order);
    io?.to('order:' + order.publicId).emit('order:update', publicView);
    tableChanged(order.table);
  },
  /** The table has paid: its phones start a fresh visit. */
  tableSettled: (table) => { io?.to('table:' + table).emit('table:cleared'); tableChanged(table); },
  callCreated: (call) => io?.to('admin').emit('call:new', call),
  callUpdated: (call) => {
    io?.to('admin').emit('call:update', call);
    if (call.status === 'done') io?.to('table:' + call.table).emit('call:done', { table: call.table, type: call.type });
  },
  menuChanged: () => io?.emit('menu:update'),
  /** Something on the open-tables list changed without an order moving (e.g. a reward was used). */
  tablesChanged: () => io?.to('admin').emit('tables:update')
};
