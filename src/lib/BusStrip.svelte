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
  import { EQ9, FX_PRESETS, FX_PARAMS, PRESET_KEYS, GLOBAL_CH, format, type BusDef } from './midi-map';

  let { def }: { def: BusDef } = $props();
  const k = (cc: number) => `${def.ch}:${cc}`;
  const isFx = $derived(!!def.slot);
  const fxId = $derived(def.id as 'fx1' | 'fx2');

  const FREQS = [62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const bands = $derived(EQ9.map((e, i) => ({ type: 'peak' as const, f: FREQS[i], q: 1.4, key: k(e.cc) })));

  let tapFlash = $state(0);
  function tap() {
    mixer.tap();
    tapFlash++;
  }
  const presetKey = $derived(isFx ? PRESET_KEYS[fxId] : '');
  // parameter names of the selected preset
  const fxp = $derived(isFx ? (FX_PARAMS[fxId][mixer.values[presetKey] - 1] ?? ['Param 1', 'Param A', 'Param B']) : ['', '', '']);
  const color = $derived(def.id === 'main' ? '#e6e9ec' : isFx ? '#3ec9cf' : '#f5a524');
</script>

<section class="strip bus" class:compact={ui.compact} class:main={def.id === 'main'} class:fx={isFx} aria-label={def.name}>
  <Scribble id={def.id} name={def.name} {color} sub="BUS · MIDI {def.ch}" editable={false} />

  {#if isFx}
    <div class="sect">
      <div class="st">Effect</div>
      <div class="lcd">
        <span class="num">{String(mixer.values[presetKey]).padStart(2, '0')}</span>
        <select
          value={mixer.values[presetKey]}
          onchange={(e) => mixer.set(presetKey, Number((e.currentTarget as HTMLSelectElement).value))}
          aria-label="{def.name} preset"
        >
          {#each FX_PRESETS[fxId] as name, i (i)}
            <option value={i + 1}>{name}</option>
          {/each}
        </select>
      </div>
      <div class="steppers">
        <button type="button" onclick={() => mixer.set(presetKey, mixer.values[presetKey] - 1)} aria-label={t('Previous preset')}>◀</button>
        <button type="button" onclick={() => mixer.set(presetKey, mixer.values[presetKey] + 1)} aria-label={t('Next preset')}>▶</button>
      </div>
      <div class="center">
        <Knob pkey="{def.slot}:1" label={fxp[0]} role="param" size="lg" />
      </div>
      <Toggle pkey="{def.slot}:2" label={fxp[1]} onLabel={fxp[2]} kind="ab" />
    </div>
    {#if def.id === 'fx1'}
      <div class="sect extra">
        <div class="st">FX 1 + FX 2</div>
        <div class="global" title={t('Mutes both effects (FX 1 and FX 2)')}>
          <Toggle pkey="{GLOBAL_CH}:1" label="FX Mute" kind="fxmute" />
        </div>
      </div>
    {/if}
    {#if def.id === 'fx2'}
      <div class="sect extra">
        <div class="st">Tempo</div>
        <div class="tapbox" title={t('Tap tempo for delay/echo presets 1–12')}>
          {#key tapFlash}
            <button type="button" class="tap" class:hit={tapFlash > 0} onclick={tap} title={t('Tap tempo for delay/echo (key T)')}>TAP</button>
          {/key}
          <span class="bpm" class:live={!!mixer.bpm} style={mixer.bpm ? `--beat:${60 / mixer.bpm}s` : ''}>
            {mixer.bpm ? `${mixer.bpm}` : '—'}<small>BPM</small>
          </span>
        </div>
      </div>
    {/if}
  {:else}
    <div class="sect">
      <div class="st">Dynamics</div>
      <div class="row">
        <Knob pkey={k(8)} label="Limiter" role="dyn" />
        {#if def.id === 'main'}<Knob pkey={k(10)} label="Bal" role="pan" />{/if}
      </div>
    </div>
    <div class="sect">
      <div class="st">9-band EQ</div>
      <EqCurve {bands} width={ui.compact ? 116 : 176} height={ui.compact ? 96 : 64} />
      <EqPresets kind="bus" keys={EQ9.map((e) => k(e.cc))} />
      <div class="eq9" class:hidden={ui.compact}>
        {#each EQ9 as e (e.cc)}
          <div class="col">
            <Fader pkey={k(e.cc)} mini height={190} label="{def.name} EQ {e.label} Hz" />
            <span class="f">{e.label}</span>
            <span class="v">{format('eq', mixer.values[k(e.cc)]).replace('.0', '')}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="bottom">
    <Fader pkey={k(7)} label="{def.name} level" height={ui.compact ? 210 : 250} />
    <div class="readout" class:off={mixer.values[k(7)] === 0}>{format('level', mixer.values[k(7)])}</div>
  </div>
</section>

<style>
  .strip {
    flex: none;
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 8px 8px;
    background: var(--strip-bus);
    border-radius: 6px;
    box-shadow: var(--strip-shadow);
  }
  .strip.fx { width: 132px; }
  .strip.main { background: var(--strip-main); }
  .sect {
    border-top: 1px solid var(--line);
    padding-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .st {
    font: 700 8px/1 var(--label-font);
    color: var(--label);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    text-align: center;
  }
  .row { display: flex; justify-content: center; gap: 8px; }
  .center { display: flex; justify-content: center; }
  .eq9 { display: flex; justify-content: space-between; }
  .eq9.hidden { display: none; }
  .strip.compact { width: 132px; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 19px; }
  .f { font: 600 7.5px/1 var(--label-font); color: var(--label); }
  .v { font: 7.5px/1 var(--mono); color: var(--readout); white-space: nowrap; }

  .lcd {
    position: relative;
    background: var(--lcd);
    border-radius: 4px;
    padding: 5px 6px 5px;
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.8);
  }
  .lcd .num { display: block; font: 700 20px/1 var(--mono); color: var(--lcd-text); text-shadow: 0 0 8px var(--lcd-text); }
  .lcd select {
    width: 100%;
    margin-top: 3px;
    background: transparent;
    color: var(--lcd-text);
    border: none;
    font: 11px/1.2 var(--mono);
    padding: 0;
    cursor: pointer;
    text-shadow: 0 0 6px var(--lcd-text);
  }
  .lcd select option { background: #111; color: #eee; }
  .steppers { display: flex; gap: 4px; }
  .tapbox { display: flex; gap: 4px; align-items: stretch; min-height: 38px; }
  .global { display: flex; flex-direction: column; justify-content: center; min-height: 38px; }
  .sect.extra { margin-top: 10px; border-top: 2px solid var(--line); padding-top: 6px; }
  .tap {
    flex: 1;
    font: 800 11px/1 var(--label-font);
    letter-spacing: 0.1em;
    color: var(--btn-text);
    background: var(--btn);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    padding: 8px 0;
    cursor: pointer;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
  }
  .tap:active { transform: translateY(2px); box-shadow: none; }
  .tap.hit { animation: tap 0.3s ease-out; }
  @keyframes tap { from { background: var(--accent); color: #fff; box-shadow: 0 0 14px var(--accent); } }
  .bpm {
    flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font: 700 14px/1 var(--mono);
    color: var(--label);
    background: var(--lcd);
    border-radius: 4px;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
  }
  .bpm small { font: 600 7px/1.2 var(--label-font); letter-spacing: 0.1em; }
  .bpm.live { color: var(--lcd-text); animation: beat var(--beat) ease-out infinite; }
  @keyframes beat { 0% { text-shadow: 0 0 10px var(--lcd-text); } 60%, 100% { text-shadow: none; } }
  .steppers button {
    flex: 1;
    background: var(--btn);
    color: var(--btn-text);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    padding: 3px 0;
    font-size: 10px;
    cursor: pointer;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.45);
  }
  .steppers button:active { transform: translateY(2px); box-shadow: none; }

  .bottom {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    border-top: 1px solid var(--line);
    padding-top: 5px;
  }
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
