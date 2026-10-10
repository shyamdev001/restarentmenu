import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { fullName, money, pad2 } from '../../lib/format.js';
import { useTheme } from '../../lib/theme.js';

/** Where a plate sits on the wheel, relative to the one in the centre. */
function position(i, current, total) {
  let off = i - current;
  if (off > total / 2) off -= total;
  if (off < -total / 2) off += total;
  if (off === 0) return 'is-cur';
  if (off === -1) return 'is-prev';
  if (off === 1) return 'is-next';
  return off < 0 ? 'is-far-l' : 'is-far-r';
}

const EMBERS = [[14, 78, 0], [32, 86, 1.4], [62, 80, 2.6], [82, 70, 3.8], [48, 92, 4.7], [8, 52, 0.8], [90, 44, 2.1], [72, 94, 3.2], [24, 60, 5.3]];
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The price, rolling from the last dish's figure to this one. */
function Price({ value, currency }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reducedMotion() || document.hidden) { setShown(value); from.current = value; return undefined; }
    const start = performance.now();
    const begin = from.current;
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 450);
      const at = Math.round(begin + (value - begin) * (1 - (1 - p) ** 4));
      from.current = at;
      setShown(at);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <b>{money(shown, currency)}</b>;
}

/** Each word of a dish name rises in on its own beat. */
const words = (text, from = 0) => text.split(' ').filter(Boolean).map((w, i) => (
  <span key={from + i} className="c-w" style={{ animationDelay: (from + i) * 55 + 'ms' }}>{w} </span>
));

