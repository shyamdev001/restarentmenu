import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { Admin } from '../models/index.js';
import { canDo } from '../services/staff.js';

export const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
export const COOKIE_NAME = 'sm_token';

/** Validate req.body against a zod schema and replace it with the parsed value. */
export const validate = (schema) => (req, _res, next) => {
  req.body = schema.parse(req.body);
  next();
};

/**
 * Require a signed-in member of staff. The account is read fresh on every
 * request, so a changed role or a switched-off account takes effect at once.
 */
export async function requireAdmin(req, _res, next) {
  try {
    const payload = jwt.verify(req.cookies?.[COOKIE_NAME] || '', env.jwtSecret);
    const staff = await Admin.findById(payload.sub).lean();
    if (!staff || staff.active === false) throw new Error('signed out');
    req.adminId = payload.sub;
    req.staff = { id: String(staff._id), name: staff.name || staff.username, role: staff.role || 'owner', mustChange: !!staff.mustChange };
    next();
  } catch {
    next(ApiError.unauthorized());
  }
}

/** Only staff whose role includes this capability may go further. */
export const allow = (capability) => (req, _res, next) => {
  // Someone still on a password another person chose (or the install's default) must pick their own first.
  if (req.staff?.mustChange) return next(new ApiError(403, 'Choose your own password first.'));
  return canDo(req.staff?.role, capability) ? next() : next(new ApiError(403, 'Your role does not allow this. Ask the owner if you need it.'));
};

const limiter = (windowMs, max, message) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  message: { message }
});
// Counted per network address, and a whole dining room is usually one address: keep it generous.
export const publicWriteLimiter = limiter(60 * 1000, 120, 'Too many requests. Please wait a moment.');
// A whole dining room often shares one Wi-Fi address, so this is kept apart from orders and calls.
export const pushLimiter = limiter(60 * 1000, 240, 'Too many requests. Please wait a moment.');
export const loginLimiter = limiter(15 * 60 * 1000, 10, 'Too many sign-in attempts. Try again in 15 minutes.');

export const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
export const uploadImage = multer({
  storage: multer.memoryStorage(), // kept in the database, not on the server's disk
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (IMAGE_TYPES[file.mimetype]
    ? cb(null, true)
    : cb(ApiError.badRequest('Only JPG, PNG or WebP images are allowed.')))
}).single('image');

export function notFound(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ message: first?.message || 'Invalid input.', field: first?.path?.join('.') });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (5 MB max).' : err.message });
  }
  if (err?.name === 'CastError') return res.status(400).json({ message: 'Invalid id.' });
  if (err?.name === 'ValidationError') return res.status(400).json({ message: err.message });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 && env.isProd ? 'Something went wrong.' : err.message });
}
