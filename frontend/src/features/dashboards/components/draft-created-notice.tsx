import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * An assistant's draft that was saved meanwhile, in another tab: one draft
 * makes one dashboard, so this copy can't be saved again.
 */
export function DraftCreatedNotice({ dashboard }: { dashboard: { id: string; name: string } }) {
  return (
    <Alert>
      <Info />
      <AlertTitle>Already created as “{dashboard.name}”</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        This draft was saved as a dashboard already, so it can’t be saved again.
        <Button asChild size="sm" variant="outline">
          <Link to="/dashboard" search={{ board: dashboard.id }}>
            Open it
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
