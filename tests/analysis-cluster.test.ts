import { describe, expect, it } from 'vitest';
import { clusterColours } from '../src/core/analysis/cluster';
import { hexToRgb, rgbToLab } from '../src/core/palette/color';

type Spec = readonly [hex: string, count: number];

function image(specs: readonly Spec[]): { data: Uint8ClampedArray; include: Uint8Array } {
  const n = specs.reduce((a, [, c]) => a + c, 0);
  const data = new Uint8ClampedArray(n * 4);
  let p = 0;
  for (const [hex, c] of specs) {
    const [r, g, b] = hexToRgb(hex);
    for (let i = 0; i < c; i++, p++) data.set([r, g, b, 255], p * 4);
  }
  return { data, include: new Uint8Array(n).fill(1) };
}

const greys = ['#303030', '#484848', '#606060', '#787878', '#909090'];
const shades: Spec[] = [...greys.map((g): Spec => [g, 200]), ['#d02020', 6]];

describe('clusterColours', () => {
  it('merges shades of one colour before a small distinct colour is lost', () => {
    const { data, include } = image(shades);
    const c = clusterColours(data, include, { k: 4 });
    expect(c.clusters).toHaveLength(4);
    const red = c.assign(0xd0, 0x20, 0x20);
    expect(c.clusters[red]!.count).toBe(6);
    const owners = new Set(greys.map((g) => c.assign(...hexToRgb(g))));
    expect(owners.size).toBe(3);
  });

  it('keeps true centroids, not palette colours', () => {
    const { data, include } = image([
      ['#303030', 100],
      ['#343434', 100],
      ['#d02020', 50],
    ]);
    const c = clusterColours(data, include, { k: 2 });
    const grey = c.clusters[c.assign(0x30, 0x30, 0x30)]!;
    const expected = rgbToLab([0x32, 0x32, 0x32]);
    expect(grey.count).toBe(200);
    expect(grey.lab.L).toBeCloseTo(expected.L, 0);
    expect(c.assign(0x34, 0x34, 0x34)).toBe(c.assign(0x30, 0x30, 0x30));
  });

  it('ignores excluded pixels', () => {
    const { data, include } = image([
      ['#303030', 10],
      ['#d02020', 10],
    ]);
    include.fill(0, 10);
    const c = clusterColours(data, include, { k: 4 });
    expect(c.clusters).toHaveLength(1);
    expect(c.clusters[0]!.count).toBe(10);
  });

  it('pins the cluster near the pin colour and lets it absorb neighbours', () => {
    const { data, include } = image(shades);
    const c = clusterColours(data, include, { k: 3, pin: rgbToLab([0x60, 0x60, 0x60]) });
    expect(c.clusters).toHaveLength(3);
    const pinned = c.clusters.filter((x) => x.pinned);
    expect(pinned).toHaveLength(1);
    expect(c.clusters[c.assign(0x60, 0x60, 0x60)]!.pinned).toBe(true);
  });

  it('reserves an empty pinned cluster when no pixel is near the pin colour', () => {
    const { data, include } = image(shades);
    const c = clusterColours(data, include, { k: 3, pin: rgbToLab([0x20, 0xa0, 0x20]) });
    expect(c.clusters).toHaveLength(3);
    const pinned = c.clusters.filter((x) => x.pinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0]!.count).toBe(0);
  });

  it('is deterministic and handles colours it has not seen', () => {
    const { data, include } = image(shades);
    const a = clusterColours(data, include, { k: 3 });
    const b = clusterColours(data, include, { k: 3 });
    expect(a.clusters).toEqual(b.clusters);
    expect(a.assign(0xd8, 0x28, 0x28)).toBe(a.assign(0xd0, 0x20, 0x20));
    expect(a.assignLab(rgbToLab([0xd0, 0x20, 0x20]))).toBe(a.assign(0xd0, 0x20, 0x20));
  });

  it('returns no clusters for an empty selection', () => {
    const c = clusterColours(new Uint8ClampedArray(0), new Uint8Array(0), { k: 3 });
    expect(c.clusters).toHaveLength(0);
  });

  it('can undo merges: cut(k) is the clustering at k and agrees with a direct run', () => {
    const { data, include } = image(shades);
    const c = clusterColours(data, include, { k: 3 });
    expect(c.max).toBe(6);
    expect(c.cut(5).clusters).toHaveLength(5);
    expect(c.cut(3).clusters).toEqual(c.clusters);
    expect(c.cut(99).clusters).toHaveLength(6);
    expect(c.cut(1).clusters).toHaveLength(1);
  });

  it('keeps the pinned centroid at its own pixels when others merge into it', () => {
    const { data, include } = image([
      ['#606060', 100],
      ['#686868', 30],
      ['#d02020', 20],
    ]);
    const c = clusterColours(data, include, { k: 2, pin: rgbToLab([0x60, 0x60, 0x60]) });
    const pinned = c.clusters.find((x) => x.pinned)!;
    expect(pinned.count).toBe(130);
    expect(pinned.lab.L).toBeCloseTo(rgbToLab([0x60, 0x60, 0x60]).L, 0);
  });

  it('assigns colours independently of the order of earlier calls', () => {
    const { data, include } = image(shades);
    const a = clusterColours(data, include, { k: 3 });
    const b = clusterColours(data, include, { k: 3 });
    const probes: [number, number, number][] = [
      [0x31, 0x2f, 0x33],
      [0x70, 0x71, 0x72],
      [0xd2, 0x10, 0x40],
      [0x33, 0x33, 0x33],
    ];
    const fwd = probes.map((q) => a.assign(...q));
    const back = [...probes].reverse().map((q) => b.assign(...q));
    expect(fwd).toEqual(back.reverse());
  });

  it('stays fast on a noisy full-colour gradient', () => {
    const w = 800;
    const data = new Uint8ClampedArray(w * w * 4);
    let seed = 1;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++)
        data.set(
          [(x / w) * 255 + (rnd() - 0.5) * 40, (y / w) * 255 + (rnd() - 0.5) * 40, 128, 255],
          (y * w + x) * 4,
        );
    const t0 = performance.now();
    const c = clusterColours(data, new Uint8Array(w * w).fill(1), { k: 6 });
    expect(c.clusters).toHaveLength(6);
    expect(c.max).toBeLessThanOrEqual(1000);
    expect(performance.now() - t0).toBeLessThan(400);
  });
});
