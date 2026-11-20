import type { Pattern } from '../pattern/types';

/** Current pattern file schema version. */
export const CURRENT_VERSION = 1;

/** `.brickstitch.json` envelope, version 1. The source image is never stored. */
export interface PatternFile {
  readonly format: 'brickstitch-pattern';
  readonly version: number;
  readonly savedAt: string;
  readonly app: string;
  readonly pattern: Pattern;
}

/** Synchronous string storage port (localStorage in the UI, a map in tests). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
