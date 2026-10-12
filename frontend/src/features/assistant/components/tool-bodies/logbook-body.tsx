import { ListLogbookQuerySchema } from '@gen-ui/shared';
import { LogbookTable } from '@/features/logbook/components/logbook-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/** The Logbook page's own table: authors edit their entries, authors and admins delete them. */
export function LogbookBody({ input }: { input: ToolInput<'listLogbookEntries'> }) {
  return <LogbookTable query={ListLogbookQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })} dense />;
}

