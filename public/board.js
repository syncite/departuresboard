import { GLYPHS, COL_X, GLYPH_W, ROWS } from './glyphs.js';
import { sydneyNow, upcoming, hhmm } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Character grid: every train takes two lines, as on the SNCB boards.
const FIELDS = {
  time: { start: 0, len: 5 },
  dest: { start: 6, len: 24 },
  line: { start: 31, len: 3 },
  plat: { start: 35, len: 2 },
};
const COLS = 37;
const TRAINS = 7;
const LINES = TRAINS * 2;

// Geometry, in SVG user units, measured from a head-on photo of the board at
// Brussel-Zuid. U is one glyph-grid unit (a narrow tile column is 1 U wide).
const U = 2.6;
const ROW = 1.65 * U;                // one tile row
const PANEL_W = 8.9 * U;
const PANEL_H = 18.4 * U;
const DIVIDER = 2.55 * U;            // black gap between character panels
const RAIL = 7.6 * U;                // black rail between character lines
const PAD_X = 8;
const HEAD_H = 46;
const GLYPH_X = (PANEL_W - GLYPH_W * U) / 2;
const GLYPH_Y = 1.8 * U;
const RADIUS = 0.6 * U;              // rounding on curved corners

const colX = c => PAD_X + c * (PANEL_W + DIVIDER);
const lineY = l => HEAD_H + RAIL + l * (PANEL_H + RAIL);
const WIDTH = colX(COLS - 1) + PANEL_W + PAD_X;
const HEIGHT = lineY(LINES) + RAIL;

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

function glyphPath({ rows, round = {}, polys = [] }) {
  const lit = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < 5 && rows[r][c] !== '.';
  let d = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 5; c++) {
      const code = rows[r][c];
      if (code === '.') continue;
      const x0 = COL_X[c] * U, x1 = COL_X[c + 1] * U;
      const y0 = r * ROW, y1 = (r + 1) * ROW;
      if (code === 'd') { d += polygon([[x1, y0], [x1, y1], [x0, y1]]); continue; }
      if (code === 'a') { d += polygon([[x0, y0], [x1, y0], [x0, y1]]); continue; }
      const free = [
        !lit(r - 1, c) && !lit(r, c - 1), !lit(r - 1, c) && !lit(r, c + 1),
        !lit(r + 1, c) && !lit(r, c + 1), !lit(r + 1, c) && !lit(r, c - 1),
      ];
      const explicit = round[`${r},${c}`] || '';
      const max = Math.min(y1 - y0, x1 - x0) / 2;
      d += roundedRect(x0, y0, x1, y1, CORNERS.map((k, i) =>
        ((code === 'o' && free[i]) || explicit.includes(k) ? Math.min(RADIUS, max) : 0)));
    }
  }
  for (const poly of polys) d += polygon(poly.map(([x, y]) => [x * U, y * ROW]));
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

