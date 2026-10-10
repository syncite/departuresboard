import { GLYPHS, COL_X, GLYPH_W, ROWS } from './glyphs.js';
import { sydneyNow, upcoming, hhmm, remarkPages, wrap } from './data.js';

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

// Character pitch on screen, in CSS pixels. Wide screens show a board up to
// MAX_COLS wide; narrower ones get a reflowed board with wrapped text.
const WIDE_PITCH = 44;
const NARROW_PITCH = 38;
const MIN_WIDE_COLS = 22;
const MAX_COLS = 37;
const MIN_COLS = 8;
const WIDE_LINES = 14;
const NARROW_LINES = 22;

// Every PAGE_MS the remarks lines flip to the next page of stops.
const PAGE_MS = 5000;
// One character's flip, and the wave that ripples across the board.
const FLIP_MS = 620;
const STAGGER_COL_MS = 24;
const STAGGER_LINE_MS = 16;

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

// Keeps the part of a polygon above (or below) the line y = ym.
function clipY(poly, ym, above) {
  const inside = ([, y]) => (above ? y <= ym : y >= ym);
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    if (inside(p)) out.push(p);
    if (inside(p) !== inside(q)) {
      const t = (ym - p[1]) / (q[1] - p[1]);
      out.push([p[0] + t * (q[0] - p[0]), ym]);
    }
  });
  return out.length >= 3 ? out : null;
}

/** A board's text as a grid: `cells[line][col]` is a character or ' '. */
function toGrid({ cols, lines }) {
  return lines.map(runs => {
    const row = Array(cols).fill(' ');
    for (const [col, text] of runs) {
      [...text].forEach((ch, i) => { if (col + i < cols && GLYPHS[ch]) row[col + i] = ch; });
    }
    return row;
  });
}

const cellKey = (l, c) => `${l},${c}`;

/**
 * Draws the board as two stacked SVGs: the board itself, and an overlay with
 * the tile seams and grain. The HDR layer, when on, sits between them so the
 * seams still cross the brighter letters. Cells in `skip` are left blank for
 * the flip animation to draw.
 */
function drawBoard(layout, grid, angled, skip = new Set()) {
  const { cols, labels, labelSize } = layout;
  const lines = grid.length;
  const w = boardWidth(cols);
  const h = lineY(lines) + RAIL;
  const view = makeView(w, h, angled);
  const viewBox = `0 0 ${f(view.width)} ${f(view.height)}`;
  const quad = (x0, y0, x1, y1) => ring(project(view, rectPts(x0, y0, x1, y1)));
  const placed = [];
  grid.forEach((row, l) => row.forEach((ch, c) => {
    if (ch !== ' ' && !skip.has(cellKey(l, c))) placed.push([ch, colX(c) + GLYPH_X, lineY(l) + GLYPH_Y, l]);
  }));

  const base = el('svg', { viewBox, role: 'img', 'aria-labelledby': 'board-title' });
  el('title', { id: 'board-title' }, base).textContent = 'Departures from Central';
  const defs = el('defs', {}, base);
  gradient(defs, 'panel', [
    ['0', 'var(--panel-shadow)'], ['0.08', 'var(--panel-top)'], ['0.55', 'var(--panel-mid)'], ['1', 'var(--panel-bottom)'],
  ]);
  gradient(defs, 'lit', [['0', 'var(--lit-top)'], ['1', 'var(--lit-bottom)']]);
  gradient(defs, 'rail', [['0', 'var(--rail-top)'], ['0.12', 'var(--rail)'], ['1', 'var(--rail-bottom)']]);
  gradient(defs, 'flap-top', [['0', 'var(--panel-top)'], ['1', 'var(--panel-mid)']]);
  gradient(defs, 'flap-bottom', [['0', 'var(--panel-mid)'], ['1', 'var(--panel-bottom)']]);
  // Camera exposure measured in the close-up photo: the board darkens about
  // 30% towards the bottom of the frame and a little to the left, while the
  // lit tiles stay at full brightness.
  gradient(defs, 'exposure-v', [['0', 'rgba(0,0,0,0)'], ['0.6', 'rgba(0,0,0,0.12)'], ['1', 'rgba(0,0,0,0.36)']]);
  gradient(defs, 'exposure-h', [['0', 'rgba(0,0,0,0.08)'], ['1', 'rgba(0,0,0,0)']], { x1: 0, y1: 0, x2: 1, y2: 0 });

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
  for (let l = 0; l <= lines; l++) {
    el('path', { d: quad(0, lineY(l) - RAIL, w, lineY(l)), fill: 'url(#rail)' }, base);
  }
  for (let l = 0; l < lines; l++) {
    for (let c = 0; c < cols; c++) {
      const d = quad(colX(c), lineY(l), colX(c) + PANEL_W, lineY(l) + PANEL_H);
      el('path', { d, fill: 'url(#panel)' }, base);
      // The phone camera's sharpening leaves a dark undershoot around each panel.
      if (angled) el('path', { d, class: 'undershoot' }, base);
    }
  }
  const byLine = grid.map((_, l) => placed.filter(p => p[3] === l));
  byLine.forEach(row => {
    if (row.length) el('path', { d: glyphsPath(view, row), fill: 'url(#lit)' }, base);
  });
  const anim = el('g', { class: 'flips' }, base);
  if (angled) {
    el('path', { d: quad(0, 0, w, h), fill: 'url(#exposure-v)', 'pointer-events': 'none' }, base);
    el('path', { d: quad(0, 0, w, h), fill: 'url(#exposure-h)', 'pointer-events': 'none' }, base);
  }

  const overlay = el('svg', { viewBox, class: 'overlay', 'aria-hidden': 'true' });
  const odefs = el('defs', {}, overlay);
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

  return { base, overlay, anim, view, placed, cols, lines };
}

