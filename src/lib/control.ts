import { mixer } from './mixer.svelte';
import { params } from './midi-map';

export interface ControlOpts {
  pkey: string;
  /** pixels of vertical drag for the full range */
  px: number;
  onDrag?: (active: boolean) => void;
  /** map a pointer event to an absolute value (e.g. click on a fader slot); null = relative drag */
  absolute?: (e: PointerEvent) => number | null;
  /** non-linear value <-> position mapping (0..1) for faders */
  taper?: { fwd: (v: number) => number; inv: (p: number) => number };
}

/** Svelte action: drag / wheel / keyboard / double-click handling for a continuous control. */
export function control(node: HTMLElement, opts: ControlOpts) {
  let o = opts;
  let down = false;
  let acc = 0;
  let lastY = 0;
  let scale = 1; // CSS zoom of the console: client px per layout px

  const range = () => {
    const p = params.get(o.pkey);
    return o.pkey.endsWith(':pc') ? 15 : (p?.max ?? 127);
  };
  const cur = () => mixer.values[o.pkey];
  const def = () => params.get(o.pkey)?.def ?? 0;

  function pointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    node.focus();
    node.setPointerCapture(e.pointerId);
    down = true;
    scale = node.offsetHeight ? node.getBoundingClientRect().height / node.offsetHeight || 1 : 1;
    o.onDrag?.(true);
    const abs = o.absolute?.(e);
    if (abs != null) mixer.set(o.pkey, abs);
    acc = o.taper ? o.taper.fwd(cur()) : cur();
    lastY = e.clientY;
  }
  function pointermove(e: PointerEvent) {
    if (!down) return;
    const fine = e.shiftKey ? 0.15 : 1;
    if (o.taper) {
      acc = Math.max(0, Math.min(1, acc + ((lastY - e.clientY) / scale / o.px) * fine));
      lastY = e.clientY;
      mixer.set(o.pkey, o.taper.inv(acc));
      return;
    }
    acc += ((lastY - e.clientY) / scale / o.px) * range() * fine;
    acc = Math.max(0, Math.min(range(), acc));
    lastY = e.clientY;
    mixer.set(o.pkey, acc);
  }
  function pointerup(e: PointerEvent) {
    if (!down) return;
    down = false;
    if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    o.onDrag?.(false);
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const step = e.shiftKey ? 1 : Math.max(1, Math.round(range() / 50));
    mixer.set(o.pkey, cur() + (e.deltaY < 0 ? step : -step));
  }
  function dblclick() {
    mixer.set(o.pkey, def());
  }
  function keydown(e: KeyboardEvent) {
    const big = Math.max(1, Math.round(range() / 10));
    const map: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: big, PageDown: -big };
    if (e.key in map) {
      e.preventDefault();
      mixer.set(o.pkey, cur() + map[e.key]);
    } else if (e.key === 'Home' || e.key === 'Delete') {
      e.preventDefault();
      dblclick();
    }
  }

  node.addEventListener('pointerdown', pointerdown);
  node.addEventListener('pointermove', pointermove);
  node.addEventListener('pointerup', pointerup);
  node.addEventListener('pointercancel', pointerup);
  node.addEventListener('wheel', wheel, { passive: false });
  node.addEventListener('dblclick', dblclick);
  node.addEventListener('keydown', keydown);

  return {
    update(n: ControlOpts) {
      o = n;
    },
    destroy() {
      node.removeEventListener('pointerdown', pointerdown);
      node.removeEventListener('pointermove', pointermove);
      node.removeEventListener('pointerup', pointerup);
      node.removeEventListener('pointercancel', pointerup);
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('dblclick', dblclick);
      node.removeEventListener('keydown', keydown);
    },
  };
}
