// @vitest-environment jsdom
/*
    AudioAnalyzerBeatPane.test.js - the Beat debug pane

    The analyzer draws four debug panes when debug is on. The 4th one is a
    scrolling plot of the beat detector: one column per drawn frame carrying that
    frame's flux as a bar, its threshold as a 1 px mark, detected beats as a full
    height white column, and the current tempo as text.

    jsdom has no canvas implementation, so getContext is stubbed with a recorder
    and the tests assert what was drawn (bars, marks, colours, cursor) rather
    than pixels, which is the behaviour the pane exists for.

    Copyright © 2021 Anthony Stellato
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AudioAnalyzer } from '../../scripts/audio/AudioAnalyzer.js';

const FFT_SIZE = 512;
const BINS = FFT_SIZE / 2;
const DT = 1 / 60;
const PANE_W = 250;
const PANE_H = 100;

// ---------------------------------------------------------------------------
// Recording 2D context: every drawing call is kept in order, tagged with the
// style in force at the time, so a single frame's output can be sliced out.
// ---------------------------------------------------------------------------

function makeRecorder() {
  const recorder = {
    calls: [],
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    createLinearGradient() {
      return { addColorStop() {} };
    },
    clearRect(x, y, w, h) {
      recorder.calls.push({ op: 'clearRect', x, y, w, h });
    },
    fillRect(x, y, w, h) {
      recorder.calls.push({ op: 'fillRect', x, y, w, h, fillStyle: recorder.fillStyle });
    },
    beginPath() {},
    moveTo(x, y) {
      recorder.calls.push({ op: 'moveTo', x, y });
    },
    lineTo(x, y) {
      recorder.calls.push({ op: 'lineTo', x, y });
    },
    stroke() {
      recorder.calls.push({ op: 'stroke', strokeStyle: recorder.strokeStyle });
    },
    arc(x, y, radius) {
      recorder.calls.push({ op: 'arc', x, y, radius });
    },
    fill() {
      recorder.calls.push({ op: 'fill', fillStyle: recorder.fillStyle });
    },
    fillText(text, x, y) {
      recorder.calls.push({ op: 'fillText', text, x, y, fillStyle: recorder.fillStyle, font: recorder.font });
    },
  };
  return recorder;
}

const contexts = new Map();   // canvas element -> recorder
let contextRequests = [];     // { canvas, type } for every getContext call
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function installCanvasStub() {
  HTMLCanvasElement.prototype.getContext = function getContext(type) {
    contextRequests.push({ canvas: this, type });
    if (type !== '2d') return null;
    if (!contexts.has(this)) contexts.set(this, makeRecorder());
    return contexts.get(this);
  };
}

function mountCanvases(ids = [1, 2, 3, 4], { width = PANE_W, height = PANE_H } = {}) {
  document.body.innerHTML = '';
  contexts.clear();
  contextRequests = [];
  for (const id of ids) {
    const canvas = document.createElement('canvas');
    canvas.id = 'audio-debug' + id;
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
  }
}

function pane(id) {
  return contexts.get(document.getElementById('audio-debug' + id));
}

function callsOn(id) {
  return pane(id) ? pane(id).calls : [];
}

// Slice the drawing calls a single update() produced on one pane.
function frameOn(a, id, db, mutate) {
  if (mutate) mutate(db);
  const mark = callsOn(id).length;
  a.update(DT);
  return callsOn(id).slice(mark);
}

// A fake AnalyserNode handing over the same mutable dB buffer every frame, so a
// test can change the spectrum between updates.
function floatNode(db, { sampleRate = 48000 } = {}) {
  const analyser = {
    fftSize: FFT_SIZE,
    smoothingTimeConstant: 0,
    frequencyBinCount: db.length,
    getFloatFrequencyData(arr) {
      arr.set(db.subarray(0, arr.length));
    },
    getByteTimeDomainData(arr) {
      arr.fill(128);
    },
  };
  return { context: { sampleRate, createAnalyser: () => analyser }, connect() {} };
}

function silence() {
  return new Float32Array(BINS).fill(-96);
}

// Low end only: the band a kick drum occupies.
function setLowEnd(db, dbValue) {
  for (let bin = 1; bin < 40; bin++) db[bin] = dbValue;
}

// Every bin: a broadband onset, the strongest thing the detector can report.
function setBroadband(db, dbValue) {
  for (let bin = 1; bin < BINS; bin++) db[bin] = dbValue;
}

function analyzer(db, debug = true) {
  return new AudioAnalyzer(floatNode(db), debug, 6, FFT_SIZE);
}

// ---------------------------------------------------------------------------
// Colour helpers: the pane may write "#fff", "white" or "rgb(255, 255, 255)".
// ---------------------------------------------------------------------------

function normaliseColour(style) {
  const text = String(style).trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map((d) => d + d).join('') : hex[1];
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ];
  }
  const rgb = text.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (text === 'white') return [255, 255, 255];
  if (text === 'red') return [255, 0, 0];
  return null;
}

function isWhite(style) {
  const rgb = normaliseColour(style);
  return !!rgb && rgb.every((channel) => channel === 255);
}

// The bar colour is a bright green-yellow: red and green high, blue low.
function isGreenYellow(style) {
  const rgb = normaliseColour(style);
  return !!rgb && rgb[0] >= 120 && rgb[1] >= 150 && rgb[2] <= 100;
}

// A flux bar and the threshold mark of one column, told apart by height.
function splitColumn(calls) {
  const fills = calls.filter((call) => call.op === 'fillRect');
  return {
    fills,
    bars: fills.filter((call) => call.h > 1),
    marks: fills.filter((call) => call.h === 1),
  };
}

beforeEach(() => {
  contexts.clear();
  contextRequests = [];
  installCanvasStub();
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------

it('AC1 ::initialises the beat canvas when debug is on', () => {
  // A deliberately wrong initial size: the analyzer is what sizes the pane.
  mountCanvases([1, 2, 3, 4], { width: 10, height: 10 });

  analyzer(silence());

  const beatCanvas = document.getElementById('audio-debug4');
  expect(beatCanvas.width).toBe(PANE_W);
  expect(beatCanvas.height).toBe(PANE_H);

  const request = contextRequests.find((entry) => entry.canvas === beatCanvas && entry.type === '2d');
  expect(request).toBeTruthy();
  expect(pane(4)).toBeTruthy();
});

it('AC2 ::draws one flux column per frame and wraps at pane width', () => {
  mountCanvases([1, 2, 3, 4]);
  const db = silence();
  setLowEnd(db, -40);   // a steady low end that opens with an onset transient
  const a = analyzer(db);
  a.setDrawEnabled(true);

  // Each drawn frame owns exactly one column: a flux bar plus a threshold mark.
  const columns = [];
  for (let drawn = 0; drawn < 5; drawn++) columns.push(splitColumn(frameOn(a, 4, db)));

  columns.forEach((column, drawn) => {
    expect(column.fills).toHaveLength(2);
    expect(column.bars).toHaveLength(1);
    expect(column.marks).toHaveLength(1);
    // Both belong to the cursor's column, one px per drawn frame.
    expect(column.bars[0].x).toBe(drawn);
    expect(column.marks[0].x).toBe(drawn);
    // The bar is scaled to the pane height and grows from the bottom edge.
    expect(column.bars[0].h).toBeGreaterThan(1);
    expect(column.bars[0].h).toBeLessThanOrEqual(PANE_H);
    expect(column.bars[0].y).toBeCloseTo(PANE_H - column.bars[0].h, 6);
  });

  // Less flux, a shorter bar: the same cursor, a smaller onset later on.
  expect(columns[0].bars[0].h).toBeGreaterThan(columns[4].bars[0].h);

  // The cursor advances one pixel per drawn frame and wraps at the pane width.
  mountCanvases([1, 2, 3, 4]);
  const wrapDb = silence();
  setLowEnd(wrapDb, -40);
  const b = analyzer(wrapDb);
  b.setDrawEnabled(true);
  for (let drawn = 0; drawn < PANE_W + 1; drawn++) {
    const column = splitColumn(frameOn(b, 4, wrapDb));
    expect([...new Set(column.fills.map((call) => call.x))]).toEqual([drawn % PANE_W]);
  }
});

it('AC3 ::marks beat frames and clamps tall flux', () => {
  mountCanvases([1, 2, 3, 4]);
  const db = silence();
  const a = analyzer(db);
  a.setDrawEnabled(true);

  for (let frame = 0; frame < 8; frame++) frameOn(a, 4, db);

  // A low end onset fires a beat: a full height column, distinct from an
  // ordinary bar's green-yellow.
  const beatFrame = splitColumn(frameOn(a, 4, db, (spectrum) => setLowEnd(spectrum, -8)));
  expect(a.isOnBeat()).toBe(true);
  expect(beatFrame.bars).toHaveLength(1);
  expect(beatFrame.bars[0].h).toBe(PANE_H);
  expect(beatFrame.bars[0].y).toBe(0);
  expect(isWhite(beatFrame.bars[0].fillStyle)).toBe(true);
  // The threshold mark is still drawn for a beat frame.
  expect(beatFrame.marks).toHaveLength(1);

  // A broadband onset inside the refractory window raises more flux than the
  // pane can show: it is not a beat, but its bar clamps to the pane top instead
  // of drawing past it.
  const clamped = splitColumn(frameOn(a, 4, db, (spectrum) => setBroadband(spectrum, -8)));
  expect(a.isOnBeat()).toBe(false);
  expect(clamped.bars).toHaveLength(1);
  expect(clamped.bars[0].h).toBe(PANE_H);
  expect(clamped.bars[0].y).toBe(0);
  // Clamped is not the same as a beat: the bar colour tells them apart.
  expect(isGreenYellow(clamped.bars[0].fillStyle)).toBe(true);
  expect(clamped.bars[0].fillStyle).not.toBe(beatFrame.bars[0].fillStyle);

  // Nothing anywhere may draw outside the pane.
  for (const call of callsOn(4).filter((entry) => entry.op === 'fillRect')) {
    expect(call.h).toBeLessThanOrEqual(PANE_H);
    expect(call.y).toBeGreaterThanOrEqual(0);
  }
});

it('AC4 ::labels the pane with the current tempo', () => {
  mountCanvases([1, 2, 3, 4]);
  const a = analyzer(silence());
  a.setDrawEnabled(true);
  for (let frame = 0; frame < 5; frame++) a.update(DT);

  const idleLabels = callsOn(4).filter((call) => call.op === 'fillText');
  expect(idleLabels.length).toBeGreaterThan(0);
  const idle = idleLabels[idleLabels.length - 1];
  expect(idle.text).toBe('-- BPM');
  // Top-left of the pane.
  expect(idle.x).toBeLessThan(80);
  expect(idle.y).toBeLessThan(24);

  // A steady 120 BPM pulse train: the tempo replaces the placeholder.
  mountCanvases([1, 2, 3, 4]);
  const db = silence();
  const b = analyzer(db);
  b.setDrawEnabled(true);
  let t = 0;
  for (let frame = 0; frame < 60 * 12; frame++) {
    const hit = t % 0.5 < DT * 1.5;
    setLowEnd(db, hit ? -8 : -96);
    b.update(DT);
    t += DT;
  }

  expect(b.getBpm()).toBeGreaterThan(100);
  expect(b.getBpm()).toBeLessThan(140);

  const tempoLabels = callsOn(4).filter((call) => call.op === 'fillText');
  const shown = tempoLabels[tempoLabels.length - 1];
  expect(shown.text).toMatch(/^\d+(\.\d+)? BPM$/);
  expect(Number.parseFloat(shown.text)).toBeCloseTo(b.getBpm(), 0);
});

it('AC5 ::does not draw the beat pane while the overlay is hidden', () => {
  mountCanvases([1, 2, 3, 4]);
  const db = silence();
  const a = analyzer(db);
  // drawEnabled starts false: the debug canvases are hidden until the overlay opens.
  for (let frame = 0; frame < 5; frame++) a.update(DT);
  expect(callsOn(4)).toHaveLength(0);
  expect(callsOn(1)).toHaveLength(0);

  a.setDrawEnabled(true);
  const resumed = frameOn(a, 4, db);
  expect(resumed.some((call) => call.op === 'fillRect')).toBe(true);
});

it('AC6 ::tolerates a missing beat canvas', () => {
  mountCanvases([1, 2, 3]);
  const a = analyzer(silence());
  a.setDrawEnabled(true);

  expect(() => {
    for (let frame = 0; frame < 4; frame++) a.update(DT);
  }).not.toThrow();

  // The panes that do exist still draw.
  expect(callsOn(1).length).toBeGreaterThan(0);
  expect(callsOn(2).length).toBeGreaterThan(0);
  expect(callsOn(3).length).toBeGreaterThan(0);
});

it('Composition ::beat pane plots flux and threshold from a real BeatDetector pulse train while the other panes keep drawing', () => {
  mountCanvases([1, 2, 3, 4]);
  const db = silence();
  const a = analyzer(db);
  a.setDrawEnabled(true);

  const frames = [];
  let t = 0;
  for (let frame = 0; frame < 60 * 8; frame++) {
    // 120 BPM kick: two frames of low end per hit, silence between.
    const hit = t % 0.5 < DT * 1.5;
    setLowEnd(db, hit ? -8 : -96);

    const beatMark = callsOn(4).length;
    const relativeMark = callsOn(2).length;
    a.update(DT);
    frames.push({
      onBeat: a.isOnBeat(),
      beat: callsOn(4).slice(beatMark),
      relative: callsOn(2).slice(relativeMark),
    });
    t += DT;
  }

  const onset = frames.find((frame) => frame.onBeat);
  expect(onset).toBeTruthy();

  // The beat pane: a full height white column on the onset frame, plus that
  // frame's threshold mark.
  const beatColumn = splitColumn(onset.beat);
  expect(beatColumn.bars).toHaveLength(1);
  expect(beatColumn.bars[0].x).toBe(beatColumn.marks[0].x);
  expect(beatColumn.bars[0].h).toBe(PANE_H);
  expect(beatColumn.bars[0].y).toBe(0);
  expect(isWhite(beatColumn.bars[0].fillStyle)).toBe(true);

  // The Relative pane keeps drawing its bars, the BPM text and the beat dot.
  const relativeFills = onset.relative.filter((call) => call.op === 'fillRect');
  expect(relativeFills.length).toBeGreaterThanOrEqual(6);
  expect(onset.relative.filter((call) => call.op === 'fillText' && /BPM$/.test(call.text)).length)
    .toBeGreaterThanOrEqual(1);
  expect(onset.relative.filter((call) => call.op === 'arc').length).toBeGreaterThanOrEqual(1);

  // And the tempo the detector found reaches the beat pane.
  const labels = frames.flatMap((frame) => frame.beat).filter((call) => call.op === 'fillText');
  expect(labels.some((call) => /^\d+(\.\d+)? BPM$/.test(call.text))).toBe(true);
});
