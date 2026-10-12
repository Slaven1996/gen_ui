import { useQuery } from '@tanstack/react-query';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { userOptionsQueryOptions } from '../api/queries';

/** Filter by one or more people (authors, actors, assignees). */
export function UserFilter({
  label = 'People',
  value,
  onChange,
}: {
  label?: string;
  value: readonly string[] | undefined;
  onChange: (value: string[] | undefined) => void;
}) {
  const users = useQuery(userOptionsQueryOptions());
  const options = (users.data ?? []).map((user) => ({ value: user.id, label: user.name }));
  return <MultiSelectFilter label={label} options={options} value={value} onChange={onChange} />;
}
