// Minimal i18n: English is the source language (keys), Czech translations live in cs.ts.
// Placeholders: {name} (object vars) or {0}, {1} (positional vars).
import { CS } from './i18n-cs';

export type Lang = 'en' | 'cs';
const KEY = 'flow8.lang.v1';

function detect(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'en' || s === 'cs') return s;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && /^(cs|sk)\b/i.test(navigator.language) ? 'cs' : 'en';
}

class I18n {
  lang = $state<Lang>(detect());
  /** user choice: 'auto' follows the browser language */
  choice = $state<Lang | 'auto'>((() => {
    try {
      const s = localStorage.getItem(KEY);
      return s === 'en' || s === 'cs' ? s : 'auto';
    } catch {
      return 'auto';
    }
  })());

  set(choice: Lang | 'auto') {
    this.choice = choice;
    try {
      if (choice === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* storage unavailable */
    }
    this.lang = choice === 'auto' ? detect() : choice;
    document.documentElement.lang = this.lang;
  }
}

export const i18n = new I18n();

export function t(en: string, vars?: Record<string, unknown> | unknown[]): string {
  let s = i18n.lang === 'cs' ? (CS[en] ?? en) : en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => {
    const v = Array.isArray(vars) ? vars[Number(k)] : vars[k];
    return v === undefined ? m : String(v);
  });
  return s;
}