export default function Stage({
  settings, table, categories, category, onCategory,
  dishes, index, onStep, onPick, onOpen,
  qty, onAdd, cartCount, cartTotal, bump, orderStatus, isFav, onFav, canPickTable
}) {
  const dish = dishes[index];
  const touchX = useRef(null);
  const [theme, toggleTheme] = useTheme();
  const zone = useRef(null);
  const nameWords = dish.name.split(' ').filter(Boolean).length;

  // With a mouse, the plate leans toward the pointer and the ring drifts against it.
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || reducedMotion()) return undefined;
    let frame = 0;
    const onMove = (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = zone.current;
        if (!el) return;
        el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(frame); };
  }, []);
  const word = (dish.word || dish.name).toUpperCase();
  const ringText = `${settings.name} · ${settings.tagline} · served to order · `.toUpperCase();

  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 45) onStep(dx > 0 ? -1 : 1);
  };

  return (
    <>
      <header className="c-top">
        <div className="c-brand">
          {settings.name}
          {table
            ? <small>TABLE {pad2(table)}</small>
            : canPickTable
              ? <small><button className="c-pick" onClick={() => onOpen('table')}>CHOOSE YOUR TABLE</button></small>
              : <small>SCAN YOUR TABLE'S QR TO ORDER</small>}
        </div>
        <nav className="c-cats c-rail" aria-label="Categories">
          {categories.map((c) => (
            <button key={c.id} className={'c-cat' + (c.id === category ? ' is-on' : '')}
              aria-current={c.id === category ? 'true' : undefined} onClick={() => onCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </nav>
        <button key={bump} className={'c-cart c-glass c-press' + (cartCount ? ' is-filled' : '') + (bump ? ' c-bump' : '')}
          onClick={() => onOpen('order')}
          aria-label={`Your order, ${cartCount} items` + (orderStatus ? `. Sent order: ${orderStatus}` : '')}>
          {orderStatus ? <span className="c-live" /> : <Icon name="bag" />}
          {cartCount ? `${cartCount} · ${money(cartTotal, settings.currency)}` : orderStatus || 'Order'}
        </button>
      </header>

      <div ref={zone} className="c-zone" onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
        <div className="c-halo" />
        <div className="c-shadow" />
        <span className="c-smoke" />
        <span className="c-smoke is-b" />

        <div key={'word' + dish.id} className="c-word" aria-hidden="true">
          <div><span>{word} — {word} —</span><span>{word} — {word} —</span></div>
        </div>

        {EMBERS.map(([left, top, delay]) => (
          <span key={delay} className="c-ember" style={{ left: left + '%', top: top + '%', animationDelay: delay + 's' }} />
        ))}

        <div className="c-center c-ring" aria-hidden="true">
          <svg viewBox="0 0 400 400">
            <defs><path id="c-ring-path" d="M200,200 m-186,0 a186,186 0 1,1 372,0 a186,186 0 1,1 -372,0" /></defs>
            <text><textPath href="#c-ring-path" textLength="1160" lengthAdjust="spacing">{ringText + ringText}</textPath></text>
          </svg>
        </div>
        <div className="c-center c-dots" aria-hidden="true">
          <svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="196" fill="none" stroke="rgba(150,100,24,0.5)" strokeWidth="5" strokeDasharray="1 9.26" />
            <circle cx="200" cy="200" r="158" fill="none" stroke="rgba(150,100,24,0.32)" strokeWidth="0.6" /></svg>
        </div>

        <span key={'w1' + dish.id} className="c-wave" />
        <span key={'w2' + dish.id} className="c-wave" />

        {dishes.map((d, i) => {
          const pos = position(i, index, dishes.length);
          const current = pos === 'is-cur';
          return (
            <button key={d.id} className={`c-plate ${pos}` + (d.available ? '' : ' is-out')}
              onClick={() => (current ? onOpen('dish') : onPick(d.id))}
              aria-label={current ? `Details for ${d.name} ${d.accent}` : `Show ${d.name} ${d.accent}`}
              tabIndex={pos.startsWith('is-far') ? -1 : 0}>
              <span className="c-plate__dish">
                {d.image && <img src={d.image} alt="" loading={current ? 'eager' : 'lazy'} decoding="async" draggable="false" />}
              </span>
            </button>
          );
        })}
        {!dish.available && <div className="c-soldout">SOLD OUT</div>}

        <span className="c-steam" style={{ '--sx': -0.22 }} />
        <span className="c-steam" style={{ '--sx': -0.04, animationDelay: '1.7s' }} />
        <span className="c-steam" style={{ '--sx': 0.14, animationDelay: '3.3s' }} />

        <button className="c-theme c-round c-glass c-press" onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>

        <button className="c-fav c-round c-glass c-press" onClick={onFav} aria-pressed={isFav} aria-label="Save to favourites">
          <span key={String(isFav)} className={isFav ? 'c-pop' : ''}><Icon name="heart" fill={isFav ? 'currentColor' : 'none'} /></span>
        </button>
      </div>

      <div className="c-info">
        <div key={dish.id} className="c-rise">
          <div className="c-meta c-eyebrow">
            <span>{pad2(index + 1)} / {pad2(dishes.length)}</span>
            <span className="c-progress"><i style={{ transform: `scaleX(${(index + 1) / dishes.length})` }} /></span>
            <span className={'c-diet' + (dish.veg ? ' is-veg' : '')}><i />{dish.veg ? 'Veg' : 'Non-veg'}</span>
          </div>
          <h1 className="c-name" aria-label={fullName(dish)}>
            <span aria-hidden="true">{words(dish.name)}<em>{words(dish.accent || '', nameWords)}</em></span>
          </h1>
          <p className="c-desc">{dish.description}</p>
        </div>

        {dish.chefNote && <p key={'chef' + dish.id} className="c-chef">“{dish.chefNote}”</p>}

        <div className="c-row">
          <div className="c-price">
            <Price value={dish.price} currency={settings.currency} />
            <span><Icon name="clock" size={14} />{dish.prepMin} min</span>
          </div>
          <div className="c-arrows">
            <button className="c-round c-glass c-press" onClick={() => onStep(-1)} aria-label="Previous dish"><Icon name="left" /></button>
            <button className="c-round c-glass c-press" onClick={() => onStep(1)} aria-label="Next dish"><Icon name="right" /></button>
          </div>
        </div>

        <div className="c-actions">
          <button className="c-round c-glass c-press" onClick={() => onOpen('menu')} aria-label="Browse the full menu"><Icon name="menu" /></button>
          <button className="c-round c-glass c-press" onClick={() => onOpen('dish')} aria-label="Details and options"><Icon name="sliders" /></button>
          <button className="c-add c-press" onClick={onAdd} disabled={!dish.available}>
            <span>{!dish.available ? 'Sold out today' : qty ? 'Added to order' : 'Add to order'}</span>
            <i key={bump} className={bump ? 'c-bump' : ''}>{qty || '+'}</i>
          </button>
          {bump > 0 && <span key={'orb' + bump} className="c-orb" aria-hidden="true" />}
          {bump > 0 && (
            <span key={'sparks' + bump} className="c-sparks" aria-hidden="true">
              {SPARKS.map((a) => <i key={a} style={{ '--a': a + 'deg' }} />)}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
