import { useQuery } from '@tanstack/react-query';
import { tagQueryOptions } from '@/features/tags/api/queries';
import { TagForm } from '@/features/tags/components/tag-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/** The tag as it is now, with Claude's changes over it. */
export function EditTagBody({ input, disabled, onSaved }: FormProps<'editTag'>) {
  const tag = useQuery(tagQueryOptions(input.tagId));
  return (
    <WhenLoaded query={tag}>
      {(current) => (
        <TagForm tag={current} prefill={input.changes} disabled={disabled} onSaved={(saved) => onSaved(saved.id)} />
      )}
    </WhenLoaded>
  );
}
