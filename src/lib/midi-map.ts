// FLOW 8 MIDI implementation (Quick Start Guide, "MIDI Implementation", p. 44–45).
// Communication is one-way: the mixer does not send parameter changes back,
// except for a "MIDI Dump" triggered from the console's Snapshots menu.

export type Kind =
  | 'level' // 0 = OFF, 1..127 = -70..+10 dB
  | 'balance' // 0..127, 64 = center
  | 'eq' // 0..127, 64 = 0 dB, ±15 dB
  | 'gain' // -20..+60 dB
  | 'lowcut' // 20..600 Hz
  | 'percent' // 0..100 (101..127 = 100 %)
  | 'limiter' // -30..0 dB
  | 'switch'; // 0 = off, 127 = on

export interface Param {
  key: string; // `${midiCh}:${cc}`
  ch: number; // MIDI channel 1..16
  cc: number;
  kind: Kind;
  label: string;
  def: number;
  max: number;
  /** excluded from "send all" (e.g. phantom power) */
  noBulk?: boolean;
}

export interface InputDef {
  id: string;
  name: string;
  ch: number;
  pre: boolean; // has gain / low cut / comp
  phantom: boolean;
  stereo: boolean;
  color: string; // default scribble colour
}

export interface BusDef {
  id: 'main' | 'mon1' | 'mon2' | 'fx1' | 'fx2';
  name: string;
  ch: number;
  slot?: number; // FX slot MIDI channel
}

export const GLOBAL_CH = 16;

export const INPUTS: InputDef[] = [
  { id: 'in1', name: 'CH 1', ch: 1, pre: true, phantom: true, stereo: false, color: '#e5484d' },
  { id: 'in2', name: 'CH 2', ch: 2, pre: true, phantom: true, stereo: false, color: '#f5a524' },
  { id: 'in3', name: 'CH 3', ch: 3, pre: true, phantom: false, stereo: false, color: '#f5d524' },
  { id: 'in4', name: 'CH 4', ch: 4, pre: true, phantom: false, stereo: false, color: '#3ecf6e' },
  { id: 'in56', name: 'CH 5/6', ch: 5, pre: true, phantom: false, stereo: true, color: '#3ec9cf' },
  { id: 'in78', name: 'CH 7/8', ch: 6, pre: true, phantom: false, stereo: true, color: '#4f8bff' },
  { id: 'usb', name: 'USB/BT', ch: 7, pre: false, phantom: false, stereo: true, color: '#b07cff' },
];

export const BUSES: BusDef[] = [
  { id: 'mon1', name: 'MON 1', ch: 9 },
  { id: 'mon2', name: 'MON 2', ch: 10 },
  { id: 'fx1', name: 'FX 1', ch: 11, slot: 14 },
  { id: 'fx2', name: 'FX 2', ch: 12, slot: 15 },
  { id: 'main', name: 'MAIN', ch: 8 },
];

export const EQ9 = [
  { cc: 11, label: '62' },
  { cc: 12, label: '125' },
  { cc: 13, label: '250' },
  { cc: 14, label: '500' },
  { cc: 15, label: '1k' },
  { cc: 16, label: '2k' },
  { cc: 17, label: '4k' },
  { cc: 18, label: '8k' },
  { cc: 19, label: '16k' },
];

export const FX_PRESETS: Record<'fx1' | 'fx2', string[]> = {
  fx1: [
    'Ambience', 'Perc. Reverb 1', 'Perc. Reverb 2', 'Guitar Reverb 1', 'Guitar Reverb 2',
    'Chamber', 'Room', 'Concert', 'Church', 'Cathedral', 'Temple', 'Stadium',
    'Flanger', 'Soft Chorus', 'Warm Chorus', 'Deep Chorus',
  ],
  fx2: [
    'Delay 1/1', 'Delay 1/2', 'Delay 1/3', 'Delay 2/1', 'Echo 1/1', 'Echo 1/2', 'Echo 1/3',
    'Echo 2/1', 'Wide Echo', 'Ping Pong', 'Ping Pong 1/3', 'Ping Pong R>L',
    'Flanger', 'Soft Chorus', 'Warm Chorus', 'Deep Chorus',
  ],
};

/** Per-preset parameter names [param 1, param 2 option A, option B] (from the FLOW Mix app). */
const IV: [string, string, string] = ['Decay', 'Instrument', 'Vocal'];
const PRE: [string, string, string] = ['Decay', 'Pre-delay off', 'Pre-delay on'];
const MOD: [string, string, string] = ['Mod speed', 'Mono', 'Stereo'];
const CHO: [string, string, string] = ['Density', 'Trem off', 'Trem on'];
const DLY: [string, string, string] = ['Feedback', 'Dull', 'Bright'];
const ECH: [string, string, string] = ['Filter', 'Soft', 'Strong'];
const WID: [string, string, string] = ['Filter', 'Wide', 'Narrow'];
export const FX_PARAMS: Record<'fx1' | 'fx2', [string, string, string][]> = {
  fx1: [
    IV, ['Decay', 'Dull', 'Bright'], ['Decay', 'Dull', 'Bright'], ['Decay', 'Less bass', 'More bass'],
    ['Decay', 'Less bass', 'More bass'], PRE, IV, IV, IV, ['Decay', 'Small', 'Large'], PRE, PRE,
    MOD, CHO, CHO, CHO,
  ],
  fx2: [DLY, DLY, DLY, DLY, ECH, ECH, ECH, ECH, WID, WID, WID, WID, MOD, CHO, CHO, CHO],
};

