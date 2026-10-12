import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

/** From a detail to a related list filtered to its record ("12 tags →"), or to another record's detail. */
export function DetailLink({ children, ...link }: Pick<LinkProps, 'to' | 'search' | 'params'> & { children: ReactNode }) {
  return (
    <Link {...(link as LinkProps)} className="inline-flex items-center gap-1 hover:underline">
      {children}
      <ArrowRight className="size-3.5 text-muted-foreground" />
    </Link>
  );
}
