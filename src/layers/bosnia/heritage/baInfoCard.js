/**
 * One small, shared detail card for the Bosnia reference layers (heritage,
 * war memory, minefields, power). Opened on a click; closed by its button,
 * Escape, or when the owning layer turns off.
 *
 * Everything is built with DOM APIs and `textContent` — upstream/OSM/Wikidata
 * text never reaches innerHTML. Links are restricted to https URLs and
 * images to Wikimedia Commons.
 */

const CARD_ID = 'ba-info-card';
let _card = null;
let _owner = null;
let _keyHandler = null;

/**
 * Keep only absolute https links.
 * @param {unknown} value
 * @returns {string|null}
 */
export function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 600) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Commons thumbnail URL for a bare Commons file name, or null.
 * @param {unknown} fileName e.g. "Stari Most 2.jpg"
 * @param {number} [width]
 * @returns {string|null}
 */
export function commonsThumbUrl(fileName, width = 320) {
  if (typeof fileName !== 'string') return null;
  const name = fileName.trim();
  if (!name || name.length > 240 || /[\u0000-\u001f/\\#?]/.test(name))
    return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${Math.max(64, Math.min(640, Math.round(width)))}`;
}

/** Commons file page for attribution. */
export function commonsFilePage(fileName) {
  if (!commonsThumbUrl(fileName)) return null;
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.trim())}`;
}

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.style.cssText = style;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function ensureCard() {
  if (_card && document.body.contains(_card)) return _card;
  _card = el(
    'aside',
    [
      'position:fixed',
      'left:16px',
      'bottom:96px',
      'z-index:180',
      'width:min(360px, calc(100vw - 32px))',
      'max-height:min(62vh, 560px)',
      'overflow:auto',
      'padding:14px 16px 12px',
      'background:var(--glass-bg, rgba(12,12,20,0.86))',
      'backdrop-filter:blur(16px)',
      '-webkit-backdrop-filter:blur(16px)',
      'border:1px solid rgba(255,255,255,0.14)',
      'border-left:3px solid var(--ba-card-accent, #ccc)',
      'border-radius:8px',
      'color:var(--text-primary, #e8eaed)',
      'font:12px/1.45 var(--font-mono, monospace)',
      'box-shadow:0 8px 28px rgba(0,0,0,0.45)',
    ].join(';'),
  );
  _card.id = CARD_ID;
  _card.setAttribute('role', 'dialog');
  _card.setAttribute('aria-live', 'polite');
  _card.hidden = true;
  document.body.appendChild(_card);
  return _card;
}

/**
 * Show the card for one feature.
 * @param {string} ownerId Layer id; closeInfoCard(ownerId) only closes its own card.
 * @param {object} model
 * @param {string} model.title
 * @param {string} [model.subtitle]
 * @param {string} [model.accent] CSS colour for the left rule.
 * @param {string} [model.warning] Highlighted warning paragraph.
 * @param {string} [model.text] Body paragraph.
 * @param {Array<[string, string|number|null|undefined]>} [model.rows] Key/value rows; empty values are skipped.
 * @param {Array<{label:string,url:string}>} [model.links]
 * @param {string} [model.image] Commons file name.
 * @param {string} [model.footer] Small print (licence / source).
 */
export function showInfoCard(ownerId, model) {
  if (typeof document === 'undefined' || !model?.title) return;
  const card = ensureCard();
  card.replaceChildren();
  card.style.setProperty('--ba-card-accent', model.accent || '#cccccc');
  card.setAttribute('aria-label', String(model.title));

  const head = el(
    'div',
    'display:flex;align-items:flex-start;gap:8px;margin-bottom:6px',
  );
  const titles = el('div', 'flex:1;min-width:0');
  titles.appendChild(
    el(
      'div',
      'font-size:13px;font-weight:600;letter-spacing:0.02em;overflow-wrap:anywhere',
      model.title,
    ),
  );
  if (model.subtitle)
    titles.appendChild(
      el(
        'div',
        'color:var(--text-secondary, #9aa);margin-top:2px',
        model.subtitle,
      ),
    );
  head.appendChild(titles);
  const close = el(
    'button',
    'flex:none;background:none;border:1px solid rgba(255,255,255,0.2);color:inherit;border-radius:4px;cursor:pointer;font:inherit;padding:0 6px;line-height:20px',
    '×',
  );
  close.type = 'button';
  close.setAttribute('aria-label', 'Close details');
  close.addEventListener('click', () => closeInfoCard());
  head.appendChild(close);
  card.appendChild(head);

  if (model.warning) {
    card.appendChild(
      el(
        'div',
        'margin:6px 0 8px;padding:7px 9px;border:1px solid #ff3b3b;background:rgba(255,40,40,0.14);color:#ffd6d6;border-radius:4px;font-weight:600',
        model.warning,
      ),
    );
  }

  const thumb = commonsThumbUrl(model.image);
  if (thumb) {
    const img = el(
      'img',
      'display:block;width:100%;max-height:180px;object-fit:cover;border-radius:4px;margin:4px 0 6px;background:rgba(255,255,255,0.05)',
    );
    img.alt = String(model.title);
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = thumb;
    img.addEventListener('error', () => img.remove(), { once: true });
    card.appendChild(img);
  }

  if (model.text) card.appendChild(el('p', 'margin:4px 0 8px', model.text));

  const rows = (model.rows || []).filter(
    ([, value]) =>
      value !== undefined && value !== null && String(value).trim() !== '',
  );
  if (rows.length) {
    const table = el(
      'dl',
      'display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:4px 0 8px',
    );
    for (const [key, value] of rows) {
      table.appendChild(el('dt', 'color:var(--text-secondary, #9aa)', key));
      table.appendChild(el('dd', 'margin:0;overflow-wrap:anywhere', value));
    }
    card.appendChild(table);
  }

  const links = (model.links || [])
    .map((link) => ({ label: link?.label, url: safeHttpsUrl(link?.url) }))
    .filter((link) => link.url && link.label);
  if (links.length) {
    const list = el(
      'div',
      'display:flex;flex-wrap:wrap;gap:4px 10px;margin:4px 0 6px',
    );
    for (const link of links) {
      const a = el(
        'a',
        'color:var(--accent, #00d4ff);text-decoration:none;border-bottom:1px dotted currentColor',
        link.label,
      );
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      list.appendChild(a);
    }
    card.appendChild(list);
  }

  if (model.footer)
    card.appendChild(
      el(
        'div',
        'margin-top:6px;color:var(--text-dim, #778);font-size:10.5px',
        model.footer,
      ),
    );

  _owner = ownerId;
  card.hidden = false;
  if (!_keyHandler) {
    _keyHandler = (event) => {
      if (event.key === 'Escape') closeInfoCard();
    };
    document.addEventListener('keydown', _keyHandler);
  }
}

/**
 * Close the card. With an owner id, only that layer's card closes.
 * @param {string} [ownerId]
 */
export function closeInfoCard(ownerId) {
  if (!_card) return;
  if (ownerId && _owner !== ownerId) return;
  _card.hidden = true;
  _card.replaceChildren();
  _owner = null;
  if (_keyHandler) {
    document.removeEventListener('keydown', _keyHandler);
    _keyHandler = null;
  }
}
