import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { speakLines } from '../../lib/speech.js';
import { tableName } from '../../lib/format.js';

const KINDS = {
  new: { label: 'New order', icon: 'receipt', say: 'New order.' },
  ready: { label: 'Ready to serve', icon: 'bell', say: 'Order ready.' },
  call: { label: 'Table calling', icon: 'bell', say: '' }
};

/** How one dish is read out: "2 Butter Chicken, fiery, with butter naan". */
function spoken(item) {
  const extras = [item.spice && item.spice.toLowerCase(), item.addons?.length ? 'with ' + item.addons.map((a) => a.name).join(' and ') : ''].filter(Boolean);
  return `${item.qty} ${item.name}` + (extras.length ? ', ' + extras.join(', ') : '');
}

/**
 * The call-out: the order takes over the screen and is read aloud, one dish at
 * a time, each line lighting up as it is spoken. A kitchen can follow it
 * without touching anything. A tap anywhere sends it away.
 *
 * `call` is { kind: 'new' | 'ready' | 'call', table, number?, items?, type? }
 */
export default function Callout({ call, onDone }) {
  const [at, setAt] = useState(-1);
  const kind = KINDS[call.kind];
  const place = tableName(call.table);
  const items = call.items || [];
  const headline = call.kind === 'call'
    ? `${place} is asking for ${call.type === 'bill' ? 'the bill' : 'a server'}.`
    : `${kind.say} ${place}.`;

  useEffect(() => {
    let close;
    // Line 0 is the headline; lines 1… are the dishes. A short pause first lets the chime ring out.
    const lines = [headline, ...items.map(spoken)];
    let stop = () => {};
    const start = setTimeout(() => {
      stop = speakLines(lines, {
        onLine: (i) => setAt(i),
        onEnd: () => { close = setTimeout(onDone, 1800); }
      });
    }, 650);
    return () => { clearTimeout(start); clearTimeout(close); stop(); };
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onDone(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  return (
    <div className={'a-callout is-' + call.kind} role="alertdialog" aria-label={headline} onClick={onDone}>
      <i className="a-callout__ring" aria-hidden="true" />
      <i className="a-callout__ring" aria-hidden="true" />
      <div className="a-callout__card">
        <p className={'a-callout__kind' + (at >= 0 ? ' is-said' : '')}><Icon name={kind.icon} size={16} />{kind.label}{call.number ? ` · #${call.number}` : ''}</p>
        <h2 className={'a-callout__table' + (at >= 0 ? ' is-said' : '')}>{place}</h2>
        {call.kind === 'call' && <p className="a-callout__ask">{call.type === 'bill' ? 'wants the bill' : 'needs a server'}</p>}
        {items.length > 0 && (
          <ol className="a-callout__items">
            {items.map((item, i) => (
              <li key={i} className={at === i + 1 ? 'is-now' : at > i + 1 ? 'is-said' : ''} style={{ animationDelay: 0.25 + i * 0.07 + 's' }}>
                <b>{item.qty}</b>
                <span>{item.name}
                  {(item.spice || item.addons?.length > 0) && <small>{[item.spice, ...(item.addons || []).map((a) => '+ ' + a.name)].filter(Boolean).join(' · ')}</small>}
                  {item.note && <small>Note: “{item.note}”</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="a-callout__hint">Tap anywhere to close</p>
      </div>
    </div>
  );
}
