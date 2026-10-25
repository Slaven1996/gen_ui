import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** A link to an assistant's dashboard draft whose chat is gone (cleared, or answered again). */
export function DraftUnavailable({ onOpenDashboards, onNew }: { onOpenDashboards: () => void; onNew: () => void }) {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardHeader>
        <CardTitle>This draft is no longer available</CardTitle>
        <CardDescription>
          The chat it came from was deleted, or the answer that held it was generated again. Ask the assistant for the
          dashboard again, or build it here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center gap-2">
        <Button variant="outline" onClick={onOpenDashboards}>
          Open your dashboards
        </Button>
        <Button onClick={onNew}>New dashboard</Button>
      </CardContent>
    </Card>
  );
}
