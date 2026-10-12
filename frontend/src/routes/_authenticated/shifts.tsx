import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { CalendarPlus, Settings2 } from 'lucide-react';
import {
  ShiftsPageQuerySchema,
  zonedDate,
  type ShiftCalendar as ShiftCalendarData,
  type ShiftCalendarQuery,
  type ShiftsPageQuery,
  type ShiftsPageQueryInput,
} from '@gen-ui/shared';
import { FilterBar } from '@/components/filters/filter-bar';
import { MultiSelectFilter } from '@/components/filters/multi-select-filter';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { shiftCalendarQueryOptions, shiftTemplatesQueryOptions } from '@/features/shifts/api/queries';
import { OnDutyStrip } from '@/features/shifts/components/on-duty/on-duty-strip';
import { ScheduleShiftDialog } from '@/features/shifts/components/dialogs/schedule-shift-dialog';
import { ShiftCalendar } from '@/features/shifts/components/calendar/shift-calendar';
import { TemplatesDialog } from '@/features/shifts/components/dialogs/templates-dialog';
import { UserFilter } from '@/features/users/components/user-filter';
import { useAuth } from '@/lib/auth/auth-store';
import { SHIFT_ROLE_OPTIONS } from '@/lib/labels';
import { defaultsOf, searchSchema } from '@/lib/search';

/** The page's URL (shared with the assistant's calendar): the calendar's query, plus how the week groups its rows. */
const calendarQuery = (search: ShiftsPageQuery): ShiftCalendarQuery => ({
  view: search.view,
  date: search.date,
  userId: search.userId,
  templateId: search.templateId,
  role: search.role,
});

export const Route = createFileRoute('/_authenticated/shifts')({
  staticData: { title: 'Shifts' },
  validateSearch: searchSchema(ShiftsPageQuerySchema),
  search: { middlewares: [stripSearchParams(defaultsOf(ShiftsPageQuerySchema))] },
  // `group` only changes how the same data is drawn.
  loaderDeps: ({ search }) => calendarQuery(search),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(shiftCalendarQueryOptions(deps)),
  component: ShiftsPage,
});

/** Scheduling from the header starts on today, or on the first day shown when that is later. */
function scheduleDate(calendar: ShiftCalendarData | undefined): string | undefined {
  if (!calendar) return undefined;
  const today = zonedDate(new Date(), calendar.timeZone);
  return calendar.from > today ? calendar.from : today;
}

function ShiftsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [scheduling, setScheduling] = useState(false);
  const [managingTemplates, setManagingTemplates] = useState(false);

  const query = calendarQuery(search);
  // The same cache entry the calendar reads: for the plant time zone and the period shown.
  const calendar = useQuery(shiftCalendarQueryOptions(query));
  const templates = useQuery(shiftTemplatesQueryOptions());
  const templateOptions = (templates.data ?? []).map((template) => ({ value: template.id, label: template.name }));

  const setSearch = (patch: Partial<ShiftsPageQueryInput>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

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

      <OnDutyStrip />

      <ShiftCalendar
        query={query}
        onQueryChange={(next) => setSearch(next)}
        group={search.group}
        onGroupChange={(group) => setSearch({ group })}
        filters={
          <FilterBar
            canReset={Boolean(search.userId || search.role || search.templateId)}
            onReset={() => setSearch({ userId: undefined, role: undefined, templateId: undefined })}
          >
            <UserFilter value={search.userId} onChange={(userId) => setSearch({ userId })} />
            <MultiSelectFilter label="Role" options={SHIFT_ROLE_OPTIONS} value={search.role} onChange={(role) => setSearch({ role })} />
            <MultiSelectFilter
              label="Shift"
              options={templateOptions}
              value={search.templateId}
              onChange={(templateId) => setSearch({ templateId })}
            />
          </FilterBar>
        }
      />

      {isAdmin && (
        <>
          <ScheduleShiftDialog
            open={scheduling}
            onOpenChange={setScheduling}
            defaultDate={scheduleDate(calendar.data)}
            timeZone={calendar.data?.timeZone}
          />
          <TemplatesDialog open={managingTemplates} onOpenChange={setManagingTemplates} />
        </>
      )}
    </PageContainer>
  );
}
