export const money = (amount, currency = '₹') =>
  currency + Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** This device's time zone, sent with report requests so days and hours are the restaurant's own. */
export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** The small version of a dish photo, for lists and anything shown at thumbnail size. */
export const thumb = (url) => (/^\/uploads\/.+\.webp$/.test(url || '') && !url.endsWith('-s.webp') ? url.replace(/\.webp$/, '-s.webp') : url);

export const pad2 = (n) => String(n).padStart(2, '0');

export const fullName = (dish) => `${dish.name} ${dish.accent || ''}`.trim();

export const SPICE_LEVELS = ['Mild', 'Medium', 'Fiery'];
export const HEAT_LABELS = ['No heat', 'Mild', 'Medium', 'Fiery'];

/** The customer's saved choices for a dish, with defaults. */
export const optionFor = (opts, dish) => ({
  spice: dish.spice > 0 ? 'Medium' : '',
  addons: {},
  note: '',
  ...(opts[dish.id] || {})
});

/** Dish price plus the chosen add-ons. Display only: the server recalculates. */
export function unitPrice(dish, opt) {
  return dish.price + dish.addons.filter((a) => opt.addons[a.name]).reduce((sum, a) => sum + a.price, 0);
}

/** A lighter, more saturated version of a hex colour, for the glow behind the plate. */
export function glowOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.min(255, Math.round(c + (255 - c) * 0.32));
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export function timeAgo(date) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
}
