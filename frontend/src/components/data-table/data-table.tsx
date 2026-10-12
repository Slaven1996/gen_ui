import { useState, type KeyboardEvent } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type Updater,
} from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { DataTablePagination } from './data-table-pagination';
import { SortButton } from './sort-button';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Server-side sort field this column sorts by (`sort=<field>` / `sort=-<field>`). */
    sortKey?: string;
    /** Direction of the first click — `desc` for dates and counts. */
    sortFirst?: 'asc' | 'desc';
    /** Extra classes for this column's header and cells (width, alignment). */
    className?: string;
  }
}

export interface ServerPagination {
  pageIndex: number;
  pageSize: number;
  rowCount: number;
  onPaginationChange: (next: PaginationState) => void;
}

/** Controlled server-side sort in the API's `field` / `-field` form. */
export interface ServerSort {
  value: string;
  onChange: (next: string) => void;
}

export interface RowSelection<TData> {
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  /** Rows that may not be selected render a disabled checkbox. */
  canSelect?: (row: TData) => boolean;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Server-side pagination. Omit to paginate `data` on the client. */
  pagination?: ServerPagination;
  /** Page size for client-side pagination. */
  pageSize?: number;
  sort?: ServerSort;
  selection?: RowSelection<TData>;
  onRowClick?: (row: TData) => void;
  isLoading?: boolean;
  /** Dim rows while a new page is fetched in the background. */
  isFetching?: boolean;
  emptyMessage?: string;
  getRowId?: (row: TData) => string;
  /** Tighter rows for embedded views (dashboard widgets, chat). */
  dense?: boolean;
}

/**
 * The one table used everywhere: CRUD screens (server-paginated, sorted and
 * filtered through the URL), dashboard widgets and AI-generated tables
 * (client-paginated) share the same look and behaviour.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  pagination,
  pageSize = 10,
  sort,
  selection,
  onRowClick,
  isLoading = false,
  isFetching = false,
  emptyMessage = 'No results.',
  getRowId,
  dense = false,
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
  const selected = new Set(selection?.selected ?? []);
  const selectableIds = selection
    ? rows.filter((row) => selection.canSelect?.(row.original) ?? true).map((row) => row.id)
    : [];
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));
  const columnCount = columns.length + (selection ? 1 : 0);
  const cellPadding = dense ? 'py-1.5' : undefined;

  const toggleAll = (checked: boolean) =>
    selection?.onChange(
      checked
        ? [...new Set([...selected, ...selectableIds])]
        : [...selected].filter((id) => !selectableIds.includes(id)),
    );

  const toggleRow = (id: string, checked: boolean) =>
    selection?.onChange(checked ? [...selected, id] : [...selected].filter((item) => item !== id));

  const onRowKeyDown = (event: KeyboardEvent, row: TData) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) onRowClick?.(row);
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {selection && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      disabled={selectableIds.length === 0}
                      aria-label="Select all rows on this page"
                    />
                  </TableHead>
                )}
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <TableHead key={header.id} className={meta?.className}>
                      {sort && meta?.sortKey ? (
                        <SortButton sortKey={meta.sortKey} first={meta.sortFirst ?? 'asc'} sort={sort}>
                          {content}
                        </SortButton>
                      ) : (
                        content
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={cn(isFetching && !isLoading && 'opacity-60 transition-opacity')}>
            {isLoading ? (
              Array.from({ length: Math.min(paginationState.pageSize, 5) }, (_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: columnCount }, (_, cellIndex) => (
                    <TableCell key={cellIndex} className={cellPadding}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length > 0 ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selected.has(row.id) ? 'selected' : undefined}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (event) => onRowKeyDown(event, row.original) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {selection && (
                    <TableCell className={cellPadding} onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                        disabled={!(selection.canSelect?.(row.original) ?? true)}
                        aria-label="Select row"
                      />
                    </TableCell>
                  )}
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cellPadding, cell.column.columnDef.meta?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && <DataTablePagination table={table} total={pagination?.rowCount} />}
    </div>
  );
}
