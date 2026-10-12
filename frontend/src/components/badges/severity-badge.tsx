import type { AlarmSeverity } from '@gen-ui/shared';
import { StatusBadge } from '@/components/status-badge';
import { SEVERITY } from '@/lib/labels';

/** An alarm severity as colour + icon + text. */
export function SeverityBadge({ severity }: { severity: AlarmSeverity }) {
  const { tone, icon, label } = SEVERITY[severity];
  return <StatusBadge tone={tone} icon={icon} label={label} />;
}
