import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { getSocket } from '../../lib/socket.js';
import { usePersistentState } from '../../lib/usePersistentState.js';

/** Loads the menu and keeps it live: when the admin changes anything, it refreshes. */
export function useMenu() {
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => (
    api.get('/menu').then((m) => { setMenu(m); setError(''); }).catch((e) => setError(e.message))
  ), []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('menu:update', load);
    socket.on('connect', load);
    return () => { socket.off('menu:update', load); socket.off('connect', load); };
  }, [load]);

  return { menu, error, reload: load };
}

/** False while the live link to the restaurant is down for more than a moment. */
export function useLiveLink() {
  const [live, setLive] = useState(true);
  useEffect(() => {
    const socket = getSocket();
    let timer;
    const up = () => { clearTimeout(timer); setLive(true); };
    const down = () => { clearTimeout(timer); timer = setTimeout(() => setLive(false), 4000); };
    socket.on('connect', up);
    socket.on('disconnect', down);
    socket.on('connect_error', down);
    return () => { clearTimeout(timer); socket.off('connect', up); socket.off('disconnect', down); socket.off('connect_error', down); };
  }, []);
  return live;
}

/**
 * News for this table: the staff answered a "call a server" or "bring the bill"
 * request (onCallDone), or the table has paid and the visit is over (onCleared).
 */
export function useTableNews(table, { onCallDone, onCleared }) {
  const handlers = useRef({});
  handlers.current = { onCallDone, onCleared };

  useEffect(() => {
    if (!table) return undefined;
    const socket = getSocket();
    const watch = () => socket.emit('table:watch', table);
    const done = (call) => handlers.current.onCallDone?.(call);
    const cleared = () => handlers.current.onCleared?.();
    watch();
    socket.on('connect', watch);
    socket.on('call:done', done);
    socket.on('table:cleared', cleared);
    return () => { socket.off('connect', watch); socket.off('call:done', done); socket.off('table:cleared', cleared); };
  }, [table]);
}

/** The whole table's unpaid bill, from every phone at it. Null while unknown: the sheet then shows this phone's orders. */
export function useTableBill(table, code, open) {
  const [bill, setBill] = useState(null);

  useEffect(() => {
    if (!table || !open) return undefined;
    let alive = true;
    const load = () => api.get(`/tables/${table}/bill` + (code ? `?code=${encodeURIComponent(code)}` : ''))
      .then((orders) => alive && setBill(orders))
      .catch(() => alive && setBill(null));
    load();
    const socket = getSocket();
    socket.on('table:update', load);
    const timer = setInterval(load, 20000);
    return () => { alive = false; socket.off('table:update', load); clearInterval(timer); };
  }, [table, code, open]);

  return open && table ? bill : null;
}

const VISIT_HOURS = 12;

/** The orders this phone has sent during the current visit, updated live from the kitchen. */
export function useOrders() {
  const [refs, setRefs] = usePersistentState('sm.orders', []); // [{ id, at }]
  const [orders, setOrders] = useState([]);

  const liveIds = refs.filter((r) => Date.now() - r.at < VISIT_HOURS * 3600 * 1000).map((r) => r.id);
  const key = liveIds.join(',');

  useEffect(() => {
    if (!key) { setOrders([]); return undefined; }
    const socket = getSocket();
    const watch = () => socket.emit('orders:watch', key.split(','));
    // Orders the table has already paid for are no longer part of this visit.
    const refresh = () => api.get('/orders?ids=' + key).then((list) => {
      const open = list.filter((o) => !o.settled);
      setOrders(open);
      if (open.length !== key.split(',').length) setRefs((refs) => refs.filter((r) => open.some((o) => o.id === r.id)));
    }).catch(() => {});
    // A live update carries the order but not its place in the queue: keep what we knew of that.
    const onUpdate = (order) => setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, ...order } : o)));

    watch();
    refresh();
    socket.on('connect', watch);
    socket.on('connect', refresh);
    socket.on('order:update', onUpdate);
    // The queue ahead moves without any news for this order, so look again now and then,
    // and at once when the guest comes back to the page (a phone may have paused it).
    const poll = setInterval(refresh, 25000);
    const onBack = () => { if (!document.hidden) { watch(); refresh(); } };
    document.addEventListener('visibilitychange', onBack);
    return () => {
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onBack);
      socket.off('connect', watch);
      socket.off('connect', refresh);
      socket.off('order:update', onUpdate);
    };
  }, [key]);

  const addOrder = useCallback((order) => {
    setOrders((list) => [...list, order]);
    setRefs((list) => [...list, { id: order.id, at: Date.now() }]);
  }, [setRefs]);

  const clearOrders = useCallback(() => setRefs([]), [setRefs]);
  /** Follow an order known only by its id, e.g. opened from a notification after the menu was closed. */
  const followOrder = useCallback((id) => setRefs((list) => (list.some((r) => r.id === id) ? list : [...list, { id, at: Date.now() }])), [setRefs]);
  /** Put a fresher copy of one order in place (after a spin or a rating). */
  const putOrder = useCallback((order) => setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, ...order } : o))), []);

  return { orders, addOrder, clearOrders, putOrder, followOrder };
}
