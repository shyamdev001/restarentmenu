import { useRef } from 'react';
import Icon from '../../components/Icon.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Full-screen opening. Opens like an iris from the plate when the guest taps the button. */
export default function Welcome({ settings, table, image, gone, onEnter }) {
  const [first, ...rest] = settings.name.split(' ');
  const root = useRef(null);
  const plate = useRef(null);

  // Centre the opening on wherever the plate sits in this layout.
  const enter = () => {
    if (root.current && plate.current) {
      const r = root.current.getBoundingClientRect();
      const p = plate.current.getBoundingClientRect();
      root.current.style.setProperty('--ix', `${p.left - r.left + p.width / 2}px`);
      root.current.style.setProperty('--iy', `${p.top - r.top + p.height / 2}px`);
    }
    onEnter();
  };

  return (
    <section ref={root} className={'c-welcome' + (gone ? ' is-gone' : '')} aria-label="Welcome" aria-hidden={gone}>
      <div className="c-welcome__bar c-eyebrow">
        <span>{table ? `Table ${String(table).padStart(2, '0')}` : 'Welcome'}</span>
        <span>{greeting()}</span>
      </div>

      <div ref={plate} className="c-welcome__plate">
        <svg viewBox="0 0 400 400" aria-hidden="true">
          <defs><path id="c-ring-welcome" d="M200,200 m-186,0 a186,186 0 1,1 372,0 a186,186 0 1,1 -372,0" /></defs>
          <text><textPath href="#c-ring-welcome" textLength="1160" lengthAdjust="spacing">
            {`WELCOME · ${settings.tagline.toUpperCase()} · SERVED TO ORDER · WELCOME · ${settings.tagline.toUpperCase()} · `}
          </textPath></text>
        </svg>
        {image && <div className="c-plate"><span className="c-plate__dish"><img src={image} alt="" /></span></div>}
      </div>

      <div className="c-welcome__text">
        <h1><span className="c-w">{first}</span>{rest.length > 0 && <em className="c-w" style={{ animationDelay: '140ms' }}>{rest.join(' ')}</em>}</h1>
        {settings.welcome && <p>{settings.welcome}</p>}
      </div>

      <button className="c-enter c-press" onClick={enter} tabIndex={gone ? -1 : 0}>
        Open the menu <Icon name="right" />
      </button>
    </section>
  );
}
