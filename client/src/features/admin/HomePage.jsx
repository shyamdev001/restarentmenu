import Icon from '../../components/Icon.jsx';
import { money } from '../../lib/format.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;

/** A row that says what is waiting and takes you there in one tap. */
function Row({ icon, title, hint, action, onClick, urgent }) {
  return (
    <button className={'a-row' + (urgent ? ' is-urgent' : '')} onClick={onClick}>
      <span className="a-row__icon"><Icon name={icon} size={18} /></span>
      <span className="a-row__text"><b>{title}</b>{hint && <small>{hint}</small>}</span>
      <span className="a-row__go">{action}<Icon name="right" size={15} /></span>
    </button>
  );
}

/**
 * The first screen after signing in: what needs doing now, how today is going,
 * what is still to set up, and the things an owner reaches for most.
 */
export default function HomePage({ orders, calls, stats, openTables, menu, settings, alerts, go, onAlerts }) {
  const currency = settings.currency;
  const fresh = orders.filter((o) => o.status === 'new').length;
  const cooking = orders.filter((o) => o.status === 'cooking').length;
  const ready = orders.filter((o) => o.status === 'ready').length;
  const toSettle = openTables.filter((t) => !t.active);
  const soldOut = menu.dishes.filter((d) => !d.available);
  const noPhoto = menu.dishes.filter((d) => !d.image);
  const localSite = !settings.publicUrl || /localhost|127\.0\.0\.1/.test(settings.publicUrl);

  // What is waiting for someone, most pressing first.
  const now = [
    fresh > 0 && { icon: 'receipt', urgent: true, title: `${plural(fresh, 'new order')} waiting`, hint: 'Nothing is cooked until you start it.', action: 'Open orders', to: 'orders' },
    calls.length > 0 && { icon: 'bell', urgent: true, title: `${plural(calls.length, 'table')} asking for you`, hint: calls.map((c) => `Table ${c.table}${c.type === 'bill' ? ' (bill)' : ''}`).join(', '), action: 'See calls', to: 'orders' },
    ready > 0 && { icon: 'check', title: `${plural(ready, 'order')} ready to carry out`, action: 'Open orders', to: 'orders' },
    cooking > 0 && { icon: 'flame', title: `${plural(cooking, 'order')} cooking`, action: 'Open orders', to: 'orders' },
    toSettle.length > 0 && { icon: 'receipt', title: `${plural(toSettle.length, 'table')} finished and not marked paid`, hint: toSettle.map((t) => `Table ${t.table} · ${money(t.total, currency)}`).join(', '), action: 'Mark paid', to: 'orders' }
  ].filter(Boolean);

  // Things that are not finished setting up. Each disappears once it is done.
  const setup = [
    !menu.categories.length && { icon: 'grid', title: 'Create your first category', hint: 'Dishes are grouped into categories such as Starters or Drinks.', action: 'Categories', to: 'categories' },
    menu.categories.length > 0 && !menu.dishes.length && { icon: 'dish', title: 'Add your first dish', action: 'Dishes', to: 'menu' },
    localSite && { icon: 'gear', title: 'Enter your website address', hint: 'The table QR codes are built from it. Until then they only work on this computer.', action: 'Settings', to: 'settings' },
    noPhoto.length > 0 && { icon: 'dish', title: `${plural(noPhoto.length, 'dish', 'dishes')} without a photo`, hint: noPhoto.slice(0, 3).map((d) => `${d.name} ${d.accent || ''}`.trim()).join(', ') + (noPhoto.length > 3 ? '…' : ''), action: 'Add photos', to: 'menu' },
    alerts === 'default' && { icon: 'bell', title: 'Get alerts on this device', hint: 'Hear about new orders even when this page is closed.', action: 'Turn on', run: onAlerts }
  ].filter(Boolean);

  const shortcuts = [
    { icon: 'plus', title: 'Add a dish', hint: 'Name, price, photo and extras', to: 'menu', extra: { newDish: true } },
    { icon: 'dish', title: 'Mark a dish sold out', hint: soldOut.length ? `${plural(soldOut.length, 'dish', 'dishes')} sold out right now` : 'One switch, guests see it at once', to: 'menu' },
    { icon: 'qr', title: 'Print table QR codes', hint: `${plural(settings.tables, 'table')} set up`, to: 'tables' },
    { icon: 'chart', title: 'See how the month is going', hint: 'Sales, best sellers, busiest hours', to: 'reports' },
    { icon: 'clock', title: 'Look up a past order', hint: 'Every day of the last 60', to: 'history' },
    { icon: 'gear', title: 'Change tax, tables or password', hint: `Tax ${settings.taxPercent}% · ${settings.requireQr ? 'QR-only ordering is on' : 'any link can order'}`, to: 'settings' }
  ];

  return (
    <>
      <div className="a-title">
        <h1>{greeting()}</h1>
        <span className="a-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>

      <section aria-label="Needs you now">
        <h2 className="a-sub" style={{ marginBottom: 12 }}>Needs you now</h2>
        {now.length
          ? <div className="a-rows">{now.map((r) => <Row key={r.title} {...r} onClick={() => go(r.to)} />)}</div>
          : <div className="a-empty">Nothing is waiting. New orders and table calls appear here and ring.</div>}
      </section>

      <section aria-label="Today">
        <h2 className="a-sub" style={{ marginBottom: 12 }}>Today so far
          <button className="a-btn a-sub__link" onClick={() => go('reports')}>Full reports<Icon name="right" size={15} /></button>
        </h2>
        <div className="a-stats">
          <div className="a-stat"><b>{stats.active}</b><span>Active orders</span></div>
          <div className="a-stat"><b>{stats.orders}</b><span>Orders today</span></div>
          <div className="a-stat"><b>{stats.items}</b><span>Plates today</span></div>
          <div className="a-stat is-key"><b>{money(stats.revenue, currency)}</b><span>Sales today</span></div>
        </div>
      </section>

      {setup.length > 0 && (
        <section aria-label="Still to set up">
          <h2 className="a-sub" style={{ marginBottom: 12 }}>Still to set up</h2>
          <div className="a-rows">{setup.map((r) => <Row key={r.title} {...r} onClick={() => (r.run ? r.run() : go(r.to))} />)}</div>
        </section>
      )}

      <section aria-label="Shortcuts">
        <h2 className="a-sub" style={{ marginBottom: 12 }}>Shortcuts</h2>
        <div className="a-rows is-two">{shortcuts.map((r) => <Row key={r.title} {...r} onClick={() => go(r.to, r.extra)} />)}</div>
      </section>
    </>
  );
}
