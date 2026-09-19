import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api/errors';

/** Default error UI for any route whose loader or component throws. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <h2 className="text-lg font-semibold">This page couldn’t load</h2>
      <p className="max-w-md text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      <Button
        variant="outline"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Try again
      </Button>
    </div>
  );
}
