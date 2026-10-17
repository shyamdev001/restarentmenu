import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Admin } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { publicStaff } from '../services/staff.js';
import { COOKIE_NAME } from '../middleware/index.js';

const SESSION_HOURS = 12;
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  maxAge: SESSION_HOURS * 60 * 60 * 1000,
  path: '/'
};

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username: username.toLowerCase() });
  // Compare even when the user is unknown, so timing does not reveal valid usernames.
  const ok = await bcrypt.compare(password, admin?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!admin || !ok) throw ApiError.unauthorized('Wrong username or password.');
  if (admin.active === false) throw ApiError.unauthorized('This account has been switched off. Ask the owner.');

  const token = jwt.sign({ sub: String(admin._id) }, env.jwtSecret, { expiresIn: `${SESSION_HOURS}h` });
  res.cookie(COOKIE_NAME, token, cookieOptions).json(publicStaff(admin));
});

export const logout = (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined }).json({ ok: true });
};

export const me = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.adminId);
  if (!admin) throw ApiError.unauthorized();
  res.json(publicStaff(admin));
});

export const changePassword = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.adminId);
  if (!admin || !(await bcrypt.compare(req.body.current, admin.passwordHash))) {
    throw ApiError.badRequest('Current password is wrong.');
  }
  admin.passwordHash = await bcrypt.hash(req.body.next, 12);
  await admin.save();
  res.json({ ok: true });
});
