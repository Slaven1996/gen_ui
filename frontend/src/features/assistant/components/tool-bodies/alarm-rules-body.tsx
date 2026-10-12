import { ListAlarmDefinitionsQuerySchema } from '@gen-ui/shared';
import { DefinitionsTable } from '@/features/alarms/components/definitions-table';
import { withoutTitle } from '../../lib/tool-queries';
import type { ToolInput } from '../../types';

/** The Alarm rules page's own table: the same columns, and edit, delete and enable for admins. */
export function AlarmRulesBody({ input }: { input: ToolInput<'listAlarmRules'> }) {
  return (
    <DefinitionsTable query={ListAlarmDefinitionsQuerySchema.parse({ ...withoutTitle(input), pageSize: 5 })} dense />
  );
}

