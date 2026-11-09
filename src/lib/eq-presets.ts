// EQ presets: values are dB per band (channel: low, low-mid, hi-mid, hi; bus: 9 graphic bands)
// plus an optional low-cut frequency in Hz for channels (0 = off).

export interface ChannelPreset {
  db: [number, number, number, number];
  lowcut: number;
}
export type BusPreset = number[]; // 9 values

export const CHANNEL_PRESETS: Record<string, ChannelPreset> = {
  Flat: { db: [0, 0, 0, 0], lowcut: 0 },
  Vocals: { db: [-2, -3, 3, 4], lowcut: 100 },
  'Speech / podcast': { db: [-4, -2, 4, 2], lowcut: 120 },
  'Acoustic guitar': { db: [-3, -4, 2, 3], lowcut: 90 },
  'Electric guitar': { db: [-2, 2, 3, -2], lowcut: 80 },
  Bass: { db: [4, -3, 2, -3], lowcut: 0 },
  Kick: { db: [5, -6, 3, 0], lowcut: 0 },
  Keys: { db: [-1, -2, 1, 2], lowcut: 40 },
  'Music from USB/BT': { db: [2, -1, 0, 2], lowcut: 0 },
};

export const BUS_PRESETS: Record<string, BusPreset> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  Loudness: [4, 3, 0, -1, -2, -1, 0, 3, 4],
  'Anti-boom': [-3, -2, -3, -1, 0, 0, 0, 0, 0],
  'Speech clarity': [-4, -2, -1, 0, 1, 3, 3, 1, 0],
  'Monitor (anti-feedback)': [-2, -1, -2, -1, 0, -2, -1, 0, -2],
  'Background music': [3, 2, 0, -2, -2, -1, 1, 3, 3],
};

const KEY = 'flow8.eqpresets.v1';
interface UserPresets {
  channel: Record<string, ChannelPreset>;
  bus: Record<string, BusPreset>;
}

export function loadUserPresets(): UserPresets {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const p = JSON.parse(s) as Partial<UserPresets>;
      return { channel: p.channel ?? {}, bus: p.bus ?? {} };
    }
  } catch {
    /* storage unavailable */
  }
  return { channel: {}, bus: {} };
}

export function saveUserPresets(p: UserPresets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}
