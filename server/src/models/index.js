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
  // The wheel guests can spin while they wait. Each prize has a weight (its share of the wheel's odds).
  game: {
    on: { type: Boolean, default: false },
    prizes: [{ _id: false, label: { type: String, trim: true, maxlength: 30 }, weight: { type: Number, min: 1, max: 100 }, win: { type: Boolean, default: true } }]
  },
  requireQr: { type: Boolean, default: false },  // only take orders that come from a scanned table QR code (off until the owner turns it on)
  // Where guests can follow, message or review the restaurant. Shown after the meal.
  social: {
    instagram: { type: String, default: '', trim: true },
    whatsapp: { type: String, default: '', trim: true },   // the restaurant's WhatsApp number
    google: { type: String, default: '', trim: true },     // the Google review link
    zomato: { type: String, default: '', trim: true },
    swiggy: { type: String, default: '', trim: true }
  },
  // The guest club, its stamp card and its reminders (see services/club.js).
  club: {
    on: { type: Boolean, default: true },
    loyalty: { type: Boolean, default: true },
    stamps: { type: Number, default: 5, min: 2, max: 20 },
    reward: { type: String, default: 'A dessert on us', trim: true },
    minSpend: { type: Number, default: 0, min: 0 },
    remind: { type: Boolean, default: false },
    remindDays: { type: Number, default: 30, min: 7, max: 365 },
    missYou: { type: String, default: '', trim: true },
    birthday: { type: String, default: '', trim: true }
  },
  // What the printed bill shows under the name. The tax is split into CGST and SGST when a GSTIN is set.
  address: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  gstin: { type: String, default: '', trim: true, uppercase: true },
  billNote: { type: String, default: '', trim: true },
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
  table: { type: Number, required: true, min: 0 },   // 0 is the counter: takeaway and walk-ins entered by staff
  source: { type: String, enum: ['guest', 'staff'], default: 'guest' }, // who entered it
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
  // When the order reached each step, for the kitchen-speed report.
  cookingAt: Date, readyAt: Date, servedAt: Date, cancelledAt: Date,
  // While-you-wait: the table's one spin of the wheel, and the guest's rating after the meal.
  spunAt: Date,
  prize: { label: String, win: Boolean },
  rating: { stars: { type: Number, min: 1, max: 5 }, comment: { type: String, trim: true, maxlength: 300 }, at: Date },
  // Who did what: the staff member who entered it (if any), and each step with who took it.
  enteredBy: String,
  trail: [{ _id: false, status: String, by: String, at: Date }],
  settled: { type: Boolean, default: false },     // the table has paid: no longer part of anyone's bill
  paidBy: { type: String, enum: ['cash', 'upi', 'card'] }, // how, as staff recorded it when marking the table paid
  paidAt: Date,
  visit: { type: String },                        // the party at the table (see services/tables.js): one bill, one spin
  guest: { type: Schema.Types.ObjectId, ref: 'Guest', index: true }, // a club member who ordered it
  clientKey: { type: String }                     // made by the guest's phone, so a retried send is not a second order
}, jsonOptions);
orderSchema.index({ createdAt: -1 });
orderSchema.index({ table: 1, settled: 1 });
orderSchema.index({ table: 1, visit: 1 });
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
// Everyone who signs in to the admin panel. The role decides what they may do (see services/staff.js).
const adminSchema = new Schema({
  name: { type: String, trim: true, maxlength: 40 },
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['owner', 'manager', 'waiter', 'kitchen'], default: 'owner' },
  active: { type: Boolean, default: true },
  // Set when someone else chose the password (the first owner, or a new member of staff): they pick their own at first sign-in.
  mustChange: { type: Boolean }
}, jsonOptions);

/* ---------------------------------- Guest club ---------------------------------- */
// Guests who chose to join: for offers, reminders and the stamp card. Deleted when they leave.
const guestSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  phone: { type: String, required: true, unique: true },          // country code and digits, e.g. 919876543210
  birthday: { _id: false, day: { type: Number, min: 1, max: 31 }, month: { type: Number, min: 1, max: 12 } },
  consentAt: { type: Date, required: true },                       // when they ticked the box
  keys: { type: [String], default: [], index: true },               // one per phone that joined: lets that phone show the card
  offers: { _id: false, endpoint: String, keys: { p256dh: String, auth: String } }, // push for offers and reminders
  visits: { type: Number, default: 0 },
  spent: { type: Number, default: 0 },
  lastVisitAt: { type: Date, index: true },
  seenVisits: { type: [String], default: [] },                      // visits already counted
  stamps: { type: Number, default: 0 },
  rewardsReady: { type: Number, default: 0 },
  rewardsUsed: { type: Number, default: 0 },
  sent: { type: Number, default: 0 },                              // offers sent to them
  lastMissYouAt: Date,
  lastBirthdayYear: Number
}, jsonOptions);

/* --------------------------------- Table visits -------------------------------- */
// Which party is sitting at each table now. One small document per table, changed only by compare-and-swap.
const tableVisitSchema = new Schema({
  table: { type: Number, required: true, unique: true },
  visit: { type: String, default: null },
  openedAt: Date
});

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
export const TableVisit = model('TableVisit', tableVisitSchema);
export const Guest = model('Guest', guestSchema);

/** Always returns the single settings document, creating it if needed. */
export async function getSettings() {
  return Setting.findOneAndUpdate({ key: 'main' }, {}, { new: true, upsert: true, setDefaultsOnInsert: true });
}
