import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import type { AppNotification } from '@gen-ui/shared';
import { SeverityBadge } from '@/components/badges/severity-badge';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * One notification in the bell's list: severity, time, text, links to its
 * alarm and asset, and a button to dismiss it. Following a link closes the
 * bell (`onNavigate`), which marks what it showed read, this one included.
 */
export function NotificationItem({
  notification,
  onNavigate,
  onDismiss,
}: {
  notification: AppNotification;
  onNavigate: () => void;
  onDismiss: () => void;
}) {
  const unread = notification.readAt === null;

  return (
    <li className={cn('space-y-1 px-4 py-3', unread && 'bg-muted/60')}>
      <div className="flex items-center justify-between gap-2">
        <SeverityBadge severity={notification.severity} />
        <div className="flex items-center gap-1">
          <time dateTime={notification.createdAt} className="text-xs text-muted-foreground">
            {formatRelative(notification.createdAt)}
          </time>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={`Dismiss “${notification.title}”`}
            onClick={onDismiss}
          >
            <X />
          </Button>
        </div>
      </div>
      <p className="text-sm font-medium">
        {notification.alarmId ? (
          <Link
            to="/alarms"
            search={{ alarm: notification.alarmId }}
            onClick={onNavigate}
            className="underline-offset-2 hover:underline"
          >
            {notification.title}
          </Link>
        ) : (
          notification.title
        )}
      </p>
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
