import { useEffect, useRef } from 'react';

/**
 * For a list that loads its next page as it nears the end: calls `onReach`
 * when the sentinel (an element after the last item) comes within reach in
 * the list's own scroll area. `enabled`: there is more, and nothing loading.
 */
export function useLoadMore<R extends HTMLElement, S extends HTMLElement>(onReach: () => unknown, enabled: boolean) {
  const rootRef = useRef<R>(null);
  const sentinelRef = useRef<S>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void onReach();
      },
      // Start a little before the end comes into view.
      { root: rootRef.current, rootMargin: '0px 0px 160px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, onReach]);

  return { rootRef, sentinelRef };
}