function buildFrame(svg) {
  const defs = el('defs', {}, svg);
  // Panels are lit from inside but sit in the shadow of the rail above them.
  gradient(defs, 'panel', [
    ['0', 'var(--panel-shadow)'], ['0.09', 'var(--panel-top)'], ['0.55', 'var(--panel-mid)'], ['1', 'var(--panel-bottom)'],
  ]);
  gradient(defs, 'lit', [['0', 'var(--lit-top)'], ['1', 'var(--lit-bottom)']]);
  gradient(defs, 'rail', [['0', 'var(--rail-top)'], ['0.12', 'var(--rail)'], ['1', 'var(--rail-bottom)']]);
  gradient(defs, 'falloff', [['0', 'rgba(0,0,0,0)'], ['0.7', 'rgba(0,0,0,0.08)'], ['1', 'rgba(0,0,0,0.28)']],
    { cx: 0.5, cy: 0.35, r: 0.8 }, 'radialGradient');
  gradient(defs, 'sheen', [['0', 'rgba(255,240,200,0.07)'], ['0.45', 'rgba(255,240,200,0)']],
    { x1: 0, y1: 0, x2: 0.6, y2: 1 });

  for (const [ch, def] of Object.entries(GLYPHS)) {
    const d = glyphPath(def);
    const clip = el('clipPath', { id: `c-${glyphId(ch)}` }, defs);
    el('path', { d }, clip);
    const g = el('g', { id: glyphId(ch) }, defs);
    el('path', { d, fill: 'url(#lit)' }, g);
    el('path', { d: SEAMS, class: 'seam', 'clip-path': `url(#c-${glyphId(ch)})` }, g);
  }

  el('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'frame' }, svg);

  const label = (text, x, anchor) => {
    el('text', { x, y: HEAD_H - 14, 'text-anchor': anchor, class: 'label' }, svg).textContent = text;
  };
  label('TIME', colX(FIELDS.time.start), 'start');
  label('DESTINATION', colX(FIELDS.dest.start), 'start');
  label('LINE', colX(FIELDS.line.start), 'start');
  label('PLAT', colX(FIELDS.plat.start + FIELDS.plat.len - 1) + PANEL_W, 'end');

  const back = el('g', {}, svg);
  for (let l = 0; l < LINES; l++) {
    el('rect', { x: 0, y: lineY(l) - RAIL, width: WIDTH, height: RAIL, fill: 'url(#rail)' }, back);
    for (let c = 0; c < COLS; c++) {
      el('rect', { x: colX(c), y: lineY(l), width: PANEL_W, height: PANEL_H, fill: 'url(#panel)' }, back);
    }
  }
  el('rect', { x: 0, y: lineY(LINES) - RAIL, width: WIDTH, height: RAIL, fill: 'url(#rail)' }, back);

  const layer = el('g', {}, svg);
  // Broad room lighting: a soft sheen from the upper left and falloff at the edges.
  el('rect', { x: 0, y: HEAD_H, width: WIDTH, height: HEIGHT - HEAD_H, fill: 'url(#sheen)', 'pointer-events': 'none' }, svg);
  el('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: 'url(#falloff)', 'pointer-events': 'none' }, svg);
  return layer;
}

function put(layer, line, col, text) {
  [...text].forEach((ch, i) => {
    if (ch === ' ' || !GLYPHS[ch] || col + i >= COLS) return;
    el('use', {
      href: `#${glyphId(ch)}`,
      x: f(colX(col + i) + GLYPH_X),
      y: f(lineY(line) + GLYPH_Y),
    }, layer);
  });
}

const fit = (text, len) => text.slice(0, len);
const right = (text, len) => fit(text, len).padStart(len, ' ');

function render(layer, list) {
  layer.replaceChildren();
  list.forEach((t, i) => {
    const top = i * 2;
    put(layer, top, FIELDS.time.start, hhmm(t.time));
    put(layer, top, FIELDS.dest.start, fit(t.dest, FIELDS.dest.len));
    put(layer, top, FIELDS.line.start, fit(t.line, FIELDS.line.len));
    put(layer, top, FIELDS.plat.start, right(t.plat, FIELDS.plat.len));
    // Remarks sit on the second line, under the destination.
    put(layer, top + 1, FIELDS.dest.start, fit(t.via, FIELDS.dest.len));
  });
}

function describe(list) {
  return list.map(t => `${hhmm(t.time)} ${t.line} to ${t.dest}, ${t.via.replace('·', 'and')}, platform ${t.plat}`).join('. ');
}

export function mount(container, live) {
  const svg = el('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`, role: 'img', 'aria-labelledby': 'board-title',
    preserveAspectRatio: 'xMidYMin meet',
  });
  el('title', { id: 'board-title' }, svg).textContent = 'Departures from Central';
  container.appendChild(svg);
  const layer = buildFrame(svg);

  let last = '';
  const tick = () => {
    const list = upcoming(sydneyNow().minutes, TRAINS);
    const key = list.map(t => t.time + t.dest).join('|');
    if (key !== last) {
      last = key;
      render(layer, list);
      if (live) live.textContent = describe(list);
    }
  };
  tick();
  setInterval(tick, 5000);
}
