import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** A dashboard without widgets; `onAdd` when the user may add one. */
export function EmptyDashboard({ onAdd }: { onAdd?: () => void }) {
  return (
    <Card className="border-dashed text-center">
      <CardHeader>
        <CardTitle>This dashboard is empty</CardTitle>
        <CardDescription>Add widgets: alarm lists, charts, KPIs, the on-duty roster…</CardDescription>
      </CardHeader>
      {onAdd && (
        <CardContent>
          <Button onClick={onAdd}>
            <Plus />
            Add a widget
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