/** Path data for a set of placed glyphs, projected and scaled by k. */
function glyphsPath(view, placed, k = 1) {
  return placed.map(([ch, x, y]) => glyphPolys(ch).map(poly => ring(project(view, poly, x, y, k))).join('')).join('');
}

/**
 * The flap's angle over a flip, 0 (flat, showing the old top half) to PI
 * (flat, showing the new bottom half). The top flap is released and falls
 * under gravity, then slaps down and bounces once before settling.
 */
function flapAngle(t) {
  const FALL = 0.7;
  if (t < FALL) return Math.PI * (t / FALL) ** 2;
  const u = (t - FALL) / (1 - FALL);
  return Math.PI - 0.15 * Math.PI * Math.sin(Math.PI * u) * (1 - u) ** 1.4;
}

/**
 * Draws one frame of the flipping cells into `drawn.anim`. Each cell shows
 * the new top half and old bottom half behind a flap hinged at its middle.
 * The flap's shape is computed in board space (folded towards the viewer,
 * with a touch of perspective on its free edge) and then projected like the
 * rest of the board, so it stays vector and follows the camera angle.
 */
function drawFlips(drawn, flips, now) {
  const { view, anim } = drawn;
  anim.replaceChildren();
  let running = false;
  const halves = [];
  for (const fl of flips) {
    const t = (now - fl.start) / FLIP_MS;
    const x0 = colX(fl.c), x1 = x0 + PANEL_W, y0 = lineY(fl.l), y1 = y0 + PANEL_H;
    const ym = (y0 + y1) / 2, cx = (x0 + x1) / 2;
    const gx = x0 + GLYPH_X, gy = y0 + GLYPH_Y;
    const glyphHalf = (ch, above, map) => (ch === ' ' ? [] : glyphPolys(ch)
      .map(poly => clipY(poly.map(([x, y]) => [x + gx, y + gy]), ym, above))
      .filter(Boolean)
      .map(poly => ring(project(view, poly.map(([x, y]) => map(x, y))))));
    const same = (x, y) => [x, y];

    if (t >= 1 || t < 0) {
      if (t < 1) running = true;
      const ch = t >= 1 ? fl.to : fl.from;
      halves.push(...glyphHalf(ch, true, same), ...glyphHalf(ch, false, same));
      continue;
    }
    running = true;
    const theta = flapAngle(t);
    halves.push(...glyphHalf(fl.to, true, same), ...glyphHalf(fl.from, false, same));

    const g = el('g', {}, anim);
    const upper = theta < Math.PI / 2;
    const fold = upper ? Math.cos(theta) : -Math.cos(theta);   // 1 flat ... 0 edge-on
    const lift = Math.sin(theta);                               // how far it leans out
    const map = (x, y) => [cx + (x - cx) * (1 + 0.1 * lift * Math.abs(y - ym) / (PANEL_H / 2)),
      ym + (y - ym) * fold];
    // The flap's shadow on the half it is about to cover.
    const shadeHalf = upper ? [x0, ym, x1, y1] : [x0, y0, x1, ym];
    el('path', {
      d: ring(project(view, rectPts(...shadeHalf))), fill: '#000', 'fill-opacity': f(0.28 * lift),
    }, g);
    const flapRect = upper ? rectPts(x0, y0, x1, ym) : rectPts(x0, ym, x1, y1);
    const flapD = ring(project(view, flapRect.map(([x, y]) => map(x, y))));
    el('path', { d: flapD, fill: upper ? 'url(#flap-top)' : 'url(#flap-bottom)' }, g);
    const lit = upper ? glyphHalf(fl.from, true, map) : glyphHalf(fl.to, false, map);
    if (lit.length) el('path', { d: lit.join(''), fill: 'url(#lit)' }, g);
    // Turning away from the light darkens the flap; a glint runs along it as it lands.
    el('path', { d: flapD, fill: '#000', 'fill-opacity': f((upper ? 0.55 : 0.4) * lift) }, g);
    if (!upper) el('path', { d: flapD, fill: '#fff4d0', 'fill-opacity': f(0.14 * lift * fold) }, g);
    // The split between the flaps, visible only while it moves.
    const [[hx0, hy0], [hx1, hy1]] = project(view, [[x0, ym], [x1, ym]]);
    el('path', { d: `M${f(hx0)} ${f(hy0)}L${f(hx1)} ${f(hy1)}`, class: 'hinge', 'stroke-opacity': f(0.4 + 0.5 * lift) }, g);
  }
  if (halves.length) anim.prepend(el('path', { d: halves.join(''), fill: 'url(#lit)' }));
  return running;
}

