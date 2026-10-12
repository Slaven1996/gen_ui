import { templateTimes, type ShiftTemplate } from '@gen-ui/shared';
import { coverageSummary } from '../../lib/calendar-utils';

/** A template's colour, name, hours and staffing target: the row header of the roster. */
export function TemplateLabel({ template }: { template: ShiftTemplate }) {
  const times = templateTimes(template);
  return (
    <div className="flex gap-2">
      <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ background: template.color }} />
      <div className="min-w-0 space-y-0.5">
        <div className="truncate text-sm font-medium" title={template.name}>
          {template.name}
          {!template.isActive && <span className="font-normal text-muted-foreground"> (inactive)</span>}
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {times.label}
          {times.overnight && <sup className="ml-0.5">+1</sup>}
        </div>
        {template.coverage.length > 0 && (
          <div className="text-[11px] leading-snug text-muted-foreground">{coverageSummary(template.coverage)}</div>
        )}
      </div>
    </div>
  );
}
