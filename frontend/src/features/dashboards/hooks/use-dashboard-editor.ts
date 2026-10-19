import { useState } from 'react';
import { sameDraft } from '../lib/draft';
import type { DashboardDraft } from '../types';

/**
 * The dashboard being edited, as a local copy: adding, changing, moving,
 * resizing or removing widgets, renaming and sharing all change only the
 * copy, and nothing reaches the server until it is saved in one request.
 * `dirty` once the copy differs from where editing started.
 */
export function useDashboardEditor() {
  const [state, setState] = useState<{ start: DashboardDraft; draft: DashboardDraft } | null>(null);
  return {
    draft: state?.draft,
    dirty: state !== null && !sameDraft(state.start, state.draft),
    start: (draft: DashboardDraft) => setState({ start: draft, draft }),
    change: (patch: Partial<DashboardDraft>) =>
      setState((current) => current && { ...current, draft: { ...current.draft, ...patch } }),
    stop: () => setState(null),
  };
}