/** Full-width board: time, destination, line and platform, remarks below. */
function wideLayout(list, cols, page) {
  const lineCol = cols - 6, platCol = cols - 2;
  const destLen = lineCol - 7;
  const lines = [];
  for (const t of list) {
    const dest = wrap(t.dest, destLen);
    const pages = remarkPages(t, cols - 6, 1);
    const block = [
      [[0, hhmm(t.time)], [6, dest[0]], [lineCol, fit(t.line, 3)], [platCol, right(t.plat, 2)]],
      ...dest.slice(1).map(row => [[6, row]]),
      [[6, pages[page % pages.length][0]]],
    ];
    if (lines.length + block.length > WIDE_LINES) break;
    lines.push(...block);
  }
  while (lines.length < WIDE_LINES) lines.push([]);
  const labels = [[0, 'TIME', 'start'], [6, 'DESTINATION', 'start'], [lineCol, 'LINE', 'start'], [platCol + 1, 'PLAT', 'end']];
  return { cols, lines, labels, labelSize: 21 };
}

const fit = (text, len) => text.slice(0, len);
const right = (text, len) => fit(text, len).padStart(len, ' ');

/**
 * Narrow board: the time and line on the first row with the platform at the
 * right when it fits, then the destination and remarks wrapped beneath.
 */
function narrowLayout(list, cols, page) {
  const lineCol = 6;
  const platFits = cols >= lineCol + 3 + 1 + 2;
  const lines = [];
  for (const t of list) {
    const first = [[0, hhmm(t.time)], [lineCol, fit(t.line, cols - lineCol)]];
    if (platFits) first.push([cols - 2, right(t.plat, 2)]);
    const pages = remarkPages(t, cols, 2);
    const remarks = pages[page % pages.length];
    const block = [
      first,
      ...wrap(t.dest, cols).map(row => [[0, row]]),
      ...[0, 1].map(i => [[0, remarks[i] || '']]),
    ];
    if (!platFits) block.push([[0, `Plat ${t.plat}`]]);
    if (lines.length + block.length > NARROW_LINES) break;
    lines.push(...block);
  }
  while (lines.length < NARROW_LINES) lines.push([]);
  const labels = [[0, 'TIME', 'start'], [lineCol, 'LINE', 'start']];
  if (platFits) labels.push([cols - 1, 'PLAT', 'end']);
  return { cols, lines, labels, labelSize: 28 };
}

