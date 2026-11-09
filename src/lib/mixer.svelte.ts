import { t } from './i18n.svelte';
import { params, INPUTS, BUSES, GLOBAL_CH, PRESET_KEYS, FX_PRESETS, format } from './midi-map';
import { ble } from './ble.svelte';
import { encode, snapshotLoad, fxTempo } from './ble-codec';
import { decodeSysexDump, isFlowDump } from './sysex';

export type Theme = 'ssl' | 'neve' | 'digital';

interface Settings {
  pcZeroBased: boolean; // false (verified): snapshot/preset N -> program byte N; 0 is ignored by the mixer
  tapNote: number;
  confirm48: boolean;
  theme: Theme;
  /** keep the app in sync with the mixer (BT dump trigger + USB SysEx) */
  follow: boolean;
  /** scale the console to fit the window */
  fit: boolean;
  /** strip ids hidden from the console (they keep working) */
  hidden: string[];
  /** console layout: auto (compact on small screens), compact, full */
  layout: 'auto' | 'compact' | 'full';
}

interface LogEntry {
  id: number;
  dir: 'tx' | 'rx' | 'info' | 'err';
  text: string;
}

interface Saved {
  values: Record<string, number>;
  names: Record<string, string>;
  colors: Record<string, string>;
  /** visible-strip layout of the scene */
  hidden?: string[];
  /** channel sources: setting id (0x09 CH 5/6, 0x0a CH 7/8) → 0 LINE / 1 USB */
  routing?: Record<string, number>;
}

const STORE_KEY = 'flow8.state.v1';
const SCENES_KEY = 'flow8.scenes.v1';
const SETTINGS_KEY = 'flow8.settings.v2';

function defaults(): Record<string, number> {
  const o: Record<string, number> = {};
  for (const p of params.values()) o[p.key] = p.def;
  o[PRESET_KEYS.fx1] = 1;
  o[PRESET_KEYS.fx2] = 1;
  return o;
}

function readJSON<T>(k: string): T | null {
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable – ignore */
  }
}

