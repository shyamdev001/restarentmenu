import { z } from 'zod';
import { ORDER_STATUSES } from '../models/index.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const text = (max) => z.string().trim().max(max);

export const loginSchema = z.object({
  username: text(40).min(1),
  password: z.string().min(1).max(200)
});

const role = z.enum(['owner', 'manager', 'waiter', 'kitchen']);
export const staffAddSchema = z.object({
  name: text(40).min(1, 'Name is required'),
  username: z.string().trim().toLowerCase().min(3, 'Use at least 3 letters for the username').max(40).regex(/^[a-z0-9._-]+$/, 'Usernames use letters, numbers, dots and dashes only'),
  role,
  password: z.string().min(8, 'Use at least 8 characters for the password').max(200)
});
export const staffChangeSchema = z.object({
  name: text(40).min(1).optional(),
  role: role.optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, 'Use at least 8 characters for the password').max(200).optional()
});

export const passwordSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(8, 'Use at least 8 characters').max(200)
});

const tableCode = z.string().max(40).optional();   // from the table's QR code

export const orderSchema = z.object({
  table: z.coerce.number().int().min(1).max(500),
  code: tableCode,
  clientKey: z.string().regex(/^[\w-]{16,64}$/).optional(),
  guestKey: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  expected: z.coerce.number().min(0).max(100000000).optional(),
  items: z.array(z.object({
    dishId: objectId,
    qty: z.coerce.number().int().min(1).max(20),
    spice: z.enum(['', 'Mild', 'Medium', 'Fiery']).default(''),
    addons: z.array(text(40)).max(8).default([]),
    note: text(140).default('')
  })).min(1, 'Your order is empty').max(40)
});

// An order entered by staff from the admin panel. Table 0 is the counter (takeaway, walk-ins).
export const staffOrderSchema = z.object({
  table: z.coerce.number().int().min(0).max(500),
  items: orderSchema.shape.items
});

export const callSchema = z.object({
  table: z.coerce.number().int().min(1).max(500),
  code: tableCode,
  type: z.enum(['waiter', 'bill'])
});

// The server sends a request to this address, so it must be a real browser push
// service and nothing else (never an address inside our own network).
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;
const pushEndpoint = z.string().url().max(2000).refine((value) => {
  try { const url = new URL(value); return url.protocol === 'https:' && PUSH_HOSTS.test(url.hostname); } catch { return false; }
}, 'Unknown push service');

const subscription = z.object({
  endpoint: pushEndpoint,
  keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(300) })
});

export const pushGuestSchema = z.object({
  subscription,
  orders: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(30).default([]),
  table: z.coerce.number().int().min(1).max(500).nullable().default(null)
});
export const pushAdminSchema = z.object({ subscription });
export const pushRemoveSchema = z.object({ endpoint: pushEndpoint });
export const pushRenewSchema = z.object({ old: pushEndpoint, subscription });

export const ratingSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  comment: text(300).default('')
});

// The wheel: between two and eight segments, each with a label, its share of the odds, and whether it is a prize.
export const gameSchema = z.object({
  on: z.boolean(),
  prizes: z.array(z.object({
    label: text(30).min(1, 'Each segment needs a name'),
    weight: z.coerce.number().int().min(1).max(100),
    win: z.boolean()
  })).min(2, 'The wheel needs at least two segments').max(8)
});

export const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });

// Taking dishes off an order: each changed line and its new, lower quantity (0 removes it).
export const trimSchema = z.object({
  items: z.array(z.object({ index: z.number().int().min(0).max(39), qty: z.number().int().min(0).max(20) })).min(1).max(40)
});

export const moveSchema = z.object({ to: z.coerce.number().int().min(1).max(500) });

// Marking a table paid: how the money came in, for the day's cash, UPI and card totals.
export const settleSchema = z.object({ method: z.enum(['cash', 'upi', 'card'], { errorMap: () => ({ message: 'Choose cash, UPI or card' }) }) });

