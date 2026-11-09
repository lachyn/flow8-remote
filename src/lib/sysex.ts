// Decoder for the FLOW 8 full-state SysEx dump (sent over USB MIDI after "MIDI Dump" on the mixer
// or after the Bluetooth 0x4B trigger). Offsets come from automated calibration, see sysex-map.ts.
import { SYSEX_MAP, type SxEntry } from './sysex-map';
import { BLE_TABLES } from './ble-tables';

const clamp = (v: number, lo = 0, hi = 127) => Math.max(lo, Math.min(hi, Math.round(v)));

export function isFlowDump(d: Uint8Array) {
  return d.length > 3000 && d[0] === 0xf0 && d[1] === 0x00 && d[2] === 0x20 && d[3] === 0x32 && d[4] === 0x21;
}

function readFloat(d: Uint8Array, e: Extract<SxEntry, { t: 'f' }>) {
  const buf = new Uint8Array(4);
  e.p.forEach((pos, i) => (buf[i] = d[pos] | ((d[e.m] >> e.b[i]) & 1 ? 0x80 : 0)));
  return new DataView(buf.buffer).getFloat32(0, true);
}

const lowcutTable = BLE_TABLES.lowcut;
function hzToMidi(hz: number) {
  if (hz <= 20) return 0;
  let best = 0, bd = Infinity;
  for (let m = 0; m < 128; m++) {
    const d = Math.abs(lowcutTable[m] - hz);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function toMidi(kind: string, f: number): number {
  switch (kind) {
    case 'level': return f <= -70 ? 0 : clamp(((f + 70) * 126) / 80 + 1, 1, 127);
    case 'eq': return clamp(64 + (f / 15) * (f < 0 ? 64 : 63));
    case 'gain': return clamp(((f + 20) * 127) / 80);
    case 'pan': return clamp(64 + f * (f < 0 ? 64 : 63));
    case 'comp': return clamp(f * 100, 0, 100);
    case 'limiter': return clamp(127 * (1 - f / 15));
  }
  return 0;
}

/** Decode a full dump into app [key, MIDI-scaled value] pairs. */
export function decodeSysexDump(d: Uint8Array): [string, number][] {
  const out: [string, number][] = [];
  for (const [key, e] of Object.entries(SYSEX_MAP)) {
    if (e.t === 'f') {
      const f = readFloat(d, e);
      if (Number.isFinite(f)) out.push([key, toMidi(e.k, f)]);
    } else if (e.t === 'lc') {
      const hz = (d[e.p] | ((d[e.m] >> e.bit) & 1 ? 0x80 : 0)) | (d[e.p + 1] << 8);
      out.push([key, hzToMidi(hz)]);
    } else {
      const v = d[e.p];
      if (e.k === 'bool') out.push([key, v ? 127 : 0]);
      else if (e.k === 'fxparam') out.push([key, clamp(v, 0, 100)]);
      else if (e.k === 'preset') out.push([key, clamp(v, 1, 16)]);
    }
  }
  return out;
}
