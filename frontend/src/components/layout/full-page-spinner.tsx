
export function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status">
      <div className="size-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
