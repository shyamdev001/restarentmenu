import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { TZ, money, tableName } from '../../lib/format.js';

const iso = (date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const dayLabel = (day, long) => new Date(day + 'T12:00:00').toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
const hourLabel = (hour) => new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
// 3 January 2000 was a Monday: weekday 1 = Monday … 7 = Sunday.
const weekdayLabel = (n, long) => new Date(2000, 0, 2 + n).toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' });
const count = (n) => Number(n || 0).toLocaleString('en-IN');
const plural = (n, word) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;
const mins = (n) => (n == null ? 'not known yet' : n < 1 ? 'under a minute' : `${n} min`);

const PRESETS = [['Today', 0], ['7 days', 6], ['30 days', 29], ['90 days', 89]];
const VIEWS = [['overview', 'Overview'], ['dishes', 'Dishes'], ['time', 'Days and hours'], ['tables', 'Tables'], ['service', 'Kitchen and service']];

/** Every day between two dates, so quiet days show as gaps instead of vanishing. */
function eachDay(from, to) {
  const days = [];
  for (let d = new Date(from + 'T12:00:00'); iso(d) <= to && days.length < 400; d.setDate(d.getDate() + 1)) days.push(iso(d));
  return days;
}

/**
 * A single-series bar chart. One colour, because the bars differ only in size.
 * Pointing at (or tabbing to) a bar reads its exact figures out in the line above.
 */
function Bars({ title, note, bars, emptyText = 'Nothing to show.' }) {
  const [at, setAt] = useState(null);
  const max = Math.max(...bars.map((b) => b.value), 0);
  const shown = at !== null && bars[at] ? bars[at] : null;
  const every = Math.max(1, Math.ceil(bars.length / 8)); // label only as many ticks as fit

  return (
    <section className="a-card a-chart">
      <header>
        <h2 className="a-sub">{title}</h2>
        <p className="a-chart__read" aria-live="polite">{shown ? shown.tip : note}</p>
      </header>
      {max === 0 ? <p className="a-chart__none">{emptyText}</p> : (
        <div className="a-bars" onMouseLeave={() => setAt(null)}>
          <span className="a-bars__max">{bars.find((b) => b.value === max)?.short}</span>
          <div className="a-bars__plot">
            {bars.map((b, i) => (
              <button key={b.key} type="button" className={'a-bar' + (at === i ? ' is-at' : '')} aria-label={b.tip}
                onMouseEnter={() => setAt(i)} onFocus={() => setAt(i)} onBlur={() => setAt(null)} onClick={() => setAt(i)}>
                <i style={{ height: b.value ? `max(3px, ${(b.value / max) * 100}%)` : 0 }} />
              </button>
            ))}
          </div>
          <div className="a-bars__axis" aria-hidden="true">
            {bars.map((b, i) => <span key={b.key}>{i % every === 0 ? b.label : ''}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}

/** Ranked rows, each with a bar scaled to the largest. The figures stay in plain ink beside it. */
function Ranked({ rows, valueOf, render }) {
  const max = Math.max(...rows.map(valueOf), 0);
  return (
    <ol className="a-rank">
      {rows.map((row, i) => (
        <li key={(row.name ?? row.table ?? i) + '-' + i}>
          <span className="a-rank__n">{i + 1}</span>
          <div className="a-rank__body">
            {render(row)}
            <span className="a-rank__bar"><i style={{ width: max ? `max(4px, ${(valueOf(row) / max) * 100}%)` : 0 }} /></span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A headline figure with how it compares to the period just before. Up or down is said in words, not only colour. */
function Stat({ label, value, now, before, moneyLike }) {
  let change = null;
  if (before > 0) {
    const pct = Math.round(((now - before) / before) * 100);
    change = pct === 0
      ? <small className="a-delta">same as before</small>
      : <small className={'a-delta ' + (pct > 0 ? 'is-up' : 'is-down')}><Icon name={pct > 0 ? 'up' : 'down'} size={12} strokeWidth={2.5} />{Math.abs(pct)}% {pct > 0 ? 'up' : 'down'}</small>;
  } else if (now > 0) {
    change = <small className="a-delta">nothing before to compare</small>;
  }
  return <div className={'a-stat' + (moneyLike ? ' is-key' : '')}><b>{value}</b><span>{label}</span>{change}</div>;
}

const PAID = { cash: ['Cash', 'cash'], upi: ['UPI', 'qr'], card: ['Card', 'card'], unrecorded: ['Not recorded', 'receipt'], open: ['Not paid yet', 'clock'] };

/** How the money came in: cash in the drawer, UPI and card in the bank. For checking the day at closing time. */
function Payments({ payments, rupees }) {
  if (!payments) return null;
  const shown = payments.filter((p) => p.orders > 0 || ['cash', 'upi', 'card'].includes(p.method));
  const most = Math.max(1, ...shown.map((p) => p.revenue));
  const recorded = payments.filter((p) => ['cash', 'upi', 'card'].includes(p.method)).reduce((n, p) => n + p.revenue, 0);
  return (
    <section className="a-card" aria-label="How guests paid">
      <h2 className="a-sub" style={{ marginBottom: 6 }}>How guests paid</h2>
      <p className="a-muted a-small" style={{ marginBottom: 14 }}>
        {recorded ? `${rupees(recorded)} recorded when tables were marked paid. Count the cash drawer against Cash.` : 'Each time a table is marked paid, staff tap Cash, UPI or Card; the totals show here.'}
      </p>
      <ul className="a-payments">
        {shown.map((p) => (
          <li key={p.method} className={['unrecorded', 'open'].includes(p.method) ? 'is-quiet' : ''}>
            <span><Icon name={PAID[p.method][1]} size={16} />{PAID[p.method][0]}</span>
            <span className="a-payments__bar" aria-hidden="true"><i style={{ width: `${(p.revenue / most) * 100}%` }} /></span>
            <b>{rupees(p.revenue)}<small>{p.orders} {p.orders === 1 ? 'order' : 'orders'}</small></b>
          </li>
        ))}
      </ul>
    </section>
  );
}

const Fact = ({ label, value, note }) => <div className="a-fact"><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</div>;

/** Orders by weekday and hour. One hue, darker for busier: it shows when to staff up. */
function Heat({ heat }) {
  const [at, setAt] = useState(null);
  if (!heat.length) return null;
  const hours = heat.map((h) => h.hour);
  const first = Math.min(...hours); const last = Math.max(...hours);
  const span = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = Math.max(...heat.map((h) => h.orders));
  const cell = (weekday, hour) => heat.find((h) => h.weekday === weekday && h.hour === hour)?.orders || 0;

  return (
    <section className="a-card a-chart">
      <header>
        <h2 className="a-sub">When guests order</h2>
        <p className="a-chart__read" aria-live="polite">{at || 'Darker means busier. Point at a square for its number.'}</p>
      </header>
      <div className="a-scroll">
        <table className="a-heat" onMouseLeave={() => setAt(null)}>
          <thead><tr><th />{span.map((h) => <th key={h} scope="col">{hourLabel(h)}</th>)}</tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
              <tr key={weekday}>
                <th scope="row">{weekdayLabel(weekday)}</th>
                {span.map((hour) => {
                  const n = cell(weekday, hour);
                  const tip = `${weekdayLabel(weekday, true)}, ${hourLabel(hour)} to ${hourLabel((hour + 1) % 24)}: ${plural(n, 'order')}`;
                  return (
                    <td key={hour}>
                      <button type="button" aria-label={tip} onMouseEnter={() => setAt(tip)} onFocus={() => setAt(tip)} onBlur={() => setAt(null)} onClick={() => setAt(tip)}
                        style={{ '--heat': n ? 0.14 + (n / max) * 0.86 : 0 }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Everything the restaurant's orders can tell its owner, for any range of days. */
export default function ReportsPage({ settings, setError }) {
  const [range, setRange] = useState({ from: daysAgo(29), to: daysAgo(0) });
  const [view, setView] = useState('overview');
  const [report, setReport] = useState(null);
  const [all, setAll] = useState(false);
  const [table, setTable] = useState(false);
  const currency = settings.currency;
  const rupees = (n) => money(Math.round(n || 0), currency); // whole amounts read better in a report
  const query = `from=${range.from}&to=${range.to}&tz=${encodeURIComponent(TZ)}`;

  useEffect(() => {
    let alive = true;
    if (range.from > range.to) return undefined;
    api.get('/admin/reports?' + query).then((r) => alive && setReport(r)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [query, range.from, range.to, setError]);

  const preset = PRESETS.find(([, n]) => range.from === daysAgo(n) && range.to === daysAgo(0));
  const t = report?.totals;
  const before = report?.previous;
  const days = report ? eachDay(report.from, report.to) : [];
  const byDay = new Map((report?.byDay || []).map((d) => [d.day, d]));
  const byHour = new Map((report?.byHour || []).map((h) => [h.hour, h]));
  const byWeekday = new Map((report?.byWeekday || []).map((w) => [w.weekday, w]));
  const busiest = (report?.byHour || []).slice().sort((a, b) => b.orders - a.orders)[0];
  const bestDay = (report?.byDay || []).slice().sort((a, b) => b.revenue - a.revenue)[0];
  const bestWeekday = (report?.byWeekday || []).slice().sort((a, b) => b.perDay - a.perDay)[0];
  const sellers = report?.sellers || [];
  const earners = sellers.slice().sort((a, b) => b.revenue - a.revenue);
  const bestTable = report?.byTable[0];
  const kitchen = report?.kitchen;
  const sizeOf = new Map((report?.sizes || []).map((s) => [s.plates, s.orders]));
  const spiceTotal = (report?.spice || []).reduce((n, s) => n + s.qty, 0);

  return (
    <>
      <div className="a-title">
        <h1>Sales <em>reports</em></h1>
        <div className="a-export" role="group" aria-label="Download a spreadsheet">
          <span className="a-muted a-small">Download</span>
          {[['orders', 'Orders'], ['dishes', 'Dishes'], ['days', 'Days']].map(([kind, label]) => (
            <a key={kind} className="a-btn" href={`/api/admin/reports/export?kind=${kind}&${query}`} download><Icon name="down" size={15} />{label}</a>
          ))}
        </div>
      </div>

      <div className="a-range">
        <div className="a-range__presets" role="group" aria-label="Period">
          {PRESETS.map(([label, n]) => (
            <button key={label} className={'a-chipbtn' + (preset?.[0] === label ? ' is-on' : '')} aria-pressed={preset?.[0] === label}
              onClick={() => setRange({ from: daysAgo(n), to: daysAgo(0) })}>{label}</button>
          ))}
        </div>
        <label className="a-label">From<input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} /></label>
        <label className="a-label">To<input type="date" value={range.to} min={range.from} max={daysAgo(0)} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} /></label>
      </div>

      {!report && <p className="a-muted">Adding it up…</p>}

      {report && (
        <>
          <div className="a-stats">
            <Stat label="Orders" value={count(t.orders)} now={t.orders} before={before.orders} />
            <Stat label="Plates" value={count(t.plates)} now={t.plates} before={before.plates} />
            <Stat label="Average bill" value={rupees(Math.round(t.average))} now={t.average} before={before.average} />
            <Stat label="Sales" value={rupees(t.revenue)} now={t.revenue} before={before.revenue} moneyLike />
          </div>
          <p className="a-muted a-small">
            Compared with the {plural(report.days, 'day')} before ({dayLabel(before.from)} to {dayLabel(before.to)}).
            {t.cancelled > 0 && ` ${plural(t.cancelled, 'cancelled order')} ${t.cancelled === 1 ? 'is' : 'are'} left out of every figure.`}
          </p>

          {!t.orders && <div className="a-empty">No orders between {dayLabel(report.from, true)} and {dayLabel(report.to, true)}.</div>}

          {t.orders > 0 && (
            <>
              <nav className="a-views" aria-label="Report sections">
                {VIEWS.map(([id, label]) => (
                  <button key={id} className={'a-view' + (view === id ? ' is-on' : '')} aria-current={view === id ? 'true' : undefined} onClick={() => setView(id)}>{label}</button>
                ))}
              </nav>

              {view === 'overview' && (
                <>
                  <div className="a-facts">
                    <Fact label="Sales before tax" value={rupees(t.subtotal)} />
                    <Fact label="Tax collected" value={rupees(t.tax)} />
                    <Fact label="Plates per order" value={t.platesPerOrder} />
                    <Fact label="Sales per day" value={rupees(Math.round(t.revenue / report.days))} note={`over ${plural(report.days, 'day')}`} />
                    <Fact label="Cancelled" value={count(t.cancelled)} note={t.cancelled ? `${rupees(t.cancelledValue)} lost · ${t.cancelRate}% of orders` : 'none'} />
                  </div>

                  <Payments payments={report.payments} rupees={rupees} />

                  <section className="a-card">
                    <h2 className="a-sub" style={{ marginBottom: 12 }}>At a glance</h2>
                    <ul className="a-glance">
                      {bestDay && <li><span>Best day</span><b>{dayLabel(bestDay.day, true)}</b><small>{rupees(bestDay.revenue)} from {plural(bestDay.orders, 'order')}</small></li>}
                      {bestWeekday && <li><span>Strongest weekday</span><b>{weekdayLabel(bestWeekday.weekday, true)}</b><small>{rupees(Math.round(bestWeekday.perDay))} on an average one</small></li>}
                      {busiest && <li><span>Busiest hour</span><b>{hourLabel(busiest.hour)} to {hourLabel((busiest.hour + 1) % 24)}</b><small>{plural(busiest.orders, 'order')}</small></li>}
                      {sellers[0] && <li><span>Most ordered</span><b>{sellers[0].name}</b><small>{plural(sellers[0].qty, 'plate')}</small></li>}
                      {earners[0] && <li><span>Earns the most</span><b>{earners[0].name}</b><small>{rupees(earners[0].revenue)} · {earners[0].share}% of sales</small></li>}
                      {bestTable && <li><span>Best table</span><b>{tableName(bestTable.table)}</b><small>{rupees(bestTable.revenue)} from {plural(bestTable.orders, 'order')}</small></li>}
                    </ul>
                  </section>

                  {days.length > 1 && (
                    <Bars title="Sales by day" note={bestDay ? `Best day: ${dayLabel(bestDay.day, true)}, ${rupees(bestDay.revenue)}` : ''}
                      bars={days.map((day) => {
                        const d = byDay.get(day);
                        return { key: day, value: d?.revenue || 0, label: dayLabel(day), short: rupees(d?.revenue || 0),
                          tip: `${dayLabel(day, true)}: ${rupees(d?.revenue || 0)} from ${plural(d?.orders || 0, 'order')}` };
                      })} />
                  )}

                  <section className="a-card">
                    <h2 className="a-sub" style={{ marginBottom: 8 }}>Day by day
                      <button className="a-btn" style={{ marginLeft: 'auto' }} onClick={() => setTable((v) => !v)} aria-expanded={table}>{table ? 'Hide the table' : 'Show the table'}</button>
                    </h2>
                    {table && (
                      <div className="a-scroll">
                        <table className="a-table">
                          <thead><tr><th>Date</th><th>Orders</th><th>Plates</th><th>Average bill</th><th>Cash</th><th>UPI</th><th>Card</th><th>Sales</th></tr></thead>
                          <tbody>
                            {report.byDay.slice().reverse().map((d) => (
                              <tr key={d.day}><td>{dayLabel(d.day, true)}</td><td>{count(d.orders)}</td><td>{count(d.plates)}</td><td>{rupees(Math.round(d.average))}</td><td>{rupees(d.cash || 0)}</td><td>{rupees(d.upi || 0)}</td><td>{rupees(d.card || 0)}</td><td>{rupees(d.revenue)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!table && <p className="a-muted a-small">{plural(report.byDay.length, 'day')} with orders in this period.</p>}
                  </section>
                </>
              )}

              {view === 'dishes' && (
                <div className="a-charts">
                  <section className="a-card">
                    <h2 className="a-sub" style={{ marginBottom: 14 }}>Best sellers<span className="a-muted a-small">by plates sold</span></h2>
                    <Ranked rows={all ? sellers : sellers.slice(0, 10)} valueOf={(d) => d.qty} render={(d) => (
                      <div className="a-rank__row">
                        <span><b>{d.name}</b><small>{d.category} · {d.share}% of sales</small></span>
                        <span className="a-rank__fig"><b>{count(d.qty)}</b><small>{rupees(d.revenue)}</small></span>
                      </div>
                    )} />
                    {sellers.length > 10 && <button className="a-btn" style={{ marginTop: 14 }} onClick={() => setAll((v) => !v)}>{all ? 'Show the top 10' : `Show all ${sellers.length}`}</button>}
                  </section>

                  <div className="a-stack">
                    <section className="a-card">
                      <h2 className="a-sub" style={{ marginBottom: 14 }}>By category<span className="a-muted a-small">by sales</span></h2>
                      <Ranked rows={report.byCategory} valueOf={(c) => c.revenue} render={(c) => (
                        <div className="a-rank__row">
                          <span><b>{c.name}</b><small>{plural(c.qty, 'plate')}</small></span>
                          <span className="a-rank__fig"><b>{rupees(c.revenue)}</b></span>
                        </div>
                      )} />
                    </section>

                    {report.addons.length > 0 && (
                      <section className="a-card">
                        <h2 className="a-sub" style={{ marginBottom: 14 }}>Extras<span className="a-muted a-small">add-ons guests chose</span></h2>
                        <Ranked rows={report.addons.slice(0, 8)} valueOf={(a) => a.qty} render={(a) => (
                          <div className="a-rank__row">
                            <span><b>{a.name}</b></span>
                            <span className="a-rank__fig"><b>{count(a.qty)}</b><small>{rupees(a.revenue)}</small></span>
                          </div>
                        )} />
                      </section>
                    )}

                    {spiceTotal > 0 && (
                      <section className="a-card">
                        <h2 className="a-sub" style={{ marginBottom: 14 }}>How spicy guests ask for it</h2>
                        <Ranked rows={report.spice.map((s) => ({ ...s, name: s.level }))} valueOf={(s) => s.qty} render={(s) => (
                          <div className="a-rank__row">
                            <span><b>{s.level}</b></span>
                            <span className="a-rank__fig"><b>{Math.round((s.qty / spiceTotal) * 100)}%</b><small>{plural(s.qty, 'plate')}</small></span>
                          </div>
                        )} />
                      </section>
                    )}

                    {report.unsold.length > 0 && (
                      <section className="a-card">
                        <h2 className="a-sub" style={{ marginBottom: 6 }}>Not ordered in this period</h2>
                        <p className="a-muted a-small" style={{ marginBottom: 12 }}>{count(report.unsold.length)} {report.unsold.length === 1 ? 'dish' : 'dishes'} on the menu with no sales.</p>
                        <div className="a-chips">{report.unsold.map((d) => <span key={d.name} className="a-chip">{d.name}</span>)}</div>
                      </section>
                    )}
                  </div>
                </div>
              )}

              {view === 'time' && (
                <>
                  <div className="a-charts">
                    <Bars title="Busiest hours"
                      note={busiest ? `Busiest: ${hourLabel(busiest.hour)} to ${hourLabel((busiest.hour + 1) % 24)}, ${plural(busiest.orders, 'order')}` : ''}
                      bars={Array.from({ length: 24 }, (_, hour) => {
                        const h = byHour.get(hour);
                        return { key: hour, value: h?.orders || 0, label: hourLabel(hour), short: plural(h?.orders || 0, 'order'),
                          tip: `${hourLabel(hour)} to ${hourLabel((hour + 1) % 24)}: ${plural(h?.orders || 0, 'order')}, ${rupees(h?.revenue || 0)}` };
                      })} />
                    <Bars title="An average weekday"
                      note={bestWeekday ? `Strongest: ${weekdayLabel(bestWeekday.weekday, true)}, ${rupees(Math.round(bestWeekday.perDay))} a day` : ''}
                      bars={[1, 2, 3, 4, 5, 6, 7].map((n) => {
                        const w = byWeekday.get(n);
                        return { key: n, value: w?.perDay || 0, label: weekdayLabel(n), short: rupees(Math.round(w?.perDay || 0)),
                          tip: `${weekdayLabel(n, true)}: ${rupees(Math.round(w?.perDay || 0))} a day on average, over ${plural(w?.days || 0, 'day')}` };
                      })} />
                  </div>
                  <Heat heat={report.heat} />
                </>
              )}

              {view === 'tables' && (
                <div className="a-charts">
                  <section className="a-card">
                    <h2 className="a-sub" style={{ marginBottom: 8 }}>Sales by table</h2>
                    <div className="a-scroll">
                      <table className="a-table" style={{ minWidth: 420 }}>
                        <thead><tr><th>Table</th><th>Orders</th><th>Plates</th><th>Average bill</th><th>Sales</th></tr></thead>
                        <tbody>
                          {report.byTable.map((row) => (
                            <tr key={row.table}><td>{tableName(row.table)}</td><td>{count(row.orders)}</td><td>{count(row.plates)}</td><td>{rupees(Math.round(row.average))}</td><td>{rupees(row.revenue)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <Bars title="How big orders are" note={`${t.platesPerOrder} plates in an average order`}
                    bars={[1, 2, 3, 4, 5, 6].map((n) => ({
                      key: n, value: sizeOf.get(n) || 0, label: n === 6 ? '6+' : String(n), short: plural(sizeOf.get(n) || 0, 'order'),
                      tip: `${n === 6 ? '6 or more plates' : plural(n, 'plate')}: ${plural(sizeOf.get(n) || 0, 'order')}`
                    }))} />
                </div>
              )}

              {view === 'service' && (
                <>
                  <section className="a-card">
                    <h2 className="a-sub" style={{ marginBottom: 6 }}>Kitchen speed</h2>
                    {!kitchen && <p className="a-muted">No timed orders in this period. Timing is recorded for orders moved through the board from now on.</p>}
                    {kitchen && (
                      <>
                        <p className="a-muted a-small" style={{ marginBottom: 14 }}>From {plural(kitchen.timed, 'served order')} with recorded times.</p>
                        <div className="a-facts">
                          <Fact label="Order to table" value={mins(kitchen.total)} note="on average" />
                          <Fact label="Slowest order" value={mins(kitchen.slowest)} />
                          <Fact label="Later than promised" value={count(kitchen.late)} note={`${Math.round((kitchen.late / kitchen.timed) * 100)}% of timed orders`} />
                          <Fact label="Waiting to start" value={mins(kitchen.accept)} note="new until cooking" />
                          <Fact label="Cooking" value={mins(kitchen.cook)} note="cooking until ready" />
                          <Fact label="Carrying out" value={mins(kitchen.carry)} note="ready until served" />
                        </div>
                      </>
                    )}
                  </section>

                  <section className="a-card">
                    <h2 className="a-sub" style={{ marginBottom: 6 }}>What guests said</h2>
                    {!report.ratings && <p className="a-muted">No ratings in this period. Guests are asked to rate once their meal is served.</p>}
                    {report.ratings && (
                      <>
                        <div className="a-facts">
                          <Fact label="Average rating" value={`${report.ratings.average} of 5`} note={`from ${plural(report.ratings.count, 'rating')}`} />
                          {report.ratings.spread.map((s) => <Fact key={s.stars} label={`${s.stars} ${s.stars === 1 ? 'star' : 'stars'}`} value={count(s.count)} />)}
                        </div>
                        {report.ratings.notes.length > 0 && (
                          <ul className="a-notes">
                            {report.ratings.notes.map((n, i) => (
                              <li key={i}><b>{n.stars} of 5</b><span>“{n.comment}”</span><small>{tableName(n.table)} · order #{n.number}</small></li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                    {report.prizes.length > 0 && (
                      <p className="a-muted a-small" style={{ marginTop: 12 }}>Given away on the wheel: {report.prizes.map((p) => `${p.count} × ${p.label}`).join(', ')}.</p>
                    )}
                  </section>

                  <div className="a-charts">
                    <section className="a-card">
                      <h2 className="a-sub" style={{ marginBottom: 14 }}>Calls from tables</h2>
                      <div className="a-facts">
                        <Fact label="Called a server" value={count(report.calls.waiter)} note={report.calls.waiter ? `answered in ${mins(report.calls.waiterAnswer)}` : 'none'} />
                        <Fact label="Asked for the bill" value={count(report.calls.bill)} note={report.calls.bill ? `answered in ${mins(report.calls.billAnswer)}` : 'none'} />
                      </div>
                    </section>
                    <section className="a-card">
                      <h2 className="a-sub" style={{ marginBottom: 14 }}>Cancelled orders</h2>
                      <div className="a-facts">
                        <Fact label="Cancelled" value={count(t.cancelled)} note={`${t.cancelRate}% of all orders`} />
                        <Fact label="Sales lost" value={rupees(t.cancelledValue)} />
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
