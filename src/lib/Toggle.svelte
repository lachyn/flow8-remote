<script lang="ts">
  import { t } from './i18n.svelte';
  import { mixer } from './mixer.svelte';
  import { dialogs } from './dialog.svelte';

  interface Props {
    pkey: string;
    label: string;
    /** mute | solo | p48 | ab | fxmute */
    kind: string;
    confirmOn?: string;
    onLabel?: string;
  }
  let { pkey, label, kind, confirmOn, onLabel }: Props = $props();

  const on = $derived(mixer.values[pkey] > 0);

  async function click() {
    if (!on && confirmOn && !(await dialogs.confirm({ title: 'Phantom 48 V', message: confirmOn, ok: t('Turn on'), danger: true }))) return;
    mixer.set(pkey, on ? 0 : 127);
  }
</script>

<button type="button" class="tg {kind}" class:on aria-pressed={on} onclick={click}>
  <span class="led" aria-hidden="true"></span>
  <span class="txt">{on && onLabel ? onLabel : label}</span>
</button>

<style>
  .tg {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 100%;
    padding: 5px 4px 4px;
    font: 700 10px/1 var(--label-font);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--btn-text);
    background: var(--btn);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12);
    cursor: pointer;
    transition: transform 0.06s ease, box-shadow 0.06s ease, background 0.2s ease, color 0.2s ease;
  }
  .tg:active {
    transform: translateY(2px);
    box-shadow: 0 0 0 rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
  .tg:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--led-off);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.6);
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }
  .tg.on .led {
    background: var(--led);
    box-shadow: 0 0 6px 1px var(--led), 0 0 12px var(--led);
  }
  .mute { --led: var(--mute); }
  .solo { --led: var(--solo); }
  .p48 { --led: var(--p48); }
  .ab { --led: var(--accent); }
  .fxmute { --led: var(--mute); }
  .tg.on.mute,
  .tg.on.fxmute,
  .tg.on.solo,
  .tg.on.p48,
  .tg.on.ab {
    background: linear-gradient(color-mix(in srgb, var(--led) 92%, #fff), color-mix(in srgb, var(--led) 78%, #000));
    color: var(--on-text, #fff);
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.45), 0 0 14px -2px var(--led), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .tg.on.solo, .tg.on.p48 { --on-text: #1a1200; }
  .tg.on .led { background: #fff; box-shadow: 0 0 6px 2px rgba(255, 255, 255, 0.8); }
  .tg.on.solo .led { animation: pulse 0.9s ease-in-out infinite; }
  @keyframes pulse {
    50% { box-shadow: 0 0 2px var(--led); opacity: 0.6; }
  }
</style>
