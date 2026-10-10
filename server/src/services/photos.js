import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Dish, Image } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { UPLOAD_DIR } from '../middleware/index.js';

/**
 * Dish photos. Whatever the admin uploads (a phone JPG, a PNG, a WebP) is
 * turned into WebP, which is much smaller for the same look, in two sizes:
 *
 *   <id>.webp     up to 1000px, for the plate on the guest's screen
 *   <id>-s.webp   240px square, for lists and plates waiting off-centre
 *
 * Both are kept in the database, so they survive a redeploy.
 */

const FULL = { width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true };
const SMALL = { width: 240, height: 240, fit: 'cover' };

/** Any image in, two WebP buffers out. Phone photos are turned upright first. */
export async function toWebp(buffer) {
  try {
    const source = sharp(buffer, { failOn: 'none' }).rotate();
    const [full, small] = await Promise.all([
      source.clone().resize(FULL).webp({ quality: 80 }).toBuffer(),
      source.clone().resize(SMALL).webp({ quality: 72 }).toBuffer()
    ]);
    return { full, small };
  } catch {
    throw ApiError.badRequest('That file could not be read as a picture. Please try another photo.');
  }
}

/** Store a new photo in both sizes and return the address of the large one. */
export async function savePhoto(buffer) {
  const { full, small } = await toWebp(buffer);
  const id = crypto.randomBytes(12).toString('hex');
  await Image.insertMany([
    { name: `${id}.webp`, type: 'image/webp', data: full },
    { name: `${id}-s.webp`, type: 'image/webp', data: small }
  ]);
  return `/uploads/${id}.webp`;
}

/** Remove an uploaded photo in every size, wherever it is kept. The bundled sample photos are left alone. */
export async function removePhoto(url) {
  if (!url?.startsWith('/uploads/') || url.startsWith('/uploads/seed/')) return;
  const name = path.basename(url);
  const small = name.replace(/\.(\w+)$/, '-s.$1');
  await Promise.all([
    Image.deleteMany({ name: { $in: [name, small] } }),
    fs.unlink(path.join(UPLOAD_DIR, name)).catch(() => {})
  ]);
}

/**
 * Run at start-up. Brings older photos up to date, once:
 *   - sample dishes still pointing at the old .jpg samples move to the .webp ones
 *   - photos uploaded before this change (JPG or PNG, on disk or in the database) are converted
 */
export async function modernisePhotos() {
  let moved = 0;

  for (const dish of await Dish.find({ image: /^\/uploads\/seed\/[\w-]+\.jpg$/ }).select('image')) {
    const webp = dish.image.replace(/\.jpg$/, '.webp');
    const exists = await fs.access(path.join(UPLOAD_DIR, 'seed', path.basename(webp))).then(() => true, () => false);
    if (exists) { await Dish.updateOne({ _id: dish._id }, { image: webp }); moved += 1; }
  }

  for (const dish of await Dish.find({ image: /^\/uploads\/[a-f0-9]{24}\.(jpg|png)$/ }).select('image')) {
    const name = path.basename(dish.image);
    const stored = await Image.findOne({ name });
    const data = stored?.data || await fs.readFile(path.join(UPLOAD_DIR, name)).catch(() => null);
    if (!data) continue; // the file is gone: nothing to convert
    try {
      const url = await savePhoto(data);
      await Dish.updateOne({ _id: dish._id }, { image: url });
      await removePhoto(dish.image);
      moved += 1;
    } catch { /* an unreadable old photo stays as it is */ }
  }

  if (moved) console.log(`Converted ${moved} dish photo(s) to WebP.`);
}
