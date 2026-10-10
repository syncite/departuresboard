import { GLYPHS, GLYPH_W, GLYPH_H } from './glyphs.js';
import { sydneyNow, upcoming, hhmm } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Character grid: every train takes two lines, as at Brussels-Central.
const FIELDS = {
  time: { start: 0, len: 5 },
  dest: { start: 6, len: 24 },
  line: { start: 31, len: 3 },
  plat: { start: 35, len: 2 },
};
const COLS = 37;
const TRAINS = 7;
const LINES = TRAINS * 2;

// Geometry, in SVG user units.
const CELL_W = 19;
const CELL_H = 32;
const CELL_GAP = 2;
const GROUP = 6;          // cells per module, separated by a heavier divider
const GROUP_GAP = 4;
const BAR_H = 9;          // black rail between character lines
const PAD_X = 10;
const HEAD_H = 44;
const GLYPH_SCALE = 22 / GLYPH_H;
const SLANT = -7;         // degrees of forward lean

const colX = c => PAD_X + c * (CELL_W + CELL_GAP) + Math.floor(c / GROUP) * GROUP_GAP;
const lineY = l => HEAD_H + BAR_H + l * (CELL_H + BAR_H);
const WIDTH = colX(COLS - 1) + CELL_W + PAD_X;
const HEIGHT = lineY(LINES) + 2;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function glyphDefs(defs) {
  for (const [ch, parts] of Object.entries(GLYPHS)) {
    const g = el('g', { id: glyphId(ch) }, defs);
    for (const part of parts) {
      if (Array.isArray(part)) {
        el('polyline', { points: part.map(p => p.join(',')).join(' '), class: 'seg' }, g);
      } else {
        el('polygon', { points: part.fill.map(p => p.join(',')).join(' '), class: 'seg-fill' }, g);
      }
    }
  }
}

const glyphId = ch => `g-${ch.codePointAt(0).toString(16)}`;

function buildFrame(svg) {
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'cell', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', style: 'stop-color: var(--cell-top)' }, grad);
  el('stop', { offset: '0.55', style: 'stop-color: var(--cell-mid)' }, grad);
  el('stop', { offset: '1', style: 'stop-color: var(--cell-bottom)' }, grad);
  const glow = el('filter', { id: 'glow', x: '-5%', y: '-20%', width: '110%', height: '140%' }, defs);
  el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0.8', result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);
  glyphDefs(defs);

  el('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'rail' }, svg);
  el('rect', { x: 0, y: 0, width: WIDTH, height: HEAD_H, class: 'head' }, svg);

  const label = (text, x, anchor) => {
    const t = el('text', { x, y: HEAD_H - 13, 'text-anchor': anchor, class: 'label' }, svg);
    t.textContent = text;
  };
  label('TIME', colX(FIELDS.time.start), 'start');
  label('DESTINATION', (colX(FIELDS.dest.start) + colX(FIELDS.dest.start + FIELDS.dest.len)) / 2, 'middle');
  label('LINE', colX(FIELDS.line.start), 'start');
  label('PLAT', colX(FIELDS.plat.start + FIELDS.plat.len - 1) + CELL_W, 'end');

  const cells = el('g', { class: 'cells' }, svg);
  for (let l = 0; l < LINES; l++) {
    for (let c = 0; c < COLS; c++) {
      el('rect', { x: colX(c), y: lineY(l), width: CELL_W, height: CELL_H, fill: 'url(#cell)' }, cells);
    }
    el('rect', { x: 0, y: lineY(l) - BAR_H, width: WIDTH, height: 1.2, class: 'rail-edge' }, cells);
  }
  return el('g', { class: 'glyphs', filter: 'url(#glow)' }, svg);
}

function put(layer, line, col, text) {
  [...text].forEach((ch, i) => {
    if (ch === ' ' || !GLYPHS[ch]) return;
    const c = col + i;
    if (c >= COLS) return;
    const x = colX(c) + (CELL_W - GLYPH_W * GLYPH_SCALE) / 2 + 1.5;
    const y = lineY(line) + (CELL_H - GLYPH_H * GLYPH_SCALE) / 2;
    el('use', {
      href: `#${glyphId(ch)}`,
      transform: `translate(${x.toFixed(2)} ${(y + GLYPH_H * GLYPH_SCALE).toFixed(2)}) skewX(${SLANT}) scale(${GLYPH_SCALE.toFixed(4)}) translate(0 ${-GLYPH_H})`,
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
    // The second line sits right-aligned under the destination, like the
    // Dutch/French translation line on the Brussels board.
    put(layer, top + 1, FIELDS.dest.start, right(t.via, FIELDS.dest.len));
  });
}

function describe(list) {
  return list.map(t => `${hhmm(t.time)} ${t.line} to ${t.dest.toLowerCase()}, ${t.via.toLowerCase().replace('◆', 'and')}, platform ${t.plat}`).join('. ');
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
