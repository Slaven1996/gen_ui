import { Link } from '@tanstack/react-router';
import type { AppNotification } from '@gen-ui/shared';
import { SeverityBadge } from '@/components/badges/severity-badge';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One notification in the bell's list: severity, time, text, and a link to its asset. */
export function NotificationItem({
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
