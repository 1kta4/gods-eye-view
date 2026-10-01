import { MINE_OFFICIAL_LINKS, MINE_WARNING } from './model.js';

/**
 * Prominent mine-safety notice shown the first time the minefield layer is
 * enabled in a browser session. The app's #toast is a short-lived status
 * line, too easy to miss for this, so the layer owns a fixed banner that
 * stays until the operator acknowledges it.
 */

const BANNER_ID = 'ba-minefield-warning';
const SESSION_KEY = 'gev:ba-minefields-warning-ack';
let _shownThisPage = false;

function acknowledged() {
  if (_shownThisPage) return true;
  try {
    return window.sessionStorage?.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function remember() {
  _shownThisPage = true;
  try {
    window.sessionStorage?.setItem(SESSION_KEY, '1');
  } catch {
    /* private mode: the module flag still covers this page */
  }
}

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Show the banner unless already acknowledged this session.
 * @param {{asOf:string|null, source:string|null, url:string|null, rows:Array<{area:string,level:string,km2:number}>}|null} [stats]
 * @param {{force?: boolean}} [options]
 * @returns {boolean} True when the banner was shown.
 */
export function showMinefieldWarning(stats = null, { force = false } = {}) {
  if (typeof document === 'undefined') return false;
  if (!force && acknowledged()) return false;
  document.getElementById(BANNER_ID)?.remove();
  const banner = el(
    'div',
    [
      'position:fixed',
      'top:72px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:400',
      'width:min(640px, calc(100vw - 32px))',
      'max-height:calc(100vh - 120px)',
      'overflow:auto',
      'padding:16px 18px 14px',
      'background:rgba(40,0,0,0.92)',
      'border:2px solid #ff2a2a',
      'border-radius:8px',
      'box-shadow:0 0 0 4px rgba(255,42,42,0.25), 0 12px 40px rgba(0,0,0,0.6)',
      'color:#fff',
      'font:13px/1.5 var(--font-mono, monospace)',
    ].join(';'),
  );
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'alertdialog');
  banner.setAttribute('aria-modal', 'false');
  banner.setAttribute('aria-labelledby', `${BANNER_ID}-title`);

  const title = el(
    'div',
    'font-size:15px;font-weight:700;letter-spacing:0.04em;color:#ff6b6b;margin-bottom:6px',
    '⚠ LANDMINE WARNING — read before using this layer',
  );
  title.id = `${BANNER_ID}-title`;
  banner.appendChild(title);
  banner.appendChild(el('p', 'margin:0 0 10px;font-weight:600', MINE_WARNING));

  const links = el(
    'div',
    'display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px',
  );
  for (const link of MINE_OFFICIAL_LINKS) {
    const a = el('a', 'color:#ffd0d0;text-decoration:underline', link.label);
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    links.appendChild(a);
  }
  banner.appendChild(links);

  if (stats?.rows?.length) {
    const details = el('details', 'margin:0 0 12px');
    details.appendChild(
      el(
        'summary',
        'cursor:pointer;color:#ffd0d0',
        `Official suspected hazardous area by canton/entity (${stats.asOf || 'BHMAC'})`,
      ),
    );
    const table = el(
      'dl',
      'display:grid;grid-template-columns:1fr auto;gap:1px 16px;margin:6px 0 4px',
    );
    for (const row of stats.rows) {
      const strong = row.level !== 'canton' ? 'font-weight:700' : '';
      table.appendChild(el('dt', strong, row.area));
      table.appendChild(
        el(
          'dd',
          `margin:0;text-align:right;${strong}`,
          `${row.km2.toFixed(2)} km²`,
        ),
      );
    }
    details.appendChild(table);
    if (stats.source)
      details.appendChild(
        el('div', 'font-size:11px;color:#e0b0b0', stats.source),
      );
    banner.appendChild(details);
  }

  const ok = el(
    'button',
    'background:#ff2a2a;color:#fff;border:none;border-radius:4px;padding:6px 14px;font:inherit;font-weight:700;cursor:pointer',
    'I understand',
  );
  ok.type = 'button';
  ok.addEventListener('click', () => {
    remember();
    banner.remove();
  });
  banner.appendChild(ok);
  document.body.appendChild(banner);
  ok.focus?.({ preventScroll: true });
  return true;
}

/** Remove the banner without acknowledging it (layer turned off). */
export function hideMinefieldWarning() {
  if (typeof document === 'undefined') return;
  document.getElementById(BANNER_ID)?.remove();
}
