/**
 * 24 px stroke icon paths from the redesign mockups (SPEC R45), drawn with stroke 1.7 and
 * round caps by `Icon.svelte`. Out-of-scope icons (R43: hand, clock, heart) are omitted.
 */
export const ICONS = {
  brush:
    'M18.5 3.5l2 2-8.5 9.5-3-3zM9 12.5c-2.5 0-4 1.6-4 3.8 0 1.5-.8 2.5-2 3 1 .8 2.3 1.2 3.6 1.2 3 0 5.4-1.8 5.4-4.6',
  eraser: 'M8 20h12M4.5 14.5l9-10 6.5 6-8.5 9.5H8zM9.5 9l6.5 6',
  pipette: 'M14.5 6.5l3 3M13 8l3 3-8 8-4 1 1-4zM15.5 5.5l1.8-1.8a2.1 2.1 0 0 1 3 3L18.5 8.5',
  fill: 'M4.5 12.5l7.5-7.5 7 7-6.5 6.5a2 2 0 0 1-2.8 0zM10 3l2 2M5 13h13.5M20 15.5s1.8 2.3 1.8 3.7a1.8 1.8 0 0 1-3.6 0c0-1.4 1.8-3.7 1.8-3.7',
  ring: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  undo: 'M8 6L3.5 10.5 8 15M4 10.5h10a5.5 5.5 0 0 1 0 11h-3',
  redo: 'M16 6l4.5 4.5L16 15M20 10.5H10a5.5 5.5 0 0 0 0 11h3',
  image: 'M4 5h16v14H4zM4 16l4.5-4.5 4 4 2.5-2.5 5 5M15.5 9.5h.01',
  print: 'M7 8V4h10v4M7 17H4.5v-7.5h15V17H17M7 14h10v6H7z',
  download: 'M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3zM12 10v4.5M12 17.5h.01',
  chevron: 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  crop: 'M7 3v14h14M3 7h14v14',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  wand: 'M5 19L16 8M14 6l1-2.5L16 6l2.5 1L16 8l-1 2.5L14 8l-2.5-1zM19 13l.5-1.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L17 14z',
  folder: 'M3.5 6.5h6l2 2.5h9v10h-17z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  ruler: 'M3.5 15.5l12-12 5 5-12 12zM8 11l1.5 1.5M11 8l1.5 1.5M14 5l1.5 1.5',
  mirror: 'M12 3v18M8.5 7L4 12l4.5 5zM15.5 7L20 12l-4.5 5z',
  pencil: 'M4 20l1-4L16.5 4.5l3 3L8 19zM14.5 6.5l3 3',
  'rotate-left': 'M4 5v5h5M4.5 10a8 8 0 1 1-.5 4',
  'rotate-right': 'M20 5v5h-5M19.5 10a8 8 0 1 0 .5 4',
  info: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01',
  palette:
    'M12 4a8 8 0 1 0 0 16c1.5 0 2-1 2-2s-.5-1.5-.5-2.5 1-1.5 2-1.5H18a2.5 2.5 0 0 0 2-2.5C20 7 16.5 4 12 4zM8 11h.01M11 8h.01M15 9h.01',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  start: 'M4 20L20 4M15 4h5v5M4 14c3 0 3 3 6 3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
} as const;

/** Name of an icon in {@link ICONS}. */
export type IconName = keyof typeof ICONS;
