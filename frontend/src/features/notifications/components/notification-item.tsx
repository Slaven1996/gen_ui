import { Link, type LinkProps } from '@tanstack/react-router';
import { X } from 'lucide-react';
import type { AppNotification } from '@gen-ui/shared';
import { LogSeverityBadge } from '@/components/badges/log-severity-badge';
import { SeverityBadge } from '@/components/badges/severity-badge';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/lib/format';
import { NOTIFICATION_TYPE } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { notificationLink } from '../lib/notification-link';

/**
 * One notification in the bell's list: what kind it is (and how bad, for
 * alarms and logbook entries), time, text, a link to what it is about and
 * its asset, and a button to dismiss it. Following a link closes the bell
 * (`onNavigate`), which marks what it showed read, this one included.
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
  const { label, icon: Icon } = NOTIFICATION_TYPE[notification.type];
  const link = notificationLink(notification);

  return (
    <li className={cn('space-y-1 px-4 py-3', unread && 'bg-muted/60')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {notification.severity && <SeverityBadge severity={notification.severity} />}
          {notification.entrySeverity && <LogSeverityBadge severity={notification.entrySeverity} />}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon className="size-3.5 shrink-0" />
            {label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
        {link ? (
          <Link {...(link as LinkProps)} onClick={onNavigate} className="underline-offset-2 hover:underline">
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
