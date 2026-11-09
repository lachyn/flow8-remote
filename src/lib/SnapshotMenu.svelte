<script lang="ts">
  import { t } from './i18n.svelte';
  import { fly } from 'svelte/transition';
  import { mixer } from './mixer.svelte';
  import { ble } from './ble.svelte';
  import { dialogs } from './dialog.svelte';

  let open = $state(false);
  let renaming = $state(false);
  let root: HTMLDivElement | undefined = $state();

  const snapName = (n: number) => mixer.snapNames[n] ?? ble.snapshotNames[n - 1] ?? '';
  const cur = $derived(mixer.lastSnapshot && mixer.lastSnapshot < 16 ? mixer.lastSnapshot : null);

  async function pick(n: number) {
    if (renaming) {
      renaming = false;
      const name = await dialogs.prompt({
        title: t('Snapshot {0} name', [n]),
        message: t('Stored in this app only (the mixer does not send names over USB). Empty = no name.'),
        ok: t('Save'),
        input: { value: snapName(n), maxlength: 16 },
      });
      if (name !== null) mixer.renameSnapshot(n, name.trim());
      return;
    }
    open = false;
    mixer.loadSnapshot(n);
  }
  async function reset() {
    open = false;
    if (await dialogs.confirm({ title: t('Reset mixer'), message: t('Snapshot 16 resets every setting on the mixer to factory defaults.'), ok: t('Reset'), danger: true }))
      mixer.loadSnapshot(16);
  }

  $effect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node) && !(e.target as HTMLElement).closest('[role=dialog]')) {
        open = false;
        renaming = false;
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  });
</script>

<div class="snap" bind:this={root}>
  <button type="button" class="trigger" class:on={open} onclick={() => (open = !open)} aria-expanded={open}>
    <span class="lbl">Snapshot</span>
    <span class="val">{cur ? `${cur}${snapName(cur) ? ' · ' + snapName(cur) : ''}` : '—'}</span>
    <span class="caret">▾</span>
  </button>
  {#if open}
    <div class="menu" transition:fly={{ y: -6, duration: 140 }} role="menu">
      <div class="grid">
        {#each Array.from({ length: 15 }, (_, i) => i + 1) as n (n)}
          <button type="button" class="tile" class:cur={cur === n} class:renaming role="menuitem" onclick={() => pick(n)}>
            <span class="num">{n}</span>
            <span class="name">{snapName(n) || ' '}</span>
          </button>
        {/each}
      </div>
      <div class="foot">
        <button type="button" class:on={renaming} onclick={() => (renaming = !renaming)}>{renaming ? t('Click a snapshot…') : t('✎ Rename')}</button>
        <button type="button" class="danger" onclick={reset}>{t('Reset mixer')}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .snap { position: relative; }
  .trigger {
    display: flex; align-items: center; gap: 8px;
    font: 600 11px/1 var(--label-font);
    color: var(--btn-text);
    background: var(--btn);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    padding: 6px 9px;
    cursor: pointer;
    box-shadow: 0 2px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    max-width: 230px;
  }
  .trigger.on { outline: 2px solid var(--focus); outline-offset: 1px; }
  .lbl { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; }
  .val { font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .caret { opacity: 0.7; }
  .menu {
    position: absolute; top: calc(100% + 6px); left: 0; z-index: 40;
    width: 340px; padding: 8px;
    background: #15181c; color: #e8ecf0;
    border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 10px;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6);
  }
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
  .tile {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 7px 2px 6px;
    background: #22262c; color: inherit;
    border: 1px solid #353b42; border-radius: 6px;
    cursor: pointer; min-width: 0;
    transition: background 0.12s, border-color 0.12s;
  }
  .tile:hover { background: #2c323a; border-color: #4a525c; }
  .tile.cur { background: var(--accent-btn); border-color: var(--accent); box-shadow: 0 0 12px -3px var(--accent); }
  .tile.renaming { border-style: dashed; border-color: var(--accent); }
  .num { font: 700 15px/1 var(--mono); }
  .name { font: 600 10px/1.1 var(--label-font); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
  .foot { display: flex; justify-content: space-between; gap: 6px; margin-top: 8px; }
  .foot button {
    font: 700 10px/1 var(--label-font); letter-spacing: 0.08em; text-transform: uppercase;
    padding: 7px 10px; border-radius: 5px; cursor: pointer;
    background: #22262c; color: #cfd6dd; border: 1px solid #353b42;
  }
  .foot button.on { background: var(--accent-btn); color: #fff; }
  .foot .danger { color: #ff8080; border-color: #6b2b2e; }
</style>
