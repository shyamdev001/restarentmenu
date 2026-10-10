import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { TZ, money } from '../../lib/format.js';

const iso = (date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const dayLabel = (day, long) => new Date(day + 'T12:00:00').toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
const hourLabel = (hour) => new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });

const PRESETS = [['Today', 0], ['7 days', 6], ['30 days', 29], ['90 days', 89]];

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
function Bars({ title, note, bars, emptyText }) {
  const [at, setAt] = useState(null);
  const max = Math.max(...bars.map((b) => b.value), 0);
  const shown = at !== null && bars[at] ? bars[at] : null;
  // Label only as many ticks as fit without colliding.
  const every = Math.max(1, Math.ceil(bars.length / 8));

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
        <li key={row.name + i}>
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

/** Sales, busiest hours and best sellers for any range of days, with a spreadsheet export. */
export default function ReportsPage({ settings, setError }) {
  const [range, setRange] = useState({ from: daysAgo(29), to: daysAgo(0) });
  const [report, setReport] = useState(null);
  const [all, setAll] = useState(false);
  const currency = settings.currency;
  const query = `from=${range.from}&to=${range.to}&tz=${encodeURIComponent(TZ)}`;

  useEffect(() => {
    let alive = true;
    if (range.from > range.to) return undefined;
    api.get('/admin/reports?' + query).then((r) => alive && setReport(r)).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [query, range.from, range.to, setError]);

  const preset = PRESETS.find(([, n]) => range.from === daysAgo(n) && range.to === daysAgo(0));
  const totals = report?.totals;
  const days = report ? eachDay(report.from, report.to) : [];
  const byDay = new Map((report?.byDay || []).map((d) => [d.day, d]));
  const byHour = new Map((report?.byHour || []).map((h) => [h.hour, h]));
  const busiest = (report?.byHour || []).slice().sort((a, b) => b.orders - a.orders)[0];
  const best = (report?.byDay || []).slice().sort((a, b) => b.revenue - a.revenue)[0];
  const sellers = report?.sellers || [];

  return (
    <>
      <div className="a-title">
        <h1>Sales <em>reports</em></h1>
        <a className="a-btn is-gold" href={'/api/admin/reports/export?' + query} download><Icon name="down" size={16} />Export spreadsheet</a>
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
            <div className="a-stat"><b>{totals.orders.toLocaleString('en-IN')}</b><span>Orders</span></div>
            <div className="a-stat"><b>{totals.plates.toLocaleString('en-IN')}</b><span>Plates</span></div>
            <div className="a-stat"><b>{money(Math.round(totals.average), currency)}</b><span>Average bill</span></div>
            <div className="a-stat"><b>{money(totals.revenue, currency)}</b><span>Sales</span></div>
          </div>
          {totals.cancelled > 0 && <p className="a-muted a-small">{totals.cancelled} cancelled {totals.cancelled === 1 ? 'order is' : 'orders are'} left out of every figure here.</p>}

          {!totals.orders && <div className="a-empty">No orders between {dayLabel(report.from, true)} and {dayLabel(report.to, true)}.</div>}

          {totals.orders > 0 && (
            <>
              <div className="a-charts">
                {days.length > 1 && (
                  <Bars title="Sales by day" emptyText="No sales."
                    note={best ? `Best day: ${dayLabel(best.day, true)}, ${money(best.revenue, currency)}` : ''}
                    bars={days.map((day) => {
                      const d = byDay.get(day);
                      return { key: day, value: d?.revenue || 0, label: dayLabel(day), short: money(d?.revenue || 0, currency),
                        tip: `${dayLabel(day, true)}: ${money(d?.revenue || 0, currency)} from ${d?.orders || 0} ${d?.orders === 1 ? 'order' : 'orders'}` };
                    })} />
                )}
                <Bars title="Busiest hours" emptyText="No orders."
                  note={busiest ? `Busiest: ${hourLabel(busiest.hour)} to ${hourLabel((busiest.hour + 1) % 24)}, ${busiest.orders} ${busiest.orders === 1 ? 'order' : 'orders'}` : ''}
                  bars={Array.from({ length: 24 }, (_, hour) => {
                    const h = byHour.get(hour);
                    return { key: hour, value: h?.orders || 0, label: hourLabel(hour), short: `${h?.orders || 0} orders`,
                      tip: `${hourLabel(hour)} to ${hourLabel((hour + 1) % 24)}: ${h?.orders || 0} ${h?.orders === 1 ? 'order' : 'orders'}, ${money(h?.revenue || 0, currency)}` };
                  })} />
              </div>

              <div className="a-charts">
                <section className="a-card">
                  <h2 className="a-sub" style={{ marginBottom: 14 }}>Best sellers<span className="a-muted a-small">by plates sold</span></h2>
                  <Ranked rows={all ? sellers : sellers.slice(0, 8)} valueOf={(d) => d.qty} render={(d) => (
                    <div className="a-rank__row">
                      <span><b>{d.name}</b><small>{d.category}</small></span>
                      <span className="a-rank__fig"><b>{d.qty}</b><small>{money(d.revenue, currency)}</small></span>
                    </div>
                  )} />
                  {sellers.length > 8 && <button className="a-btn" style={{ marginTop: 14 }} onClick={() => setAll((v) => !v)}>{all ? 'Show the top 8' : `Show all ${sellers.length}`}</button>}
                </section>

                <div className="a-stack">
                  <section className="a-card">
                    <h2 className="a-sub" style={{ marginBottom: 14 }}>By category<span className="a-muted a-small">by sales</span></h2>
                    <Ranked rows={report.byCategory} valueOf={(c) => c.revenue} render={(c) => (
                      <div className="a-rank__row">
                        <span><b>{c.name}</b><small>{c.qty} {c.qty === 1 ? 'plate' : 'plates'}</small></span>
                        <span className="a-rank__fig"><b>{money(c.revenue, currency)}</b></span>
                      </div>
                    )} />
                  </section>

                  {report.unsold.length > 0 && (
                    <section className="a-card">
                      <h2 className="a-sub" style={{ marginBottom: 6 }}>Not ordered in this period</h2>
                      <p className="a-muted a-small" style={{ marginBottom: 12 }}>{report.unsold.length} {report.unsold.length === 1 ? 'dish' : 'dishes'} on the menu with no sales.</p>
                      <div className="a-chips">{report.unsold.map((d) => <span key={d.name} className="a-chip">{d.name}</span>)}</div>
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
