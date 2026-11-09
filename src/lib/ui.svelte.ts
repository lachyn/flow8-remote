// Layout state shared by components: compact mode for small screens (e.g. 14" laptops).
import { mixer } from './mixer.svelte';

class Ui {
  winH = $state(typeof window !== 'undefined' ? window.innerHeight : 1080);
  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('resize', () => (this.winH = window.innerHeight));
  }
  /** auto: compact when the window is lower than ~1000 px */
  compact = $derived(mixer.settings.layout === 'compact' || (mixer.settings.layout !== 'full' && this.winH < 1000));
}

export const ui = new Ui();
