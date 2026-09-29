import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import type { AppNotification } from '@gen-ui/shared';
import { SeverityBadge } from '@/components/domain-badges';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { clearNotifications, markNotificationsRead, useNotifications } from './notifications-store';

/**
 * The bell in the header: a count of unread notifications, and the latest
 * ones in a popover. They arrive over the notifications socket as they
 * happen; closing the popover marks them read.
 */
export function NotificationBell() {
  const { items, unread, connected } = useNotifications();
  const [open, setOpen] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) markNotificationsRead();
  };
  const close = () => onOpenChange(false);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="text-sm font-medium">Notifications</p>
            <p className="text-xs text-muted-foreground">{connected ? 'Live' : 'Connecting…'}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={items.length === 0} onClick={clearNotifications}>
            Clear
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. New alarms show up here as they happen.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((notification, index) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                unread={index < unread}
                onNavigate={close}
              />
            ))}
          </ul>
        )}

        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link to="/alarms" onClick={close}>
              View all alarms
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({
  notification,
  unread,
  onNavigate,
}: {
  notification: AppNotification;
  unread: boolean;
  onNavigate: () => void;
}) {
  return (
    <li className={cn('space-y-1 px-4 py-3', unread && 'bg-muted/60')}>
      <div className="flex items-center justify-between gap-2">
        <SeverityBadge severity={notification.severity} />
        <time dateTime={notification.createdAt} className="text-xs text-muted-foreground">
          {formatRelative(notification.createdAt)}
        </time>
      </div>
      <p className="text-sm font-medium">{notification.title}</p>
      <p className="text-xs text-muted-foreground">{notification.message}</p>
      <div className="flex items-center gap-2 text-xs">
        {notification.asset && (
          <Link
            to="/assets/$assetId"
            params={{ assetId: notification.asset.id }}
            onClick={onNavigate}
            className="underline-offset-2 hover:underline"
          >
            {notification.asset.name}
          </Link>
        )}
        {notification.demo && <span className="text-muted-foreground">Demo alarm</span>}
      </div>
    </li>
  );
}
