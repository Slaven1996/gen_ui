import { useId, useState, type FormEvent } from 'react';
import { CreateUserSchema, PASSWORD_MIN_LENGTH, type PublicUser, type Role } from '@gen-ui/shared';
import { Field } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/api/errors';
import { fieldErrors } from '@/lib/form';
import { useCreateUser } from '../api/mutations';
import type { CreateUserPrefill } from '../types';

type FieldErrors = Partial<Record<'email' | 'name' | 'password', string>>;

/**
 * The Add user form: the dialog's header, fields and button. The page shows
 * it in `CreateUserDialog`; the assistant shows it inside an answer
 * (`InlineDialog`), pre-filled. Either way it sits inside a `Dialog`, which
 * its title and description need.
 */
export function CreateUserForm({
  initial,
  disabled = false,
  onCreated,
}: {
  initial?: CreateUserPrefill;
  /** Keeps the button off, e.g. while the answer that opened the form is still streaming. */
  disabled?: boolean;
  onCreated: (user: PublicUser) => void;
}) {
  const id = useId();
  const [form, setForm] = useState(() => ({
    email: initial?.email ?? '',
    name: initial?.name ?? '',
    password: '',
    role: initial?.role ?? ('USER' as Role),
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const createUser = useCreateUser();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = CreateUserSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    createUser.mutate(parsed.data, { onSuccess: onCreated });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Add user</DialogTitle>
        <DialogDescription>They can sign in right away with the password you set.</DialogDescription>
      </DialogHeader>

      <Field id={`${id}-name`} label="Name" error={errors.name}>
        <Input
          id={`${id}-name`}
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field id={`${id}-email`} label="Email" error={errors.email}>
        <Input
          id={`${id}-email`}
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field
        id={`${id}-password`}
        label="Temporary password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errors.password}
      >
        <Input
          id={`${id}-password`}
          type="password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          autoComplete="new-password"
        />
      </Field>
      <Field id={`${id}-role`} label="Role">
        <Select value={form.role} onValueChange={(role) => setForm({ ...form, role: role as Role })}>
          <SelectTrigger id={`${id}-role`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">User</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {createUser.isError && (
        <p className="text-sm text-destructive" role="alert">
          {getErrorMessage(createUser.error)}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={disabled || createUser.isPending}>
          {createUser.isPending ? 'Adding…' : 'Add user'}
        </Button>
      </DialogFooter>
    </form>
  );
}
