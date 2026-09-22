import { useState } from 'react';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { CalendarPlus, ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { z } from 'zod';
import { shiftAssignmentFilters, type ShiftAssignment } from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { ViewCard } from '@/components/view-card';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { AssignmentDialog } from '@/features/shifts/assignment-dialog';
import { OnDutyList } from '@/features/shifts/on-duty-list';
import { ScheduleDialog } from '@/features/shifts/schedule-dialog';
import { TemplatesDialog } from '@/features/shifts/templates-dialog';
import { addDays, describeWeek, fromDateKey, startOfWeek, toDateKey } from '@/features/shifts/week';
import { WeekCalendar } from '@/features/shifts/week-calendar';
import { UserFilter } from '@/features/users/user-filter';
import { useAuth } from '@/lib/auth/auth-store';
import { SHIFT_ROLE_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

/** `week` is the Monday of the week shown (default: this week); the rest filters like the API. */
const shiftsSearch = z.object({
  week: z.iso.date().optional(),
  userId: shiftAssignmentFilters.userId,
  role: shiftAssignmentFilters.role,
});
type ShiftsSearch = z.output<typeof shiftsSearch>;

export const Route = createFileRoute('/_authenticated/shifts')({
  staticData: { title: 'Shifts' },
  validateSearch: searchSchema(shiftsSearch),
  search: { middlewares: [stripSearchParams(defaultsOf(shiftsSearch))] },
  component: ShiftsPage,
});

function ShiftsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [scheduling, setScheduling] = useState(false);
  const [managingTemplates, setManagingTemplates] = useState(false);
  const [editing, setEditing] = useState<ShiftAssignment | null>(null);

  const weekStart = startOfWeek(search.week ? fromDateKey(search.week) : new Date());
  const thisWeek = toDateKey(startOfWeek(new Date()));
  const setSearch = (patch: Partial<ShiftsSearch>) => navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  const goToWeek = (date: Date) => {
    const key = toDateKey(startOfWeek(date));
    setSearch({ week: key === thisWeek ? undefined : key });
  };

  useAssistantContext({ title: 'Shifts', summary: `Shift plan for the week of ${describeWeek(weekStart)}.` });

  return (
    <PageContainer className="max-w-7xl">
      <PageHeader
        title="Shifts"
        description="Who works when. The on-duty list is what alarm escalation would page."
        actions={
          isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setManagingTemplates(true)}>
                <Settings2 />
                Templates
              </Button>
              <Button onClick={() => setScheduling(true)}>
                <CalendarPlus />
                Schedule
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => goToWeek(addDays(weekStart, -7))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => goToWeek(addDays(weekStart, 7))}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" onClick={() => goToWeek(new Date())} disabled={toDateKey(weekStart) === thisWeek}>
            This week
          </Button>
          <h3 className="ml-2 text-sm font-medium">{describeWeek(weekStart)}</h3>
        </div>
        <FilterBar canReset={Boolean(search.userId || search.role)} onReset={() => setSearch({ userId: undefined, role: undefined })}>
          <UserFilter value={search.userId} onChange={(userId) => setSearch({ userId })} />
          <MultiSelectFilter label="Role" options={SHIFT_ROLE_OPTIONS} value={search.role} onChange={(role) => setSearch({ role })} />
        </FilterBar>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        <WeekCalendar
          weekStart={weekStart}
          filters={{ userId: search.userId, role: search.role }}
          onAssignmentClick={isAdmin ? setEditing : undefined}
        />
        <ViewCard title="On duty now" className="h-fit">
          <OnDutyList />
        </ViewCard>
      </div>

      <ScheduleDialog open={scheduling} onOpenChange={setScheduling} date={toDateKey(weekStart < new Date() ? new Date() : weekStart)} />
      <TemplatesDialog open={managingTemplates} onOpenChange={setManagingTemplates} />
      <AssignmentDialog assignment={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </PageContainer>
  );
}
