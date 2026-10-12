import type { LogSeverity } from '@gen-ui/shared';
import { StatusBadge } from '@/components/status-badge';
import { LOG_SEVERITY } from '@/lib/labels';

/** A logbook entry severity as colour + icon + text. */
export function LogSeverityBadge({ severity }: { severity: LogSeverity }) {
  const { tone, icon, label } = LOG_SEVERITY[severity];
  return <StatusBadge tone={tone} icon={icon} label={label} />;
}
