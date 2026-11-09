<script lang="ts">
  import { t } from './i18n.svelte';
  import Knob from './Knob.svelte';
  import Fader from './Fader.svelte';
  import Toggle from './Toggle.svelte';
  import EqCurve from './EqCurve.svelte';
  import Scribble from './Scribble.svelte';
  import EqPresets from './EqPresets.svelte';
  import { ui } from './ui.svelte';
  import { mixer } from './mixer.svelte';
  import { format, type InputDef } from './midi-map';

  let { def }: { def: InputDef } = $props();
  const k = (cc: number) => `${def.ch}:${cc}`;

  const bands = $derived([
    ...(def.pre ? [{ type: 'hpf' as const, f: 20, q: 0.707, key: k(9), color: '#cfd6dd' }] : []),
    { type: 'lowshelf' as const, f: 100, q: 0.7, key: k(1), color: '#c48bff' },
    { type: 'peak' as const, f: 500, q: 1.0, key: k(2), color: '#4f9dff' },
    { type: 'peak' as const, f: 2500, q: 1.0, key: k(3), color: '#4ee08a' },
    { type: 'highshelf' as const, f: 10000, q: 0.7, key: k(4), color: '#ff5a5a' },
  ]);

  const muted = $derived(mixer.values[k(5)] > 0);
  const soloed = $derived(mixer.values[k(6)] > 0);
  const dimmed = $derived(muted || (mixer.anySolo && !soloed));
</script>

<section class="strip" class:dimmed class:soloed aria-label={mixer.names[def.id] || def.name}>
  <Scribble id={def.id} name={def.name} color={def.color} sub="MIDI {def.ch}{def.stereo ? ' · ST' : ''}" />

  <div class="p48row">
    {#if def.phantom}
      <Toggle
        pkey={k(12)}
        label="48V"
        kind="p48"
        confirmOn={mixer.settings.confirm48 ? t('Turn on 48 V phantom power on {0}?', [def.name]) : undefined}
      />
    {/if}
  </div>

  <div class="sect">
    <div class="st">Input</div>
    <div class="grid2" class:row3={ui.compact}>
      {#if def.pre}
        <Knob pkey={k(8)} label="Gain" role="gain" size={ui.compact ? 'sm' : 'md'} />
        <Knob pkey={k(9)} label="Lo Cut" role="pan" size={ui.compact ? 'sm' : 'md'} />
        <Knob pkey={k(11)} label="Comp" role="dyn" size={ui.compact ? 'sm' : 'md'} />
      {:else}
        <div class="na">—</div>
      {/if}
    </div>
  </div>

  <div class="sect">
    <div class="st">EQ</div>
    <EqCurve {bands} height={ui.compact ? 84 : 58} />
    <EqPresets kind="channel" keys={[k(1), k(2), k(3), k(4)]} lowcutKey={def.pre ? k(9) : undefined} />
    {#if !ui.compact}
      <div class="grid2 eq">
        <Knob pkey={k(4)} label="Hi" role="hf" />
        <Knob pkey={k(3)} label="Hi Mid" role="hmf" />
        <Knob pkey={k(2)} label="Lo Mid" role="lmf" />
        <Knob pkey={k(1)} label="Low" role="lf" />
      </div>
    {/if}
  </div>

  <div class="sect">
    <div class="st">Sends</div>
    <div class="grid2 sends">
      <Knob pkey={k(14)} label="Mon 1" role="aux" size="sm" />
      <Knob pkey={k(15)} label="Mon 2" role="aux" size="sm" />
      <Knob pkey={k(16)} label="FX 1" role="fx" size="sm" />
      <Knob pkey={k(17)} label="FX 2" role="fx" size="sm" />
    </div>
  </div>

  <div class="bottom">
    <Knob pkey={k(10)} label={def.stereo ? 'Bal' : 'Pan'} role="pan" size="sm" />
    <div class="btns">
      <Toggle pkey={k(6)} label="Solo" kind="solo" />
      <Toggle pkey={k(5)} label="Mute" kind="mute" />
    </div>
    <Fader pkey={k(7)} label="{def.name} level" height={ui.compact ? 210 : 250} />
    <div class="readout" class:off={mixer.values[k(7)] === 0}>
      {format('level', mixer.values[k(7)])}
    </div>
  </div>
</section>

<style>
  .strip {
    flex: none;
    width: 124px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 6px 8px;
    background: var(--strip);
    border-radius: 6px;
    box-shadow: var(--strip-shadow);
    position: relative;
    transition: filter 0.3s ease, opacity 0.3s ease;
  }
  .strip.dimmed { filter: saturate(0.55) brightness(0.82); }
  .strip.soloed { box-shadow: var(--strip-shadow), 0 0 0 1px var(--solo), 0 0 16px -4px var(--solo); }
  .p48row { min-height: 23px; }
  .sect {
    border-top: 1px solid var(--line);
    padding-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .st {
    font: 700 8px/1 var(--label-font);
    color: var(--label);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    text-align: center;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    justify-items: center;
    gap: 1px 0;
    min-height: 140px;
    align-content: start;
  }
  .grid2.row3 { grid-template-columns: repeat(3, 1fr); min-height: 0; }
  .grid2.eq,
  .grid2.sends { min-height: 0; }
  .na { grid-column: 1 / -1; color: var(--label); align-self: center; margin-top: 50px; }
  .bottom {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    border-top: 1px solid var(--line);
    padding-top: 5px;
  }
  .btns { display: flex; gap: 4px; width: 100%; }
  .readout {
    width: 100%;
    text-align: center;
    font: 12px/1 var(--mono);
    color: var(--lcd-text);
    background: var(--lcd);
    padding: 4px 0;
    border-radius: 3px;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
    text-shadow: 0 0 6px var(--lcd-text);
  }
  .readout.off { color: var(--label); text-shadow: none; }
</style>
