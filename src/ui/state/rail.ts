import type { MessageKey, PatternMode } from '../../core';
import type { IconName } from '../icons';
import type { Tool } from './editor';
import { cycleIndex } from './roving';

/** One tool of the left rail. */
export interface RailTool {
  readonly id: Tool;
  readonly icon: IconName;
  readonly label: MessageKey;
  readonly hint: MessageKey;
}

const tool = (id: Tool, icon: IconName): RailTool => ({
  id,
  icon,
  label: `rail.${id}`,
  hint: `rail.hint.${id}`,
});

/** Rail tools in order (SPEC R46): Sudda only on shaped patterns; Ring follows a divider. */
export function railTools(mode: PatternMode): RailTool[] {
  return [
    tool('paint', 'brush'),
    ...(mode === 'shaped' ? [tool('erase', 'eraser')] : []),
    tool('fill', 'fill'),
    tool('eyedropper', 'pipette'),
    tool('ring', 'ring'),
  ];
}

/** Tool selected by arrow/Home/End `key` from `current` in the rail; `null` for other keys. */
export function railKeyTarget(ids: readonly Tool[], current: Tool, key: string): Tool | null {
  const i = cycleIndex(ids.length, ids.indexOf(current), key);
  return i === null ? null : (ids[i] ?? null);
}
