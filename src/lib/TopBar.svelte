<script lang="ts">
  import { t } from './i18n.svelte';
  import { mixer } from './mixer.svelte';
  import { ble } from './ble.svelte';
  import { dialogs } from './dialog.svelte';
  import SnapshotMenu from './SnapshotMenu.svelte';

  let { onSettings }: { onSettings: () => void } = $props();

  // LED flashes: restart the CSS animation on every message
  let txKey = $derived(mixer.txBlink);
  let rxKey = $derived(mixer.rxBlink);

  let scene = $state('');


  function btHelp() {
    const chromium = /Chrome|Chromium|Edg\//.test(navigator.userAgent);
    const linux = /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
    dialogs.confirm({
      title: t('Bluetooth is not available in this browser'),
      message: !chromium
        ? t('Web Bluetooth works only in Chrome, Edge and other Chromium-based browsers. Open the app there.')
        : linux
          ? t('On Linux, Web Bluetooth is off in Chrome. Open chrome://flags/#enable-experimental-web-platform-features, set it to Enabled and restart the browser. Bluetooth must be on in the system.')
          : t('Check that Bluetooth is on and the browser is allowed to use it.'),
      ok: t('Got it'),
      cancel: t('Close'),
    });
  }

  // how much the app knows about the real mixer state
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 2000);
    return () => clearInterval(t);
  });
  const stateKind = $derived(
    mixer.lastSync === 0 ? 'unknown' : now - mixer.lastSync < 4000 ? 'live' : 'loaded',
  );
  const lastSyncText = $derived(
    mixer.lastSync ? new Date(mixer.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
  );
  function stateClick() {
    if (ble.connected) mixer.syncFromMixer(true);
    else
      dialogs.confirm({
        title: t('Load state from the mixer'),
        message:
          t('The mixer faders are not motorised, so the app has to read the state from the mixer. Either connect Bluetooth (then it is automatic) or press Snapshots › MIDI Dump on the mixer – the app receives it over USB.'),
        ok: t('Got it'),
        cancel: t('Close'),
      });
  }
  async function pushAll() {
    const ok = await dialogs.confirm({
      title: t('Send the app state to the mixer?'),
      message:
        t('Overwrites every value on the mixer with what the app shows (except 48 V). Physical faders will not move – on first touch the value jumps to their position.'),
      ok: t('Send'),
      danger: true,
    });
    if (ok) mixer.sendAll();
  }

  async function save() {
    const name = await dialogs.prompt({ title: t('Save scene'), message: t('Saves the current mixer values, visible strips and channel sources in this browser.'), ok: t('Save'), input: { value: scene, placeholder: t('e.g. Rehearsal') } });
    if (name?.trim()) {
      mixer.saveScene(name.trim());
      scene = name.trim();
    }
  }
  async function load() {
    if (scene) await mixer.loadScene(scene);
  }
  async function del() {
    if (scene && (await dialogs.confirm({ title: t('Delete scene'), message: t('Scene “{0}” will be removed.', [scene]), ok: t('Delete'), danger: true }))) {
      mixer.deleteScene(scene);
      scene = '';
    }
  }
</script>

<header class="bar">
  <div class="brand">
    <span class="logo">FLOW<b>8</b></span>
    <span class="sub" title="Verze {__APP_VERSION__}">remote console · {__APP_VERSION__.split(' · ')[0]}</span>
  </div>

  <div class="grp midi">
    <div class="leds" title={mixer.connected ? t('MIDI connected') : mixer.midiError || t('Mixer not found')}>
      <span class="led pwr" class:on={mixer.connected}></span>
      {#key txKey}<span class="led tx" class:flash={txKey > 0}></span>{/key}
      {#key rxKey}<span class="led rx" class:flash={rxKey > 0}></span>{/key}
    </div>
    <select
      bind:value={mixer.outId}
      onchange={() => mixer.refreshPorts()}
      aria-label={t('MIDI output')}
      title={t('MIDI output')}
    >
      {#if mixer.outputs.length === 0}<option value="">{t('— no MIDI —')}</option>{/if}
      {#each mixer.outputs as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
    </select>
  </div>

  <div class="grp bt">
    {#if ble.status === 'unsupported'}
      <button type="button" class="btna" onclick={btHelp}>{t('ᛒ BT unavailable')}</button>
    {:else if ble.status === 'connected'}
      {#key ble.rxBlink}<span class="led rx" class:flash={ble.rxBlink > 0}></span>{/key}
      <button type="button" class="bton" onclick={() => mixer.syncFromMixer(true)} title={t('Load the current state from the mixer')}>{t('⇠ From mixer')}</button>

      <button type="button" onclick={() => ble.disconnect()} aria-label="Odpojit Bluetooth" title="Odpojit Bluetooth">✕</button>
    {:else}
      <button
        type="button"
        class:busy={ble.status !== 'off'}
        onclick={() => ble.connect()}
        disabled={ble.status !== 'off'}
        title={t('Bluetooth link: the app follows the mixer')}
      >
        {ble.status === 'off' ? t('ᛒ Connect BT') : ble.status === 'pairing' ? t('ᛒ Waiting for pairing…') : t('ᛒ Connecting…')}
      </button>
    {/if}
  </div>

  <button
    type="button"
    class="state"
    class:ok={stateKind !== 'unknown'}
    class:live={stateKind === 'live'}
    onclick={stateClick}
    title={stateKind === 'unknown' ? t('The app does not know the real mixer state yet – click to load') : t('App values match the mixer')}
  >
    {#if stateKind === 'live'}{t('● in sync')}{:else if stateKind === 'loaded'}{t('✓ loaded {0}', [lastSyncText])}{:else}{t('⚠ state unverified')}{/if}
  </button>

  <div class="grp">
    <SnapshotMenu />
  </div>

  <div class="grp">
    <span class="gl">{t('Scenes')}</span>
    <select bind:value={scene} aria-label={t('Saved scenes')}>
      <option value="">{t('— select —')}</option>
      {#each mixer.scenes as s (s)}<option value={s}>{s}</option>{/each}
    </select>
    <button type="button" onclick={load} disabled={!scene}>{t('Load')}</button>
    <button type="button" onclick={save}>{t('Save')}</button>
    <button type="button" onclick={del} disabled={!scene} aria-label={t('Delete scene')}>✕</button>
    <button type="button" onclick={pushAll} disabled={mixer.sending > 0} title={t('Overwrite the mixer with the app values (except 48 V)')}>
      {#if mixer.sending > 0}
        <span class="prog" style="width:{mixer.sending * 100}%"></span>
        {t('Sending…')}
      {:else}
        {t('⇢ To mixer…')}
      {/if}
    </button>
  </div>

  <div class="grp right">
    <button type="button" onclick={onSettings} aria-label={t('Settings')}>⚙</button>
    {#if mixer.anySolo}<span class="solo">SOLO</span>{/if}
  </div>
</header>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 18px;
    padding: 8px 16px;
    background: var(--bar);
    border-bottom: 1px solid rgba(0, 0, 0, 0.5);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
    position: relative;
    z-index: 2;
  }
  .brand { display: flex; align-items: baseline; gap: 8px; }
  .logo { font: 800 18px/1 var(--label-font); letter-spacing: 0.12em; color: var(--text); }
  .logo b { color: var(--accent); }
  .sub { font: 600 9px/1 var(--label-font); color: var(--label); text-transform: uppercase; letter-spacing: 0.2em; }
  .grp { display: flex; align-items: center; gap: 6px; }
  .grp.right { margin-left: auto; }
  .state { font: 700 10px/1 var(--label-font); letter-spacing: 0.06em; text-transform: uppercase; color: #1a1200; background: #f5a524; }
  .state.ok { background: var(--btn); color: var(--ok); }
  .state.live { animation: pulse-ok 2s ease-in-out infinite; }
  @keyframes pulse-ok { 50% { box-shadow: 0 0 10px -2px var(--ok); } }
  .gl { font: 700 9px/1 var(--label-font); color: var(--label); text-transform: uppercase; letter-spacing: 0.12em; }

  button, select {
    font: 600 11px/1 var(--label-font);
    color: var(--btn-text);
    background: var(--btn);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    padding: 6px 9px;
    cursor: pointer;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transition: transform 0.06s, box-shadow 0.06s, background 0.2s;
    position: relative;
    overflow: hidden;
  }
  button:active:not(:disabled) { transform: translateY(2px); box-shadow: none; }
  button:disabled { opacity: 0.45; cursor: default; }
  button:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  select { max-width: 190px; }
  .prog { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255, 255, 255, 0.25); transition: width 0.1s; }

  .leds { display: flex; gap: 4px; padding: 4px 6px; background: rgba(0, 0, 0, 0.35); border-radius: 4px; }
  .led { width: 8px; height: 8px; border-radius: 50%; background: var(--led-off); }
  .led.pwr.on { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .led.tx.flash { animation: flash-tx 0.25s ease-out; }
  .led.rx.flash { animation: flash-rx 0.25s ease-out; }
  @keyframes flash-tx { from { background: var(--accent); box-shadow: 0 0 8px var(--accent); } }
  @keyframes flash-rx { from { background: var(--solo); box-shadow: 0 0 8px var(--solo); } }

  .btna { color: var(--label); }
  .bton { background: var(--accent-btn); color: #fff; }
  .busy { animation: pulse-bt 1.2s ease-in-out infinite; opacity: 1 !important; }
  @keyframes pulse-bt { 50% { box-shadow: 0 0 12px var(--accent); } }



  .solo {
    background: var(--solo);
    color: #000;
    font: 800 11px/1 var(--label-font);
    padding: 6px 9px;
    border-radius: 4px;
    animation: blink 1s steps(2) infinite;
  }
  @keyframes blink { 50% { opacity: 0.4; } }
</style>
