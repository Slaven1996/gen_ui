import { createFileRoute } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { askAssistant } from '@/features/assistant/ask-assistant';
import { useAssistantContext } from '@/features/assistant/assistant-context';
import { useAuth } from '@/lib/auth/auth-store';

export const Route = createFileRoute('/_authenticated/dashboard')({
  staticData: { title: 'Dashboard' },
  component: DashboardPage,
});

const PLACEHOLDER_METRICS = ['Active users', 'Open requests', 'Revenue, last 30 days'];

const STARTER_PROMPTS = [
  {
    label: 'Chart weekly signups',
    prompt: 'Chart weekly signups as a line: W1 42, W2 58, W3 51, W4 77, W5 90, W6 84',
  },
  {
    label: 'Summarize KPIs as cards',
    prompt: 'Show stat cards: 312 open requests (−8%), 4.6 avg rating (+0.2), 18h median response time (−15%)',
  },
];

function DashboardPage() {
  const { user } = useAuth();
  useAssistantContext({
    title: 'Dashboard',
    summary: 'Placeholder overview page. No data sources are connected yet.',
  });

  const firstName = user?.name.split(' ')[0] ?? 'there';

  return (
    <PageContainer>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="This dashboard is a placeholder. Connect a data source to fill in these metrics."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDER_METRICS.map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">—</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">No data source connected</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ask the assistant</CardTitle>
          <CardDescription>Answers can include live components, right next to your work.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map(({ label, prompt }) => (
            <Button key={label} variant="outline" size="sm" onClick={() => askAssistant(prompt)}>
              <Sparkles />
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
