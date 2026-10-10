import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import Notices, { useNotices } from '../../components/Notices.jsx';
import { alertsState, askForAlerts, enablePush, isMuted, onSoundReady, play, setBaseTitle, setMuted, soundReady } from '../../lib/notify.js';
import { money, timeAgo } from '../../lib/format.js';
import { useTheme } from '../../lib/theme.js';
import { useAdminData } from './useAdminData.js';
import { scrollPageToTop, useSmoothScroll } from '../../lib/useSmoothScroll.js';
import Login from './Login.jsx';
import OrdersBoard from './OrdersBoard.jsx';
import MenuManager from './MenuManager.jsx';
import CategoryManager from './CategoryManager.jsx';
import TablesQr from './TablesQr.jsx';
import SettingsPage from './SettingsPage.jsx';
import HistoryPage from './HistoryPage.jsx';
import ReportsPage from './ReportsPage.jsx';
import HomePage from './HomePage.jsx';
import Finder from './Finder.jsx';
import '../../styles/admin.css';

// Sections grouped by what they are for. [id, label, icon]
const NAV = [
  { group: 'Today', items: [['home', 'Home', 'home'], ['orders', 'Orders', 'receipt']] },
  { group: 'Your business', items: [['reports', 'Reports', 'chart'], ['history', 'History', 'clock']] },
  { group: 'Your menu', items: [['menu', 'Dishes', 'dish'], ['categories', 'Categories', 'grid']] },
  { group: 'Setup', items: [['tables', 'Tables & QR', 'qr'], ['settings', 'Settings', 'gear']] }
];
const BAR = ['home', 'orders', 'menu', 'reports']; // on the phone's bottom bar; the rest sit under More

const REMIND_MS = 60000; // while something is waiting, a quiet reminder this often

