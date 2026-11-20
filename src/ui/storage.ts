import type { KeyValueStore } from '../core';

/** `localStorage` as a {@link KeyValueStore}; `set` throws on quota errors. */
export const localStore = (): KeyValueStore => ({
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
});

/** Offers `data` as a file download named `name`. */
export function download(name: string, data: string | Uint8Array, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
