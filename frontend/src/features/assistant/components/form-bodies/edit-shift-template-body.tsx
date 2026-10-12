import { useQuery } from '@tanstack/react-query';
import { shiftTemplatesQueryOptions } from '@/features/shifts/api/queries';
import { TemplateForm } from '@/features/shifts/components/dialogs/template-form';
import type { FormProps } from '../../types';
import { WhenLoaded } from '../when-loaded';

/** The template as it is now, from the list the Shifts page keeps, with Claude's changes over it. */
export function EditShiftTemplateBody({ input, disabled, onSaved }: FormProps<'editShiftTemplate'>) {
  const template = useQuery({
    ...shiftTemplatesQueryOptions(),
    select: (templates) => templates.find((item) => item.id === input.templateId) ?? null,
  });
  return (
    <WhenLoaded query={template}>
      {(current) =>
        current ? (
          <TemplateForm
            template={current}
            prefill={input.changes}
            heading="dialog"
            disabled={disabled}
            onSaved={(saved) => onSaved(saved.id)}
          />
        ) : (
          <p className="pr-6 text-sm text-destructive" role="alert">
            This shift template no longer exists.
          </p>
        )
      }
    </WhenLoaded>
  );
}
