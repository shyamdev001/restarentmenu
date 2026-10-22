import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Admin, Secret } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Staff accounts and what each kind of job may do. Every signed-in person has
 * one role; each part of the admin panel asks for a capability, not a role, so
 * the table below is the single place that decides who can do what.
 *
 *   orders   see the live board and the kitchen screen
 *   cook     start an order and mark it ready
 *   serve    mark an order served
 *   cancel   cancel an order
 *   enter    enter an order for a table or the counter
 *   calls    answer a table calling for a server or the bill
 *   settle   mark a table as paid
 *   soldout  switch a dish to sold out and back
 *   menu     add, edit and delete dishes and categories
 *   reports  sales figures, reports and history
 *   qr       print the table QR codes
 *   guests   the guest club: the list, offers and reminders
 *   settings restaurant settings and the wheel
 *   staff    add, change and remove staff accounts
 */
export const ROLES = {
  owner: { label: 'Owner', can: ['orders', 'cook', 'serve', 'cancel', 'enter', 'calls', 'settle', 'soldout', 'menu', 'reports', 'qr', 'guests', 'settings', 'staff'] },
  manager: { label: 'Manager', can: ['orders', 'cook', 'serve', 'cancel', 'enter', 'calls', 'settle', 'soldout', 'menu', 'reports', 'qr', 'guests'] },
  waiter: { label: 'Waiter', can: ['orders', 'serve', 'enter', 'calls', 'settle'] },
  kitchen: { label: 'Kitchen', can: ['orders', 'cook', 'soldout'] }
};

export const canDo = (role, capability) => !!ROLES[role]?.can.includes(capability);

/** Which capability moving an order to each status needs. */
export const STEP_NEEDS = { cooking: 'cook', ready: 'cook', served: 'serve', cancelled: 'cancel' };

/** How a member of staff appears to the panel. Never includes the password. */
export const publicStaff = (s) => ({
  id: String(s._id), name: s.name || s.username, username: s.username, role: s.role || 'owner',
  active: s.active !== false, can: ROLES[s.role || 'owner'].can, createdAt: s.createdAt,
  mustChange: !!s.mustChange
});

/** The password a new install starts with. Nobody may keep it. */
export const DEFAULT_PASSWORD = 'admin12345';

export const listStaff = async () => (await Admin.find().sort({ createdAt: 1 })).map(publicStaff);

export async function addStaff({ name, username, role, password }) {
  if (await Admin.exists({ username: username.toLowerCase() })) throw ApiError.conflict(`The username "${username}" is already taken.`);
  // The owner chose this password, so the new person picks their own the first time they sign in.
  const staff = await Admin.create({ name, username, role, passwordHash: await bcrypt.hash(password, 12), mustChange: true });
  return publicStaff(staff);
}

/** The restaurant must always keep at least one owner who can sign in. */
async function assertOwnerRemains(exceptId) {
  const owners = await Admin.countDocuments({ _id: { $ne: exceptId }, role: 'owner', active: { $ne: false } });
  if (!owners) throw ApiError.conflict('There must always be at least one active owner.');
}

export async function changeStaff(id, { name, role, active, password }, by) {
  const staff = await Admin.findById(id);
  if (!staff) throw ApiError.notFound('That staff account no longer exists.');
  const losingOwner = (staff.role || 'owner') === 'owner' && ((role && role !== 'owner') || active === false);
  if (losingOwner) await assertOwnerRemains(staff._id);
  if (String(staff._id) === String(by) && active === false) throw ApiError.badRequest('You cannot switch off your own account.');
  if (name !== undefined) staff.name = name;
  if (role) staff.role = role;
  if (active !== undefined) staff.active = active;
  if (password) {
    staff.passwordHash = await bcrypt.hash(password, 12);
    staff.mustChange = String(staff._id) !== String(by); // reset by someone else: they choose their own next time
  }
  await staff.save();
  return publicStaff(staff);
}

export async function removeStaff(id, by) {
  const staff = await Admin.findById(id);
  if (!staff) throw ApiError.notFound('That staff account no longer exists.');
  if (String(staff._id) === String(by)) throw ApiError.badRequest('You cannot remove your own account.');
  if ((staff.role || 'owner') === 'owner') await assertOwnerRemains(staff._id);
  await staff.deleteOne();
}

/**
 * Accounts still on the password a new install starts with must change it.
 * Checked once at start-up for accounts made before this rule existed.
 */
export async function flagDefaultPasswords() {
  for (const admin of await Admin.find({ mustChange: { $exists: false } })) {
    admin.mustChange = await bcrypt.compare(DEFAULT_PASSWORD, admin.passwordHash);
    await admin.save();
  }
}

/**
 * The owner has forgotten their password. On a host such as Render, set
 * RESET_OWNER_PASSWORD (and optionally RESET_OWNER_USERNAME) and restart: that
 * owner can then sign in with it and must choose a new one at once. The same
 * value is applied only once, so leaving it set does not undo their new password.
 */
export async function resetOwnerFromEnv() {
  const password = process.env.RESET_OWNER_PASSWORD || '';
  if (!password) return;
  if (password.length < 8) { console.warn('RESET_OWNER_PASSWORD must be at least 8 characters. Nothing was changed.'); return; }
  const username = (process.env.RESET_OWNER_USERNAME || '').trim().toLowerCase();
  const stamp = crypto.createHash('sha256').update(username + '\0' + password).digest('hex');
  if ((await Secret.findOne({ key: 'ownerReset' }))?.value === stamp) return;

  let owner = username
    ? await Admin.findOne({ username })
    : await Admin.findOne({ $or: [{ role: 'owner' }, { role: { $exists: false } }] }).sort({ createdAt: 1, _id: 1 });
  if (!owner) owner = new Admin({ username: username || 'owner', name: 'Owner' });
  Object.assign(owner, { role: 'owner', active: true, mustChange: true, passwordHash: await bcrypt.hash(password, 12) });
  await owner.save();
  await Secret.findOneAndUpdate({ key: 'ownerReset' }, { value: stamp }, { upsert: true });
  console.warn(`Password reset for "${owner.username}". Sign in with it and choose a new one. You can now remove RESET_OWNER_PASSWORD.`);
}
