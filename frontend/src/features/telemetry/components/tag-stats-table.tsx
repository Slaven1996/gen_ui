import { useQuery } from '@tanstack/react-query';
import type { TelemetryStatsQueryInput } from '@gen-ui/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { tagsListQueryOptions } from '@/features/tags/api/queries';
import { formatReading, formatRelative } from '@/lib/format';
import { statsQueryOptions } from '../api/queries';
import { seriesColor } from '../lib/series-color';

/**
 * Min, max, mean and last reading per tag for the chart's window — the
 * numbers behind the chart, and its table view for readers who can't use it.
 */
export function TagStatsTable({ query }: { query: TelemetryStatsQueryInput }) {
  const tagIds = Array.isArray(query.tagIds) ? query.tagIds : [];
  const stats = useQuery(statsQueryOptions(query));
  const tags = useQuery({ ...tagsListQueryOptions({ ids: tagIds, pageSize: 100 }), enabled: tagIds.length > 0 });

  if (tagIds.length === 0) return null;
  if (stats.isPending || tags.isPending) return <Skeleton className="h-24" />;

  const byId = new Map((tags.data?.items ?? []).map((tag) => [tag.id, tag]));

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead className="text-right">Last</TableHead>
            <TableHead className="text-right">Min</TableHead>
            <TableHead className="text-right">Max</TableHead>
            <TableHead className="text-right">Mean</TableHead>
            <TableHead className="text-right">Readings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(stats.data ?? []).map((row) => {
            const tag = byId.get(row.tagId);
            const index = tagIds.indexOf(row.tagId);
            return (
              <TableRow key={row.tagId}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: seriesColor(index) }} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{tag?.name ?? 'Unknown tag'}</div>
                      <div className="truncate text-xs text-muted-foreground">{tag?.asset.name}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatReading(row.last, tag?.unit)}
                  <div className="text-xs text-muted-foreground">{formatRelative(row.lastAt)}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatReading(row.min, tag?.unit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatReading(row.max, tag?.unit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatReading(row.avg, tag?.unit)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.count.toLocaleString()}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
