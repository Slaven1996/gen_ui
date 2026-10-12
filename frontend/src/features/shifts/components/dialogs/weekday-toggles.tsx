import { Button } from '@/components/ui/button';
import { WEEKDAYS } from '@/lib/labels';

/** Pick weekdays, Monday first; values are JavaScript's (0 = Sunday). */
export function WeekdayToggles({
  value,
  onChange,
  label = 'Weekdays',
}: {
  value: readonly number[];
  onChange: (weekdays: number[]) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {WEEKDAYS.map((day) => {
        const on = value.includes(day.value);
        return (
          <Button
            key={day.value}
            type="button"
            size="xs"
            variant={on ? 'secondary' : 'outline'}
            aria-pressed={on}
            className="w-10"
            onClick={() => onChange(on ? value.filter((item) => item !== day.value) : [...value, day.value])}
          >
            {day.label}
          </Button>
        );
      })}
    </div>
  );
}
