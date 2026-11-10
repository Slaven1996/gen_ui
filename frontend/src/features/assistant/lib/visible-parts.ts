import { isStaticToolUIPart } from 'ai';
import { isHelperToolPart, type GenUIMessage } from '@gen-ui/shared';

/**
 * Whether the chat draws anything for this part of an answer. A helper tool's
 * call (a lookup Claude makes for itself) and empty text or reasoning draw
 * nothing, so an answer made only of them still looks like it is thinking.
 */
export function isVisiblePart(part: GenUIMessage['parts'][number]): boolean {
  if (part.type === 'text' || part.type === 'reasoning') return part.text.trim().length > 0;
  return isStaticToolUIPart(part) && !isHelperToolPart(part);
}