function describe(list) {
  return list.map(t => `${hhmm(t.time)} ${t.line} to ${t.dest}, ${t.via}, platform ${t.plat}`).join('. ');
}

// Tile seams are faint from across a concourse and clear up close, so their
// strength follows the on-screen size of a tile row, pinch zoom included.
function updateSeams(container, drawn) {
  if (!drawn) return;
  const scale = drawn.base.getBoundingClientRect().width / drawn.view.width;
  const zoom = window.visualViewport ? window.visualViewport.scale : 1;
  const t = Math.min(1, Math.max(0, (ROW * scale * zoom - 5) / 25));
  container.style.setProperty('--seam-alpha', (0.12 + 0.55 * t).toFixed(3));
}

/**
 * The lit tiles as a CSS clip path in pixels. A path clip is redrawn as
 * vectors at any zoom (a CSS mask image is not), so the HDR letters stay as
 * crisp as the board beneath them.
 */
function hdrClip({ view, placed }, pxWidth) {
  return `path('${glyphsPath(view, placed, pxWidth / view.width) || 'M0 0'}')`;
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
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let angled = angledPreference();
  let drawn = null;
  let shown = null;          // { layout, grid, shape } currently on the board
  let flips = [];
  let frame = 0;

  const render = (layout, grid, skip) => {
    drawn = drawBoard(layout, grid, angled, skip);
    host.replaceChildren(drawn.base);
    overlayHost.replaceChildren(drawn.overlay);
    container.classList.toggle('camera', angled);
    // Flipping cells drop out of the HDR layer and light up again as they land.
    setClip(hdrClip(drawn, drawn.base.getBoundingClientRect().width));
    updateSeams(container, drawn);
  };

  const animate = () => {
    if (drawFlips(drawn, flips, performance.now())) {
      frame = requestAnimationFrame(animate);
    } else {
      frame = 0;
      flips = [];
      render(shown.layout, shown.grid);
    }
  };

  const build = () => {
    const width = container.clientWidth || window.innerWidth;
    const wideCols = Math.min(MAX_COLS, Math.floor(width / WIDE_PITCH));
    const wide = wideCols >= MIN_WIDE_COLS;
    const cols = wide ? wideCols : Math.max(MIN_COLS, Math.floor(width / NARROW_PITCH));
    const page = Math.floor(Date.now() / PAGE_MS);
    const list = upcoming(sydneyNow().minutes, 8);
    const layout = wide ? wideLayout(list, cols, page) : narrowLayout(list, cols, page);
    return { layout, grid: toGrid(layout), shape: `${angled}|${wide}|${cols}`, list };
  };

  const update = ({ instant = false } = {}) => {
    const next = build();
    if (live) live.textContent = describe(next.list);
    const prev = shown;
    shown = next;
    if (frame) { cancelAnimationFrame(frame); frame = 0; flips = []; }
    if (!prev || prev.shape !== next.shape || instant || reduceMotion) {
      render(next.layout, next.grid);
      return;
    }
    const start = performance.now();
    const changed = [];
    next.grid.forEach((row, l) => row.forEach((ch, c) => {
      const from = prev.grid[l]?.[c] ?? ' ';
      if (from !== ch) {
        changed.push({ l, c, from, to: ch, start: start + c * STAGGER_COL_MS + l * STAGGER_LINE_MS + Math.random() * 30 });
      }
    }));
    if (!changed.length) return;
    flips = changed;
    render(next.layout, next.grid, new Set(changed.map(fl => cellKey(fl.l, fl.c))));
    frame = requestAnimationFrame(animate);
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
    update({ instant: true });
  });
  syncViewToggle();
  update();
  // Flip on each page boundary, aligned to the wall clock.
  const tick = () => {
    update();
    setTimeout(tick, PAGE_MS - (Date.now() % PAGE_MS) + 20);
  };
  setTimeout(tick, PAGE_MS - (Date.now() % PAGE_MS) + 20);
  let pending;
  window.addEventListener('resize', () => {
    clearTimeout(pending);
    pending = setTimeout(() => update({ instant: true }), 150);
  });
  window.visualViewport?.addEventListener('resize', () => updateSeams(container, drawn));
}
