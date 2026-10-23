import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { assistantInstructionsQueryOptions } from '@/features/settings/api/queries';
import { AssistantInstructionsForm } from '@/features/settings/components/assistant-instructions-form';

export const Route = createFileRoute('/_authenticated/settings')({
  staticData: { title: 'Settings' },
  beforeLoad: ({ context }) => {
    if (context.auth.getSnapshot().user?.role !== 'ADMIN') throw redirect({ to: '/dashboard' });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(assistantInstructionsQueryOptions()),
  component: SettingsPage,
});

function SettingsPage() {
  const instructions = useQuery(assistantInstructionsQueryOptions());

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Settings" description="Settings that apply to everyone using the app." />
      {instructions.data && (
        // A new key once saved: the form starts again from the saved text.
        <AssistantInstructionsForm key={instructions.data.updatedAt ?? 'default'} instructions={instructions.data} />
      )}
    </PageContainer>
  );
}
