import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ChangePasswordSchema, PASSWORD_MIN_LENGTH, UpdateProfileSchema } from '@gen-ui/shared';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useChangePassword, useUpdateProfile } from '@/features/profile/api';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-store';

export const Route = createFileRoute('/_authenticated/profile')({
  staticData: { title: 'Profile' },
  component: ProfilePage,
});

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Your profile"
        description="Update how you appear in the app and manage your password."
      />

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
          <Avatar className="size-12 rounded-lg">
            <AvatarFallback className="rounded-lg text-base">{initialsOf(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate">{user.name}</CardTitle>
            <CardDescription className="truncate">{user.email}</CardDescription>
          </div>
          <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'} className="ml-auto">
            {user.role === 'ADMIN' ? 'Admin' : 'User'}
          </Badge>
        </CardHeader>
        <Separator />
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <Detail label="Member since" value={formatDate(user.createdAt)} />
          <Detail label="Last sign-in" value={formatDate(user.lastLoginAt)} />
        </CardContent>
      </Card>

      <NameCard currentName={user.name} email={user.email} />
      <PasswordCard />
    </PageContainer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function NameCard({ currentName, email }: { currentName: string; email: string }) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string>();
  const updateProfile = useUpdateProfile();

  const dirty = name.trim() !== currentName;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = UpdateProfileSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    updateProfile.mutate(parsed.data, { onSuccess: (updated) => setName(updated.name) });
  };

  const reset = () => {
    setName(currentName);
    setError(undefined);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Display name</CardTitle>
          <CardDescription>Shown in the sidebar, and to the assistant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="name" label="Name" error={error}>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field
            id="email"
            label="Email"
            hint="Your email is your sign-in identifier and cannot be changed here."
          >
            <Input id="email" value={email} disabled readOnly autoComplete="email" />
          </Field>
          {updateProfile.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(updateProfile.error)}
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={!dirty || updateProfile.isPending}>
            {updateProfile.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

const emptyPasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
type PasswordField = keyof typeof emptyPasswordForm;
type PasswordErrors = Partial<Record<PasswordField, string>>;

function PasswordCard() {
  const [form, setForm] = useState(emptyPasswordForm);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const changePassword = useChangePassword();

  const set = (field: PasswordField) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((previous) => ({ ...previous, [field]: event.target.value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (form.newPassword !== form.confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    const parsed = ChangePasswordSchema.safeParse({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    if (!parsed.success) {
      const next: PasswordErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as PasswordField;
        next[field] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    changePassword.mutate(parsed.data, {
      onSuccess: () => {
        setForm(emptyPasswordForm);
        changePassword.reset();
      },
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing your password signs you out everywhere else. This tab stays signed in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="currentPassword" label="Current password" error={errors.currentPassword}>
            <Input
              id="currentPassword"
              type="password"
              value={form.currentPassword}
              onChange={set('currentPassword')}
              autoComplete="current-password"
            />
          </Field>
          <Field
            id="newPassword"
            label="New password"
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={errors.newPassword}
          >
            <Input
              id="newPassword"
              type="password"
              value={form.newPassword}
              onChange={set('newPassword')}
              autoComplete="new-password"
            />
          </Field>
          <Field id="confirmPassword" label="Confirm new password" error={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              autoComplete="new-password"
            />
          </Field>
          {changePassword.isError && (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(changePassword.error)}
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending ? 'Updating…' : 'Change password'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
