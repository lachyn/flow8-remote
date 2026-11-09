// FLOW 8 Bluetooth LE protocol codec (see docs/ble-protocol.md).
// The app's state keeps MIDI-scaled values (`${midiCh}:${cc}`, 0..127); this module converts them
// to/from the mixer's BLE messages and its 0x38 state dump.
import { BLE_TABLES } from './ble-tables';

type Kind = keyof typeof BLE_TABLES;

export const BLE_SERVICE = '14839ad4-8d7e-415c-9a42-167340cf2339';
export const BLE_CHAR = '0034594a-a8e7-4b1a-a6b1-cd5243059a57';

export function frame(...b: number[]): Uint8Array {
  const sum = b.reduce((a, x) => a + x, 0) & 0xff;
  return new Uint8Array([...b, sum]);
}

// ---- value scaling ------------------------------------------------------------
const toBle = (kind: Kind, v: number) => BLE_TABLES[kind][Math.max(0, Math.min(127, Math.round(v)))];
function fromBle(kind: Kind, x: number): number {
  const t = BLE_TABLES[kind];
  let best = 0, bd = Infinity;
  for (let m = 0; m < 128; m++) {
    const d = Math.abs(t[m] - x);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

// ---- addressing -----------------------------------------------------------------
// MIDI channel 1..7 = input strips 0..6; buses MIDI 8..12 → BLE ids
const BUS_ID: Record<number, number> = { 8: 0x0f, 9: 0x0a, 10: 0x0b, 11: 0x0c, 12: 0x0d };
const ID_BUS: Record<number, number> = { 0x0f: 8, 0x0a: 9, 0x0b: 10, 0x0c: 11, 0x0d: 12 };
const FX_SLOT_ID: Record<number, number> = { 14: 0x0c, 15: 0x0d };
const SEND_CC: Record<number, number> = { 14: 0x0a, 15: 0x0b, 16: 0x0c, 17: 0x0d };
const CC_SEND: Record<number, number> = { 0x0a: 14, 0x0b: 15, 0x0c: 16, 0x0d: 17 };
const CH_EQ = [ // band: [freq hi, freq lo, q] — MIDI cc 1..4 = low, lo-mid, hi-mid, hi
  [0x00, 0x64, 0x00], [0x01, 0xf4, 0x06], [0x07, 0xd0, 0x06], [0x2e, 0xe0, 0x00],
];
const GEQ = [
  [0x00, 0x3f], [0x00, 0x7d], [0x00, 0xfa], [0x01, 0xf4], [0x03, 0xe8], [0x07, 0xd0], [0x0f, 0xa0], [0x1f, 0x40], [0x3e, 0x80],
];

const on = (v: number) => (v > 0 ? 1 : 0);
// MAIN balance uses its own linear scale (measured: MIDI 30 → 0x3a, 50 → 0x62)
const balToBle = (v: number) => Math.max(0, Math.min(254, Math.round(v) * 2 - 2));
const balFromBle = (x: number) => Math.max(0, Math.min(127, Math.round((x + 2) / 2)));

/** Encode one app parameter change as BLE message(s). `values` = whole app state (for paired params). */
export function encode(key: string, v: number, values: Record<string, number>): Uint8Array[] {
  const [chS, ccS] = key.split(':');
  const ch = Number(chS);
  if (ccS === 'pc') {
    const fx = FX_SLOT_ID[ch];
    return fx ? [frame(0x31, 0x01, fx, Math.max(0, v - 1))] : [];
  }
  const cc = Number(ccS);
  if (ch >= 1 && ch <= 7) {
    const s = ch - 1;
    switch (cc) {
      case 7: return [frame(0x06, 0x01, s, 0x0f, toBle('level', v))];
      case 14: case 15: case 16: case 17: return [frame(0x06, 0x01, s, SEND_CC[cc], toBle('level', v))];
      case 10: return [frame(0x00, 0x01, s, toBle('pan', v))];
      case 5: return [frame(0x08, 0x01, s, on(v))];
      case 6: return [frame(0x01, 0x01, s, on(v))];
      case 8: return [frame(0x02, 0x01, s, toBle('gain', v))];
      case 9: { const f = toBle('lowcut', v); return [frame(0x04, 0x01, s, 0x00, f >> 8, f & 0xff)]; }
      case 11: return [frame(0x13, 0x01, s, toBle('comp', v))];
      case 1: case 2: case 3: case 4: {
        const [fh, fl, q] = CH_EQ[cc - 1];
        return [frame(0x09, 0x01, s, cc - 1, fh, fl, q, toBle('eq', v))];
      }
    }
    if (cc === 12) return [frame(0x15, 0x01, s, on(v))]; // phantom power
    return [];
  }
  if (BUS_ID[ch] !== undefined) {
    const b = BUS_ID[ch];
    if (cc === 7) return [frame(0x06, 0x01, b, b, toBle('level', v))];
    if (cc === 10) return [frame(0x00, 0x01, b, balToBle(v))];
    if (cc === 8) return [frame(0x14, 0x01, b, toBle('limiter', v))];
    if (cc >= 11 && cc <= 19) {
      const [fh, fl] = GEQ[cc - 11];
      return [frame(0x03, 0x01, b, cc - 11, fh, fl, 0x08, toBle('eq', v))];
    }
    return [];
  }
  if (FX_SLOT_ID[ch] !== undefined && (cc === 1 || cc === 2)) {
    const p1 = toBle('fxparam', cc === 1 ? v : values[`${ch}:1`]);
    const p2 = on(cc === 2 ? v : values[`${ch}:2`]);
    return [frame(0x11, 0x01, FX_SLOT_ID[ch], p1, p2, 0x00, 0x01)];
  }
  if (ch === 16 && cc === 1) return [frame(0x08, 0x01, 0x0c, on(v)), frame(0x08, 0x01, 0x0d, on(v))];
  return [];
}

/** Load mixer snapshot n (1..15; 16 = reset) – command 0x20 with a 0-based index. */
export const snapshotLoad = (n: number) => frame(0x20, 0x01, (n - 1) & 0x0f);
/** Set the FX tempo in BPM – command 0x40, 16-bit little endian. */
export const fxTempo = (bpm: number) => frame(0x40, 0x01, bpm & 0xff, (bpm >> 8) & 0xff);

/** Decode a parameter notification into app [key, MIDI value] pairs. */
export function decode(d: Uint8Array): [string, number][] {
  if (d.length < 4) return [];
  const t = d[0], id = d[2];
  const inCh = id <= 6 ? id + 1 : 0;
  const bus = ID_BUS[id];
  switch (t) {
    case 0x06: {
      const target = d[3], x = d[4];
      if (inCh) {
        if (target === 0x0f) return [[`${inCh}:7`, fromBle('level', x)]];
        if (CC_SEND[target]) return [[`${inCh}:${CC_SEND[target]}`, fromBle('level', x)]];
      } else if (bus && target === id) return [[`${bus}:7`, fromBle('level', x)]];
      return [];
    }
    case 0x00:
      if (inCh) return [[`${inCh}:10`, fromBle('pan', d[3])]];
      if (id === 0x0f) return [['8:10', balFromBle(d[3])]];
      return [];
    case 0x08:
      if (inCh) return [[`${inCh}:5`, d[3] ? 127 : 0]];
      if (id === 0x0c || id === 0x0d) return [['16:1', d[3] ? 127 : 0]];
      return [];
    case 0x01: return inCh ? [[`${inCh}:6`, d[3] ? 127 : 0]] : [];
    case 0x02: return inCh ? [[`${inCh}:8`, fromBle('gain', d[3])]] : [];
    case 0x04: return inCh ? [[`${inCh}:9`, fromBle('lowcut', (d[4] << 8) | d[5])]] : [];
    case 0x13: return inCh ? [[`${inCh}:11`, fromBle('comp', d[3])]] : [];
    case 0x09: return inCh && d[3] <= 3 ? [[`${inCh}:${d[3] + 1}`, fromBle('eq', d[7])]] : [];
    case 0x03: return bus && d[3] <= 8 ? [[`${bus}:${d[3] + 11}`, fromBle('eq', d[7])]] : [];
    case 0x14: return bus ? [[`${bus}:8`, fromBle('limiter', d[3])]] : [];
    case 0x11: {
      const slot = id === 0x0c ? 14 : id === 0x0d ? 15 : 0;
      return slot ? [[`${slot}:1`, fromBle('fxparam', d[3])], [`${slot}:2`, d[4] ? 127 : 0]] : [];
    }
    case 0x31: {
      const slot = id === 0x0c ? 14 : id === 0x0d ? 15 : 0;
      return slot ? [[`${slot}:pc`, d[3] + 1]] : [];
    }
  }
  return [];
}

// ---- 0x38 state dump ------------------------------------------------------------
// Offsets measured by changing each parameter via MIDI and diffing dumps (docs/ble/dumpmap.json).
const STRIP = 0x1b; // input strip record size
const MON_SENDS = { 9: 0xfa, 10: 0x12e } as Record<number, number>;
const FX_SENDS = { 16: 0x165, 17: 0x176 } as Record<number, number>;

export function decodeDump(d: Uint8Array): [string, number][] {
  const out: [string, number][] = [];
  if (d.length < 0x17d) return out;
  for (let s = 0; s < 7; s++) {
    // USB/BT's record starts 4 bytes later (CH 7/8 carries a label) – measured
    const o = s < 6 ? s * STRIP : 0xa6, ch = s + 1;
    const flags = d[o + 1];
    out.push([`${ch}:5`, flags & 0x01 ? 127 : 0]);
    out.push([`${ch}:6`, flags & 0x40 ? 127 : 0]);
    if (s < 6) {
      out.push([`${ch}:8`, fromBle('gain', d[o + 2])]);
      out.push([`${ch}:11`, fromBle('comp', d[o + 3])]);
      out.push([`${ch}:9`, fromBle('lowcut', (d[o + 4] << 8) | d[o + 5])]);
    }
    out.push([`${ch}:10`, fromBle('pan', d[o + 6])]);
    for (let b = 0; b < 4; b++) out.push([`${ch}:${b + 1}`, fromBle('eq', d[o + 7 + b])]);
    out.push([`${ch}:7`, fromBle('level', d[0xc6 + s])]);
    out.push([`${ch}:14`, fromBle('level', d[MON_SENDS[9] + s])]);
    out.push([`${ch}:15`, fromBle('level', d[MON_SENDS[10] + s])]);
    out.push([`${ch}:16`, fromBle('level', d[FX_SENDS[16] + s])]);
    out.push([`${ch}:17`, fromBle('level', d[FX_SENDS[17] + s])]);
  }
  // MAIN
  out.push(['8:7', fromBle('level', d[0xc3])], ['8:10', balFromBle(d[0xc4])], ['8:8', fromBle('limiter', d[0xc5])]);
  for (let b = 0; b < 9; b++) out.push([`8:${b + 11}`, fromBle('eq', d[0xcd + b])]);
  // MON 1/2
  for (const [ch, base] of [[9, 0xf7], [10, 0x12b]] as const) {
    out.push([`${ch}:7`, fromBle('level', d[base])], [`${ch}:8`, fromBle('limiter', d[base + 2])]);
    for (let b = 0; b < 9; b++) out.push([`${ch}:${b + 11}`, fromBle('eq', d[base + 0x0a + b])]);
  }
  // FX buses / slots
  for (const [bus, slot, base] of [[11, 14, 0x15e], [12, 15, 0x16f]] as const) {
    out.push([`${bus}:7`, fromBle('level', d[base + 1])]);
    out.push([`${slot}:1`, fromBle('fxparam', d[base + 3])], [`${slot}:2`, d[base + 4] ? 127 : 0]);
  }
  out.push(['16:1', d[0x15e] & 0x01 ? 127 : 0]);
  return out;
}

/** Snapshot names from a 0x27 message: length-prefixed strings. */
export function decodeSnapshotNames(d: Uint8Array): string[] {
  const names: string[] = [];
  let i = 2;
  while (i < d.length - 1) {
    const n = d[i++];
    if (n === 0 || i + n > d.length - 1) break;
    names.push(new TextDecoder().decode(d.slice(i, i + n)));
    i += n;
  }
  return names;
}
