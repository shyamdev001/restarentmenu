import bcrypt from 'bcryptjs';
import { Admin } from '../models/index.js';
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
 *   settings restaurant settings and the wheel
 *   staff    add, change and remove staff accounts
 */
export const ROLES = {
  owner: { label: 'Owner', can: ['orders', 'cook', 'serve', 'cancel', 'enter', 'calls', 'settle', 'soldout', 'menu', 'reports', 'qr', 'settings', 'staff'] },
  manager: { label: 'Manager', can: ['orders', 'cook', 'serve', 'cancel', 'enter', 'calls', 'settle', 'soldout', 'menu', 'reports', 'qr'] },
  waiter: { label: 'Waiter', can: ['orders', 'serve', 'enter', 'calls', 'settle'] },
  kitchen: { label: 'Kitchen', can: ['orders', 'cook', 'soldout'] }
};

export const canDo = (role, capability) => !!ROLES[role]?.can.includes(capability);

/** Which capability moving an order to each status needs. */
export const STEP_NEEDS = { cooking: 'cook', ready: 'cook', served: 'serve', cancelled: 'cancel' };

/** How a member of staff appears to the panel. Never includes the password. */
export const publicStaff = (s) => ({
  id: String(s._id), name: s.name || s.username, username: s.username, role: s.role || 'owner',
  active: s.active !== false, can: ROLES[s.role || 'owner'].can, createdAt: s.createdAt
});

export const listStaff = async () => (await Admin.find().sort({ createdAt: 1 })).map(publicStaff);

export async function addStaff({ name, username, role, password }) {
  if (await Admin.exists({ username: username.toLowerCase() })) throw ApiError.conflict(`The username "${username}" is already taken.`);
  const staff = await Admin.create({ name, username, role, passwordHash: await bcrypt.hash(password, 12) });
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
  if (password) staff.passwordHash = await bcrypt.hash(password, 12);
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
