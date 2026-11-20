import { readdirSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** One third-party package shipped in the build. */
export interface Notice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly text: string;
}

/** File access used by {@link collectNotices}; paths are relative to the project root. */
export interface NoticeFs {
  read(path: string): string;
  list(dir: string): string[];
}

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;

/** Package a bundled module id comes from (innermost `node_modules`), or `null` for project code. */
export function packageName(id: string): string | null {
  const parts = id.replace(/\\/g, '/').split('/node_modules/');
  if (parts.length < 2) return null;
  const segs = (parts.at(-1) ?? '').split('/');
  const name = segs[0]?.startsWith('@') ? `${segs[0]}/${segs[1] ?? ''}` : (segs[0] ?? '');
  return name === '' ? null : name;
}

/** Name, version, licence id and licence text per package; throws when a licence file is missing. */
export function collectNotices(names: readonly string[], fs: NoticeFs): Notice[] {
  return [...new Set(names)].sort().map((name) => {
    const dir = `node_modules/${name}`;
    const pkg = JSON.parse(fs.read(`${dir}/package.json`)) as {
      version?: string;
      license?: string;
    };
    const file = fs.list(dir).find((f) => LICENSE_FILE.test(f));
    if (!file) throw new Error(`third-party notices: no licence file for ${name}`);
    return {
      name,
      version: pkg.version ?? '',
      license: pkg.license ?? 'UNKNOWN',
      text: fs.read(`${dir}/${file}`).trim(),
    };
  });
}

/** Plain-text notices file listing every package with its full licence text. */
export function renderNotices(project: string, notices: readonly Notice[]): string {
  const head = `${project} includes the following third-party software.\n`;
  const body = notices.map((n) => {
    const title = `${n.name} ${n.version} (${n.license})`;
    return `${title}\n${'-'.repeat(title.length)}\n${n.text}\n`;
  });
  return [head, ...body].join('\n');
}

/**
 * Vite plugin: writes `THIRD_PARTY_LICENSES.txt` next to the build, covering every package in
 * the bundle plus the runtime `dependencies` (fonts arrive as CSS assets, not modules).
 */
export function thirdPartyNotices(root: string, project: string): Plugin {
  const fs: NoticeFs = {
    read: (p) => readFileSync(`${root}/${p}`, 'utf8'),
    list: (d) => readdirSync(`${root}/${d}`),
  };
  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle() {
      const pkg = JSON.parse(fs.read('package.json')) as { dependencies?: Record<string, string> };
      const bundled = [...this.getModuleIds()].map(packageName).filter((n) => n !== null);
      const names = [...bundled, ...Object.keys(pkg.dependencies ?? {})];
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_LICENSES.txt',
        source: renderNotices(project, collectNotices(names, fs)),
      });
    },
  };
}
