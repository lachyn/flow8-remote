<script lang="ts">
  import { t } from './i18n.svelte';
  import { mixer } from './mixer.svelte';

  interface Props {
    id: string;
    name: string;
    color: string;
    sub: string;
    editable?: boolean;
  }
  let { id, name, color, sub, editable = true }: Props = $props();

  const value = $derived(mixer.names[id] ?? '');
  const col = $derived(mixer.colors[id] ?? color);

  function rename(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value.slice(0, 12);
    if (v) mixer.names[id] = v;
    else delete mixer.names[id];
    mixer.persist();
  }
  function recolor(e: Event) {
    mixer.colors[id] = (e.currentTarget as HTMLInputElement).value;
    mixer.persist();
  }
</script>

<div class="scribble" style="--sc: {col}">
  {#if editable}
    <input
      class="name"
      value={value}
      placeholder={name}
      maxlength="12"
      spellcheck="false"
      aria-label={t('Channel name {name}', { name })}
      onchange={rename}
    />
  {:else}
    <div class="name fixed">{name}</div>
  {/if}
  <div class="meta">
    {#if editable}
      <label class="swatch" title={t('Channel colour')}>
        <input type="color" value={col} oninput={recolor} aria-label={t('Channel colour {name}', { name })} />
      </label>
    {/if}
    <span>{sub}</span>
  </div>
</div>

<style>
  .scribble { display: flex; flex-direction: column; gap: 2px; }
  .name {
    width: 100%;
    text-align: center;
    font: var(--scribble-font);
    color: var(--scribble-text);
    background: var(--scribble-bg, var(--sc));
    border: var(--scribble-border);
    border-radius: var(--scribble-radius);
    padding: 4px 2px 3px;
    box-shadow: var(--scribble-shadow);
    transform: var(--scribble-tilt);
    transition: background 0.3s ease, color 0.3s ease;
    outline: none;
  }
  .name.fixed { user-select: none; }
  .name::placeholder { color: var(--scribble-text); opacity: 0.85; }
  .name:focus { box-shadow: 0 0 0 2px var(--focus); }
  .meta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font: 8.5px/1 var(--mono);
    color: var(--label);
    letter-spacing: 0.04em;
  }
  .swatch {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--sc);
    box-shadow: 0 0 4px var(--sc);
    cursor: pointer;
    overflow: hidden;
  }
  .swatch input { opacity: 0; width: 1px; height: 1px; }
</style>
