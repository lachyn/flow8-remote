<script lang="ts">
  import { t } from './i18n.svelte';
  import { Spring } from 'svelte/motion';
  import { untrack } from 'svelte';
  import { mixer } from './mixer.svelte';
  import { params, format, dbToLevel, levelToPos, posToLevel } from './midi-map';
  import { control } from './control';

  interface Props {
    pkey: string;
    height?: number;
    mini?: boolean;
    label?: string;
  }
  let { pkey, height = 260, mini = false, label }: Props = $props();

  const p = $derived(params.get(pkey)!);
  const value = $derived(mixer.values[pkey]);
  const bipolar = $derived(p.kind === 'eq');

  let dragging = $state(false);
  // motorised-fader feel: springy when changed from outside, instant while dragging
  const anim = new Spring(untrack(() => mixer.values[pkey]), { stiffness: 0.08, damping: 0.42 });
  $effect(() => {
    anim.set(value, { instant: dragging });
  });

  const CAP = $derived(mini ? 12 : 30);
  const travel = $derived(height - CAP);
  const isLevel = $derived(p.kind === 'level');
  const taper = { fwd: levelToPos, inv: posToLevel };
  const pos = (v: number) => (isLevel ? levelToPos(v) : v / p.max);
  const y = (v: number) => CAP / 2 + (1 - pos(v)) * travel;
  const capY = $derived(y(Math.max(0, Math.min(p.max, anim.current))));
  const zeroY = $derived(bipolar ? y(64) : y(dbToLevel(0)));

  const marks = $derived(
    isLevel
      ? [10, 5, 0, -5, -10, -20, -30, -40, -50]
          .map((db) => ({ t: db > 0 ? `+${db}` : `${db}`, y: y(dbToLevel(db)) }))
          .concat([{ t: '∞', y: y(0) }])
      : [],
  );

  let slot: HTMLDivElement | undefined = $state();
  function absolute(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('.capk') || !slot) return null;
    const r = slot.getBoundingClientRect();
    const scale = r.height / height || 1; // CSS zoom
    const rel = 1 - ((e.clientY - r.top) / scale - CAP / 2) / travel;
    return isLevel ? posToLevel(rel) : rel * p.max;
  }
</script>

<div class="fwrap" class:mini>
  {#if marks.length}
    <div class="scale" style="height:{height}px" aria-hidden="true">
      {#each marks as m (m.t)}
        <span style="top:{m.y}px" class:zero={m.t === '0'}>{m.t}</span>
      {/each}
    </div>
  {/if}
  <div
    class="fader"
    class:dragging
    bind:this={slot}
    style="height:{height}px"
    role="slider"
    tabindex="0"
    aria-label={label ?? p.label}
    aria-orientation="vertical"
    aria-valuemin={0}
    aria-valuemax={p.max}
    aria-valuenow={value}
    aria-valuetext={format(p.kind, value)}
    title="{label ?? p.label}: {format(p.kind, value)} — {t('double-click = default')}"
    use:control={{ pkey, px: travel, onDrag: (d) => (dragging = d), absolute, taper: isLevel ? taper : undefined }}
  >
    <div class="slot"></div>
    {#if !mini}
      {#each marks as m (m.t)}<div class="notch" style="top:{m.y}px"></div>{/each}
    {/if}
    {#if bipolar}
      <div class="zero" style="top:{zeroY}px"></div>
      <div class="fill" style="top:{Math.min(capY, zeroY)}px; height:{Math.abs(capY - zeroY)}px"></div>
    {:else}
      <div class="fill" style="top:{capY}px; bottom:{CAP / 2}px"></div>
    {/if}
    <div class="capk" style="top:{capY}px"></div>
  </div>
</div>

<style>
  .fwrap { display: flex; justify-content: center; gap: 3px; }
  .scale {
    position: relative;
    width: 20px;
    font: 8.5px/1 var(--mono);
    color: var(--label);
  }
  .scale span { position: absolute; right: 0; transform: translateY(-50%); }
  .scale span.zero { color: var(--text); font-weight: 700; }

  .fader {
    position: relative;
    width: 34px;
    cursor: ns-resize;
    touch-action: none;
    border-radius: 4px;
    outline: none;
  }
  .fader:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
  .slot {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 6px;
    transform: translateX(-50%);
    background: var(--slot);
    border-radius: 3px;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
  }
  .notch {
    position: absolute;
    left: 6px;
    right: 6px;
    height: 1px;
    background: var(--tick);
    opacity: 0.6;
  }
  .zero {
    position: absolute;
    left: 1px;
    right: 1px;
    height: 1px;
    background: var(--tick);
  }
  .fill {
    position: absolute;
    left: 50%;
    width: 4px;
    transform: translateX(-50%);
    background: var(--fader-fill);
    border-radius: 2px;
    box-shadow: var(--fill-glow);
  }
  .capk {
    position: absolute;
    left: 0;
    right: 0;
    height: 30px;
    transform: translateY(-50%);
    background: var(--fader-cap);
    border-radius: 3px;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  .capk::before,
  .capk::after {
    content: '';
    position: absolute;
    left: 4px;
    right: 4px;
    height: 1px;
    background: rgba(0, 0, 0, 0.25);
  }
  .capk::before { top: 6px; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.18); }
  .capk::after { top: 50%; height: 2px; margin-top: -1px; background: var(--fader-line); }
  .fader.dragging .capk {
    transform: translateY(-50%) scale(1.06);
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.7), 0 0 0 1px var(--focus);
  }

  .mini .fader { width: 18px; }
  .mini .slot { width: 4px; }
  .mini .fill { width: 3px; background: var(--cap-eq9); }
  .mini .capk { height: 12px; border-radius: 2px; }
  .mini .capk::before { display: none; }
  .mini .capk::after { left: 2px; right: 2px; height: 1px; margin-top: 0; }
</style>
