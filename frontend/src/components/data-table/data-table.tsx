import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type Updater,
} from '@tanstack/react-table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { DataTablePagination } from './data-table-pagination';

export interface ServerPagination {
  pageIndex: number;
  pageSize: number;
  rowCount: number;
  onPaginationChange: (next: PaginationState) => void;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Server-side pagination. Omit to paginate `data` on the client. */
  pagination?: ServerPagination;
  /** Page size for client-side pagination. */
  pageSize?: number;
  isLoading?: boolean;
  /** Dim rows while a new page is fetched in the background. */
  isFetching?: boolean;
  emptyMessage?: string;
  getRowId?: (row: TData) => string;
}

/**
 * The one table used everywhere: CRUD screens (server-paginated) and
 * AI-generated tables (client-paginated) share the same look and behaviour.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  pagination,
  pageSize = 10,
  isLoading = false,
  isFetching = false,
  emptyMessage = 'No results.',
  getRowId,
}: DataTableProps<TData, TValue>) {
  const [clientPagination, setClientPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });

  const paginationState: PaginationState = pagination
    ? { pageIndex: pagination.pageIndex, pageSize: pagination.pageSize }
    : clientPagination;

  const onPaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(paginationState) : updater;
    if (pagination) pagination.onPaginationChange(next);
    else setClientPagination(next);
  };

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    state: { pagination: paginationState },
    onPaginationChange,
    ...(pagination
      ? { manualPagination: true, rowCount: pagination.rowCount }
      : { getPaginationRowModel: getPaginationRowModel() }),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={cn(isFetching && !isLoading && 'opacity-60 transition-opacity')}>
            {isLoading ? (
              Array.from({ length: Math.min(paginationState.pageSize, 5) }, (_, index) => (
                <TableRow key={index}>
                  {columns.map((_, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && <DataTablePagination table={table} />}
    </div>
  );
}
