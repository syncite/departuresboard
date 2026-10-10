import { GLYPHS, COL_X, GLYPH_W, ROWS } from './glyphs.js';
import { sydneyNow, upcoming, hhmm } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Geometry, in SVG user units, measured from a head-on photo of the board at
// Brussel-Zuid. U is one glyph-grid unit (a narrow tile column is 1 U wide).
const U = 2.6;
const ROW = 1.65 * U;                // one tile row
const PANEL_W = 8.9 * U;
const PANEL_H = 18.4 * U;
const DIVIDER = 2.1 * U;             // black gap between character panels
const RAIL = 7.6 * U;                // black rail between character lines
const PAD_X = 8;
const HEAD_H = 46;
const GLYPH_X = (PANEL_W - GLYPH_W * U) / 2;
const GLYPH_Y = 1.8 * U;
const RADIUS = 0.8 * U;              // rounding on curved corners
const PITCH = PANEL_W + DIVIDER;

// The full board is 37 characters wide with two lines per train, as on the
// SNCB boards. Narrow screens get a reflowed board instead: characters at
// least NARROW_PITCH CSS pixels apart, with text wrapped onto extra lines.
const WIDE_COLS = 37;
const WIDE_TRAINS = 7;
const NARROW_TRAINS = 4;
const NARROW_PITCH = 38;
const MIN_COLS = 8;

const colX = c => PAD_X + c * PITCH;
const lineY = l => HEAD_H + RAIL + l * (PANEL_H + RAIL);
const boardWidth = cols => colX(cols - 1) + PANEL_W + PAD_X;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

const f = n => +n.toFixed(2);

function roundedRect(x0, y0, x1, y1, [tl, tr, br, bl]) {
  return `M${f(x0 + tl)} ${f(y0)}H${f(x1 - tr)}` +
    (tr ? `A${f(tr)} ${f(tr)} 0 0 1 ${f(x1)} ${f(y0 + tr)}` : '') +
    `V${f(y1 - br)}` +
    (br ? `A${f(br)} ${f(br)} 0 0 1 ${f(x1 - br)} ${f(y1)}` : '') +
    `H${f(x0 + bl)}` +
    (bl ? `A${f(bl)} ${f(bl)} 0 0 1 ${f(x0)} ${f(y1 - bl)}` : '') +
    `V${f(y0 + tl)}` +
    (tl ? `A${f(tl)} ${f(tl)} 0 0 1 ${f(x0 + tl)} ${f(y0)}` : '') + 'Z';
}

