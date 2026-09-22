import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * "View full page": opens the full route with the embedded view's own query
 * as its URL, so the page shows exactly what the embed showed — plus the
 * filters, paging and sorting to take it further.
 */
export function ViewFullPageLink(props: Pick<LinkProps, 'to' | 'search' | 'params'> & { label?: string }) {
  const { label = 'View full page', ...link } = props;
  return (
    <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
      <Link {...(link as LinkProps)}>
        {label}
        <ArrowUpRight className="size-3.5" />
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
