/** Slider whose effect the import picture highlights (R39): background removal, line thickening or details (R42). */
export type ActiveSlider = 'edge' | 'lines' | 'details';

/** Injectable timer functions (default `setTimeout` / `clearTimeout`). */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

/** Milliseconds the highlight stays after a slider is released. */
export const RELEASE_MS = 500;

/** Live slider highlight state machine; see {@link sliderHighlight}. */
export interface SliderHighlight {
  readonly active: ActiveSlider | null;
  /** Slider grabbed (pointer down): active until released. */
  press(s: ActiveSlider): void;
  /** Slider let go: inactive after {@link RELEASE_MS} unless pressed again; ignored for another slider. */
  release(s: ActiveSlider): void;
  /** One discrete change (keyboard): press and release. */
  pulse(s: ActiveSlider): void;
  /** Cancels a pending release. */
  dispose(): void;
}

const defaultTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** `activeSlider` with a release delay; `onChange` fires on every change of `active`. */
export function sliderHighlight(
  onChange: (s: ActiveSlider | null) => void,
  timers: Timers = defaultTimers,
  releaseMs = RELEASE_MS,
): SliderHighlight {
  let active: ActiveSlider | null = null;
  let timer: unknown;
  const set = (s: ActiveSlider | null): void => {
    if (s === active) return;
    active = s;
    onChange(s);
  };
  const cancel = (): void => {
    if (timer === undefined) return;
    timers.clear(timer);
    timer = undefined;
  };
  const press = (s: ActiveSlider): void => {
    cancel();
    set(s);
  };
  const release = (s: ActiveSlider): void => {
    if (active !== s) return;
    cancel();
    timer = timers.set(() => {
      timer = undefined;
      set(null);
    }, releaseMs);
  };
  return {
    get active() {
      return active;
    },
    press,
    release,
    pulse: (s) => {
      press(s);
      release(s);
    },
    dispose: cancel,
  };
}
