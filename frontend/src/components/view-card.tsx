import type { ReactNode } from 'react';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
