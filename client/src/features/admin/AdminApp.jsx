import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import Notices, { useNotices } from '../../components/Notices.jsx';
import { alertsState, askForAlerts, buzz, enablePush, isMuted, onSoundReady, play, setBaseTitle, setMuted, soundReady } from '../../lib/notify.js';
import { money, tableName, timeAgo } from '../../lib/format.js';
import { SPEEDS, canSpeak, chosenVoice, listVoices, onVoices, setChosenVoice, setVoiceDetail, setVoiceOn, setVoiceRate, speakLines, voiceDetail, voiceOn, voiceRate } from '../../lib/speech.js';
import Callout from './Callout.jsx';
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
import KitchenScreen from './KitchenScreen.jsx';
import StaffPage from './StaffPage.jsx';
import AccountPage from './AccountPage.jsx';
import ChoosePassword from './ChoosePassword.jsx';
import GuestsPage from './GuestsPage.jsx';
import '../../styles/admin.css';

// Sections grouped by what they are for. [id, label, icon]
const NAV = [
  { group: 'Today', items: [['home', 'Home', 'home'], ['orders', 'Orders', 'receipt'], ['kitchen', 'Kitchen screen', 'chef', 'Kitchen']] },
  { group: 'Your business', items: [['reports', 'Reports', 'chart'], ['guests', 'Guests', 'heart'], ['history', 'History', 'clock']] },
  { group: 'Your menu', items: [['menu', 'Dishes', 'dish'], ['categories', 'Categories', 'grid']] },
  { group: 'Setup', items: [['tables', 'Tables & QR', 'qr'], ['staff', 'Staff', 'users'], ['settings', 'Settings', 'gear'], ['account', 'My account', 'user']] }
];
// What a role must be allowed to do to see each section. Sections not listed are open to everyone signed in.
const NEEDS = { guests: ['guests'], orders: ['orders'], kitchen: ['orders'], reports: ['reports'], history: ['reports'], menu: ['menu', 'soldout'], categories: ['menu'], tables: ['qr'], staff: ['staff'], settings: ['settings'] };
const BAR_ORDER = ['home', 'orders', 'kitchen', 'reports', 'menu']; // the first four this person may use go on the phone's bottom bar
const ROLE_NAMES = { owner: 'Owner', manager: 'Manager', waiter: 'Waiter', kitchen: 'Kitchen' };

const REMIND_MS = 60000;
// Safari on iPhone only delivers push to a site added to the home screen.
const IOS_BROWSER = typeof navigator !== 'undefined'
  && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  && !navigator.standalone && !window.matchMedia?.('(display-mode: standalone)').matches; // while something is waiting, a quiet reminder this often

