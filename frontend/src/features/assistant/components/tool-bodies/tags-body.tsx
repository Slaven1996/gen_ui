import { ListTagsQuerySchema } from '@gen-ui/shared';
import { TagsTable } from '@/features/tags/components/tags-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/** The Tags page's own table with live values: chart for everyone; add a rule, edit and delete for admins. */
export function TagsBody({ input }: { input: ToolInput<'listTags'> }) {
  return <TagsTable query={ListTagsQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })} dense />;
}

