<script lang="ts">
  import { t } from './i18n.svelte';
  // Illustrative frequency-response display (RBJ biquads evaluated analytically).
  // FLOW 8 band frequencies are not published in the MIDI spec, so these are approximations.
  import { mixer } from './mixer.svelte';
  import { eqDb, lowcutHz } from './midi-map';

  type Band = { type: 'peak' | 'lowshelf' | 'highshelf' | 'hpf'; f: number; q: number; key: string; color?: string };

  interface Props {
    bands: Band[];
    width?: number;
    height?: number;
    color?: string;
  }
  let { bands, width = 104, height = 46 }: Props = $props();

  const FS = 48000;
  const RANGE = 18; // ±dB shown

  let canvas: HTMLCanvasElement | undefined = $state();
  let shown: number[] = [];
  let active = $state(-1);
  let hover = $state(-1);

  // geometry shared by drawing and hit-testing
  const xOfF = (f: number) => (Math.log10(f / 20) / 3) * width;
  const fOfX = (x: number) => 20 * Math.pow(1000, Math.max(0, Math.min(width, x)) / width);
  const yOfDb = (db: number) => height / 2 - (db / RANGE) * (height / 2 - 2);
  const dbOfY = (y: number) => ((height / 2 - y) / (height / 2 - 2)) * RANGE;
  function handlePos(i: number, vals = shown): [number, number] {
    const b = bands[i];
    if (b.type === 'hpf') return [Math.max(5, xOfF(vals[i] > 0 ? vals[i] : 20)), height - 7];
    return [xOfF(b.f), yOfDb(vals[i] ?? 0)];
  }
  const dbToV = (db: number) => Math.round(64 + (db / 15) * (db < 0 ? 64 : 63));
  const hzToV = (f: number) => (f <= 21 ? 0 : Math.round((127 * Math.log(f / 20)) / Math.log(30)));

  function coeffs(b: Band, g: number) {
    const w0 = (2 * Math.PI * b.f) / FS;
    const cos = Math.cos(w0), sin = Math.sin(w0);
    if (b.type === 'hpf') {
      const al = sin / (2 * b.q);
      return [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + al, -2 * cos, 1 - al];
    }
    const A = Math.pow(10, g / 40);
    if (b.type === 'peak') {
      const al = sin / (2 * b.q);
      return [1 + al * A, -2 * cos, 1 - al * A, 1 + al / A, -2 * cos, 1 - al / A];
    }
    const al = (sin / 2) * Math.SQRT2;
    const sa = 2 * Math.sqrt(A) * al;
    if (b.type === 'lowshelf')
      return [
        A * (A + 1 - (A - 1) * cos + sa), 2 * A * (A - 1 - (A + 1) * cos), A * (A + 1 - (A - 1) * cos - sa),
        A + 1 + (A - 1) * cos + sa, -2 * (A - 1 + (A + 1) * cos), A + 1 + (A - 1) * cos - sa,
      ];
    return [
      A * (A + 1 + (A - 1) * cos + sa), -2 * A * (A - 1 + (A + 1) * cos), A * (A + 1 + (A - 1) * cos - sa),
      A + 1 - (A - 1) * cos + sa, 2 * (A - 1 - (A + 1) * cos), A + 1 - (A - 1) * cos - sa,
    ];
  }
  function magDb(c: number[], f: number) {
    const w = (2 * Math.PI * f) / FS;
    const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = c[0] + c[1] * c1 + c[2] * c2, ni = -(c[1] * s1 + c[2] * s2);
    const dr = c[3] + c[4] * c1 + c[5] * c2, di = -(c[4] * s1 + c[5] * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }

  const targets = $derived(
    bands.map((b) => {
      const v = mixer.values[b.key];
      return b.type === 'hpf' ? (v === 0 ? 0 : lowcutHz(v)) : eqDb(v);
    }),
  );

  function draw(vals: number[]) {
    const cv = canvas;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== width * dpr) {
      cv.width = width * dpr;
      cv.height = height * dpr;
    }
    const ctx = cv.getContext('2d')!;
    const css = getComputedStyle(cv);
    const line = css.getPropertyValue('--curve').trim() || '#7fd';
    const grid = css.getPropertyValue('--curve-grid').trim() || 'rgba(255,255,255,.08)';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const fx = (x: number) => 20 * Math.pow(1000, x / width); // 20 Hz .. 20 kHz
    const yOf = (db: number) => height / 2 - (db / RANGE) * (height / 2 - 2);

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (const f of [100, 1000, 10000]) {
      const x = (Math.log10(f / 20) / 3) * width;
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, height); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, height / 2 + 0.5); ctx.lineTo(width, height / 2 + 0.5); ctx.stroke();

    const cs = bands
      .map((b, i) => (b.type === 'hpf' ? (vals[i] > 0 ? coeffs({ ...b, f: vals[i] }, 0) : null) : coeffs(b, vals[i])))
      .filter((c): c is number[] => c !== null);

    ctx.beginPath();
    for (let x = 0; x <= width; x++) {
      const f = fx(x);
      let db = 0;
      for (const c of cs) db += magDb(c, f);
      const yy = Math.max(-2, Math.min(height + 2, yOf(db)));
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = line;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineTo(width, height / 2);
    ctx.lineTo(0, height / 2);
    ctx.closePath();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = line;
    ctx.fill();
    ctx.globalAlpha = 1;

    bands.forEach((b, i) => {
      const [hx, hy] = handlePos(i, vals);
      const hot = i === active || i === hover;
      ctx.beginPath();
      ctx.arc(hx, hy, hot ? 5 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = b.color ?? line;
      ctx.shadowColor = b.color ?? line;
      ctx.shadowBlur = hot ? 10 : 4;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.stroke();
    });
  }

  // ---- direct manipulation -------------------------------------------------
  function local(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = canvas!.getBoundingClientRect();
    const scale = r.width / width || 1; // CSS zoom of the console
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  }
  function pick(x: number, y: number) {
    let best = -1, bd = Infinity;
    bands.forEach((_, i) => {
      const [hx, hy] = handlePos(i);
      const d = Math.hypot(hx - x, (hy - y) * 0.5);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function apply(i: number, x: number, y: number) {
    const b = bands[i];
    if (b.type === 'hpf') mixer.set(b.key, hzToV(fOfX(x)));
    else mixer.set(b.key, dbToV(Math.max(-15, Math.min(15, dbOfY(y)))));
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    canvas!.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    active = pick(x, y);
    apply(active, x, y);
  }
  function move(e: PointerEvent) {
    const [x, y] = local(e);
    if (active >= 0) apply(active, x, y);
    else hover = pick(x, y);
    requestAnimationFrame(() => draw(shown));
  }
  function up() {
    active = -1;
    requestAnimationFrame(() => draw(shown));
  }
  function leave() {
    if (active < 0) hover = -1;
    requestAnimationFrame(() => draw(shown));
  }
  function dbl(e: MouseEvent) {
    const [x, y] = local(e);
    const b = bands[pick(x, y)];
    mixer.set(b.key, b.type === 'hpf' ? 0 : 64);
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const [x, y] = local(e);
    const b = bands[pick(x, y)];
    mixer.set(b.key, mixer.values[b.key] + (e.deltaY < 0 ? 2 : -2));
  }

  // animate the curve toward its target values
  $effect(() => {
    const t = targets;
    if (shown.length !== t.length) shown = [...t];
    let raf = 0;
    const step = () => {
      let moving = false;
      shown = shown.map((s, i) => {
        const d = t[i] - s;
        if (Math.abs(d) < 0.02 * (bands[i].type === 'hpf' ? 50 : 1)) return t[i];
        moving = true;
        return s + d * 0.22;
      });
      draw(shown);
      if (moving) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  });

  // wheel needs a non-passive listener to stop page scroll
  $effect(() => {
    const cv = canvas;
    if (!cv) return;
    cv.addEventListener('wheel', wheel, { passive: false });
    return () => cv.removeEventListener('wheel', wheel);
  });

  // redraw on theme change
  $effect(() => {
    void mixer.settings.theme;
    requestAnimationFrame(() => draw(shown));
  });
</script>

<canvas
  bind:this={canvas}
  style="width:{width}px;height:{height}px"
  class:grab={active >= 0}
  title={t('Drag the curve points (Low Cut horizontally), wheel = fine, double-click = reset')}
  aria-hidden="true"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onpointerleave={leave}
  ondblclick={dbl}
></canvas>

<style>
  canvas {
    display: block;
    margin: 0 auto;
    background: var(--screen);
    border-radius: 4px;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255, 255, 255, 0.06);
    cursor: crosshair;
    touch-action: none;
  }
  canvas.grab { cursor: grabbing; }
</style>
