const show = (value: unknown) => (value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));

/** `{ field: { from, to } }` as a small before → after table; anything else as JSON. */
export function AuditChanges({ changes }: { changes: Record<string, unknown> }) {
  const entries = Object.entries(changes);
  const isDiff = entries.every(([, value]) => value && typeof value === 'object' && 'from' in value && 'to' in value);
  if (!isDiff) {
    return <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(changes, null, 2)}</pre>;
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([field, value]) => {
          const { from, to } = value as { from: unknown; to: unknown };
          return (
            <tr key={field} className="border-b last:border-0">
              <td className="py-1 pr-2 font-medium">{field}</td>
              <td className="py-1 pr-2 break-all text-muted-foreground line-through">{show(from)}</td>
              <td className="py-1 break-all">{show(to)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