export const reorderSchema = z.object({ ids: z.array(objectId).min(1).max(200) });

export const categorySchema = z.object({
  name: text(40).min(1, 'Name is required'),
  sort: z.coerce.number().int().min(0).max(9999).default(0)
});

export const dishSchema = z.object({
  category: objectId,
  name: text(60).min(1, 'Name is required'),
  accent: text(40).default(''),
  word: text(14).default(''),
  description: text(280).default(''),
  price: z.coerce.number().min(0).max(1000000),
  veg: z.coerce.boolean().default(false),
  prepMin: z.coerce.number().int().min(0).max(240).default(15),
  spice: z.coerce.number().int().min(0).max(3).default(0),
  ingredients: z.array(text(30).min(1)).max(12).default([]),
  allergens: text(120).default(''),
  kcal: z.coerce.number().min(0).max(5000).default(0),
  protein: z.coerce.number().min(0).max(500).default(0),
  chefNote: text(220).default(''),
  image: z.string().max(200).regex(/^(\/uploads\/[\w\-./]+)?$/, 'Invalid image path').default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour').default('#7A2E0C'),
  addons: z.array(z.object({ name: text(40).min(1), price: z.coerce.number().min(0).max(100000) })).max(8).default([]),
  available: z.coerce.boolean().default(true),
  sort: z.coerce.number().int().min(0).max(9999).default(0)
});

export const settingsSchema = z.object({
  name: text(60).min(1, 'Name is required'),
  tagline: text(80).default(''),
  welcome: text(200).default(''),
  currency: text(4).min(1).default('₹'),
  taxPercent: z.coerce.number().min(0).max(50),
  tables: z.coerce.number().int().min(1).max(500),
  publicUrl: z.string().trim().max(200).regex(/^(https?:\/\/[^\s]+)?$/, 'Must start with http:// or https://').default(''),
  requireQr: z.boolean().default(false),
  address: text(160).default(''),
  phone: text(30).default(''),
  gstin: z.string().trim().toUpperCase().regex(/^([0-9A-Z]{15})?$/, 'A GSTIN is 15 letters and numbers').default(''),
  billNote: text(120).default('')
});

/* --------------------------------- Guest club --------------------------------- */
const clubKey = z.string().regex(/^[a-f0-9]{24}$/, 'Unknown card');

export const clubJoinSchema = z.object({
  name: text(40).min(1, 'Please tell us your name'),
  phone: z.string().trim().min(8, 'Please enter your mobile number').max(20),
  birthday: z.object({ day: z.number().int().min(1).max(31), month: z.number().int().min(1).max(12) }).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please tick the box to join.' }) }),
  orders: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(30).default([]),
  subscription: subscription.optional()
});
export const clubKeySchema = z.object({ key: clubKey });
export const clubPushSchema = z.object({ key: clubKey, subscription });

export const offerSchema = z.object({
  ids: z.array(objectId).min(1, 'Choose who to send it to').max(1000),
  title: text(60).min(1, 'Give the offer a title'),
  body: text(200).min(1, 'Write the offer')
});

const link = z.string().trim().max(300).regex(/^(https?:\/\/[^\s]+)?$/, 'Links start with https://').default('');
export const clubSettingsSchema = z.object({
  social: z.object({
    instagram: link, google: link, zomato: link, swiggy: link,
    whatsapp: z.string().trim().max(20).regex(/^(\+?[\d\s-]{8,20})?$/, 'Enter the WhatsApp number with country code').default('')
  }),
  club: z.object({
    on: z.boolean(),
    loyalty: z.boolean(),
    stamps: z.coerce.number().int().min(2).max(20),
    reward: text(60).min(1, 'Say what the reward is'),
    minSpend: z.coerce.number().min(0).max(100000),
    remind: z.boolean(),
    remindDays: z.coerce.number().int().min(7).max(365),
    missYou: text(200).min(1, 'Write the reminder'),
    birthday: text(200).min(1, 'Write the birthday message')
  })
});
