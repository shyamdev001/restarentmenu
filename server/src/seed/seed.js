import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { connectDb } from '../config/db.js';
import { env } from '../config/env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Admin, Category, Dish, Image, Order, ServiceCall, Setting } from '../models/index.js';
import { IMAGE_TYPES, UPLOAD_DIR } from '../middleware/index.js';
import * as data from './data.js';

/**
 * Dish photos used to be saved on the server's disk, which many hosts wipe on
 * every redeploy. Copy any that are still there into the database, once.
 */
export async function importDiskPhotos() {
  const types = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]));
  const dishes = await Dish.find({ image: /^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/ }).select('image');
  let copied = 0;
  for (const dish of dishes) {
    const name = path.basename(dish.image);
    if (await Image.exists({ name })) continue;
    const data = await fs.readFile(path.join(UPLOAD_DIR, name)).catch(() => null);
    if (!data) continue;
    await Image.create({ name, type: types[path.extname(name)], data });
    copied += 1;
  }
  if (copied) console.log(`Moved ${copied} dish photo(s) from disk into the database.`);
}

/** Create the first admin account and, on an empty database, the sample menu. */
export async function ensureSeed({ reset = false } = {}) {
  if (reset) {
    await Promise.all([Category, Dish, Order, ServiceCall, Setting].map((m) => m.deleteMany({})));
  }

  if (!(await Admin.exists({}))) {
    await Admin.create({ username: env.adminUsername.toLowerCase(), passwordHash: await bcrypt.hash(env.adminPassword, 12) });
    console.log(`Admin account created: "${env.adminUsername}". Change the password after signing in.`);
  }

  if (await Setting.exists({ key: 'main' })) return;
  await Setting.create({ key: 'main', ...data.settings });

  const categories = await Category.insertMany(data.categories.map(([, name], sort) => ({ name, sort })));
  const categoryId = Object.fromEntries(data.categories.map(([key], i) => [key, categories[i]._id]));

  await Dish.insertMany(data.rows.map((r, sort) => ({
    category: categoryId[r[1]], veg: !!r[2], word: r[3], name: r[4], accent: r[5], description: r[6],
    price: r[7], prepMin: r[8], color: r[9], image: `/uploads/seed/${r[10]}.jpg`,
    ingredients: r[11], allergens: r[12], kcal: r[13], protein: r[14], spice: r[15], chefNote: r[16],
    addons: data.addons[r[1]].map(([name, price]) => ({ name, price })),
    sort
  })));
  console.log(`Sample menu created: ${data.rows.length} dishes in ${categories.length} categories.`);
}

// Run directly:  npm run seed   (wipes the menu and orders, keeps the admin account)
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await connectDb();
  await ensureSeed({ reset: process.argv.includes('--reset') });
  await mongoose.disconnect();
}