function Panel({ user, onLogout }) {
  const can = useCallback((what) => (user.can || []).includes(what), [user]);
  const allowed = useCallback((id) => !NEEDS[id] || NEEDS[id].some(can), [can]);
  // The kitchen lands straight on its screen; everyone else on Home.
  const [tab, setTab] = useState(user.role === 'kitchen' ? 'kitchen' : 'home');
  useEffect(() => { if (!allowed(tab)) setTab(user.role === 'kitchen' ? 'kitchen' : 'home'); }, [allowed, tab, user.role]);
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
  const [calling, setCalling] = useState([]);     // call-outs waiting to take the screen, first one showing
  const [callouts, setCallouts] = useState(() => { try { return localStorage.getItem('sm.callouts') !== '0'; } catch { return true; } });
  const [voice, setVoice] = useState(voiceOn);
  const [voices, setVoices] = useState(listVoices);   // the device's voices, most natural first
  const [voiceName, setVoiceName] = useState(chosenVoice);
  const [rate, setRate] = useState(voiceRate);
  const [detail, setDetail] = useState(voiceDetail);
  useEffect(() => onVoices(() => setVoices(listVoices())), []);

  // Every new order and table call: a notice, a sound, and a line in the bell's list.
  const onEvent = useCallback((kind, payload) => {
    const plates = kind === 'call' ? 0 : payload.items.reduce((n, i) => n + i.qty, 0);
    const place = tableName(payload.table);
    const notice = kind === 'order'
      ? { icon: 'receipt', title: `New order · ${place}`, sound: 'order', tag: 'order-' + payload.id,
          body: `#${payload.number} · ${plates} ${plates === 1 ? 'plate' : 'plates'} · ${money(payload.total, currency)}` }
      : kind === 'ready'
        ? { icon: 'bell', title: `Ready to serve · ${place}`, sound: 'good', tag: 'ready-' + payload.id,
            body: `#${payload.number} · ${plates} ${plates === 1 ? 'plate' : 'plates'} to carry out` }
        : { icon: payload.type === 'bill' ? 'receipt' : 'bell', sound: 'call', tag: 'call-' + payload.id,
            title: `${place} ${payload.type === 'bill' ? 'wants the bill' : 'needs a server'}`, body: 'Tap to open the orders board.' };
    // An order this screen has just entered itself is not called out back to it.
    // Only one order per send is skipped, so a colleague's order entered moments later is still announced.
    const own = kind === 'order' && payload.source === 'staff' && sending.current > 0;
    if (own) { sending.current -= 1; notice.sound = undefined; }
    // The call-out takes the screen and reads the order aloud; several arriving together wait their turn.
    const callOut = calloutsOn.current && !own;
    if (callOut) {
      setCalling((list) => [...list, { key: notice.tag + Date.now(), kind: kind === 'order' ? 'new' : kind, table: payload.table, number: payload.number, items: payload.items, type: payload.type }].slice(-6));
    }
    // With the call-out on screen a card as well would only repeat it: just ring. In the background, the card and system alert still fire.
    // A short chime only, so the voice can start straight away.
    if (callOut && !document.hidden) { if (notice.sound) play(kind === 'call' ? 'call' : 'soft'); buzz(); }
    else notify({ ...notice, important: true, vibrate: true, ttl: 12000, action: () => setTab('orders') });
    setLog((list) => [{ id: notice.tag, icon: notice.icon, title: notice.title, body: notice.body, at: Date.now() }, ...list].slice(0, 20));
    setUnread((n) => n + 1);
  }, [notify, currency]);

  const sending = useRef(0);   // orders this screen has just sent and not yet heard back about
  const calloutsOn = useRef(callouts);
  calloutsOn.current = callouts;
  const nextCall = useCallback(() => setCalling((list) => list.slice(1)), []);

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
  const toggleCallouts = () => { const on = !callouts; setCallouts(on); if (!on) setCalling([]); try { localStorage.setItem('sm.callouts', on ? '1' : '0'); } catch { /* private mode */ } };
  const toggleVoice = () => { setVoiceOn(!voice); setVoice(!voice); };
  const testVoice = () => speakLines(['Table four', 'two butter chicken, butter naan', 'one masala dosa']);
  const pickVoice = (name) => { setChosenVoice(name); setVoiceName(name); setTimeout(testVoice, 50); };
  const pickRate = (r) => { setVoiceRate(r); setRate(r); setTimeout(testVoice, 50); };
  const pickDetail = (v) => { setVoiceDetail(v); setDetail(v); };
  const toggleMute = () => { setMuted(!muted); setMute(!muted); if (muted) play('soft'); };

  // One place to move between sections: also closes the phone's "More" sheet and carries any target (a dish to open).
  const go = (to, extra) => { if (!allowed(to)) return; setTab(to); setMoreOpen(false); setTarget(extra || null); };
  const run = (what) => { if (what === 'theme') toggleTheme(); else if (what === 'bell') { setBellOpen(true); setUnread(0); } };

  if (!data.settings) return <div className="boot">{data.error || 'Loading…'}</div>;

  const navButton = ([id, label, icon, short], extraClass = '', compact = false) => (
    <button key={id} className={'a-nav' + (tab === id ? ' is-on' : '') + extraClass} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
      <Icon name={icon} size={18} /><span>{compact && short ? short : label}</span>
      {id === 'orders' && waiting > 0 && <span className="a-badge">{waiting}</span>}
    </button>
  );
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(([id]) => allowed(id)) })).filter((g) => g.items.length);
  const everything = groups.flatMap((g) => g.items);
  const bar = BAR_ORDER.filter(allowed).slice(0, 4);
  const onBar = bar.map((id) => everything.find(([x]) => x === id));
  const underMore = everything.filter(([id]) => !bar.includes(id));
  const sections = new Set(everything.map(([id]) => id));
  const signedIn = `${user.name || user.username} · ${ROLE_NAMES[user.role] || 'Owner'}`;

  return (
    <>
    <div className="a-app a-shell">
      {/* Laptop and up: every section listed down the side, grouped by what it is for. */}
      <aside className="a-side">
        <div className="a-brand">{data.settings.name}<small>ADMIN</small></div>
        <nav aria-label="Sections">
          {groups.map((g) => (
            <div key={g.group} className="a-navgroup">
              <h2>{g.group}</h2>
              {g.items.map((item) => navButton(item))}
            </div>
          ))}
        </nav>
        <div className="a-side__foot">
          <span className={'a-live' + (data.connected ? '' : ' is-off')} role="status">{data.connected ? 'Live' : 'Reconnecting'}</span>
          <p className="a-who"><Icon name="user" size={15} />{signedIn}</p>
          <button className="a-nav" onClick={onLogout}><Icon name="logout" size={18} /><span>Sign out</span></button>
        </div>
      </aside>

      <div className="a-body">
        <header className="a-head">
          <div className="a-wrap">
            <div className="a-brand a-brand--top">{data.settings.name}
              <span className={'a-live' + (data.connected ? '' : ' is-off')} role="status">{data.connected ? 'Live' : 'Reconnecting'}</span>
            </div>
            <Finder dishes={data.menu.dishes} onGo={go} onRun={run} allowed={allowed} can={can} />
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
                <div className="a-pop__row">
                  <span><Icon name="receipt" size={16} />Show each order full-screen</span>
                  <button className="a-switch" role="switch" aria-checked={callouts} aria-label="Show each order full-screen" onClick={toggleCallouts} />
                </div>
                {callouts && canSpeak() && (
                  <div className="a-pop__row">
                    <span><Icon name="sound" size={16} />Read it aloud</span>
                    <button className="a-switch" role="switch" aria-checked={voice} aria-label="Read each order aloud" onClick={toggleVoice} />
                  </div>
                )}
                {callouts && canSpeak() && voice && (
                  <div className="a-voice">
                    <label className="a-label">Voice
                      <select value={voiceName || voices[0]?.name || ''} onChange={(e) => pickVoice(e.target.value)}>
                        {voices.map((v) => <option key={v.name} value={v.name}>{v.label} ({v.quality})</option>)}
                      </select>
                    </label>
                    <div className="a-voice__row">
                      <div className="a-voice__speeds" role="group" aria-label="Speaking speed">
                        {SPEEDS.map(([label, r]) => <button key={label} className={'a-opt' + (rate === r ? ' is-on' : '')} aria-pressed={rate === r} onClick={() => pickRate(r)}>{label}</button>)}
                      </div>
                      <button className="a-btn" onClick={testVoice}>Hear it</button>
                    </div>
                    <div className="a-voice__speeds" role="group" aria-label="How much to say">
                      <button className={'a-opt' + (detail === 'full' ? ' is-on' : '')} aria-pressed={detail === 'full'} onClick={() => pickDetail('full')}>Say every dish</button>
                      <button className={'a-opt' + (detail === 'short' ? ' is-on' : '')} aria-pressed={detail === 'short'} onClick={() => pickDetail('short')}>Just the table</button>
                    </div>
                    {voices.length > 0 && !voices.some((v) => v.quality === 'Natural') && (
                      <p className="a-pop__note">This browser only has standard voices. For a natural, human-sounding one, open the admin in Microsoft Edge on this device: it includes realistic voices at no cost.</p>
                    )}
                  </div>
                )}
                {alerts === 'default' && (
                  <button className="a-btn is-gold" onClick={enableAlerts}>Send alerts to this device, even when the panel is closed</button>
                )}
                {alerts === 'granted' && <p className="a-pop__note">{pushed ? 'Push alerts are on: this device hears new orders and calls even with the panel closed.' : 'Alerts are on while this tab is open. Push could not be set up in this browser.'}</p>}
                {alerts === 'denied' && <p className="a-pop__note">Alerts are blocked in this browser's site settings.</p>}
                {IOS_BROWSER && <p className="a-pop__note">On iPhone and iPad, alerts with the panel closed only work from the home screen: tap Share, then Add to Home Screen, and open the admin from that icon.</p>}
              </section>
            )}
          </div>
        </header>

        <main className="a-wrap a-main">
          {silent && !muted && <p className="a-soundhint" role="status"><Icon name="sound" size={16} />Tap anywhere once so this screen can ring for new orders.</p>}
          {data.error && <p className="a-error" role="alert">{data.error} <button className="a-btn" onClick={() => data.setError('')}>Dismiss</button></p>}
          {tab === 'home' && <HomePage {...data} alerts={alerts} go={go} onAlerts={enableAlerts} can={can} sections={sections} />}
          {tab === 'kitchen' && <KitchenScreen orders={data.orders} can={can} connected={data.connected} />}
          {tab === 'staff' && <StaffPage me={user} />}
          {tab === 'guests' && <GuestsPage settings={data.settings} can={can} setError={data.setError} />}
          {tab === 'account' && <AccountPage me={user} />}
          {tab === 'orders' && <OrdersBoard {...data} can={can} open={target} onOpened={() => setTarget(null)} onSending={() => { sending.current += 1; setTimeout(() => { sending.current = Math.max(0, sending.current - 1); }, 10000); }} />}
          {tab === 'history' && <HistoryPage settings={data.settings} setError={data.setError} />}
          {tab === 'reports' && <ReportsPage settings={data.settings} setError={data.setError} />}
          {tab === 'menu' && <MenuManager {...data} can={can} open={target} onOpened={() => setTarget(null)} />}
          {tab === 'categories' && <CategoryManager {...data} />}
          {tab === 'tables' && <TablesQr settings={data.settings} />}
          {tab === 'settings' && <SettingsPage settings={data.settings} reload={data.loadMenu} />}
        </main>
      </div>

      {/* Phones: the four everyday sections along the bottom, the rest one tap away under More. */}
      <nav className="a-bottom" aria-label="Sections">
        {onBar.map((item) => navButton(item, '', true))}
        <button className={'a-nav' + (moreOpen || underMore.some(([id]) => id === tab) ? ' is-on' : '')} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
          <Icon name="more" size={18} strokeWidth={3} /><span>More</span>
        </button>
      </nav>
      {moreOpen && (
        <>
          <button className="a-more__veil" onClick={() => setMoreOpen(false)} aria-label="Close" tabIndex={-1} />
          <div className="a-more" role="dialog" aria-label="More sections">
            {underMore.map((item) => navButton(item))}
            <button className="a-nav" onClick={onLogout}><Icon name="logout" size={18} /><span>Sign out · {signedIn}</span></button>
          </div>
        </>
      )}
    </div>
    {calling[0] && <Callout key={calling[0].key} call={calling[0]} onDone={nextCall} />}
    <Notices items={notices} onDismiss={dismissNotice} />
    </>
  );
}

export default function AdminApp() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out

  useEffect(() => { api.get('/auth/me').then(setUser).catch(() => setUser(null)); }, []);

  // When the owner changes someone's role or switches them off, their screen follows within a minute
  // (or at once when they come back to the tab), without a reload.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return undefined;
    const check = () => api.get('/auth/me')
      .then((fresh) => setUser((old) => (old && old.role === fresh.role && old.name === fresh.name && old.active === fresh.active ? old : fresh)))
      .catch((e) => { if (e.status === 401) setUser(null); });
    const onVisible = () => { if (!document.hidden) check(); };
    const timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [signedIn]);

  const logout = async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); };

  if (user === undefined) return <div className="boot">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChange) return <ChoosePassword user={user} onDone={setUser} onLogout={logout} />;
  return <Panel user={user} onLogout={logout} />;
}
