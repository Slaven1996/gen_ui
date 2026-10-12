import type { ReactNode } from 'react';
import { DetailCard } from '@/components/detail/detail-card';
import { TagDetail } from '@/features/tags/components/tag-detail';
import type { ToolInput } from '../../types';

/** The tag's detail sheet from the Tags page as a card, with the link beside its title. */
export function TagDetailBody({ input, action }: { input: ToolInput<'showTag'>; action?: ReactNode }) {
  return (
    <DetailCard>
      <TagDetail tagId={input.tagId} action={action} />
    </DetailCard>
  );
}
