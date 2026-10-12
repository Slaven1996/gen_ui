import { TagForm } from '@/features/tags/components/tag-form';
import type { FormProps } from '../../types';

export function CreateTagBody({ input: { deviceId, ...prefill }, disabled, onSaved }: FormProps<'createTag'>) {
  return <TagForm deviceId={deviceId} prefill={prefill} disabled={disabled} onSaved={(tag) => onSaved(tag.id)} />;
}
