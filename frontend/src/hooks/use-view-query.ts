import { useEffect, useState } from 'react';

/**
 * State for an embeddable view's query. A full page passes `onChange` and
 * keeps the query in its URL; an embedded view (dashboard widget, chat
 * answer) omits it and pages or sorts locally, starting from — and resetting
 * to — the query it was given.
 */
export function useViewQuery<Q extends object>(query: Q, onChange?: (next: Q) => void): [Q, (patch: Partial<Q>) => void] {
  const [local, setLocal] = useState(query);
  const key = JSON.stringify(query);

  // A new query from above (e.g. the widget was reconfigured) replaces local paging.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `query`.
  useEffect(() => setLocal(query), [key]);

  if (onChange) return [query, (patch) => onChange({ ...query, ...patch })];
  return [local, (patch) => setLocal((current) => ({ ...current, ...patch }))];
}
