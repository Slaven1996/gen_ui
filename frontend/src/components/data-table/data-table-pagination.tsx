import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DataTablePagination<TData>({ table, total }: { table: Table<TData>; total?: number }) {
  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      {total !== undefined && (
        <span className="mr-auto text-muted-foreground tabular-nums">
          {total.toLocaleString()} {total === 1 ? 'result' : 'results'}
        </span>
      )}
      <span className="text-muted-foreground tabular-nums">
        Page {pageIndex + 1} of {Math.max(pageCount, 1)}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
        aria-label="Previous page"
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
        aria-label="Next page"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
