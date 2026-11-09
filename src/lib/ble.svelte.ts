import { t } from './i18n.svelte';
// Web Bluetooth transport for the FLOW 8 (proprietary BLE protocol, see docs/ble-protocol.md).
import { BLE_CHAR, BLE_SERVICE, frame, decode, decodeDump, decodeSnapshotNames } from './ble-codec';

export type BleStatus = 'unsupported' | 'off' | 'connecting' | 'pairing' | 'connected';

const ID_KEY = 'flow8.ble.clientId';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Web Bluetooth promises can hang forever on some systems – give every step a deadline. */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what}: timeout ${ms} ms`)), ms))]);
}
const hex = (d: Uint8Array) => [...d].map((b) => b.toString(16).padStart(2, '0')).join(' ');

function clientId(): Uint8Array {
  try {
    const s = localStorage.getItem(ID_KEY);
    if (s && /^[0-9a-f]{32}$/.test(s)) return new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));
  } catch {
    /* storage unavailable */
  }
  const id = crypto.getRandomValues(new Uint8Array(16));
  try {
    localStorage.setItem(ID_KEY, [...id].map((b) => b.toString(16).padStart(2, '0')).join(''));
  } catch {
    /* storage unavailable */
  }
  return id;
}

export interface BleHandlers {
  params: (pairs: [string, number][], fromDump: boolean) => void;
  log: (dir: 'tx' | 'rx' | 'info' | 'err', text: string) => void;
  connected?: () => void;
}

class Ble {
  status = $state<BleStatus>(typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'off' : 'unsupported');
  deviceName = $state('');
  snapshotNames = $state<string[]>([]);
  rxBlink = $state(0);
  /** whether BT notifications are available (not in desktop Chrome – the mixer lacks a CCCD) */
  notify = $state(false);
  /** latest raw metering packet (0x22), decoded later */
  meterRaw = $state<number[]>([]);

  handlers: BleHandlers | null = null;

  #dev: BluetoothDevice | null = null;
  #char: BluetoothRemoteGATTCharacteristic | null = null;
  #queue: Promise<unknown> = Promise.resolve();
  #chunks = new Map<number, Uint8Array>();
  #userClosed = false;
  #listener = (e: Event) => {
    const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
    if (v) this.#onNotify(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  };

  get connected() {
    return this.status === 'connected';
  }

  async connect() {
    if (this.status === 'unsupported') return;
    try {
      this.#dev = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'FLOW 8' }],
        optionalServices: [BLE_SERVICE],
      });
    } catch {
      return; // user cancelled the chooser
    }
    this.#userClosed = false;
    this.deviceName = this.#dev.name ?? 'FLOW 8';
    this.#dev.addEventListener('gattserverdisconnected', () => this.#onDisconnect());
    await this.#open();
  }

  disconnect() {
    this.#userClosed = true;
    this.#dev?.gatt?.disconnect();
    this.status = 'off';
  }

  /** Global mixer setting (0x25): id 0x09 = CH 5/6 ← USB 1/2, 0x0a = CH 7/8 ← USB 3/4. */
  setSetting(id: number, value: number) {
    if (this.connected) this.write(frame(0x25, 0x01, id, 0x01, value & 0xff));
  }

  /** Ask the mixer for its complete state (0x38 dump). */
  requestState() {
    // 0x4B: full dump, sent as SysEx over USB MIDI (and over BT when notifications work)
    if (this.connected) this.write(frame(0x4b, 0x01));
  }

  write(bytes: Uint8Array) {
    const c = this.#char;
    if (!c) return;
    this.#queue = this.#queue
      .then(() => c.writeValueWithResponse(bytes as BufferSource))
      .then(() => (bytes[0] === 0x4b ? undefined : this.handlers?.log('tx', `BT ${hex(bytes)}`)))
      .catch((e) => this.handlers?.log('err', t('BT write failed: {0}', [e])));
  }

  async #open() {
    const dev = this.#dev;
    if (!dev?.gatt) return;
    this.status = 'connecting';
    const hello = frame(0x39, 0x01, ...clientId());
    const deadline = Date.now() + 180_000; // time for the user to do MENU > PAIRING > PAIR APP
    while (!this.#userClosed && Date.now() < deadline) {
      let step = 'connect';
      try {
        const server = dev.gatt.connected ? dev.gatt : await within(dev.gatt.connect(), 10000, 'connect');
        step = 'service';
        const svc = await within(server.getPrimaryService(BLE_SERVICE), 8000, 'service');
        step = 'characteristic';
        const ch = await within(svc.getCharacteristic(BLE_CHAR), 5000, 'characteristic');
        ch.removeEventListener('characteristicvaluechanged', this.#listener);
        ch.addEventListener('characteristicvaluechanged', this.#listener);
        step = 'notifications';
        try {
          await within(ch.startNotifications(), 2500, 'notifications');
          this.notify = true;
        } catch {
          // FLOW 8 has no CCCD descriptor → Chrome refuses notifications; writes still work
          this.notify = false;
        }
        await sleep(600);
        step = 'hello';
        try {
          await within(ch.writeValueWithResponse(hello as BufferSource), 5000, 'hello');
        } catch (e) {
          if (this.status !== 'pairing') this.handlers?.log('info', t('BT: the mixer does not know this browser yet – waiting for PAIR APP ({0})', [e]));
          this.status = 'pairing';
          await sleep(2500);
          continue;
        }
        this.#char = ch;
        this.#queue = Promise.resolve();
        this.status = 'connected';
        this.handlers?.log('info', t('BT connected: {0}{1}', [this.deviceName, this.notify ? '' : t(' (write-only – state is read over USB)')]));
        if (this.notify) {
          this.write(frame(0x07, 0x01)); // snapshot names
          this.write(frame(0x21, 0x01, 0x08, 0x40, 0x41, 0x42, 0x43, 0xc4, 0xc5, 0xc6, 0xcf, 0, 0, 0, 0, 0, 0, 0)); // metering
        }
        this.handlers?.connected?.();
        return;
      } catch (e) {
        this.handlers?.log('err', `BT (${step}): ${e}`);
        if (step === 'connect' || step === 'service') dev.gatt.disconnect(); // start clean next round
        await sleep(2500);
      }
    }
    if (!this.connected) {
      this.status = 'off';
      this.handlers?.log('err', t('BT: connection failed (pairing timed out)'));
    }
  }

  #onDisconnect() {
    this.#char = null;
    if (this.status === 'connected') this.handlers?.log('err', t('BT disconnected'));
    if (!this.#userClosed && this.status === 'connected') {
      // try to reconnect quietly
      this.status = 'connecting';
      setTimeout(() => this.#open(), 1500);
    } else if (this.status === 'off' || this.#userClosed) {
      this.status = 'off';
    }
  }

  #onNotify(d: Uint8Array) {
    if (d.length < 3) return;
    const type = d[0];
    if (type === 0x22) {
      this.meterRaw = [...d.slice(2, -1)];
      return;
    }
    this.rxBlink++;
    if (type === 0x38) {
      this.#chunks.set(d[3], d.slice(4, -1));
      if (this.#chunks.size >= d[1]) {
        const parts = [...this.#chunks.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
        this.#chunks.clear();
        const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of parts) { all.set(p, o); o += p.length; }
        this.handlers?.log('rx', t('BT mixer state ({0} B)', [all.length]));
        this.handlers?.params(decodeDump(all), true);
      }
      return;
    }
    if (type === 0x27) {
      this.snapshotNames = decodeSnapshotNames(d);
      return;
    }
    const pairs = decode(d);
    if (pairs.length) this.handlers?.params(pairs, false);
  }
}

export const ble = new Ble();
