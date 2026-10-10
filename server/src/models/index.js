import mongoose from 'mongoose';
import { jsonOptions } from '../config/db.js';

const { Schema, model } = mongoose;

/* ----------------------------- Settings (singleton) ----------------------------- */
const settingSchema = new Schema({
  key: { type: String, default: 'main', unique: true },
  name: { type: String, default: 'My Restaurant', trim: true },
  tagline: { type: String, default: '', trim: true },
  welcome: { type: String, default: '', trim: true },
  currency: { type: String, default: '₹', trim: true },
  taxPercent: { type: Number, default: 5, min: 0, max: 50 },
  tables: { type: Number, default: 10, min: 1, max: 500 },
  publicUrl: { type: String, default: '', trim: true },
  requireQr: { type: Boolean, default: true },   // only take orders that come from a scanned table QR code
  orderCounter: { type: Number, default: 100 }
}, jsonOptions);

/* ---------------------------------- Category ---------------------------------- */
const categorySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  sort: { type: Number, default: 0 }
}, jsonOptions);

/* ------------------------------------ Dish ------------------------------------ */
const dishSchema = new Schema({
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 60 },
  accent: { type: String, default: '', trim: true, maxlength: 40 },   // second half of the name, set in italics
  word: { type: String, default: '', trim: true, uppercase: true, maxlength: 14 }, // giant background word
  description: { type: String, default: '', trim: true, maxlength: 280 },
  price: { type: Number, required: true, min: 0 },
  veg: { type: Boolean, default: false },
  prepMin: { type: Number, default: 15, min: 0, max: 240 },
  spice: { type: Number, default: 0, min: 0, max: 3 },
  ingredients: [{ type: String, trim: true, maxlength: 30 }],
  allergens: { type: String, default: '', trim: true, maxlength: 120 },
  kcal: { type: Number, default: 0, min: 0 },
  protein: { type: Number, default: 0, min: 0 },
  chefNote: { type: String, default: '', trim: true, maxlength: 220 },
  image: { type: String, default: '' },
  color: { type: String, default: '#7A2E0C', match: /^#[0-9a-fA-F]{6}$/ },
  addons: [{ _id: false, name: { type: String, trim: true, maxlength: 40 }, price: { type: Number, min: 0 } }],
  available: { type: Boolean, default: true },
  sort: { type: Number, default: 0 }
}, jsonOptions);

/* ------------------------------------ Order ----------------------------------- */
export const ORDER_STATUSES = ['new', 'cooking', 'ready', 'served', 'cancelled'];

const orderSchema = new Schema({
  publicId: { type: String, required: true, unique: true }, // unguessable id handed to the customer
  number: { type: Number, required: true },
  table: { type: Number, required: true, min: 1 },
  items: [{
    _id: false,
    dish: { type: Schema.Types.ObjectId, ref: 'Dish' },
    name: String,
    qty: { type: Number, min: 1 },
    unitPrice: Number,
    spice: String,
    addons: [{ _id: false, name: String, price: Number }],
    note: String,
    lineTotal: Number
  }],
  subtotal: Number,
  taxPercent: Number,
  tax: Number,
  total: Number,
  etaMin: Number,
  status: { type: String, enum: ORDER_STATUSES, default: 'new', index: true },
  settled: { type: Boolean, default: false },     // the table has paid: no longer part of anyone's bill
  clientKey: { type: String }                     // made by the guest's phone, so a retried send is not a second order
}, jsonOptions);
orderSchema.index({ createdAt: -1 });
orderSchema.index({ table: 1, settled: 1 });
orderSchema.index({ clientKey: 1 }, { unique: true, partialFilterExpression: { clientKey: { $type: 'string' } } });

/* -------------------------------- Service calls ------------------------------- */
const callSchema = new Schema({
  table: { type: Number, required: true, min: 1 },
  type: { type: String, enum: ['waiter', 'bill'], required: true },
  status: { type: String, enum: ['open', 'done'], default: 'open', index: true }
}, jsonOptions);
// At most one open call of each kind per table, even if two phones ask in the same instant.
callSchema.index({ table: 1, type: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });

/* ------------------------------ Push notifications ---------------------------- */
// One per browser that agreed to notifications. Guests are forgotten a day after their last visit.
const pushSubSchema = new Schema({
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  admin: { type: Boolean, default: false, index: true },    // hears every new order and table call
  orders: { type: [String], default: [], index: true },   // guest: the order publicIds to hear about
  table: { type: Number, default: null, index: true },     // guest: the table whose calls to hear about
  seenAt: { type: Date, default: Date.now }
}, jsonOptions);
pushSubSchema.index({ seenAt: 1 }, { name: 'guest_expiry', expireAfterSeconds: 24 * 3600, partialFilterExpression: { admin: false } });

const pushKeySchema = new Schema({
  key: { type: String, default: 'main', unique: true },
  publicKey: { type: String, required: true },
  privateKey: { type: String, required: true }
});

/* ----------------------------------- Photos ----------------------------------- */
// Dish photos live in the database, so they survive a redeploy on hosts that wipe the disk.
const imageSchema = new Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  data: { type: Buffer, required: true }
}, { timestamps: true });

/* ----------------------------------- Secrets ---------------------------------- */
const secretSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true }
});

/* ------------------------------------ Admin ----------------------------------- */
const adminSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true }
}, jsonOptions);

export const Setting = model('Setting', settingSchema);
export const Category = model('Category', categorySchema);
export const Dish = model('Dish', dishSchema);
export const Order = model('Order', orderSchema);
export const ServiceCall = model('ServiceCall', callSchema);
export const Admin = model('Admin', adminSchema);
export const PushSub = model('PushSub', pushSubSchema);
export const PushKey = model('PushKey', pushKeySchema);
export const Image = model('Image', imageSchema);
export const Secret = model('Secret', secretSchema);

/** Always returns the single settings document, creating it if needed. */
export async function getSettings() {
  return Setting.findOneAndUpdate({ key: 'main' }, {}, { new: true, upsert: true, setDefaultsOnInsert: true });
}
