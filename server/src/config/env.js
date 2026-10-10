import 'dotenv/config';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

export const env = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/saffron_menu',
  // In development a random secret is fine: sessions simply reset on restart.
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Web Push signing keys. Left empty, a pair is generated once and kept in the database.
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  // Set to "mongo" when running more than one copy of the server, so live updates reach every copy.
  socketAdapter: process.env.SOCKET_ADAPTER || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin12345'
};
