import { Link } from '@tanstack/react-router';
import { LayoutDashboard, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** The Dashboard page before the user has (or sees) any dashboard. */
export function DashboardWelcome({ firstName, onCreate }: { firstName: string; onCreate: () => void }) {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardHeader>
        <LayoutDashboard className="mx-auto size-8 text-muted-foreground" />
        <CardTitle>Welcome, {firstName}</CardTitle>
        <CardDescription>
          Build a dashboard from live views of alarms, readings, shifts and the logbook, or describe the one you want to
          the{' '}
          <Link to="/assistant" className="underline underline-offset-2">
            assistant
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onCreate}>
          <Plus />
          Create a dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