// Every subpath winds clockwise so overlapping shapes fill rather than cancel.
function polygon(pts) {
  const area = pts.reduce((a, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    return a + (x * ny - nx * y);
  }, 0);
  const ordered = area < 0 ? [...pts].reverse() : pts;
  return `M${ordered.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
}

const CORNERS = ['TL', 'TR', 'BR', 'BL'];

/**
 * The lit tiles of a glyph as one path. By default in glyph units; `ox`, `oy`
 * and `k` place and scale it, e.g. into CSS pixels for the HDR clip path.
 */
function glyphPath({ rows, round = {}, polys = [] }, ox = 0, oy = 0, k = 1) {
  const lit = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < 5 && rows[r][c] !== '.';
  let d = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 5; c++) {
      const code = rows[r][c];
      if (code === '.') continue;
      const x0 = ox + COL_X[c] * U * k, x1 = ox + COL_X[c + 1] * U * k;
      const y0 = oy + r * ROW * k, y1 = oy + (r + 1) * ROW * k;
      if (code === 'd') { d += polygon([[x1, y0], [x1, y1], [x0, y1]]); continue; }
      if (code === 'a') { d += polygon([[x0, y0], [x1, y0], [x0, y1]]); continue; }
      const free = [
        !lit(r - 1, c) && !lit(r, c - 1), !lit(r - 1, c) && !lit(r, c + 1),
        !lit(r + 1, c) && !lit(r, c + 1), !lit(r + 1, c) && !lit(r, c - 1),
      ];
      const explicit = round[`${r},${c}`] || '';
      const max = Math.min(y1 - y0, x1 - x0) / 2;
      d += roundedRect(x0, y0, x1, y1, CORNERS.map((key, i) =>
        ((code === 'o' && free[i]) || explicit.includes(key) ? Math.min(RADIUS * k, max) : 0)));
    }
  }
  for (const poly of polys) d += polygon(poly.map(([x, y]) => [ox + x * U * k, oy + y * ROW * k]));
  return d;
}

const glyphId = ch => `g-${ch.codePointAt(0).toString(16)}`;

// Thin dark seams between tiles, drawn over each glyph and clipped to it, so
// straight strokes and diagonals alike show the mosaic grid.
const SEAMS = [
  ...COL_X.slice(1, -1).map(x => `M${f(x * U)} 0V${f(ROWS * ROW)}`),
  ...Array.from({ length: ROWS - 1 }, (_, r) => `M0 ${f((r + 1) * ROW)}H${f(GLYPH_W * U)}`),
].join('');

function gradient(defs, id, stops, attrs = { x1: 0, y1: 0, x2: 0, y2: 1 }, type = 'linearGradient') {
  const g = el(type, { id, ...attrs }, defs);
  for (const [offset, color] of stops) el('stop', { offset, style: `stop-color: ${color}` }, g);
}

function buildBaseDefs(svg) {
  const defs = el('defs', {}, svg);
  // Panels are lit from inside but sit in the shadow of the rail above them.
  gradient(defs, 'panel', [
    ['0', 'var(--panel-shadow)'], ['0.09', 'var(--panel-top)'], ['0.55', 'var(--panel-mid)'], ['1', 'var(--panel-bottom)'],
  ]);
  gradient(defs, 'lit', [['0', 'var(--lit-top)'], ['1', 'var(--lit-bottom)']]);
  gradient(defs, 'rail', [['0', 'var(--rail-top)'], ['0.12', 'var(--rail)'], ['1', 'var(--rail-bottom)']]);
  for (const [ch, def] of Object.entries(GLYPHS)) {
    el('path', { id: glyphId(ch), d: glyphPath(def), fill: 'url(#lit)' }, defs);
  }
}

function buildOverlayDefs(svg) {
  const defs = el('defs', {}, svg);
  gradient(defs, 'falloff', [['0', 'rgba(0,0,0,0)'], ['0.7', 'rgba(0,0,0,0.08)'], ['1', 'rgba(0,0,0,0.28)']],
    { cx: 0.5, cy: 0.35, r: 0.8 }, 'radialGradient');
  gradient(defs, 'sheen', [['0', 'rgba(255,200,120,0.09)'], ['0.5', 'rgba(255,200,120,0)']],
    { x1: 0, y1: 0, x2: 0.6, y2: 1 });
  for (const [ch, def] of Object.entries(GLYPHS)) {
    const clip = el('clipPath', { id: `c-${glyphId(ch)}` }, defs);
    el('path', { d: glyphPath(def) }, clip);
    el('path', { id: `s-${glyphId(ch)}`, d: SEAMS, class: 'seam', 'clip-path': `url(#c-${glyphId(ch)})` }, defs);
  }
}

// The characters placed by a layout, as [char, x, y] in board units.
function placements({ cols, lines }) {
  const out = [];
  lines.forEach((runs, l) => {
    for (const [col, text] of runs) {
      [...text].forEach((ch, i) => {
        if (ch !== ' ' && GLYPHS[ch] && col + i < cols) out.push([ch, colX(col + i) + GLYPH_X, lineY(l) + GLYPH_Y]);
      });
    }
  });
  return out;
}

/**
 * Draws a board `cols` characters wide as two stacked SVGs: the board itself,
 * and an overlay with the tile seams and room lighting. The HDR layer, when
 * on, sits between them so the seams still cross the brighter letters.
 * `lines` is a list of text runs per line, each [column, text]; `labels` are
 * header captions [column, text, align].
 */