// ---- value conversions -------------------------------------------------------

export const levelDb = (v: number) => -70 + ((v - 1) * 80) / 126;
export const dbToLevel = (db: number) => Math.round(((db + 70) * 126) / 80 + 1);
export const LEVEL_0DB = dbToLevel(0);
export const eqDb = (v: number) => ((v - 64) / (v < 64 ? 64 : 63)) * 15;
export const gainDb = (v: number) => -20 + (v * 80) / 127;
// The manual only states the 20–600 Hz range; a logarithmic curve is assumed.
export const lowcutHz = (v: number) => 20 * Math.pow(30, v / 127);
export const limiterDb = (v: number) => -30 + (v * 30) / 127;
export const balancePos = (v: number) => (v - 64) / (v < 64 ? 64 : 63); // -1..1

const sdb = (db: number) => (db > 0.05 ? '+' : '') + db.toFixed(1);

export function format(kind: Kind, v: number): string {
  switch (kind) {
    case 'level':
      return v === 0 ? 'OFF' : sdb(levelDb(v));
    case 'balance': {
      const p = balancePos(v);
      return Math.abs(p) < 0.01 ? 'C' : (p < 0 ? 'L' : 'R') + Math.round(Math.abs(p) * 100);
    }
    case 'eq':
      return sdb(eqDb(v));
    case 'gain':
      return sdb(gainDb(v));
    case 'lowcut':
      return v === 0 ? 'OFF' : Math.round(lowcutHz(v)) + ' Hz';
    case 'percent':
      return Math.min(100, v) + '%';
    case 'limiter':
      return limiterDb(v).toFixed(1);
    case 'switch':
      return v ? 'ON' : 'OFF';
  }
}

// ---- parameter registry -------------------------------------------------------

export const params = new Map<string, Param>();

function add(ch: number, cc: number, kind: Kind, label: string, def: number, extra: Partial<Param> = {}) {
  const max = kind === 'percent' ? 100 : kind === 'switch' ? 127 : 127;
  const p: Param = { key: `${ch}:${cc}`, ch, cc, kind, label, def, max, ...extra };
  params.set(p.key, p);
  return p;
}

for (const i of INPUTS) {
  add(i.ch, 7, 'level', 'Level', 0);
  add(i.ch, 10, 'balance', 'Bal', 64);
  add(i.ch, 5, 'switch', 'Mute', 0);
  add(i.ch, 6, 'switch', 'Solo', 0);
  add(i.ch, 4, 'eq', 'Hi', 64);
  add(i.ch, 3, 'eq', 'Hi Mid', 64);
  add(i.ch, 2, 'eq', 'Lo Mid', 64);
  add(i.ch, 1, 'eq', 'Low', 64);
  if (i.pre) {
    add(i.ch, 8, 'gain', 'Gain', 32); // ~0 dB
    add(i.ch, 9, 'lowcut', 'Low Cut', 0);
    add(i.ch, 11, 'percent', 'Comp', 0);
  }
  if (i.phantom) add(i.ch, 12, 'switch', '48V', 0, { noBulk: true });
  add(i.ch, 14, 'level', 'Mon 1', 0);
  add(i.ch, 15, 'level', 'Mon 2', 0);
  add(i.ch, 16, 'level', 'FX 1', 0);
  add(i.ch, 17, 'level', 'FX 2', 0);
}

for (const b of BUSES) {
  add(b.ch, 7, 'level', 'Level', b.id === 'main' ? 0 : 0);
  if (b.id === 'main') add(b.ch, 10, 'balance', 'Bal', 64);
  if (!b.slot) {
    add(b.ch, 8, 'limiter', 'Limiter', 127);
    for (const e of EQ9) add(b.ch, e.cc, 'eq', e.label, 64);
  } else {
    add(b.slot, 1, 'percent', 'Param 1', 50);
    add(b.slot, 2, 'switch', 'Param 2', 0);
  }
}

add(GLOBAL_CH, 1, 'switch', 'FX Mute', 0);

/** Program change "parameters" (FX preset 1..16 per slot) */
export const PRESET_KEYS = { fx1: '14:pc', fx2: '15:pc' } as const;

export const key = (ch: number, cc: number | 'pc') => `${ch}:${cc}`;

// ---- fader taper (more resolution around 0 dB, like a real console fader) ----
const TAPER: [number, number][] = [
  [-71, 0], [-70, 0.03], [-50, 0.12], [-40, 0.2], [-30, 0.3], [-20, 0.42],
  [-10, 0.58], [-5, 0.67], [0, 0.76], [5, 0.88], [10, 1],
];
function interp(x: number, from: 0 | 1, to: 0 | 1) {
  const t = from === 0 ? TAPER : [...TAPER].sort((a, b) => a[1] - b[1]);
  if (x <= t[0][from]) return t[0][to];
  for (let i = 1; i < t.length; i++) {
    if (x <= t[i][from]) {
      const [a, b] = [t[i - 1], t[i]];
      return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
    }
  }
  return t[t.length - 1][to];
}
export const levelToPos = (v: number) => interp(v <= 0 ? -71 : levelDb(Math.min(127, v)), 0, 1);
export function posToLevel(p: number) {
  const db = interp(Math.max(0, Math.min(1, p)), 1, 0);
  return db < -70.5 ? 0 : Math.max(1, Math.min(127, dbToLevel(db)));
}
