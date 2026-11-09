<script lang="ts">
  import { t } from './i18n.svelte';
  import { fly } from 'svelte/transition';
  import { mixer } from './mixer.svelte';
  import { dialogs } from './dialog.svelte';
  import { eqDb, lowcutHz } from './midi-map';
  import {
    CHANNEL_PRESETS, BUS_PRESETS, loadUserPresets, saveUserPresets,
    type ChannelPreset, type BusPreset,
  } from './eq-presets';

  interface Props {
    kind: 'channel' | 'bus';
    /** channel: [low, lowMid, hiMid, hi]; bus: 9 band keys */
    keys: string[];
    lowcutKey?: string;
  }
  let { kind, keys, lowcutKey }: Props = $props();

  let open = $state(false);
  let user = $state(loadUserPresets());
  let root: HTMLDivElement | undefined = $state();

  const builtins = $derived(kind === 'channel' ? CHANNEL_PRESETS : BUS_PRESETS);
  const mine = $derived(kind === 'channel' ? user.channel : user.bus);

  const dbToV = (db: number) => Math.round(64 + (db / 15) * (db < 0 ? 64 : 63));
  const hzToV = (f: number) => (f <= 21 ? 0 : Math.round((127 * Math.log(f / 20)) / Math.log(30)));

  function apply(p: ChannelPreset | BusPreset) {
    if (kind === 'channel') {
      const cp = p as ChannelPreset;
      // preset order is low, low-mid, hi-mid, hi
      cp.db.forEach((db, i) => mixer.set(keys[i], dbToV(db)));
      if (lowcutKey) mixer.set(lowcutKey, hzToV(cp.lowcut));
    } else {
      (p as BusPreset).forEach((db, i) => mixer.set(keys[i], dbToV(db)));
    }
    open = false;
  }

  function current(): ChannelPreset | BusPreset {
    const dbs = keys.map((k) => Math.round(eqDb(mixer.values[k]) * 2) / 2);
    if (kind === 'bus') return dbs;
    const lc = lowcutKey && mixer.values[lowcutKey] > 0 ? Math.round(lowcutHz(mixer.values[lowcutKey])) : 0;
    return { db: dbs as ChannelPreset['db'], lowcut: lc };
  }

  async function save() {
    open = false;
    const name = (await dialogs.prompt({ title: t('Save EQ preset'), message: t('Saves the current EQ in this browser.'), ok: t('Save'), input: { placeholder: t('e.g. My vocal') } }))?.trim();
    if (!name) return;
    if (kind === 'channel') user.channel[name] = current() as ChannelPreset;
    else user.bus[name] = current() as BusPreset;
    saveUserPresets($state.snapshot(user));
    mixer.notify(t('EQ preset “{0}” saved.', [name]));
  }

  async function remove(name: string) {
    open = false;
    if (!(await dialogs.confirm({ title: t('Delete EQ preset'), message: t('Preset “{0}” will be removed.', [name]), ok: t('Delete'), danger: true }))) return;
    if (kind === 'channel') delete user.channel[name];
    else delete user.bus[name];
    saveUserPresets($state.snapshot(user));
  }

  $effect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  });
</script>

<div class="eqp" bind:this={root}>
  <button type="button" class="trigger" class:on={open} onclick={() => (open = !open)} aria-expanded={open}>
    {t('Presets ▾')}
  </button>
  {#if open}
    <div class="menu" transition:fly={{ y: -6, duration: 140 }} role="menu">
      <div class="hd">{t('Built-in')}</div>
      {#each Object.entries(builtins) as [name, p] (name)}
        <button type="button" class="item" role="menuitem" onclick={() => apply(p)}>{t(name)}</button>
      {/each}
      <div class="hd">{t('Mine')}</div>
      {#each Object.entries(mine) as [name, p] (name)}
        <div class="row">
          <button type="button" class="item" role="menuitem" onclick={() => apply(p)}>{name}</button>
          <button type="button" class="del" onclick={() => remove(name)} aria-label={t('Delete {name}', { name })}>✕</button>
        </div>
      {:else}
        <div class="empty">{t('none yet')}</div>
      {/each}
      <button type="button" class="save" onclick={save}>{t('＋ Save current…')}</button>
    </div>
  {/if}
</div>

<style>
  .eqp { position: relative; display: flex; justify-content: center; }
  .trigger {
    font: 700 8.5px/1 var(--label-font);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--btn-text);
    background: var(--btn);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 3px;
    padding: 3px 7px;
    cursor: pointer;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
  }
  .trigger.on { outline: 1px solid var(--focus); }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    width: 190px;
    max-height: 360px;
    overflow: auto;
    padding: 6px;
    background: #15181c;
    color: #e8ecf0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
    font: 13px/1.2 var(--label-font);
  }
  .hd { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #8d96a0; padding: 6px 6px 3px; }
  .row { display: flex; }
  .item, .save, .del {
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .item { flex: 1; width: 100%; display: block; }
  .item:hover, .save:hover { background: rgba(255, 255, 255, 0.08); }
  .del { color: #ff8080; padding: 6px 8px; }
  .del:hover { background: rgba(255, 80, 80, 0.15); }
  .empty { color: #6b747d; padding: 4px 6px; font-size: 12px; }
  .save { width: 100%; margin-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0 0 4px 4px; color: #4fd1ff; }
</style>