function drawBoard(layout) {
  const { cols, lines, labels, labelSize } = layout;
  const width = boardWidth(cols);
  const height = lineY(lines.length) + RAIL;
  const viewBox = `0 0 ${f(width)} ${f(height)}`;
  const placed = placements(layout);

  const base = el('svg', { viewBox, role: 'img', 'aria-labelledby': 'board-title' });
  el('title', { id: 'board-title' }, base).textContent = 'Departures from Central';
  buildBaseDefs(base);
  el('rect', { x: 0, y: 0, width, height, class: 'frame' }, base);
  for (const [col, text, align] of labels) {
    const x = align === 'end' ? colX(col) + PANEL_W : colX(col);
    el('text', {
      x, y: HEAD_H - 14, 'text-anchor': align, class: 'label', style: `font-size: ${labelSize}px`,
    }, base).textContent = text;
  }
  for (let l = 0; l <= lines.length; l++) {
    el('rect', { x: 0, y: lineY(l) - RAIL, width, height: RAIL, fill: 'url(#rail)' }, base);
  }
  for (let l = 0; l < lines.length; l++) {
    for (let c = 0; c < cols; c++) {
      el('rect', { x: colX(c), y: lineY(l), width: PANEL_W, height: PANEL_H, fill: 'url(#panel)' }, base);
    }
  }
  for (const [ch, x, y] of placed) el('use', { href: `#${glyphId(ch)}`, x: f(x), y: f(y) }, base);

  const overlay = el('svg', { viewBox, class: 'overlay', 'aria-hidden': 'true' });
  buildOverlayDefs(overlay);
  for (const [ch, x, y] of placed) el('use', { href: `#s-${glyphId(ch)}`, x: f(x), y: f(y) }, overlay);
  // Broad room lighting: a soft sheen from the upper left and falloff at the edges.
  el('rect', { x: 0, y: HEAD_H, width, height: height - HEAD_H, fill: 'url(#sheen)' }, overlay);
  el('rect', { x: 0, y: 0, width, height, fill: 'url(#falloff)' }, overlay);

  return { base, overlay, width, placed };
}

const fit = (text, len) => text.slice(0, len);
const right = (text, len) => fit(text, len).padStart(len, ' ');

/** Full-width board: time, destination, line and platform, remarks below. */
function wideLayout(list) {
  const lines = list.flatMap(t => [
    [[0, hhmm(t.time)], [6, fit(t.dest, 24)], [31, fit(t.line, 3)], [35, right(t.plat, 2)]],
    [[6, fit(t.via, 24)]],
  ]);
  const labels = [[0, 'TIME', 'start'], [6, 'DESTINATION', 'start'], [31, 'LINE', 'start'], [36, 'PLAT', 'end']];
  return { cols: WIDE_COLS, lines, labels, labelSize: 21 };
}

