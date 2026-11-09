<script lang="ts">
  import { t, i18n } from './lib/i18n.svelte';
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import TopBar from './lib/TopBar.svelte';
  import Dialog from './lib/Dialog.svelte';
  import ChannelStrip from './lib/ChannelStrip.svelte';
  import BusStrip from './lib/BusStrip.svelte';
  import { mixer, type Theme } from './lib/mixer.svelte';
  import { ble } from './lib/ble.svelte';
  import { INPUTS, BUSES } from './lib/midi-map';

  let showLog = $state(false);

  // PWA install prompt (shown in settings)
  let installEvt: (Event & { prompt: () => Promise<void> }) | null = $state(null);
  $effect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      installEvt = e as typeof installEvt;
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  });

  // fit the whole console into the window (e.g. 14" MacBook: 1512 × 982 pt)
  let consoleEl: HTMLElement | undefined = $state();
  let surfaceEl: HTMLElement | undefined = $state();
  let zoom = $state(1);
  $effect(() => {
    const c = consoleEl, s = surfaceEl;
    if (!c || !s) return;
    const fit = () => {
      if (!mixer.settings.fit) { zoom = 1; return; }
      const cs = getComputedStyle(c);
      const w = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = c.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      zoom = Math.max(0.55, Math.min(1, w / s.offsetWidth, h / s.offsetHeight));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    ro.observe(s); // strips shown / hidden
    return () => ro.disconnect();
  });
  let dlg: HTMLDialogElement | undefined = $state();
  let logEl: HTMLPreElement | undefined = $state();

  $effect(() => {
    document.documentElement.dataset.theme = mixer.settings.theme;
  });

  $effect(() => {
    void mixer.log.length;
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });

  onMount(() => {
    mixer.initMidi();
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 't' || e.key === 'T') mixer.tap();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const mons = BUSES.filter((b) => b.id === 'mon1' || b.id === 'mon2');
  const fxs = BUSES.filter((b) => b.slot);
  const main = BUSES.find((b) => b.id === 'main')!;
  function exportState() {
    const blob = new Blob([JSON.stringify(mixer.snapshot(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flow8-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importState(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    try {
      await mixer.importState(await f.text());
    } catch (err) {
      mixer.notify(t('Import failed: {0}', [err]));
    }
    input.value = '';
  }
  function setTheme(t: Theme) {
    mixer.settings.theme = t;
    mixer.persist();
  }
  const themes: { id: Theme; label: string }[] = [
    { id: 'ssl', label: 'Studio E' },
    { id: 'neve', label: 'Vintage' },
    { id: 'digital', label: 'Digital' },
  ];

  const shown = (d: { id: string }) => !mixer.settings.hidden.includes(d.id);
  const allStrips = [
    ...INPUTS.map((d) => ({ id: d.id, label: d.name })),
    ...BUSES.map((d) => ({ id: d.id as string, label: d.name })),
  ];
  function toggleStrip(id: string) {
    const h = mixer.settings.hidden;
    mixer.settings.hidden = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
    mixer.persist();
  }
</script>

<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <radialGradient id="knob-shine" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.55" />
      <stop offset="45%" stop-color="#fff" stop-opacity="0.08" />
      <stop offset="100%" stop-color="#000" stop-opacity="0.35" />
    </radialGradient>
  </defs>
</svg>

<Dialog />

<TopBar onSettings={() => dlg?.showModal()} />

{#if ble.status === 'pairing'}
  <div class="banner pair" transition:fade>
    {@html t('<b>Bluetooth pairing:</b> on the mixer open <b>MENU › PAIRING › PAIR APP</b> and press to confirm. Needed only once per browser.')}
  </div>
{:else if (mixer.midiError || (!mixer.connected && mixer.outputs.length === 0)) && !ble.connected}
  <div class="banner" transition:fade>
    {mixer.midiError ||
      t('FLOW 8 not found on USB. Connect it with a cable, or click “Connect BT”.')}
  </div>
{/if}

<main class="console" aria-label={t('Mixing console')} bind:this={consoleEl}>
  <div class="surface" bind:this={surfaceEl} style={zoom < 1 ? `zoom:${zoom}` : ''}>
    {#if INPUTS.some(shown)}
      <div class="bank">
        {#each INPUTS.filter(shown) as def, i (def.id)}
          <div class="enter" style="animation-delay:{i * 45}ms" transition:fade={{ duration: 160 }}><ChannelStrip {def} /></div>
        {/each}
      </div>
    {/if}
    {#if [...mons, ...fxs].some(shown)}
      <div class="bank">
        {#each [...mons, ...fxs].filter(shown) as def, i (def.id)}
          <div class="enter" style="animation-delay:{(i + 7) * 45}ms" transition:fade={{ duration: 160 }}><BusStrip {def} /></div>
        {/each}
      </div>
    {/if}
    {#if shown(main)}
      <div class="bank master">
        <div class="enter" style="animation-delay:{11 * 45}ms" transition:fade={{ duration: 160 }}><BusStrip def={main} /></div>
      </div>
    {/if}
  </div>
</main>

<dialog bind:this={dlg} class="settings">
  <form method="dialog">
    <h2>{t('Settings')}</h2>
    <label>
      <span>{t('Language')}</span>
      <select value={i18n.choice} onchange={(e) => i18n.set((e.currentTarget as HTMLSelectElement).value as 'auto' | 'en' | 'cs')}>
        <option value="auto">{t('Automatic (browser language)')}</option>
        <option value="en">English</option>
        <option value="cs">Čeština</option>
      </select>
    </label>
    <label>
      <span>{t('Program Change numbering')}</span>
      <select
        value={mixer.settings.pcZeroBased ? '0' : '1'}
        onchange={(e) => { mixer.settings.pcZeroBased = (e.currentTarget as HTMLSelectElement).value === '0'; mixer.persist(); }}
      >
        <option value="1">{t('snapshot / preset N → byte N (default, verified)')}</option>
        <option value="0">{t('snapshot / preset N → byte N−1')}</option>
      </select>
    </label>
    <p class="hint">{t('If snapshot 1 loads a different snapshot (or nothing) on the mixer, switch the numbering. Snapshot 16 = mixer RESET.')}</p>
    <label>
      <span>{t('MIDI note for tap tempo')}</span>
      <select
        value={String(mixer.settings.tapNote)}
        onchange={(e) => { mixer.settings.tapNote = Number((e.currentTarget as HTMLSelectElement).value); mixer.persist(); }}
      >
        <option value="0">{t('0 (C−1, per manual)')}</option>
        <option value="60">60 (C3)</option>
      </select>
    </label>
    <label>
      <span>{t('Layout')}</span>
      <select value={mixer.settings.layout} onchange={(e) => { mixer.settings.layout = (e.currentTarget as HTMLSelectElement).value as 'auto' | 'compact' | 'full'; mixer.persist(); }}>
        <option value="auto">{t('Automatic (compact on small screens)')}</option>
        <option value="compact">{t('Compact – EQ via curves, shorter faders')}</option>
        <option value="full">{t('Full – all knobs')}</option>
      </select>
    </label>
    <label class="chk">
      <input
        type="checkbox"
        checked={mixer.settings.fit}
        onchange={(e) => { mixer.settings.fit = (e.currentTarget as HTMLInputElement).checked; mixer.persist(); }}
      />
      <span>{t('Fit console to window')}</span>
    </label>
    <label class="chk">
      <input
        type="checkbox"
        checked={mixer.settings.follow}
        onchange={(e) => { mixer.settings.follow = (e.currentTarget as HTMLInputElement).checked; mixer.persist(); }}
      />
      <span>{t('Follow the mixer (with Bluetooth + USB the state is read every second)')}</span>
    </label>
    <label class="chk">
      <input
        type="checkbox"
        checked={mixer.settings.confirm48}
        onchange={(e) => { mixer.settings.confirm48 = (e.currentTarget as HTMLInputElement).checked; mixer.persist(); }}
      />
      <span>{t('Confirm turning on 48 V')}</span>
    </label>
    <div class="sect2">
      <span>{t('Theme')}</span>
      <div class="themes" role="group" aria-label={t('Theme')}>
        {#each themes as t (t.id)}
          <button type="button" class:sel={mixer.settings.theme === t.id} onclick={() => setTheme(t.id)}>{t.label}</button>
        {/each}
      </div>
    </div>
    <div class="sect2">
      <span>{t('App')}</span>
      <div class="row2">
        {#if installEvt}
          <button type="button" onclick={() => { installEvt?.prompt(); installEvt = null; }}>⤓ {t('Install')}</button>
        {/if}
        <button type="button" onclick={() => { dlg?.close(); showLog = true; }}>{t('MIDI / BT log')}</button>
      </div>
      {#if !installEvt}<small>{t('Install: use the install icon in the browser address bar (or the app is already installed).')}</small>{/if}
    </div>
    <div class="sect2">
      <span>{t('Backup')}</span>
      <div class="row2">
        <button type="button" onclick={exportState}>{t('Export to file')}</button>
        <label class="filebtn">{t('Import from file')}<input type="file" accept=".json,application/json" onchange={importState} /></label>
      </div>
      <small>{t('Importing sends the settings to the mixer right away.')}</small>
    </div>
    <div class="strips">
      <span>{t('Visible strips')}</span>
      <div class="chips">
        {#each allStrips as st (st.id)}
          <button type="button" class:on={shown(st)} aria-pressed={shown(st)} onclick={() => toggleStrip(st.id)}>
            {mixer.names[st.id] || st.label}
          </button>
        {/each}
      </div>
      <small>{t('Hidden strips keep working, they are just not shown.')}</small>
    </div>
    <div class="routing">
      <span>{t('Channel source (via Bluetooth)')}</span>
      {#each [{ id: 0x09, ch: 'CH 5/6', usb: 'USB 1/2' }, { id: 0x0a, ch: 'CH 7/8', usb: 'USB 3/4' }] as r (r.id)}
        <div class="rrow">
          <b>{r.ch}</b>
          <button type="button" class:sel={mixer.routing[r.id] === 0} disabled={!ble.connected} onclick={() => { mixer.setRouting(r.id, 0); mixer.notify(t('{0}: source LINE', [r.ch])); }}>LINE</button>
          <button type="button" class:sel={mixer.routing[r.id] === 1} disabled={!ble.connected} onclick={() => { mixer.setRouting(r.id, 1); mixer.notify(t('{0}: source {1} (PC)', [r.ch, r.usb])); }}>{r.usb} (PC)</button>
        </div>
      {/each}
      {#if !ble.connected}<small>{t('Connect Bluetooth first.')}</small>{/if}
    </div>
    <p class="hint">
      {@html t('The FLOW 8 faders are not motorised. With Bluetooth + USB the app follows the mixer; otherwise load the state with <b>Snapshots → MIDI Dump</b> on the mixer (the app listens). Controls: drag, mouse wheel, Shift = fine, double-click = default, arrow keys, T = tap tempo.')}
    </p>
    <div class="actions"><button value="close">{t('Close')}</button></div>
  </form>
</dialog>

{#if showLog}
  <aside class="log" transition:fly={{ y: 20, duration: 180 }}>
    <div class="lh">
      <span>MIDI log</span>
      <span>
        <button type="button" onclick={() => (mixer.log = [])}>{t('Clear')}</button>
        <button type="button" onclick={() => (showLog = false)} aria-label={t('Close log')}>✕</button>
      </span>
    </div>
    <pre bind:this={logEl}>{#each mixer.log as l (l.id)}<span class={l.dir}>{l.dir.toUpperCase().padEnd(4)} {l.text}
</span>{/each}</pre>
  </aside>
{/if}

{#if mixer.toast}
  <div class="toast" transition:fly={{ y: 16, duration: 200 }}>{mixer.toast}</div>
{/if}
