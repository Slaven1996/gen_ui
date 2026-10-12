import type { ReactNode } from 'react';
import { OnDutyStrip } from '@/features/shifts/components/on-duty/on-duty-strip';
import type { ToolInput } from '../../types';

/** The Shifts page's own on-duty strip, showing only the half asked for, with the link in its corner. */
export function OnDutyBody({ input, action }: { input: ToolInput<'showOnDuty'>; action?: ReactNode }) {
  return <OnDutyStrip only={input.when} role={input.role} action={action} />;
}
