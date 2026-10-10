import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { closeSocket, resetSocket } from '../../lib/socket.js';

/**
 * Everything the admin panel shows, kept live over the socket.
 * onEvent('order' | 'call', payload) fires for each new order and each new table call.
 */
export function useAdminData(onEvent) {
  const [menu, setMenu] = useState({ categories: [], dishes: [] });
  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [calls, setCalls] = useState([]);
  const [stats, setStats] = useState({ orders: 0, revenue: 0, items: 0, active: 0 });
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [openTables, setOpenTables] = useState([]);
  const known = useRef(null); // ids already shown, so a reconnect can tell what arrived while away
  const mounted = useRef(true);
  const event = useRef(onEvent);
  event.current = onEvent;

  const guard = (promise) => promise.catch((e) => mounted.current && setError(e.message));

  const loadMenu = useCallback(() => guard(Promise.all([api.get('/menu'), api.get('/admin/settings')])
    .then(([m, s]) => { setMenu({ categories: m.categories, dishes: m.dishes }); setSettings(s); })), []);
  const loadStats = useCallback(() => guard(api.get('/admin/stats').then(setStats)), []);
  const loadOrders = useCallback(() => guard(Promise.all([api.get('/admin/orders'), api.get('/admin/calls')])
    .then(([o, c]) => {
      setOrders(o); setCalls(c);
      // Anything new since the last look arrived while this screen was asleep or offline: announce it now.
      if (known.current) {
        o.filter((order) => order.status === 'new' && !known.current.has(order.id)).reverse().forEach((order) => event.current?.('order', order));
        c.filter((call) => !known.current.has(call.id)).forEach((call) => event.current?.('call', call));
      }
      known.current = new Set([...o.map((order) => order.id), ...c.map((call) => call.id)]);
    })), []);
  const loadTables = useCallback(() => guard(api.get('/admin/tables/open').then(setOpenTables)), []);

  useEffect(() => {
    mounted.current = true;
    loadMenu(); loadOrders(); loadStats(); loadTables();

    const socket = resetSocket(); // reconnect so the server sees the admin cookie
    socket.on('connect', () => { setConnected(true); loadOrders(); loadStats(); loadTables(); });
    socket.on('tables:update', loadTables);
    socket.on('disconnect', () => setConnected(false));
    socket.on('order:new', (order) => { setOrders((list) => [order, ...list.filter((o) => o.id !== order.id)]); loadStats(); known.current?.add(order.id); event.current?.('order', order); });
    socket.on('order:update', (order) => { setOrders((list) => list.map((o) => (o.id === order.id ? order : o))); loadStats(); });
    socket.on('call:new', (call) => { setCalls((list) => [...list.filter((c) => c.id !== call.id), call]); known.current?.add(call.id); event.current?.('call', call); });
    socket.on('call:update', (call) => setCalls((list) => list.filter((c) => c.id !== call.id)));
    socket.on('menu:update', loadMenu);

    return () => { mounted.current = false; closeSocket(); };
  }, [loadMenu, loadOrders, loadStats, loadTables]);

  return { menu, settings, orders, calls, stats, error, setError, loadMenu, loadOrders, connected, openTables, loadTables };
}
