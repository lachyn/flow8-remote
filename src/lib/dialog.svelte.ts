// In-app confirm / text-input dialogs (replacement for window.confirm / window.prompt).

export interface DialogOpts {
  title: string;
  message?: string;
  ok?: string;
  cancel?: string;
  danger?: boolean;
  /** when set, the dialog asks for text */
  input?: { value?: string; placeholder?: string; maxlength?: number };
}

interface Pending extends DialogOpts {
  resolve: (v: string | boolean | null) => void;
}

class Dialogs {
  current = $state<Pending | null>(null);

  #open(o: DialogOpts) {
    this.current?.resolve(null); // only one dialog at a time
    return new Promise<string | boolean | null>((resolve) => {
      this.current = { ...o, resolve };
    });
  }

  close(v: string | boolean | null) {
    const c = this.current;
    this.current = null;
    c?.resolve(v);
  }

  async confirm(o: DialogOpts): Promise<boolean> {
    return (await this.#open(o)) === true;
  }

  async prompt(o: DialogOpts): Promise<string | null> {
    const v = await this.#open({ ...o, input: o.input ?? {} });
    return typeof v === 'string' ? v : null;
  }
}

export const dialogs = new Dialogs();
