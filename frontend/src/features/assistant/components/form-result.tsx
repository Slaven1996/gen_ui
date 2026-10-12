import type { LinkProps } from '@tanstack/react-router';
import { CircleCheck, CircleX } from 'lucide-react';
import { ViewFullPageLink } from '@/components/view-full-page-link';
import { cn } from '@/lib/utils';

/** What became of a form, in one line where the form was. */
export function FormResult({
  saved,
  text,
  link,
}: {
  saved: boolean;
  text: string;
  link?: Pick<LinkProps, 'to' | 'search'>;
}) {
  const Icon = saved ? CircleCheck : CircleX;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-4 py-3 text-sm" role="status">
      <Icon className={cn('size-4 shrink-0', saved ? 'text-primary' : 'text-muted-foreground')} />
      <span className={cn('min-w-0 flex-1', !saved && 'text-muted-foreground')}>{text}</span>
      {link && <ViewFullPageLink {...link} newTab />}
    </div>
  );
}
