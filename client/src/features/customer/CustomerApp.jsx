import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { glowOf, optionFor, unitPrice } from '../../lib/format.js';
import { usePersistentState } from '../../lib/usePersistentState.js';
import { alertsState, askForAlerts, buzz, enablePush, play, setBaseTitle } from '../../lib/notify.js';
import Notices, { useNotices } from '../../components/Notices.jsx';
import { useLiveLink, useMenu, useOrders, useTableBill, useTableNews } from './hooks.js';
import Welcome from './Welcome.jsx';
import Stage from './Stage.jsx';
import MenuSheet from './MenuSheet.jsx';
import DishSheet from './DishSheet.jsx';
import OrderSheet from './OrderSheet.jsx';
import BillSheet from './BillSheet.jsx';
import Sheet from './Sheet.jsx';
import { ClubCard, SocialLinks, useClub } from './Club.jsx';
import TableSheet from './TableSheet.jsx';
import WaitSheet from './WaitSheet.jsx';
import '../../styles/customer.css';

const IDLE_MS = 12000;     // start the showreel after this long without a touch or mouse move
const SHOWREEL_MS = 4500;  // then move to the next dish this often

const STATUS_LABEL = { new: 'Received', cooking: 'Cooking', ready: 'On its way' };
/** What the guest is told, and how loudly, each time the kitchen moves their order on. */
const STATUS_NEWS = {
  cooking: (o) => ({ icon: 'flame', title: 'Your order is on the fire', body: `Order #${o.number} · about ${o.etaMin} minutes to your table.`, sound: 'soft' }),
  ready: (o) => ({ icon: 'bell', title: 'On its way to your table', body: `Order #${o.number} has just left the kitchen.`, sound: 'good', vibrate: true, important: true }),
  served: (o) => ({ icon: 'check', title: 'Served. Enjoy.', body: `Order #${o.number} is on your table.`, sound: 'good' }),
  cancelled: (o) => ({ tone: 'bad', icon: 'close', title: `Order #${o.number} was cancelled`, body: 'Please ask your server what happened.', sound: 'bad', vibrate: [200, 80, 200], important: true })
};

/** The last status the guest was shown for each order, kept so a reload can still tell them what changed. */
function readSeen() {
  try { return JSON.parse(localStorage.getItem('sm.seen')) || {}; } catch { return {}; }
}

/** The welcome plays once per tab, not again on every refresh. */
function hasEntered() {
  try { return sessionStorage.getItem('sm.entered') === '1'; } catch { return false; }
}

const asTable = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * The table and its code from the QR link, else what this tab already knows.
 * Never guessed. The code proves the link came from that table's printed card.
 */
function readTable() {
  const query = new URLSearchParams(window.location.search);
  const fromLink = asTable(query.get('table'));
  const code = query.get('k') || '';
  try {
    if (fromLink) { sessionStorage.setItem('sm.table', fromLink); sessionStorage.setItem('sm.tk', code); }
    return { table: fromLink ?? asTable(sessionStorage.getItem('sm.table')), code: fromLink ? code : sessionStorage.getItem('sm.tk') || '' };
  } catch {
    return { table: fromLink, code };
  }
}

// A basket left untouched for this long belongs to an earlier visit: start clean.
const BASKET_MS = 6 * 3600 * 1000;
try {
  const at = Number(localStorage.getItem('sm.cartAt'));
  if (at && Date.now() - at > BASKET_MS) ['sm.cart', 'sm.opts', 'sm.sendKey', 'sm.cartAt'].forEach((k) => localStorage.removeItem(k));
} catch { /* private mode */ }

/** A fresh id for one basket. Sent with the order, so a retry is recognised as the same order. */
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