function Panel({ user, onLogout }) {
  const [tab, setTab] = useState('home');
  const [moreOpen, setMoreOpen] = useState(false);
  const [target, setTarget] = useState(null);   // something to open on arrival, e.g. a dish
  const [theme, toggleTheme] = useTheme();
  useSmoothScroll(true);
  // Every section opens from its top, not wherever the last one was left.
  useEffect(() => { scrollPageToTop(); }, [tab]);
  const { items: notices, push: notify, dismiss: dismissNotice } = useNotices();
  const [log, setLog] = useState([]);          // recent alerts, newest first
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [muted, setMute] = useState(isMuted);
  const [alerts, setAlerts] = useState(alertsState);
  const [currency, setCurrency] = useState('');

  // Every new order and table call: a notice, a sound, and a line in the bell's list.
  const onEvent = useCallback((kind, payload) => {
    const plates = kind === 'order' ? payload.items.reduce((n, i) => n + i.qty, 0) : 0;
    const notice = kind === 'order'
      ? { icon: 'receipt', title: `New order · Table ${payload.table}`, sound: 'order', tag: 'order-' + payload.id,
          body: `#${payload.number} · ${plates} ${plates === 1 ? 'plate' : 'plates'} · ${money(payload.total, currency)}` }
      : { icon: payload.type === 'bill' ? 'receipt' : 'bell', sound: 'call', tag: 'call-' + payload.id,
          title: `Table ${payload.table} ${payload.type === 'bill' ? 'wants the bill' : 'needs a server'}`, body: 'Tap to open the orders board.' };
    notify({ ...notice, important: true, vibrate: true, ttl: 12000, action: () => setTab('orders') });
    setLog((list) => [{ id: notice.tag, icon: notice.icon, title: notice.title, body: notice.body, at: Date.now() }, ...list].slice(0, 20));
    setUnread((n) => n + 1);
  }, [notify, currency]);

  const data = useAdminData(onEvent);
  const waiting = data.orders.filter((o) => o.status === 'new').length + data.calls.length;

  useEffect(() => { setCurrency(data.settings?.currency || ''); }, [data.settings]);
  useEffect(() => {
    setBaseTitle((waiting ? `(${waiting}) ` : '') + 'Admin · ' + (data.settings?.name || 'Menu'));
  }, [waiting, data.settings]);

  // Nothing waits unnoticed: a soft reminder until new orders and calls are dealt with.
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => play('nag'), REMIND_MS);
    return () => clearInterval(timer);
  }, [waiting > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once alerts are allowed, this browser also gets real pushes when the panel is closed.
  const [pushed, setPushed] = useState(false);
  useEffect(() => { if (alerts === 'granted') enablePush('admin').then(setPushed); }, [alerts]);

  // The browser plays no sound until this page has been tapped once: say so, until it has.
  const [silent, setSilent] = useState(() => !soundReady());
  useEffect(() => onSoundReady(() => setSilent(false)), []);

  // The alerts list closes on a click anywhere else, or Escape.
  useEffect(() => {
    if (!bellOpen) return undefined;
    const onDown = (e) => { if (!e.target.closest?.('.a-pop, .a-bell')) setBellOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setBellOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [bellOpen]);

  const toggleBell = () => { setBellOpen((open) => !open); setUnread(0); };
  const enableAlerts = async () => setAlerts(await askForAlerts());
  const toggleMute = () => { setMuted(!muted); setMute(!muted); if (muted) play('soft'); };

  // One place to move between sections: also closes the phone's "More" sheet and carries any target (a dish to open).
  const go = (to, extra) => { setTab(to); setMoreOpen(false); setTarget(extra || null); };
  const run = (what) => { if (what === 'theme') toggleTheme(); else if (what === 'bell') { setBellOpen(true); setUnread(0); } };

  if (!data.settings) return <div className="boot">{data.error || 'Loading…'}</div>;

  const navButton = ([id, label, icon], extraClass = '') => (
    <button key={id} className={'a-nav' + (tab === id ? ' is-on' : '') + extraClass} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
      <Icon name={icon} size={18} /><span>{label}</span>
      {id === 'orders' && waiting > 0 && <span className="a-badge">{waiting}</span>}
    </button>
  );
  const everything = NAV.flatMap((g) => g.items);
  const onBar = everything.filter(([id]) => BAR.includes(id));
  const underMore = everything.filter(([id]) => !BAR.includes(id));

  return (
    <>
    <div className="a-app a-shell">
      {/* Laptop and up: every section listed down the side, grouped by what it is for. */}
      <aside className="a-side">
        <div className="a-brand">{data.settings.name}<small>ADMIN</small></div>
        <nav aria-label="Sections">
          {NAV.map((g) => (
            <div key={g.group} className="a-navgroup">
              <h2>{g.group}</h2>
              {g.items.map((item) => navButton(item))}
            </div>
          ))}
        </nav>
        <div className="a-side__foot">
          <span className={'a-live' + (data.connected ? '' : ' is-off')} role="status">{data.connected ? 'Live' : 'Reconnecting'}</span>
          <button className="a-nav" onClick={onLogout}><Icon name="logout" size={18} /><span>Sign out {user.username}</span></button>
        </div>
      </aside>

      <div className="a-body">
        <header className="a-head">
          <div className="a-wrap">
            <div className="a-brand a-brand--top">{data.settings.name}
              <span className={'a-live' + (data.connected ? '' : ' is-off')} role="status">{data.connected ? 'Live' : 'Reconnecting'}</span>
            </div>
            <Finder dishes={data.menu.dishes} onGo={go} onRun={run} />
            <button className="a-btn is-icon a-theme" onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            <button className={'a-btn is-icon a-bell' + (unread ? ' is-ringing' : '')} onClick={toggleBell}
              aria-expanded={bellOpen} aria-label={`Alerts${unread ? `, ${unread} new` : ''}`}>
              <Icon name="bell" size={18} />{unread > 0 && <span className="a-badge">{unread}</span>}
            </button>

            {bellOpen && (
              <section className="a-pop" aria-label="Alerts" data-lenis-prevent>
                <h2 className="a-sub">Alerts</h2>
                <div className="a-pop__list">
                  {log.map((item, i) => (
                    <div key={item.id + i} className="a-pop__item">
                      <span className="a-pop__icon"><Icon name={item.icon} size={16} /></span>
                      <div><b>{item.title}</b><span>{item.body}</span></div>
                      <time>{timeAgo(item.at)}</time>
                    </div>
                  ))}
                  {!log.length && <p className="a-pop__empty">Quiet for now. New orders and table calls will ring here.</p>}
                </div>
                <div className="a-pop__row">
                  <span><Icon name="sound" size={16} />Sound and reminders</span>
                  <button className="a-switch" role="switch" aria-checked={!muted} aria-label="Sound and reminders" onClick={toggleMute} />
                </div>
                {alerts === 'default' && (
                  <button className="a-btn is-gold" onClick={enableAlerts}>Send alerts to this device, even when the panel is closed</button>
                )}
                {alerts === 'granted' && <p className="a-pop__note">{pushed ? 'Push alerts are on: this device hears new orders and calls even with the panel closed.' : 'Alerts are on while this tab is open. Push could not be set up in this browser.'}</p>}
                {alerts === 'denied' && <p className="a-pop__note">Alerts are blocked in this browser's site settings.</p>}
              </section>
            )}
          </div>
        </header>

        <main className="a-wrap a-main">
          {silent && !muted && <p className="a-soundhint" role="status"><Icon name="sound" size={16} />Tap anywhere once so this screen can ring for new orders.</p>}
          {data.error && <p className="a-error" role="alert">{data.error} <button className="a-btn" onClick={() => data.setError('')}>Dismiss</button></p>}
          {tab === 'home' && <HomePage {...data} alerts={alerts} go={go} onAlerts={enableAlerts} />}
          {tab === 'orders' && <OrdersBoard {...data} />}
          {tab === 'history' && <HistoryPage settings={data.settings} setError={data.setError} />}
          {tab === 'reports' && <ReportsPage settings={data.settings} setError={data.setError} />}
          {tab === 'menu' && <MenuManager {...data} open={target} onOpened={() => setTarget(null)} />}
          {tab === 'categories' && <CategoryManager {...data} />}
          {tab === 'tables' && <TablesQr settings={data.settings} />}
          {tab === 'settings' && <SettingsPage settings={data.settings} reload={data.loadMenu} />}
        </main>
      </div>

      {/* Phones: the four everyday sections along the bottom, the rest one tap away under More. */}
      <nav className="a-bottom" aria-label="Sections">
        {onBar.map((item) => navButton(item))}
        <button className={'a-nav' + (moreOpen || underMore.some(([id]) => id === tab) ? ' is-on' : '')} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
          <Icon name="more" size={18} strokeWidth={3} /><span>More</span>
        </button>
      </nav>
      {moreOpen && (
        <>
          <button className="a-more__veil" onClick={() => setMoreOpen(false)} aria-label="Close" tabIndex={-1} />
          <div className="a-more" role="dialog" aria-label="More sections">
            {underMore.map((item) => navButton(item))}
            <button className="a-nav" onClick={onLogout}><Icon name="logout" size={18} /><span>Sign out {user.username}</span></button>
          </div>
        </>
      )}
    </div>
    <Notices items={notices} onDismiss={dismissNotice} />
    </>
  );
}

export default function AdminApp() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out

  useEffect(() => { api.get('/auth/me').then(setUser).catch(() => setUser(null)); }, []);

  const logout = async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); };

  if (user === undefined) return <div className="boot">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Panel user={user} onLogout={logout} />;
}
