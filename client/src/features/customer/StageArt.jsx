/**
 * Small animated drawings for each step of an order, used on the guest's
 * waiting screen. Plain SVG and CSS: nothing to download, and they rest still
 * for anyone who has asked their device for less motion.
 *
 *   new      an order slip writing itself, pinned with a bell
 *   cooking  a pan on a flickering flame, food tossing, steam rising
 *   ready    a covered dish, its lid lifting, sparkles
 *   served   a plate set with knife and fork, warm steam
 */
export default function StageArt({ stage, size = 44, still = false }) {
  const cls = 'c-art is-' + stage + (still ? ' is-still' : '');
  if (stage === 'new') {
    return (
      <svg className={cls} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <path className="c-art__slip" d="M14 8h20v30l-3.300-2.400-3.400 2.400-3.300-2.400-3.400 2.400-3.300-2.400L14 38z" />
        <path className="c-art__line" d="M19 16h10" />
        <path className="c-art__line" d="M19 22h10" style={{ animationDelay: '0.35s' }} />
        <path className="c-art__line" d="M19 28h6" style={{ animationDelay: '0.7s' }} />
        <g className="c-art__bell">
          <path d="M34 9.500a4 4 0 0 1 4 4v3h-8v-3a4 4 0 0 1 4-4z" />
          <path d="M33 18h2" />
        </g>
      </svg>
    );
  }
  if (stage === 'cooking') {
    return (
      <svg className={cls} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <path className="c-art__steam" d="M18 12c-2-2 2-4 0-6" />
        <path className="c-art__steam" d="M25 11c-2-2 2-4 0-6" style={{ animationDelay: '0.6s' }} />
        <circle className="c-art__bit" cx="17" cy="21" r="1.600" />
        <circle className="c-art__bit" cx="24" cy="20" r="1.800" style={{ animationDelay: '0.25s' }} />
        <circle className="c-art__bit" cx="30" cy="21" r="1.400" style={{ animationDelay: '0.5s' }} />
        <g className="c-art__pan">
          <path d="M9 25h28a0 0 0 0 1 0 0 8 8 0 0 1-8 8H17a8 8 0 0 1-8-8z" />
          <path d="M37 26h8" />
        </g>
        <path className="c-art__flame" d="M17 44c-2-2-1-4 0-5.500 0 1.500 1.500 2 1.500 0 0-1.500 1-2.500 1.500-3.500 1 2 2.500 3.500 1.500 6-.500 1.500-2 3-4.500 3z" />
        <path className="c-art__flame" d="M24 44c-2-2-1-4.500 0-6 .500 1.500 1.500 2 1.500 0 0-1.500 1-3 1.500-4 1 2.500 2.500 4 1.500 6.500-.500 1.500-2 3.500-4.500 3.500z" style={{ animationDelay: '0.2s' }} />
        <path className="c-art__flame" d="M31 44c-2-2-1-4 0-5.500 0 1.500 1.500 2 1.500 0 0-1.500 1-2.500 1.500-3.500 1 2 2.500 3.500 1.500 6-.500 1.500-2 3-4.500 3z" style={{ animationDelay: '0.4s' }} />
      </svg>
    );
  }
  if (stage === 'ready') {
    return (
      <svg className={cls} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <path className="c-art__spark" d="M9 12v4M7 14h4" />
        <path className="c-art__spark" d="M39 9v4M37 11h4" style={{ animationDelay: '0.5s' }} />
        <path className="c-art__spark" d="M41 22v3M39.500 23.500h3" style={{ animationDelay: '0.9s' }} />
        <g className="c-art__lid">
          <path d="M10 32a14 14 0 0 1 28 0z" />
          <path d="M22 16.500a2 2 0 0 1 4 0" />
        </g>
        <path className="c-art__tray" d="M6 35h36" />
        <path className="c-art__tray" d="M10 39h28" />
      </svg>
    );
  }
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path className="c-art__steam" d="M21 13c-2-2 2-4 0-6" />
      <path className="c-art__steam" d="M27 13c-2-2 2-4 0-6" style={{ animationDelay: '0.6s' }} />
      <circle className="c-art__plate" cx="24" cy="29" r="12" />
      <circle className="c-art__plate" cx="24" cy="29" r="7" />
      <path className="c-art__cutlery" d="M6 18v8M4 18v4a2 2 0 0 0 4 0v-4M6 26v14" />
      <path className="c-art__cutlery" d="M42 18c-2 1-3 4-3 8h3v14" />
    </svg>
  );
}
