import { CreateUserForm } from '@/features/users/components/create-user-form';
import type { FormProps } from '../../types';

export function CreateUserBody({ input, disabled, onSaved }: FormProps<'createUser'>) {
  return <CreateUserForm initial={input} disabled={disabled} onCreated={(user) => onSaved(user.id)} />;
}

