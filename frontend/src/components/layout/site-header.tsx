import { useRouterState } from '@tanstack/react-router';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { UserMenu } from './user-menu';

/**
 * The top bar: page title on the left; notifications and the account menu on
 * the right. `sticky top-0` keeps it in view however far a long page (a big
 * table) scrolls: the window scrolls, and no ancestor clips or scrolls on its
 * own. The solid background and z-index keep scrolled content from showing
 * through or on top.
 */
export function SiteHeader() {
  const title = useRouterState({
    select: (state) => [...state.matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  });

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <h1 className="min-w-0 truncate text-sm font-medium">{title}</h1>

      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