export default function CustomerApp() {
  const [seat, setSeat] = useState(readTable);                 // { table, code }
  const savedTable = seat.table;
  const [pending, setPending] = useState(null);                // what to finish once a table is chosen
  const { menu, error, reload: reloadMenu } = useMenu();
  const { orders, addOrder, clearOrders, putOrder, followOrder } = useOrders();
  const { items: notices, push: notify, dismiss: dismissNotice } = useNotices();
  const [alerts, setAlerts] = useState(alertsState);
  const [pushed, setPushed] = useState(null);   // null: not tried yet; true: this phone hears news with the menu closed
  const linked = useLiveLink();
  const [clubTick, setClubTick] = useState(0);   // look at the stamp card again (the table paid)
  const member = useClub(clubTick);

  const [cart, setCart] = usePersistentState('sm.cart', {});   // { dishId: qty }
  const [opts, setOpts] = usePersistentState('sm.opts', {});   // { dishId: { spice, addons, note } }
  const [favs, setFavs] = usePersistentState('sm.favs', {});   // { dishId: true }
  const [sendKey, setSendKey] = usePersistentState('sm.sendKey', ''); // id of the basket being sent

  const [entered, setEntered] = useState(hasEntered);
  const [category, setCategory] = useState('all');
  const [currentId, setCurrentId] = useState(null);
  const [sheet, setSheet] = useState(null);                    // null | 'menu' | 'dish' | 'order' | 'bill' | 'table' | 'wait'
  const [bump, setBump] = useState(0);
  const [toast, setToast] = useState('');
  const [sending, setSending] = useState(false);
  const lastTouch = useRef(Date.now());
  const toastTimer = useRef();
  const autoStep = useRef({ at: 0, from: null });              // the showreel's last move
  const watching = useRef(false);                              // true while the waiting screen is open
  const seenStatus = useRef(null);
  if (!seenStatus.current) seenStatus.current = readSeen();

  const say = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => { if (menu) setBaseTitle(`${menu.settings.name} · Menu`); }, [menu]);
  useEffect(() => { watching.current = sheet === 'wait'; }, [sheet]);

  const enter = () => {
    try { sessionStorage.setItem('sm.entered', '1'); } catch { /* private mode */ }
    lastTouch.current = Date.now();
    setEntered(true);
  };

  // With alerts allowed, keep the server's push list in step with this visit's orders and table.
  // The table only while there are orders: after the bill is paid, the next party's calls are not this phone's news.
  const orderIds = orders.map((o) => o.id).join(',');
  useEffect(() => {
    if (alerts !== 'granted' || !orderIds) return;
    enablePush('guest', { orders: orderIds.split(','), table: savedTable }).then(setPushed);
  }, [alerts, orderIds, savedTable]);
  const turnOnAlerts = useCallback(async () => setAlerts(await askForAlerts()), []);

  // Opened from a notification: follow that order and show it. The service worker
  // sends the same news to a menu that is already open.
  const opened = useRef(false);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('order');
    if (!id || opened.current || !/^[a-f0-9]{24}$/.test(id)) return;
    opened.current = true;
    followOrder(id);
    setEntered(true);
    setSheet('wait');
    window.history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]order=[a-f0-9]{24}/, '').replace(/^&/, '?'));
  }, [followOrder]);
  // Opened from a club notification (a stamp, a reward, an offer): show the card.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('club') !== 'card') return;
    setEntered(true);
    setSheet('club');
    window.history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]club=card/, '').replace(/^&/, '?'));
  }, []);
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type !== 'open') return;
      setEntered(true);
      setSheet(String(e.data.url || '').includes('club=card') ? 'club' : 'wait');
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  // Tell the guest when the kitchen moves their order on, wherever they are in the menu.
  useEffect(() => {
    const seen = seenStatus.current;
    orders.forEach((o) => {
      if (seen[o.id] && seen[o.id] !== o.status && STATUS_NEWS[o.status]) {
        const news = STATUS_NEWS[o.status](o);
        // Already watching the order's own screen: it changes in front of them, so just the sound.
        if (watching.current && !document.hidden) { play(news.sound); if (news.vibrate) buzz(news.vibrate === true ? undefined : news.vibrate); }
        else notify({ ...news, tag: 'order-' + o.id, action: () => setSheet('wait') });
      }
      seen[o.id] = o.status;
    });
    // Forget orders that are no longer part of this visit.
    if (orders.length) Object.keys(seen).forEach((id) => { if (!orders.some((o) => o.id === id)) delete seen[id]; });
    try { localStorage.setItem('sm.seen', JSON.stringify(seen)); } catch { /* private mode */ }
  }, [orders, notify]);

  // ...when the staff answer a call from this table, and when the table has paid.
  useTableNews(savedTable, {
    onCallDone: (call) => notify({
      icon: call.type === 'bill' ? 'receipt' : 'bell',
      title: call.type === 'bill' ? 'Your bill is on its way' : 'A server is on the way',
      body: `Table ${call.table} · they have seen your request.`,
      sound: 'good', vibrate: true, important: true, tag: 'call-' + call.type
    }),
    onCleared: () => {
      setTimeout(() => setClubTick((n) => n + 1), 1500);
      clearOrders();
      setSheet(null);
      notify({ icon: 'check', title: 'All settled. Thank you.', body: 'We hope to see you again soon.', sound: 'good' });
    }
  });
  const tableBill = useTableBill(savedTable, seat.code, sheet === 'bill');

  // Remember when the basket last changed, so an abandoned one can be cleared on a later visit.
  useEffect(() => {
    try {
      if (Object.keys(cart).length) localStorage.setItem('sm.cartAt', String(Date.now()));
      else localStorage.removeItem('sm.cartAt');
    } catch { /* private mode */ }
  }, [cart]);
  // A changed basket is a different order: it must not be mistaken for a retry of the last one.
  const basketLoaded = useRef(false);
  useEffect(() => {
    if (basketLoaded.current) setSendKey('');   // not on first load: a reload mid-send must keep its id
    basketLoaded.current = true;
  }, [cart, opts]); // eslint-disable-line react-hooks/exhaustive-deps

  // The phone's back button closes an open sheet instead of leaving the menu.
  useEffect(() => {
    const onPop = () => setSheet(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const flagged = !!window.history.state?.sheet;
    if (sheet && !flagged) window.history.pushState({ ...window.history.state, sheet: true }, '');
    else if (!sheet && flagged) window.history.back();
  }, [sheet]);

  const dishes = menu?.dishes ?? [];
  const hasFavs = dishes.some((d) => favs[d.id]);
  const categories = useMemo(() => [
    { id: 'all', name: 'All' },
    ...(menu?.categories ?? []).filter((c) => dishes.some((d) => d.category === c.id)),
    ...(hasFavs ? [{ id: 'fav', name: 'Saved' }] : [])
  ], [menu, dishes, hasFavs]);

  // If the last saved dish is un-saved, the "Saved" tab goes away: fall back to everything.
  useEffect(() => { if (category === 'fav' && !hasFavs) setCategory('all'); }, [category, hasFavs]);

  const visible = useMemo(() => {
    const list = dishes.filter((d) => category === 'all' || (category === 'fav' ? favs[d.id] : d.category === category));
    return list.length ? list : dishes;
  }, [dishes, category, favs]);

  const index = Math.max(0, visible.findIndex((d) => d.id === currentId));
  const dish = visible[index];

  const step = useCallback((delta) => {
    if (!visible.length) return;
    setCurrentId(visible[(index + delta + visible.length) % visible.length].id);
  }, [visible, index]);

  // Showreel: when nobody is touching the screen, play through the dishes.
  useEffect(() => {
    if (!entered || sheet) return undefined;
    const timer = setInterval(() => {
      if (Date.now() - lastTouch.current > IDLE_MS) {
        autoStep.current = { at: Date.now(), from: visible[index]?.id };
        step(1);
        lastTouch.current = Date.now() - (IDLE_MS - SHOWREEL_MS);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [entered, sheet, step, visible, index]);

  // Keyboard, for laptops and desktops: arrows turn the wheel, Escape closes a sheet.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setSheet(null); return; }
      if (!entered || sheet || e.target.closest?.('input, textarea')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      lastTouch.current = Date.now();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entered, sheet, step]);

  // Drop anything from the basket that the restaurant has removed or sold out.
  useEffect(() => {
    if (!menu) return;
    const gone = Object.keys(cart).filter((id) => !dishes.find((d) => d.id === id)?.available);
    if (!gone.length) return;
    setCart((c) => Object.fromEntries(Object.entries(c).filter(([id]) => !gone.includes(id))));
    say(gone.length === 1 ? 'One dish in your order just sold out and was removed' : `${gone.length} dishes in your order sold out and were removed`);
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  // Forget chosen extras the restaurant no longer offers, so the basket total stays true.
  useEffect(() => {
    if (!menu) return;
    setOpts((all) => {
      let changed = false;
      const next = Object.fromEntries(Object.entries(all).map(([id, o]) => {
        const offered = dishes.find((d) => d.id === id)?.addons.map((a) => a.name) ?? [];
        const kept = Object.fromEntries(Object.entries(o.addons || {}).filter(([name, on]) => !on || offered.includes(name)));
        if (Object.keys(kept).length !== Object.keys(o.addons || {}).length) changed = true;
        return [id, { ...o, addons: kept }];
      }));
      return changed ? next : all;
    });
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !menu) return <div className="boot">The menu could not be loaded.<br />Please check your connection and refresh.</div>;
  if (!menu) return <div className="boot">Setting the table…</div>;
  if (!dish) return <div className="boot">The menu is being prepared.<br />Please check back shortly.</div>;

  const { settings } = menu;
  // A table the restaurant does not have counts as no table at all.
  // ...and so does a table number that arrived without its QR code, when the restaurant requires one.
  const table = savedTable && savedTable <= settings.tables && (!settings.requireQr || seat.code) ? savedTable : null;
  const lines = dishes.filter((d) => cart[d.id] > 0).map((d) => {
    const option = optionFor(opts, d);
    return { dish: d, qty: cart[d.id], option, unit: unitPrice(d, option) };
  });
  const cartCount = lines.reduce((n, l) => n + l.qty, 0);
  const cartTotal = lines.reduce((n, l) => n + l.unit * l.qty, 0);
  const eta = lines.reduce((n, l) => Math.max(n, l.dish.prepMin), 0);
  const live = orders.filter((o) => STATUS_LABEL[o.status]).at(-1);

  const setQty = (id, qty) => setCart((c) => {
    const next = { ...c };
    if (qty > 0) next[id] = Math.min(20, qty); else delete next[id];
    return next;
  });
  const add = (qty = 1) => {
    // If the showreel turned the wheel a moment before the tap, the guest meant the dish they were looking at.
    const meant = Date.now() - autoStep.current.at < 900 ? dishes.find((d) => d.id === autoStep.current.from) : null;
    const target = meant || dish;
    if (meant) setCurrentId(meant.id);
    if (!target.available) return;
    setQty(target.id, (cart[target.id] || 0) + qty);
    setBump((b) => b + 1);
  };

  const scanFirst = () => notify({ tone: 'bad', icon: 'bell', title: 'Scan your table\'s QR code', body: 'Point your phone\'s camera at the card on your table, then order from the page it opens.', ttl: 9000 });

  /** Without a table nothing is sent: ask first, then carry on with what the guest wanted. */
  const needTable = (action) => {
    if (settings.requireQr) { scanFirst(); return; }
    setPending({ action, back: sheet });
    setSheet('table');
  };

  /** The kitchen said no. Explain it properly, and bring the menu up to date if that was the reason. */
  const refused = (e) => {
    if (e.status === 409) {
      setSendKey('');
      reloadMenu();
      notify({ tone: 'bad', icon: 'receipt', title: 'Please check your order', body: e.message, ttl: 10000, action: () => setSheet('order') });
    } else if (e.status === 403) {
      scanFirst();
    } else {
      say(e.message);
    }
  };

  const sendOrder = async (to = table) => {
    if (!to) { needTable('send'); return; }
    setSending(true);
    // The same id goes with every retry of this basket, so a lost reply cannot become a second order.
    const clientKey = sendKey || newKey();
    if (!sendKey) setSendKey(clientKey);
    try {
      const order = await api.post('/orders', {
        table: to, code: seat.code, clientKey, expected: cartTotal,
        ...(member.key ? { guestKey: member.key } : {}),
        items: lines.map(({ dish: d, qty, option }) => ({
          dishId: d.id, qty,
          spice: d.spice > 0 ? option.spice : '',
          addons: d.addons.filter((a) => option.addons[a.name]).map((a) => a.name),
          note: option.note
        }))
      });
      addOrder(order);
      setCart({});
      setOpts({});
      setSheet('wait'); // straight to the waiting screen: progress, something quick to add, the dish's story
      const offer = alerts === 'default';
      notify({
        icon: 'receipt', title: `Order #${order.number} is with the kitchen`, sound: 'soft', ttl: offer ? 11000 : 7000,
        body: offer ? 'Tap here to be told on this phone when it moves, even with the menu closed.' : 'You will hear from us here the moment it moves.',
        action: offer ? turnOnAlerts : () => setSheet('wait')
      });
    } catch (e) {
      refused(e);
    } finally {
      setSending(false);
    }
  };

  const call = async (type, to = table) => {
    if (!to) { needTable(type); return; }
    try {
      await api.post('/calls', { table: to, code: seat.code, type });
      say(type === 'bill' ? 'Bill requested' : 'Your server has been called');
    } catch (e) {
      refused(e);
    }
  };

  const pickTable = (n) => {
    try { sessionStorage.setItem('sm.table', n); sessionStorage.setItem('sm.tk', ''); } catch { /* private mode */ }
    setSeat({ table: n, code: '' });
    setSheet(pending?.back ?? null);
    setPending(null);
    if (pending?.action === 'send') sendOrder(n);
    else if (pending) call(pending.action, n);
    else say(`Table ${n}. Thank you.`);
  };

  const toggleFav = () => {
    const on = !favs[dish.id];
    setFavs((f) => ({ ...f, [dish.id]: on }));
    say(on ? 'Saved to your favourites' : 'Removed from favourites');
  };

  return (
    <>
    <div className={'c-app' + (entered ? ' is-in' : '') + (sheet ? ' has-sheet' : '')} style={{ '--bg': dish.color, '--glow': glowOf(dish.color) }}
      onPointerDown={() => { lastTouch.current = Date.now(); }} onPointerMove={() => { lastTouch.current = Date.now(); }}>
      <Stage
        settings={settings} table={table}
        categories={categories} category={category}
        onCategory={(id) => { setCategory(id); setCurrentId(null); }}
        dishes={visible} index={index} onStep={step} onPick={setCurrentId}
        onOpen={(name) => setSheet(name === 'order' && !cartCount && orders.length ? 'wait' : name)}
        qty={cart[dish.id] || 0} onAdd={() => add(1)}
        cartCount={cartCount} cartTotal={cartTotal} bump={bump} orderStatus={live ? STATUS_LABEL[live.status] : ''}
        isFav={!!favs[dish.id]} onFav={toggleFav} canPickTable={!settings.requireQr}
      />

      <button className={'c-scrim' + (sheet ? ' is-open' : '')} onClick={() => setSheet(null)} aria-label="Close" tabIndex={-1} />

      <MenuSheet open={sheet === 'menu'} onClose={() => setSheet(null)}
        categories={menu.categories} dishes={dishes} currency={settings.currency}
        onPick={(d) => { setCategory(d.category); setCurrentId(d.id); setSheet(null); }} />

      <DishSheet open={sheet === 'dish'} onClose={() => setSheet(null)} dish={dish} currency={settings.currency}
        option={optionFor(opts, dish)} onOption={(o) => setOpts((all) => ({ ...all, [dish.id]: o }))}
        onAdd={(qty) => { add(qty); setSheet(null); }} />

      <OrderSheet open={sheet === 'order'} onClose={() => setSheet(null)}
        lines={lines} currency={settings.currency} eta={eta} total={cartTotal}
        onQty={setQty} onSend={() => sendOrder()} sending={sending}
        orders={orders} onCall={call} onBill={() => setSheet('bill')}
        alerts={alerts} onAlerts={async () => setAlerts(await askForAlerts())} onWatch={() => setSheet('wait')} />

      <WaitSheet open={sheet === 'wait'} onClose={() => setSheet(null)} orders={orders} dishes={dishes} settings={settings} table={table}
        cart={cart} cartCount={cartCount} cartTotal={cartTotal} sending={sending}
        onAdd={(d) => { setQty(d.id, (cart[d.id] || 0) + 1); setBump((b) => b + 1); }}
        onSend={() => sendOrder()} onBasket={() => setSheet('order')} onOrder={putOrder}
        alerts={alerts} pushed={pushed} onAlerts={turnOnAlerts} member={member} />

      <BillSheet open={sheet === 'bill'} onClose={() => setSheet(null)} orders={orders} tableOrders={tableBill} table={table} currency={settings.currency}
        onAsk={() => call('bill')} onNewVisit={() => { clearOrders(); setSheet(null); }}
        club={settings.club} restaurant={settings.name} social={settings.social} member={member} />

      <Sheet open={sheet === 'club'} onClose={() => setSheet(null)} title="Your" accent="card" label="Your stamp card">
        <div className="c-body c-rail">
          <ClubCard club={settings.club} restaurant={settings.name} orders={orders} member={member} />
          <SocialLinks social={settings.social} />
        </div>
      </Sheet>

      <TableSheet open={sheet === 'table'} onClose={() => { setPending(null); setSheet(null); }}
        tables={settings.tables} current={table} onPick={pickTable} />

      {!linked && <div className="c-offline" role="status">Reconnecting. Order updates will catch up.</div>}

      <div className={'c-toast' + (toast ? ' is-open' : '')} role="status">{toast}</div>

      <Welcome settings={settings} table={table} image={dishes[0]?.image} gone={entered} onEnter={enter} />
    </div>
    <Notices items={notices} onDismiss={dismissNotice} aside={!!sheet} />
    </>
  );
}
