// Set a new password for a staff account, straight in the database.
// For when the owner is locked out:   npm run reset-password -- <username> <new password>
// They are asked to choose their own password the next time they sign in.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { Admin } from '../src/models/index.js';

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 8) {
  console.error('Usage: npm run reset-password -- <username> <new password of at least 8 characters>');
  process.exit(1);
}
await connectDb();
const admin = await Admin.findOne({ username: username.toLowerCase() });
if (!admin) {
  console.error(`No account called "${username}". Accounts: ${(await Admin.find({}, 'username')).map((a) => a.username).join(', ')}`);
} else {
  Object.assign(admin, { passwordHash: await bcrypt.hash(password, 12), active: true, mustChange: true });
  await admin.save();
  console.log(`Done. "${admin.username}" can sign in with the new password and will be asked to choose their own.`);
}
await mongoose.disconnect();
