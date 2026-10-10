import { GLYPHS, COL_X, GLYPH_W, ROWS } from './glyphs.js';
import { sydneyNow, upcoming, hhmm } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Geometry, in board units, measured from photos of the board at Brussel-Zuid.
// U is one glyph-grid unit (a narrow tile column is 1 U wide).
const U = 2.6;
const ROW = 1.65 * U;                // one tile row
const PANEL_W = 8.9 * U;
const PANEL_H = 18.4 * U;
const DIVIDER = 2.8 * U;             // black gap between character panels
const RAIL = 7.6 * U;                // black rail between character lines
const PAD_X = 8;
const HEAD_H = 46;
const GLYPH_X = (PANEL_W - GLYPH_W * U) / 2;
const GLYPH_Y = 1.8 * U;
const RADIUS = 0.8 * U;              // rounding on curved corners
const ARC_STEPS = 5;                 // segments per rounded corner
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

// The camera angle of the close-up photo: where the board's corners land, as
// fractions of the image (top-left, top-right, bottom-right, bottom-left),
// and how much the photo foreshortens the board's height. Measured by fitting
// a homography to the character panels in the photo.
const ANGLED = {
  corners: [[0, 0.0111], [0.6806, 0], [1, 0.9846], [0.0044, 1]],
  squash: 0.5373,
};

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

const f = n => +n.toFixed(2);

/**
 * A view of a w x h board: either flat, or the photo's camera angle as a
 * projective map from the board rectangle onto a quadrilateral. Straight lines
 * stay straight, so everything is drawn as projected polygons and stays vector.
 */
function makeView(w, h, angled) {
  if (!angled) return { width: w, height: h, p: (x, y) => [x, y] };
  const height = h * ANGLED.squash;
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = ANGLED.corners.map(([cx, cy]) => [cx * w, cy * height]);
  // Unit square to quad (Heckbert).
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
  const p = (x, y) => {
    const u = x / w, v = y / h, q = g * u + hh * v + 1;
    return [(a * u + b * v + x0) / q, (d * u + e * v + y0) / q];
  };
  return { width: w, height, p };
}

