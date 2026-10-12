import { useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';

/**
 * The record a table shows in its detail sheet. Like `useViewQuery`: a full
 * page passes `onChange` and keeps the id in its URL (a deep link opens it,
 * Back closes it); an embedded table (asset page, widget, chat answer) keeps
 * it to itself and closes it when a link in the sheet leads to another page.
 */
export function useDetailSelection(
  selected?: string,
  onChange?: (id: string | undefined) => void,
): [string | undefined, (id: string | undefined) => void] {
  const [local, setLocal] = useState<string>();
  const pathname = useLocation({ select: (location) => location.pathname });

  // An asset link inside the sheet keeps the asset page mounted; the sheet shouldn't stay open on the next asset.
  useEffect(() => setLocal(undefined), [pathname]);

  if (onChange) return [selected, onChange];
  return [local, setLocal];
}
