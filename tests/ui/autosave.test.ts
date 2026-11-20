import { describe, expect, it, vi } from 'vitest';
import { createAutosave, createPattern, type KeyValueStore } from '../../src/core';
import { createAutosaveController, savePill } from '../../src/ui/state/autosave';

const KEY = 'bs:v1:autosave';
const p = createPattern({
  beadType: 'delica11',
  mode: 'shaped',
  width: 3,
  height: 2,
  palette: [{ id: 'k', hex: '#000000' }],
});

function setup(initial: Record<string, string> = {}, failSet = false) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    get: (k) => data.get(k) ?? null,
    set: (k, v) => {
      if (failSet) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
  };
  const timers: (() => void)[] = [];
  const onError = vi.fn();
  const onSaved = vi.fn();
  const onStatus = vi.fn();
  const ctl = createAutosaveController({
    onSaved,
    onStatus,
    autosave: createAutosave(store, KEY),
    setTimer: (fn) => timers.push(fn),
    clearTimer: () => timers.splice(0),
    onError,
  });
  return { data, ctl, timers, onError, onSaved, onStatus };
}

describe('autosave controller', () => {
  it('restores nothing when empty, a pattern when valid', () => {
    expect(setup().ctl.restore()).toEqual({});
    const { data, ctl, timers } = setup();
    ctl.schedule(p);
    timers.forEach((f) => f());
    const again = setup(Object.fromEntries(data)).ctl.restore();
    expect(again.pattern).toEqual(p);
  });

  it('debounces: only the last scheduled pattern is written, flush writes now', () => {
    const { data, ctl, timers } = setup();
    ctl.schedule({ ...p, title: 'a' });
    ctl.schedule({ ...p, title: 'b' });
    expect(timers).toHaveLength(1);
    expect(data.has(KEY)).toBe(false);
    ctl.flush();
    expect(JSON.parse(data.get(KEY) ?? '{}').pattern.title).toBe('b');
    ctl.flush();
  });

  it('blocks writes after a load error until unblocked', () => {
    const { data, ctl, timers } = setup({ [KEY]: '{broken' });
    expect(ctl.restore()).toEqual({ error: 'json' });
    expect(ctl.blocked).toBe(true);
    ctl.schedule(p);
    ctl.flush();
    timers.forEach((f) => f());
    expect(data.get(KEY)).toBe('{broken');
    ctl.unblock();
    ctl.schedule(p);
    ctl.flush();
    expect(data.get(KEY)).not.toBe('{broken');
  });

  it('reports save errors without throwing', () => {
    const { ctl, onError } = setup({}, true);
    ctl.schedule(p);
    expect(() => ctl.flush()).not.toThrow();
    expect(onError).toHaveBeenCalledWith('QuotaExceededError');
  });

  it('reports successful writes so an error banner can clear', () => {
    const { ctl, onSaved } = setup();
    ctl.schedule(p);
    ctl.flush();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('reports pending, saved, error and blocked status once per change (R50)', () => {
    const ok = setup();
    expect(ok.ctl.status).toBe('saved');
    ok.ctl.schedule(p);
    ok.ctl.schedule(p);
    expect(ok.ctl.status).toBe('pending');
    ok.ctl.flush();
    expect(ok.ctl.status).toBe('saved');
    expect(ok.onStatus.mock.calls).toEqual([['pending'], ['saved']]);

    const bad = setup({}, true);
    bad.ctl.schedule(p);
    bad.ctl.flush();
    expect(bad.ctl.status).toBe('error');
    expect(bad.onStatus.mock.calls).toEqual([['pending'], ['error']]);
  });

  it('is blocked after a load error until unblocked', () => {
    const { ctl, onStatus } = setup({ [KEY]: '{broken' });
    ctl.restore();
    expect(ctl.status).toBe('blocked');
    ctl.schedule(p);
    expect(ctl.status).toBe('blocked');
    ctl.unblock();
    expect(ctl.status).toBe('pending');
    ctl.flush();
    expect(ctl.status).toBe('saved');
    expect(onStatus.mock.calls).toEqual([['blocked'], ['pending'], ['saved']]);
  });
});

describe('save pill (R50)', () => {
  it('maps the status to text, tone and icon', () => {
    expect(savePill('saved')).toEqual({ key: 'shell.saved', tone: 'ok', icon: 'check' });
    expect(savePill('pending')).toEqual({ key: 'shell.saving', tone: 'neutral', icon: null });
    expect(savePill('error')).toEqual({ key: 'shell.notSaved', tone: 'danger', icon: 'alert' });
    expect(savePill('blocked')).toEqual({ key: 'shell.notSaved', tone: 'danger', icon: 'alert' });
  });
});