// One closed polygon as path data, wound clockwise on screen so overlapping
// shapes fill rather than cancel.
function ring(pts) {
  const area = pts.reduce((s, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    return s + (x * ny - nx * y);
  }, 0);
  const ordered = area < 0 ? [...pts].reverse() : pts;
  return `M${ordered.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
}

const project = (view, pts, ox = 0, oy = 0, k = 1) =>
  pts.map(([x, y]) => view.p(x + ox, y + oy)).map(([x, y]) => [x * k, y * k]);

function rectPts(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

// A rectangle with some corners rounded, as points (arcs flattened finely).
function roundedRectPts(x0, y0, x1, y1, [tl, tr, br, bl]) {
  const pts = [];
  const arc = (cx, cy, r, start) => {
    for (let i = 0; i <= ARC_STEPS; i++) {
      const t = start + (i / ARC_STEPS) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  };
  if (tl) arc(x0 + tl, y0 + tl, tl, Math.PI); else pts.push([x0, y0]);
  if (tr) arc(x1 - tr, y0 + tr, tr, -Math.PI / 2); else pts.push([x1, y0]);
  if (br) arc(x1 - br, y1 - br, br, 0); else pts.push([x1, y1]);
  if (bl) arc(x0 + bl, y1 - bl, bl, Math.PI / 2); else pts.push([x0, y1]);
  return pts;
}

const CORNERS = ['TL', 'TR', 'BR', 'BL'];
const glyphCache = new Map();

/** The lit tiles of a glyph as polygons in board units, origin at its top left. */
function glyphPolys(ch) {
  if (glyphCache.has(ch)) return glyphCache.get(ch);
  const { rows, round = {}, polys = [] } = GLYPHS[ch];
  const lit = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < 5 && rows[r][c] !== '.';
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 5; c++) {
      const code = rows[r][c];
      if (code === '.') continue;
      const x0 = COL_X[c] * U, x1 = COL_X[c + 1] * U;
      const y0 = r * ROW, y1 = (r + 1) * ROW;
      if (code === 'd') { out.push([[x1, y0], [x1, y1], [x0, y1]]); continue; }
      if (code === 'a') { out.push([[x0, y0], [x1, y0], [x0, y1]]); continue; }
      const free = [
        !lit(r - 1, c) && !lit(r, c - 1), !lit(r - 1, c) && !lit(r, c + 1),
        !lit(r + 1, c) && !lit(r, c + 1), !lit(r + 1, c) && !lit(r, c - 1),
      ];
      const explicit = round[`${r},${c}`] || '';
      const max = Math.min(y1 - y0, x1 - x0) / 2;
      out.push(roundedRectPts(x0, y0, x1, y1, CORNERS.map((key, i) =>
        ((code === 'o' && free[i]) || explicit.includes(key) ? Math.min(RADIUS, max) : 0))));
    }
  }
  for (const poly of polys) out.push(poly.map(([x, y]) => [x * U, y * ROW]));
  glyphCache.set(ch, out);
  return out;
}

// Tile seam lines of one glyph box, as segments in board units.
const SEAM_SEGMENTS = [
  ...COL_X.slice(1, -1).map(x => [[x * U, 0], [x * U, ROWS * ROW]]),
  ...Array.from({ length: ROWS - 1 }, (_, r) => [[0, (r + 1) * ROW], [GLYPH_W * U, (r + 1) * ROW]]),
];

function gradient(defs, id, stops, attrs = { x1: 0, y1: 0, x2: 0, y2: 1 }, type = 'linearGradient') {
  const g = el(type, { id, ...attrs }, defs);
  for (const [offset, color] of stops) el('stop', { offset, style: `stop-color: ${color}` }, g);
}

// The characters placed by a layout, as [char, x, y, line] in board units.
function placements({ cols, lines }) {
  const out = [];
  lines.forEach((runs, l) => {
    for (const [col, text] of runs) {
      [...text].forEach((ch, i) => {
        if (ch !== ' ' && GLYPHS[ch] && col + i < cols) out.push([ch, colX(col + i) + GLYPH_X, lineY(l) + GLYPH_Y, l]);
      });
    }
  });
  return out;
}

/** Path data for a set of placed glyphs, projected and scaled by k. */
function glyphsPath(view, placed, k = 1) {
  return placed.map(([ch, x, y]) => glyphPolys(ch).map(poly => ring(project(view, poly, x, y, k))).join('')).join('');
}

/**
 * Draws the board as two stacked SVGs: the board itself, and an overlay with
 * the tile seams and room lighting. The HDR layer, when on, sits between them
 * so the seams still cross the brighter letters. `lines` is a list of text runs
 * per line, each [column, text]; `labels` are captions [column, text, align].
 */
function drawBoard(layout, angled) {
  const { cols, lines, labels, labelSize } = layout;
  const w = boardWidth(cols);
  const h = lineY(lines.length) + RAIL;
  const view = makeView(w, h, angled);
  const viewBox = `0 0 ${f(view.width)} ${f(view.height)}`;
  const quad = (x0, y0, x1, y1) => ring(project(view, rectPts(x0, y0, x1, y1)));
  const placed = placements(layout);

  const base = el('svg', { viewBox, role: 'img', 'aria-labelledby': 'board-title' });
  el('title', { id: 'board-title' }, base).textContent = 'Departures from Central';
  const defs = el('defs', {}, base);
  gradient(defs, 'panel', [
    ['0', 'var(--panel-shadow)'], ['0.08', 'var(--panel-top)'], ['0.55', 'var(--panel-mid)'], ['1', 'var(--panel-bottom)'],
  ]);
  gradient(defs, 'lit', [['0', 'var(--lit-top)'], ['1', 'var(--lit-bottom)']]);
  gradient(defs, 'rail', [['0', 'var(--rail-top)'], ['0.12', 'var(--rail)'], ['1', 'var(--rail-bottom)']]);

  el('path', { d: quad(0, 0, w, h), class: 'frame' }, base);
  for (const [col, text, align] of labels) {
    // Captions follow the board's local slant at their anchor point.
    const x = align === 'end' ? colX(col) + PANEL_W : colX(col);
    const y = HEAD_H - 14;
    const [px, py] = view.p(x, y), [ax, ay] = view.p(x + 1, y), [bx, by] = view.p(x, y + 1);
    el('text', {
      'text-anchor': align, class: 'label', style: `font-size: ${labelSize}px`,
      transform: `matrix(${f(ax - px)} ${f(ay - py)} ${f(bx - px)} ${f(by - py)} ${f(px)} ${f(py)})`,
    }, base).textContent = text;
  }
  for (let l = 0; l <= lines.length; l++) {
    el('path', { d: quad(0, lineY(l) - RAIL, w, lineY(l)), fill: 'url(#rail)' }, base);
  }
  for (let l = 0; l < lines.length; l++) {
    for (let c = 0; c < cols; c++) {
      el('path', { d: quad(colX(c), lineY(l), colX(c) + PANEL_W, lineY(l) + PANEL_H), fill: 'url(#panel)' }, base);
    }
  }
  const byLine = lines.map((_, l) => placed.filter(p => p[3] === l));
  byLine.forEach(row => {
    if (row.length) el('path', { d: glyphsPath(view, row), fill: 'url(#lit)' }, base);
  });

  const overlay = el('svg', { viewBox, class: 'overlay', 'aria-hidden': 'true' });
  const odefs = el('defs', {}, overlay);
  gradient(odefs, 'falloff', [['0', 'rgba(0,0,0,0)'], ['0.75', 'rgba(0,0,0,0.06)'], ['1', 'rgba(0,0,0,0.22)']],
    { cx: 0.5, cy: 0.4, r: 0.8 }, 'radialGradient');
  byLine.forEach((row, l) => {
    if (!row.length) return;
    const clip = el('clipPath', { id: `lit-${l}` }, odefs);
    el('path', { d: glyphsPath(view, row) }, clip);
    const d = row.map(([, x, y]) => SEAM_SEGMENTS.map(([a, b]) => {
      const [[ax, ay], [bx, by]] = project(view, [a, b], x, y);
      return `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}`;
    }).join('')).join('');
    el('path', { d, class: 'seam', 'clip-path': `url(#lit-${l})` }, overlay);
  });
  el('path', { d: quad(0, 0, w, h), fill: 'url(#falloff)' }, overlay);

  return { base, overlay, view, placed };
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

