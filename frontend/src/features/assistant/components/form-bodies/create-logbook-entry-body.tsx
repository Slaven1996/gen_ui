import { EntryForm } from '@/features/logbook/components/entry-form';
import type { FormProps } from '../../types';

export function CreateLogbookEntryBody({ input, disabled, onSaved }: FormProps<'createLogbookEntry'>) {
  return <EntryForm prefill={input} disabled={disabled} onSaved={(entry) => onSaved(entry.id)} />;
}
