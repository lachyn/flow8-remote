<script lang="ts">
  import { t } from './i18n.svelte';
  import { Spring } from 'svelte/motion';
  import { untrack } from 'svelte';
  import { mixer } from './mixer.svelte';
  import { params, format } from './midi-map';
  import { control } from './control';

  interface Props {
    pkey: string;
    label?: string;
    /** colour role: hf, hmf, lmf, lf, dyn, gain, aux, fx, pan, param */
    role?: string;
    size?: 'sm' | 'md' | 'lg';
  }
  let { pkey, label, role = 'gain', size = 'md' }: Props = $props();

  const p = $derived(params.get(pkey)!);
  const bipolar = $derived(p.kind === 'eq' || p.kind === 'balance');
  const value = $derived(mixer.values[pkey]);

  let dragging = $state(false);
  const anim = new Spring(untrack(() => mixer.values[pkey]), { stiffness: 0.12, damping: 0.5 });
  $effect(() => {
    anim.set(value, { instant: dragging });
  });

  const A0 = -135, A1 = 135;
  const frac = $derived(Math.max(0, Math.min(1, anim.current / p.max)));
  const angle = $derived(A0 + frac * (A1 - A0));

  function pt(a: number, r: number) {
    const rad = ((a - 90) * Math.PI) / 180;
    return [20 + r * Math.cos(rad), 20 + r * Math.sin(rad)];
  }
  function arc(a0: number, a1: number, r = 18) {
    if (Math.abs(a1 - a0) < 0.5) return '';
    const [s, e] = a0 < a1 ? [a0, a1] : [a1, a0];
    const [x0, y0] = pt(s, r);
    const [x1, y1] = pt(e, r);
    return `M${x0} ${y0} A${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  }
  const valuePath = $derived(arc(bipolar ? 0 : A0, angle));
  const ticks = Array.from({ length: 11 }, (_, i) => A0 + (i * (A1 - A0)) / 10);
</script>

<div
  class="knob {size}"
  class:dragging
  style="--c: var(--cap-{role}); --r: var(--ring-{role}, var(--cap-{role}))"
  role="slider"
  tabindex="0"
  aria-label={label ?? p.label}
  aria-valuemin={0}
  aria-valuemax={p.max}
  aria-valuenow={value}
  aria-valuetext={format(p.kind, value)}
  title="{label ?? p.label}: {format(p.kind, value)} — {t('drag / wheel, Shift = fine, double-click = default')}"
  use:control={{ pkey, px: 160, onDrag: (d) => (dragging = d) }}
>
  <svg viewBox="0 0 40 40" aria-hidden="true">
    {#each ticks as t, i (i)}
      {@const [x0, y0] = pt(t, 19.5)}
      {@const [x1, y1] = pt(t, 17.5)}
      <line class="tick" x1={x0} y1={y0} x2={x1} y2={y1} />
    {/each}
    <path class="ring-trk" d={arc(A0, A1)} />
    {#if valuePath}<path class="ring" d={valuePath} />{/if}
    <circle class="skirt" cx="20" cy="20" r="14.5" />
    <g transform="rotate({angle} 20 20)">
      <circle class="cap" cx="20" cy="20" r="11.5" />
      <circle class="shine" cx="20" cy="20" r="11.5" />
      <line class="ptr" x1="20" y1="19" x2="20" y2="9.5" />
    </g>
  </svg>
  <span class="klabel">{label ?? p.label}</span>
  <span class="kval">{format(p.kind, value)}</span>
</div>

<style>
  .knob {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 52px;
    cursor: ns-resize;
    touch-action: none;
    border-radius: 6px;
    padding: 2px 0 1px;
    outline: none;
  }
  .knob:focus-visible {
    box-shadow: 0 0 0 2px var(--focus);
  }
  svg {
    width: 40px;
    height: 40px;
    overflow: visible;
    transition: transform 0.12s ease;
  }
  .knob.sm { width: 38px; }
  .knob.sm svg { width: 32px; height: 32px; }
  .knob.lg svg { width: 48px; height: 48px; }
  .knob.dragging svg { transform: scale(1.08); }

  .tick { stroke: var(--tick); stroke-width: 1; }
  .ring-trk { fill: none; stroke: var(--ring-track); stroke-width: 2.2; stroke-linecap: round; opacity: var(--ring-opacity); }
  .ring {
    fill: none;
    stroke: var(--r);
    stroke-width: 2.2;
    stroke-linecap: round;
    opacity: var(--ring-opacity);
    filter: var(--ring-glow);
  }
  .skirt { fill: var(--skirt); stroke: rgba(0, 0, 0, 0.55); stroke-width: 1; }
  .cap { fill: var(--c); stroke: rgba(0, 0, 0, 0.45); stroke-width: 0.8; }
  .shine { fill: url(#knob-shine); pointer-events: none; }
  .ptr { stroke: var(--pointer); stroke-width: 2; stroke-linecap: round; }

  .klabel {
    font: 600 8.5px/1.1 var(--label-font);
    color: var(--label);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
    margin-top: 1px;
  }
  .kval {
    font: 10px/1.2 var(--mono);
    color: var(--readout);
    white-space: nowrap;
    min-height: 12px;
  }
</style>
