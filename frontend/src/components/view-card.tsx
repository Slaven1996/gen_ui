import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * "View full page": opens the full route with the embedded view's own query
 * as its URL, so the page shows exactly what the embed showed — plus the
 * filters, paging and sorting to take it further. `newTab` opens it in a new
 * browser tab instead, so a chat answer stays where it is.
 */
export function ViewFullPageLink(
  props: Pick<LinkProps, 'to' | 'search' | 'params'> & { label?: string; newTab?: boolean },
) {
  const { newTab = false, label = newTab ? 'Open in new tab' : 'View full page', ...link } = props;
  const Icon = newTab ? ExternalLink : ArrowUpRight;
  return (
    <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
      <Link
        {...(link as LinkProps)}
        target={newTab ? '_blank' : undefined}
        rel={newTab ? 'noopener noreferrer' : undefined}
      >
        {label}
        <Icon className="size-3.5" />
      </Link>
    </Button>
  );
}

/**
 * The frame around an embeddable view — a dashboard widget today, an inline
 * Generative UI answer next. Title, an optional action (usually
 * `ViewFullPageLink`), and a body that fills the remaining height.
 */
export function ViewCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('h-full min-h-0 gap-3 py-4', className)}>
      <CardHeader className="px-4">
        <CardTitle className="truncate text-sm">{title}</CardTitle>
        {description && <CardDescription className="truncate text-xs">{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={cn('min-h-0 flex-1 px-4', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
