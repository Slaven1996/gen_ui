import type { Dashboard } from '@gen-ui/shared';
import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';

/** One group of the dashboard dropdown: the user's own, or those shared with them. */
export function DashboardGroup({ label, items }: { label: string; items: Dashboard[] }) {
  if (items.length === 0) return null;
  return (
    <SelectGroup>
      <SelectLabel>{label}</SelectLabel>
      {items.map((item) => (
        <SelectItem key={item.id} value={item.id}>
          {item.name}
        </SelectItem>
      ))}
    </SelectGroup>
  );
}
