import { describe, expect, it } from 'vitest';
import { collectNotices, packageName, renderNotices } from '../build/notices';

describe('packageName', () => {
  it('names the package a bundled module comes from', () => {
    expect(packageName('/p/node_modules/jspdf/dist/jspdf.es.min.js')).toBe('jspdf');
    expect(packageName('/p/node_modules/@babel/runtime/helpers/esm/typeof.js')).toBe(
      '@babel/runtime',
    );
    expect(packageName('/p/node_modules/a/node_modules/pako/dist/pako.esm.mjs')).toBe('pako');
    expect(packageName('\0/p/node_modules/svelte/src/index.js?commonjs')).toBe('svelte');
  });

  it('is null for project sources and virtual modules', () => {
    expect(packageName('/p/src/ui/App.svelte')).toBeNull();
    expect(packageName('\0vite/preload-helper.js')).toBeNull();
  });
});

describe('collectNotices', () => {
  const files: Record<string, string> = {
    'node_modules/jspdf/package.json': '{"name":"jspdf","version":"4.2.1","license":"MIT"}',
    'node_modules/jspdf/LICENSE': 'MIT text jspdf',
    'node_modules/@x/font/package.json': '{"name":"@x/font","version":"1.0.0","license":"OFL-1.1"}',
    'node_modules/@x/font/LICENSE.md': 'OFL text',
    'node_modules/nolic/package.json': '{"name":"nolic","version":"0.1.0"}',
  };
  const fs = {
    read: (p: string) => {
      const f = files[p];
      if (f === undefined) throw new Error(p);
      return f;
    },
    list: (dir: string) =>
      Object.keys(files)
        .filter((k) => k.startsWith(dir + '/') && !k.slice(dir.length + 1).includes('/'))
        .map((k) => k.slice(dir.length + 1)),
  };

  it('reads name, version, licence id and licence text once per package, sorted', () => {
    const n = collectNotices(['jspdf', '@x/font', 'jspdf'], fs);
    expect(n.map((e) => e.name)).toEqual(['@x/font', 'jspdf']);
    expect(n[1]).toEqual({
      name: 'jspdf',
      version: '4.2.1',
      license: 'MIT',
      text: 'MIT text jspdf',
    });
    expect(n[0]?.text).toBe('OFL text');
  });

  it('fails the build when a package has no licence file', () => {
    expect(() => collectNotices(['nolic'], fs)).toThrow(/nolic/);
  });
});

describe('renderNotices', () => {
  it('lists every package with its licence text', () => {
    const text = renderNotices('Brick Stitch', [
      { name: 'a', version: '1.0.0', license: 'MIT', text: 'TEXT A' },
      { name: 'b', version: '2.0.0', license: 'OFL-1.1', text: 'TEXT B' },
    ]);
    expect(text).toContain('Brick Stitch');
    expect(text).toMatch(/a 1\.0\.0 \(MIT\)\n[-]+\nTEXT A/);
    expect(text).toMatch(/b 2\.0\.0 \(OFL-1\.1\)\n[-]+\nTEXT B/);
  });
});