// Tile seams are faint from across a concourse and clear up close, so their
// strength follows the on-screen size of a tile row, pinch zoom included.
function updateSeams(container, drawn) {
  if (!drawn) return;
  const scale = drawn.base.getBoundingClientRect().width / drawn.view.width;
  const zoom = window.visualViewport ? window.visualViewport.scale : 1;
  const rowPx = ROW * scale * zoom;
  const t = Math.min(1, Math.max(0, (rowPx - 5) / 25));
  container.style.setProperty('--seam-alpha', (0.12 + 0.55 * t).toFixed(3));
}

/**
 * The lit tiles as a CSS clip path in pixels. A path clip is redrawn as
 * vectors at any zoom (a CSS mask image is not), so the HDR letters stay as
 * crisp as the board beneath them.
 */
function hdrClip({ view, placed }, pxWidth) {
  return `path('${glyphsPath(view, placed, pxWidth / view.width)}')`;
}

const VIEW_KEY = 'departures-view';

function angledPreference() {
  try { return localStorage.getItem(VIEW_KEY) !== 'flat'; } catch { return true; }
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

export function mount(container, live, hdrToggle, viewToggle) {
  const host = document.createElement('div');
  host.className = 'board-host';
  const overlayHost = document.createElement('div');
  overlayHost.className = 'overlay-host';
  container.replaceChildren(host);
  const setClip = hdrLayer(container, hdrToggle);
  container.appendChild(overlayHost);

  let angled = angledPreference();
  let drawn = null;
  let last = '';
  const clipToBoard = () => {
    if (drawn) setClip(hdrClip(drawn, drawn.base.getBoundingClientRect().width));
  };
  const update = () => {
    const width = container.clientWidth || window.innerWidth;
    const wide = width / WIDE_COLS >= NARROW_PITCH / 2;
    const cols = wide ? WIDE_COLS : Math.max(MIN_COLS, Math.floor(width / NARROW_PITCH));
    const list = upcoming(sydneyNow().minutes, wide ? WIDE_TRAINS : NARROW_TRAINS);
    const key = `${angled}|${cols}|${list.map(t => t.time + t.dest).join('|')}`;
    if (key === last) return;
    last = key;
    const layout = wide ? wideLayout(list) : narrowLayout(list, cols);
    drawn = drawBoard(layout, angled);
    host.replaceChildren(drawn.base);
    overlayHost.replaceChildren(drawn.overlay);
    clipToBoard();
    updateSeams(container, drawn);
    if (live) live.textContent = describe(list);
  };
  const syncViewToggle = () => {
    if (!viewToggle) return;
    viewToggle.textContent = angled ? 'View: angled' : 'View: flat';
    viewToggle.setAttribute('aria-pressed', String(angled));
  };
  viewToggle?.addEventListener('click', () => {
    angled = !angled;
    try { localStorage.setItem(VIEW_KEY, angled ? 'angled' : 'flat'); } catch { /* storage unavailable */ }
    syncViewToggle();
    update();
  });
  syncViewToggle();
  update();
  setInterval(update, 5000);
  let pending;
  window.addEventListener('resize', () => {
    clearTimeout(pending);
    pending = setTimeout(() => { update(); clipToBoard(); updateSeams(container, drawn); }, 150);
  });
  window.visualViewport?.addEventListener('resize', () => updateSeams(container, drawn));
}
