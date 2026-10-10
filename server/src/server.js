import http from 'node:http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { initSocket, shareAcrossServers } from './services/socket.js';
import { ensureSeed, importDiskPhotos } from './seed/seed.js';
import { modernisePhotos } from './services/photos.js';

async function main() {
  await connectDb();
  await ensureSeed();
  await importDiskPhotos();
  await modernisePhotos();

  const server = http.createServer(createApp());
  initSocket(server);
  await shareAcrossServers();

  server.listen(env.port, () => {
    console.log(`Server ready on http://localhost:${env.port}`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Could not start the server:', err.message);
  if (/ECONNREFUSED|ServerSelection/i.test(String(err))) {
    console.error('MongoDB is not reachable. Start MongoDB or set MONGODB_URI in server/.env.');
  }
  process.exit(1);
});
