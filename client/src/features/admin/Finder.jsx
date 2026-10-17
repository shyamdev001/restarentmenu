import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { fullName } from '../../lib/format.js';

/**
 * Everything an owner might look for, in their own words. Each entry says
 * where it lives, so typing "gst" or "password" finds the right page.
 */
const ALL_PLACES = [
  { label: 'Orders board', where: 'Orders', to: 'orders', words: 'new cooking ready served kitchen live cancel order' },
  { label: 'Kitchen screen', where: 'Kitchen screen', to: 'kitchen', words: 'kds kitchen display tickets chef cook tablet pass timer' },
  { label: 'Add or remove staff', where: 'Staff', to: 'staff', words: 'staff waiter cook chef manager employee user role permission login account' },
  { label: 'Enter an order yourself', where: 'Orders', to: 'orders', extra: { newOrder: true }, needs: 'enter', words: 'manual new order takeaway counter walk-in phone parcel staff' },
  { label: 'Spoken order call-outs', where: 'Bell, top right', run: 'bell', words: 'voice speak announce read aloud kitchen call out' },
  { label: 'Mark a table as paid', where: 'Orders', to: 'orders', words: 'bill paid settle open tables close' },
  { label: 'Tables asking for a server or the bill', where: 'Orders', to: 'orders', words: 'call waiter bill request' },
  { label: 'Sales reports', where: 'Reports', to: 'reports', words: 'revenue sales income best sellers daily monthly analytics profit data' },
  { label: 'Best-selling dishes', where: 'Reports', to: 'reports', words: 'top popular most ordered dishes' },
  { label: 'Download a spreadsheet', where: 'Reports', to: 'reports', words: 'export excel csv download' },
  { label: 'Busiest hours and days', where: 'Reports', to: 'reports', words: 'peak time rush weekday' },
  { label: 'Tax collected', where: 'Reports', to: 'reports', words: 'gst tax vat' },
  { label: 'Past orders by day', where: 'History', to: 'history', words: 'old previous yesterday orders history' },
  { label: 'Add a dish', where: 'Dishes', to: 'menu', extra: { newDish: true }, needs: 'menu', words: 'new item food create' },
  { label: 'Change a price or photo', where: 'Dishes', to: 'menu', words: 'edit price photo image picture description' },
  { label: 'Mark a dish sold out', where: 'Dishes', to: 'menu', words: 'unavailable out of stock finished hide' },
  { label: 'Extras and add-ons', where: 'Dishes', to: 'menu', words: 'addons extras sides options' },
  { label: 'Categories and their order', where: 'Categories', to: 'categories', words: 'rename reorder sections groups starters drinks' },
  { label: 'Print table QR codes', where: 'Tables & QR', to: 'tables', words: 'qr code print cards scan' },
  { label: 'Open a table\'s menu', where: 'Tables & QR', to: 'tables', words: 'link test preview guest menu' },
  { label: 'QR-only ordering', where: 'Settings', to: 'settings', words: 'scan qr rule security require lock' },
  { label: 'Restaurant name and welcome message', where: 'Settings', to: 'settings', words: 'name tagline welcome text brand' },
  { label: 'Tax rate and currency', where: 'Settings', to: 'settings', words: 'gst tax percent currency rupee symbol' },
  { label: 'Number of tables', where: 'Settings', to: 'settings', words: 'tables count seats' },
  { label: 'Website address', where: 'Settings', to: 'settings', words: 'url domain public link address' },
  { label: 'Change password', where: 'My account', to: 'account', words: 'password login security account my' },
  { label: 'Sound and alerts', where: 'Bell, top right', run: 'bell', words: 'sound mute notification ring alert push' },
  { label: 'Light or dark theme', where: 'Moon, top right', run: 'theme', words: 'dark light theme colour color mode' }
];

const SUGGESTED = ['Add a dish', 'Mark a dish sold out', 'Print table QR codes', 'Sales reports', 'Change password'];

/** The search box at the top of every admin page: type what you want, press Enter, be there. */
export default function Finder({ dishes, onGo, onRun, allowed, can }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef(null);
  const input = useRef(null);

  const results = useMemo(() => {
    const PLACES = ALL_PLACES.filter((p) => (p.run || allowed(p.to)) && (!p.needs || can(p.needs)));
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return PLACES.filter((p) => SUGGESTED.includes(p.label));
    const hit = (haystack) => words.every((w) => haystack.includes(w));
    const places = PLACES.filter((p) => hit(`${p.label} ${p.where} ${p.words}`.toLowerCase()));
    const found = dishes.filter((d) => hit(fullName(d).toLowerCase())).slice(0, 5)
      .map((d) => ({ label: fullName(d), where: 'Edit this dish', to: 'menu', extra: { dishId: d.id }, dish: true }))
      .filter(() => can('menu'));
    return [...found, ...places].slice(0, 8);
  }, [text, dishes, allowed, can]);

  useEffect(() => { setAt(0); }, [text]);

  // "/" from anywhere jumps to the box; a click elsewhere closes it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !e.target.closest?.('input, textarea, select, [contenteditable]')) { e.preventDefault(); input.current?.focus(); }
    };
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, []);

  const pick = (item) => {
    if (!item) return;
    setOpen(false); setText(''); input.current?.blur();
    if (item.run) onRun(item.run); else onGo(item.to, item.extra);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAt((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[at]); }
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
  };

  return (
    <div className="a-find" ref={box}>
      <label className="a-find__box">
        <Icon name="search" size={17} />
        <input ref={input} type="search" placeholder="Find anything: a dish, QR codes, tax…" aria-label="Find anything in the admin"
          role="combobox" aria-expanded={open} aria-controls="a-find-list" aria-autocomplete="list"
          value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
        <kbd aria-hidden="true">/</kbd>
      </label>
      {open && (
        <ul className="a-find__list" id="a-find-list" role="listbox" data-lenis-prevent>
          {!text.trim() && <li className="a-find__head" aria-hidden="true">Often needed</li>}
          {results.map((item, i) => (
            <li key={item.label + item.where} role="option" aria-selected={i === at}>
              <button className={i === at ? 'is-at' : ''} onMouseEnter={() => setAt(i)} onClick={() => pick(item)}>
                <Icon name={item.dish ? 'dish' : 'right'} size={15} />
                <b>{item.label}</b><span>{item.where}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="a-find__none">Nothing matches "{text.trim()}". Try a simpler word, like "price" or "qr".</li>}
        </ul>
      )}
    </div>
  );
}
