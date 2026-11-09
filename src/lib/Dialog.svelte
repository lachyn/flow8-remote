<script lang="ts">
  import { t } from './i18n.svelte';
  import { fade, scale } from 'svelte/transition';
  import { dialogs } from './dialog.svelte';

  let text = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  let okEl: HTMLButtonElement | undefined = $state();

  const d = $derived(dialogs.current);

  $effect(() => {
    if (!d) return;
    text = d.input?.value ?? '';
    queueMicrotask(() => (d.input ? (inputEl?.focus(), inputEl?.select()) : okEl?.focus()));
  });

  function ok() {
    if (!d) return;
    if (d.input) {
      const v = text.trim();
      if (!v) return inputEl?.focus();
      dialogs.close(v);
    } else dialogs.close(true);
  }
  function cancel() {
    dialogs.close(d?.input ? null : false);
  }
  function key(e: KeyboardEvent) {
    if (!d) return;
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter') { e.preventDefault(); ok(); }
  }
</script>

<svelte:window onkeydown={key} />

{#if d}
  <div class="backdrop" transition:fade={{ duration: 140 }} onpointerdown={(e) => e.target === e.currentTarget && cancel()} role="presentation">
    <div class="box" class:danger={d.danger} role="dialog" aria-modal="true" aria-labelledby="dlg-title" transition:scale={{ start: 0.94, duration: 160 }}>
      <h2 id="dlg-title">{d.title}</h2>
      {#if d.message}<p>{d.message}</p>{/if}
      {#if d.input}
        <input
          bind:this={inputEl}
          bind:value={text}
          placeholder={d.input.placeholder}
          maxlength={d.input.maxlength ?? 40}
          spellcheck="false"
        />
      {/if}
      <div class="actions">
        <button type="button" class="cancel" onclick={cancel}>{d.cancel ?? t('Cancel')}</button>
        <button type="button" class="ok" bind:this={okEl} onclick={ok}>{d.ok ?? 'OK'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(3px);
  }
  .box {
    width: min(420px, 100%);
    padding: 18px 20px 16px;
    background: linear-gradient(#1d2126, #16191d);
    color: #e8ecf0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-top: 3px solid var(--accent);
    border-radius: 10px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    font: 14px/1.4 var(--label-font);
  }
  .box.danger { border-top-color: var(--mute); }
  h2 { margin: 0 0 6px; font-size: 19px; letter-spacing: 0.02em; }
  p { margin: 0 0 12px; color: #aab3bc; }
  input {
    width: 100%;
    margin: 4px 0 12px;
    padding: 8px 10px;
    font: 15px/1.2 var(--mono);
    color: #e8ecf0;
    background: #0d0f12;
    border: 1px solid #353b42;
    border-radius: 6px;
    outline: none;
    user-select: text;
  }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  button {
    font: 700 12px/1 var(--label-font);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 9px 16px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.5);
    transition: transform 0.06s;
  }
  button:active { transform: translateY(1px); }
  .cancel { background: #2a2f36; color: #cfd6dd; }
  .ok { background: var(--accent-btn); color: #fff; }
  .danger .ok { background: #b3261e; }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
