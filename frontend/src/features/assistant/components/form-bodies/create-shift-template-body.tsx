import { TemplateForm } from '@/features/shifts/components/dialogs/template-form';
import type { FormProps } from '../../types';

export function CreateShiftTemplateBody({ input, disabled, onSaved }: FormProps<'createShiftTemplate'>) {
  return <TemplateForm prefill={input} heading="dialog" disabled={disabled} onSaved={(template) => onSaved(template.id)} />;
}