const chanName = (ch: number, names: Record<string, string>) => {
  const i = INPUTS.find((x) => x.ch === ch);
  if (i) return names[i.id] || i.name;
  const b = BUSES.find((x) => x.ch === ch || x.slot === ch);
  if (b) return (b.slot === ch ? 'FX slot ' : '') + b.name;
  if (ch === GLOBAL_CH) return 'Global';
  return `ch${ch}`;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Mixer {
  values = $state<Record<string, number>>(defaults());
  names = $state<Record<string, string>>({});
  colors = $state<Record<string, string>>({});
  settings = $state<Settings>({ pcZeroBased: false, tapNote: 0, confirm48: true, theme: 'ssl', follow: true, fit: true, hidden: [], layout: 'auto' });
  /** user-given snapshot names (the mixer only reports them over BT notifications) */
  snapNames = $state<Record<number, string>>(readJSON<Record<number, string>>('flow8.snapnames.v1') ?? {});
  sysexOk = $state(false);
  /** last known channel source (setting id → 0 LINE / 1 USB); from the user's choice or a dump */
  routing = $state<Record<number, number>>(readJSON<Record<number, number>>('flow8.routing.v1') ?? {});
  lastSync = $state(0);
  #manualSync = false;

  outputs = $state<{ id: string; name: string }[]>([]);
  outId = $state('');
  midiError = $state('');
  connected = $state(false);
  txBlink = $state(0);
  rxBlink = $state(0);

  log = $state<LogEntry[]>([]);
  lastSnapshot = $state<number | null>(null);
  bpm = $state<number | null>(null);
  sending = $state(0); // progress 0..1 of "send all", 0 = idle
  scenes = $state<string[]>([]);
  toast = $state('');

  anySolo = $derived(INPUTS.some((i) => this.values[`${i.ch}:6`] > 0));

  #access: MIDIAccess | null = null;
  #taps: number[] = [];
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #toastTimer: ReturnType<typeof setTimeout> | undefined;
  #logId = 0;
  /** when each key was last changed locally – incoming echoes are ignored briefly */
  #localAt = new Map<string, number>();

  constructor() {
    ble.handlers = {
      params: (pairs, fromDump) => this.#applyRemote(pairs, fromDump),
      log: (dir, text) => this.addLog(dir, text),
      connected: () => setTimeout(() => this.syncFromMixer(true), 300),
    };
    // follow the mixer: request a dump every second while BT + USB SysEx are available
    setInterval(() => {
      if (this.settings.follow && document.visibilityState === 'visible' && !this.sending) this.syncFromMixer(false);
    }, 1000);
    const saved = readJSON<Saved>(STORE_KEY);
    if (saved) this.#apply(saved);
    const s = readJSON<Partial<Settings>>(SETTINGS_KEY);
    if (s) Object.assign(this.settings, s);
    this.scenes = Object.keys(readJSON<Record<string, Saved>>(SCENES_KEY) ?? {}).sort();
  }

  #apply(s: Partial<Saved>, keepPhantom = false) {
    const next = { ...this.values };
    for (const [k, v] of Object.entries(s.values ?? {})) {
      const p = params.get(k);
      if (!p && !k.endsWith(':pc')) continue;
      if (keepPhantom && p?.noBulk) continue;
      next[k] = Number(v) | 0;
    }
    this.values = next;
    if (s.names) this.names = { ...s.names };
    if (s.colors) this.colors = { ...s.colors };
    if (Array.isArray(s.hidden)) this.settings.hidden = [...s.hidden];
  }

  /** Apply a scene's channel-source routing; sent to the mixer only over Bluetooth. */
  #applyRouting(r: Saved['routing']) {
    if (!r || !Object.keys(r).length) return;
    if (!ble.connected) {
      this.notify(t('Scene loaded – channel sources (LINE/USB) need Bluetooth and were not changed.'));
      return;
    }
    for (const [id, v] of Object.entries(r)) this.setRouting(Number(id), Number(v));
  }

  snapshot(): Saved {
    return {
      values: { ...this.values },
      names: { ...this.names },
      colors: { ...this.colors },
      hidden: [...this.settings.hidden],
      routing: { ...this.routing },
    };
  }

  persist() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      writeJSON(STORE_KEY, this.snapshot());
      writeJSON(SETTINGS_KEY, this.settings);
    }, 250);
  }

  notify(msg: string) {
    this.toast = msg;
    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => (this.toast = ''), 2600);
  }

  // ---- parameter access -----------------------------------------------------

  set(key: string, raw: number, send = true) {
    const isPc = key.endsWith(':pc');
    const max = isPc ? 16 : (params.get(key)?.max ?? 127);
    const min = isPc ? 1 : 0;
    const v = Math.max(min, Math.min(max, Math.round(raw)));
    if (this.values[key] === v) return;
    this.values[key] = v;
    if (send) {
      this.#localAt.set(key, performance.now());
      this.#sendParam(key);
    }
    this.persist();
  }

  /** Values reported by the mixer over Bluetooth (live moves or a full state dump). */
  #applyRemote(pairs: [string, number][], fromDump: boolean) {
    const now = performance.now();
    let changed = 0;
    for (const [k, v] of pairs) {
      if (now - (this.#localAt.get(k) ?? 0) < (fromDump ? 1500 : 600)) continue; // our own recent change / echo
      if (this.values[k] !== v) changed++;
      this.set(k, v, false);
    }
    if (fromDump) {
      this.lastSync = Date.now();
      if (this.#manualSync) this.notify(t('State loaded from the mixer ({0} changes).', [changed]));
      else if (changed) this.addLog('rx', t('Mixer → app: {0} changes', [changed]));
      this.#manualSync = false;
    }
    else if (changed) for (const [k] of pairs) this.addLog('rx', `BT ${this.describe(k)}`);
  }

  /** Whether parameter changes go to the mixer (USB MIDI preferred, Bluetooth as fallback). */
  get canSend() {
    return this.connected || ble.connected;
  }

  describe(key: string, v = this.values[key]) {
    const [chS, cc] = key.split(':');
    const ch = Number(chS);
    if (cc === 'pc') {
      const slot = ch === 14 ? 'fx1' : 'fx2';
      return `${chanName(ch, this.names)} preset ${v} ${FX_PRESETS[slot][v - 1] ?? ''}`;
    }
    const p = params.get(key);
    return p ? `${chanName(ch, this.names)} ${p.label} = ${format(p.kind, v)}` : key;
  }

  // ---- MIDI -----------------------------------------------------------------

  async initMidi() {
    if (!('requestMIDIAccess' in navigator)) {
      this.midiError = t('This browser has no Web MIDI – use Chrome, Edge or Chromium.');
      this.addLog('err', this.midiError);
      return;
    }
    try {
      this.#access = await navigator.requestMIDIAccess({ sysex: true });
      this.sysexOk = true;
    } catch {
      try {
        this.#access = await navigator.requestMIDIAccess({ sysex: false });
        this.addLog('info', t('MIDI without SysEx – mixer state cannot be read'));
      } catch (e) {
        this.midiError = t('MIDI access was denied.');
        this.addLog('err', `${this.midiError} (${e})`);
        return;
      }
    }
    this.#access.onstatechange = () => this.refreshPorts();
    this.refreshPorts();
  }

  refreshPorts() {
    const a = this.#access;
    if (!a) return;
    const outs = [...a.outputs.values()].map((o) => ({ id: o.id, name: o.name ?? o.id }));
    this.outputs = outs;
    if (!outs.some((o) => o.id === this.outId)) {
      this.outId = (outs.find((o) => /flow/i.test(o.name)) ?? outs[0])?.id ?? '';
    }
    const out = this.outId ? a.outputs.get(this.outId) : undefined;
    const was = this.connected;
    this.connected = out?.state === 'connected';
    if (this.connected && !was) this.addLog('info', t('Connected: {0}', [out?.name]));
    if (!this.connected && was) this.addLog('err', t('MIDI output disconnected'));
    for (const inp of a.inputs.values()) {
      inp.onmidimessage = /flow/i.test(inp.name ?? '') ? (e) => this.#onMessage(e.data) : null;
    }
  }

  #out() {
    return this.outId && this.#access ? this.#access.outputs.get(this.outId) : undefined;
  }

  #raw(bytes: number[], text: string) {
    const out = this.#out();
    if (!out) {
      this.addLog('err', t('Not sent (no MIDI output): {0}', [text]));
      return;
    }
    try {
      out.send(bytes);
      this.txBlink++;
      this.addLog('tx', text);
    } catch (e) {
      this.addLog('err', t('Send error: {0}', [e]));
    }
  }

  #pcByte(n: number) {
    return this.settings.pcZeroBased ? n - 1 : n;
  }

  #sendParam(key: string) {
    const [chS, cc] = key.split(':');
    const ch = Number(chS);
    const v = this.values[key];
    if (!this.connected && ble.connected) {
      const msgs = encode(key, v, this.values);
      if (!msgs.length) {
        this.addLog('err', t('Not possible over Bluetooth (USB MIDI only): {0}', [this.describe(key)]));
        return;
      }
      for (const m of msgs) ble.write(m);
      this.txBlink++;
      this.addLog('tx', `BT ${this.describe(key)}`);
      return;
    }
    if (cc === 'pc') this.#raw([0xc0 | (ch - 1), this.#pcByte(v) & 0x7f], this.describe(key));
    else this.#raw([0xb0 | (ch - 1), Number(cc), v & 0x7f], this.describe(key));
  }

  #onMessage(data: Uint8Array | null) {
    if (!data || data.length === 0) return;
    const st = data[0];
    if (st >= 0xf8) return; // clock / active sensing
    if (st === 0xf0) {
      if (isFlowDump(data)) {
        this.rxBlink++;
        this.#applyRemote(decodeSysexDump(data), true);
      }
      return;
    }
    const type = st & 0xf0;
    const ch = (st & 0x0f) + 1;
    this.rxBlink++;
    if (type === 0xb0) {
      const k = `${ch}:${data[1]}`;
      if (params.has(k)) {
        this.set(k, data[2], false);
        this.addLog('rx', this.describe(k));
        return;
      }
    } else if (type === 0xc0) {
      const n = this.settings.pcZeroBased ? data[1] + 1 : data[1];
      if (ch === 14 || ch === 15) {
        const k = ch === 14 ? PRESET_KEYS.fx1 : PRESET_KEYS.fx2;
        this.set(k, n, false);
        this.addLog('rx', this.describe(k));
        return;
      }
      if (ch === GLOBAL_CH) {
        this.lastSnapshot = n;
        this.addLog('rx', `Snapshot ${n}`);
        return;
      }
    }
    this.addLog('rx', [...data].map((b) => b.toString(16).padStart(2, '0')).join(' '));
  }

  addLog(dir: LogEntry['dir'], text: string) {
    const next = [...this.log, { id: ++this.#logId, dir, text }];
    this.log = next.length > 300 ? next.slice(-300) : next;
  }

  // ---- global actions -------------------------------------------------------

  /** Ask the mixer for its state (Bluetooth trigger; the dump arrives over USB SysEx). */
  syncFromMixer(manual = true) {
    if (!ble.connected) {
      if (manual) this.notify(t('To load from the app connect Bluetooth – or press Snapshots › MIDI Dump on the mixer.'));
      return;
    }
    if (!this.connected || !this.sysexOk) {
      if (manual) this.notify(t('The mixer state arrives over USB – connect the cable and allow MIDI SysEx.'));
      return;
    }
    this.#manualSync = manual;
    ble.requestState();
  }

  setRouting(id: number, v: number) {
    this.routing[id] = v;
    writeJSON('flow8.routing.v1', this.routing);
    ble.setSetting(id, v);
  }

  renameSnapshot(n: number, name: string) {
    if (name) this.snapNames[n] = name;
    else delete this.snapNames[n];
    writeJSON('flow8.snapnames.v1', this.snapNames);
  }

  loadSnapshot(n: number) {
    if (!this.connected && ble.connected) {
      ble.write(snapshotLoad(n));
      this.addLog('tx', `BT Snapshot ${n === 16 ? 'RESET' : n}`);
    } else this.#raw([0xc0 | (GLOBAL_CH - 1), this.#pcByte(n) & 0x7f], n === 16 ? 'Snapshot RESET' : `Snapshot ${n}`);
    this.lastSnapshot = n;
    if (ble.connected && this.sysexOk) {
      setTimeout(() => this.syncFromMixer(false), 700);
      return;
    }
    this.notify(
      n === 16
        ? t('Mixer reset. The app state may no longer match.')
        : t('Snapshot {0} loaded on the mixer – connect Bluetooth so the app can sync itself.', [n]),
    );
  }

  tap() {
    const viaBt = !this.connected && ble.connected;
    if (!viaBt) {
      const note = this.settings.tapNote & 0x7f;
      const ch = GLOBAL_CH - 1;
      this.#raw([0x90 | ch, note, 100], 'TAP');
      setTimeout(() => this.#out()?.send([0x80 | ch, note, 0]), 30);
    }
    const now = performance.now();
    this.#taps = [...this.#taps.filter((t) => now - t < 2500), now].slice(-5);
    if (this.#taps.length >= 2) {
      const iv = this.#taps.slice(1).map((t, i) => t - this.#taps[i]);
      const avg = iv.reduce((a, b) => a + b, 0) / iv.length;
      this.bpm = Math.max(50, Math.min(250, Math.round(60000 / avg)));
      // over Bluetooth the mixer takes the tempo itself, not individual taps
      if (viaBt) {
        ble.write(fxTempo(this.bpm));
        this.addLog('tx', `BT FX tempo ${this.bpm} BPM`);
      }
    }
  }

  async sendAll() {
    if (this.sending) return;
    const keys = [...params.values()].filter((p) => !p.noBulk).map((p) => p.key);
    keys.push(PRESET_KEYS.fx1, PRESET_KEYS.fx2);
    for (let i = 0; i < keys.length; i++) {
      this.#sendParam(keys[i]);
      this.sending = (i + 1) / keys.length;
      await sleep(this.connected ? 3 : 25);
    }
    this.sending = 0;
    this.notify(t('Sent {0} parameters (48 V skipped).', [keys.length]));
  }

  // ---- scenes -----------------------------------------------------------------

  saveScene(name: string) {
    const all = readJSON<Record<string, Saved>>(SCENES_KEY) ?? {};
    all[name] = this.snapshot();
    writeJSON(SCENES_KEY, all);
    this.scenes = Object.keys(all).sort();
    this.notify(t('Scene “{0}” saved.', [name]));
  }

  async loadScene(name: string) {
    const s = (readJSON<Record<string, Saved>>(SCENES_KEY) ?? {})[name];
    if (!s) return;
    this.#apply(s, true);
    this.persist();
    this.#applyRouting(s.routing);
    await this.sendAll();
  }

  deleteScene(name: string) {
    const all = readJSON<Record<string, Saved>>(SCENES_KEY) ?? {};
    delete all[name];
    writeJSON(SCENES_KEY, all);
    this.scenes = Object.keys(all).sort();
  }

  async importState(json: string) {
    const s = JSON.parse(json) as Saved;
    if (!s || typeof s !== 'object' || !s.values) throw new Error(t('Invalid file'));
    this.#apply(s, true);
    this.persist();
    this.#applyRouting(s.routing);
    await this.sendAll();
  }
}

export const mixer = new Mixer();
