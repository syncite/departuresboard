import { GLYPHS, QUARTERS, COL_W, ROW_H, ROWS } from './glyphs.js';
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

// Geometry, in SVG user units. Each character has its own panel, separated
// from its neighbours by a thick black divider.
const U = 2.65;                      // one glyph column unit
const PANEL_W = 24;
const PANEL_H = 38;
const DIVIDER = 3.5;
const RAIL = 10;                     // black rail between character lines
const PAD_X = 8;
const HEAD_H = 46;
const GLYPH_X = (PANEL_W - 8 * U) / 2;
const GLYPH_Y = 2;
const GAP = 0.02;                    // tiles are seamless at viewing distance
const RADIUS = 0.6 * U;              // rounding on a glyph's outer corners

const colX = c => PAD_X + c * (PANEL_W + DIVIDER);
const lineY = l => HEAD_H + RAIL + l * (PANEL_H + RAIL);
const WIDTH = colX(COLS - 1) + PANEL_W + PAD_X;
const HEIGHT = lineY(LINES);

const COL_X = COL_W.reduce((xs, w, i) => [...xs, xs[i] + w * U], [0]);
const ROW_PX = ROW_H * U;

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

// Quarters in clockwise order; quarter i runs from corner i to corner i + 1
// (corners: top-left, top-right, bottom-right, bottom-left). Each run of lit
// quarters becomes one polygon fanned from the tile centre.
const ORDER = [QUARTERS.T, QUARTERS.R, QUARTERS.B, QUARTERS.L];

function partialTile(mask, x0, y0, x1, y1) {
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const centre = [(x0 + x1) / 2, (y0 + y1) / 2];
  const lit = ORDER.map(q => (mask & q) !== 0);
  let d = '';
  for (let s = 0; s < 4; s++) {
    if (!lit[s] || lit[(s + 3) % 4]) continue;
    const pts = [centre, corners[s]];
    for (let k = s; lit[k % 4]; k++) pts.push(corners[(k + 1) % 4]);
    d += `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
  }
  return d;
}

function glyphPath(grid) {
  const at = (r, c) => (r >= 0 && r < ROWS && c >= 0 && c < 5 ? grid[r][c] : 0);
  let d = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < 5; c++) {
      const mask = grid[r][c];
      if (!mask) continue;
      const x0 = COL_X[c] + GAP, x1 = COL_X[c + 1] - GAP;
      const y0 = r * ROW_PX + GAP, y1 = (r + 1) * ROW_PX - GAP;
      if (mask === 15) {
        const up = at(r - 1, c), down = at(r + 1, c), left = at(r, c - 1), right = at(r, c + 1);
        const max = Math.min(y1 - y0, x1 - x0) / 2;
        d += roundedRect(x0, y0, x1, y1, [
          !up && !left, !up && !right, !down && !right, !down && !left,
        ].map(round => (round ? Math.min(RADIUS, max) : 0)));
      } else {
        d += partialTile(mask, x0, y0, x1, y1);
      }
    }
  }
  return d;
}

const glyphId = ch => `g-${ch.codePointAt(0).toString(16)}`;

function buildFrame(svg) {
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'panel', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', style: 'stop-color: var(--panel-top)' }, grad);
  el('stop', { offset: '1', style: 'stop-color: var(--panel-bottom)' }, grad);
  const bloom = el('filter', { id: 'bloom', x: '-2%', y: '-10%', width: '104%', height: '120%' }, defs);
  el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0.9', result: 'b' }, bloom);
  const soften = el('feComponentTransfer', { in: 'b', result: 'soft' }, bloom);
  el('feFuncA', { type: 'linear', slope: '0.7' }, soften);
  const merge = el('feMerge', {}, bloom);
  el('feMergeNode', { in: 'soft' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);
  for (const [ch, grid] of Object.entries(GLYPHS)) {
    el('path', { id: glyphId(ch), d: glyphPath(grid), class: 'lit' }, defs);
  }

  el('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'frame' }, svg);

  const label = (text, x, anchor) => {
    el('text', { x, y: HEAD_H - 12, 'text-anchor': anchor, class: 'label' }, svg).textContent = text;
  };
  label('TIME', colX(FIELDS.time.start), 'start');
  label('DESTINATION', colX(FIELDS.dest.start), 'start');
  label('LINE', colX(FIELDS.line.start), 'start');
  label('PLAT', colX(FIELDS.plat.start + FIELDS.plat.len - 1) + PANEL_W, 'end');

  const panels = el('g', {}, svg);
  for (let l = 0; l < LINES; l++) {
    for (let c = 0; c < COLS; c++) {
      el('rect', { x: colX(c), y: lineY(l), width: PANEL_W, height: PANEL_H, fill: 'url(#panel)' }, panels);
    }
  }
  return el('g', { filter: 'url(#bloom)' }, svg);
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