/** Word-wraps text into lines of at most `width` characters. */
function wrap(text, width) {
  const out = [];
  let line = '';
  for (let word of text.split(' ')) {
    // Words too long for a line break with a hyphen.
    while (word.length > width) {
      if (line) { out.push(line); line = ''; }
      out.push(`${word.slice(0, width - 1)}-`);
      word = word.slice(width - 1);
    }
    if (!word) continue;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Narrow board: the time and line on the first row with the platform at the
 * right when it fits, then the destination and remarks wrapped beneath.
 */
function narrowLayout(list, cols) {
  const lineCol = 6;
  const platFits = cols >= lineCol + 3 + 1 + 2;
  const lines = [];
  for (const t of list) {
    const first = [[0, hhmm(t.time)], [lineCol, fit(t.line, cols - lineCol)]];
    if (platFits) first.push([cols - 2, right(t.plat, 2)]);
    lines.push(first);
    for (const row of wrap(t.dest, cols)) lines.push([[0, row]]);
    for (const row of wrap(t.via, cols)) lines.push([[0, row]]);
    if (!platFits) lines.push([[0, `Plat ${t.plat}`]]);
  }
  const labels = [[0, 'TIME', 'start'], [lineCol, 'LINE', 'start']];
  if (platFits) labels.push([cols - 1, 'PLAT', 'end']);
  return { cols, lines, labels, labelSize: 28 };
}

function describe(list) {
  return list.map(t => `${hhmm(t.time)} ${t.line} to ${t.dest}, ${t.via.replace('·', 'and')}, platform ${t.plat}`).join('. ');
}

// Tile seams are barely visible from across a concourse and obvious up close,
// so their strength follows the on-screen size of a tile row, pinch zoom included.
function updateSeams(container) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  const target = container;
  const zoom = window.visualViewport ? window.visualViewport.scale : 1;
  const rowPx = ROW * scale * zoom;
  const t = Math.min(1, Math.max(0, (rowPx - 6) / 30));
  target.style.setProperty('--seam-alpha', (0.05 + 0.7 * t).toFixed(3));
}

/**
 * The lit tiles of a drawn board as a CSS clip path in pixels. A path clip is
 * redrawn as vectors at any zoom (a CSS mask image is not), so the HDR letters
 * stay as crisp as the board beneath them.
 */
function hdrClip({ placed, width }, pxWidth) {
  const k = pxWidth / width;
  const d = placed.map(([ch, x, y]) => glyphPath(GLYPHS[ch], x * k, y * k, k)).join('');
  return `path('${d}')`;
}

const HDR_KEY = 'departures-hdr';

function hdrPreference() {
  try {
    const saved = localStorage.getItem(HDR_KEY);
    if (saved) return saved === 'on';
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(dynamic-range: high)').matches ?? false;
}

function saveHdrPreference(on) {
  try { localStorage.setItem(HDR_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

/**
 * HDR glow: a tiny HDR10 clip of the lit yellow at about 600 nits, played
 * clipped to the letters. On HDR screens the lit tiles then reach past
 * ordinary white, like the real board. Shown only while it is really playing.
 */
function hdrLayer(container, toggle) {
  const video = document.createElement('video');
  Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.className = 'hdr';
  container.appendChild(video);
  // Played from a blob URL: Safari insists on byte-range responses for video,
  // which the static host does not give, and the clip is only 7 KB anyway.
  const ready = fetch('glow-hdr.mp4')
    .then(r => (r.ok ? r.blob() : Promise.reject(new Error(r.statusText))))
    .then(blob => { video.src = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' })); })
    .catch(() => {});

  let on = hdrPreference();
  const sync = () => {
    container.classList.toggle('hdr-on', on);
    if (toggle) {
      toggle.textContent = on ? 'HDR glow: on' : 'HDR glow: off';
      toggle.setAttribute('aria-pressed', String(on));
    }
    if (on) ready.then(() => video.play()).catch(() => {});
    else video.pause();
  };
  video.addEventListener('playing', () => container.classList.add('hdr-playing'));
  for (const type of ['pause', 'emptied', 'error', 'stalled']) {
    video.addEventListener(type, () => container.classList.remove('hdr-playing'));
  }
  toggle?.addEventListener('click', () => { on = !on; saveHdrPreference(on); sync(); });
  // Autoplay can be refused (Low Power Mode); the first tap retries.
  window.addEventListener('pointerdown', () => { if (on && video.paused) video.play().catch(() => {}); });
  sync();
  return clip => {
    video.style.webkitClipPath = clip;
    video.style.clipPath = clip;
  };
}

export function mount(container, live, toggle) {
  const host = document.createElement('div');
  host.className = 'board-host';
  const overlayHost = document.createElement('div');
  overlayHost.className = 'overlay-host';
  container.replaceChildren(host);
  const setClip = hdrLayer(container, toggle);
  container.appendChild(overlayHost);
  let drawn = null;
  const clipToBoard = () => {
    if (drawn) setClip(hdrClip(drawn, drawn.base.getBoundingClientRect().width));
  };

  let last = '';
  const update = () => {
    const width = container.clientWidth || window.innerWidth;
    const wide = width / WIDE_COLS >= NARROW_PITCH / 2;
    const cols = wide ? WIDE_COLS : Math.max(MIN_COLS, Math.floor(width / NARROW_PITCH));
    const list = upcoming(sydneyNow().minutes, wide ? WIDE_TRAINS : NARROW_TRAINS);
    const key = `${cols}|${list.map(t => t.time + t.dest).join('|')}`;
    if (key === last) return;
    last = key;
    const layout = wide ? wideLayout(list) : narrowLayout(list, cols);
    drawn = drawBoard(layout);
    host.replaceChildren(drawn.base);
    overlayHost.replaceChildren(drawn.overlay);
    clipToBoard();
    updateSeams(container);
    if (live) live.textContent = describe(list);
  };
  update();
  setInterval(update, 5000);
  let pending;
  window.addEventListener('resize', () => {
    clearTimeout(pending);
    pending = setTimeout(() => { update(); clipToBoard(); updateSeams(container); }, 150);
  });
  window.visualViewport?.addEventListener('resize', () => updateSeams(container));
}
