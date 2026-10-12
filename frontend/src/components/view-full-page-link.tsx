import { Link, type LinkProps } from '@tanstack/react-router';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
