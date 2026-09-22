import { useQuery } from '@tanstack/react-query';
import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  BarChart3,
  Bell,
  CalendarClock,
  Cpu,
  History,
  LayoutDashboard,
  LineChart,
  Network,
  NotebookPen,
  Settings2,
  Sparkles,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@gen-ui/shared';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { summaryQueryOptions } from '@/features/analytics/api';
import { useAuth } from '@/lib/auth/auth-store';
import type { FileRouteTypes } from '@/routeTree.gen';
import { NavUser } from './nav-user';

interface NavItem {
  to: FileRouteTypes['to'];
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  /** Match only this exact path (so `/alarms` isn't active on `/alarm-rules`). */
  exact?: boolean;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/alarms', label: 'Alarms', icon: Bell, exact: true },
      { to: '/logbook', label: 'Logbook', icon: NotebookPen },
      { to: '/shifts', label: 'Shifts', icon: CalendarClock },
    ],
  },
  {
    label: 'Plant',
    items: [
      { to: '/assets', label: 'Assets', icon: Network },
      { to: '/devices', label: 'Devices', icon: Cpu },
      { to: '/tags', label: 'Tags', icon: Tags },
      { to: '/graphs', label: 'Graphs', icon: LineChart },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { to: '/alarm-rules', label: 'Alarm rules', icon: Settings2 },
      { to: '/audit', label: 'Audit log', icon: History, roles: ['ADMIN'] },
      { to: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
    ],
  },
  {
    label: 'Assistant',
    items: [{ to: '/assistant', label: 'Assistant', icon: Sparkles }],
  },
];

export function AppSidebar() {
  const { user } = useAuth();
  const matchRoute = useMatchRoute();
  // The alarm badge is the one number that should always be in view.
  const summary = useQuery(summaryQueryOptions());
  const unacknowledged = summary.data?.alarms.unacknowledged ?? 0;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                  G
                </div>
                <span className="truncate font-semibold">Gen UI</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.label}
                        isActive={Boolean(matchRoute({ to: item.to, fuzzy: !item.exact }))}
                      >
                        <Link to={item.to}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.to === '/alarms' && unacknowledged > 0 && (
                        <SidebarMenuBadge className="tabular-nums" aria-label={`${unacknowledged} unacknowledged alarms`}>
                          {unacknowledged}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
