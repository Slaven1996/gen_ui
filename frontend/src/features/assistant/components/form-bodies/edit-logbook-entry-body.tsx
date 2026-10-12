import { useQuery } from '@tanstack/react-query';
import { logbookEntryQueryOptions } from '@/features/logbook/api/queries';
import { EntryForm } from '@/features/logbook/components/entry-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/** The entry as it is now, with Claude's changes over it. */
export function EditLogbookEntryBody({ input, disabled, onSaved }: FormProps<'editLogbookEntry'>) {
  const entry = useQuery(logbookEntryQueryOptions(input.entryId));
  return (
    <WhenLoaded query={entry}>
      {(current) => (
        <EntryForm entry={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}
