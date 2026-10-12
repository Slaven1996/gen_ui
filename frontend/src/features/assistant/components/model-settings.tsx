import { ASSISTANT_MODELS, AssistantModelSchema, EffortSchema, type Effort } from '@gen-ui/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setAssistantEffort, setAssistantModel, useAssistantEffort, useAssistantModel } from '../store/assistant-preferences';

const EFFORT_LABELS: Record<Effort, string> = {
  low: 'Low effort',
  medium: 'Medium effort',
  high: 'High effort',
  xhigh: 'Extra-high effort',
  max: 'Max effort',
};

/**
 * Which Claude model answers the next message, and how hard it works. Both
 * are remembered in this browser and sent with every request. The effort
 * picker is hidden for a model without effort levels (Claude Haiku 4.5).
 */
export function ModelSettings() {
  const model = useAssistantModel();
  const effort = useAssistantEffort();
  const { effort: hasEffort } = ASSISTANT_MODELS[model];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={model} onValueChange={(value) => setAssistantModel(AssistantModelSchema.parse(value))}>
        <SelectTrigger size="sm" className="text-xs" aria-label="Model">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AssistantModelSchema.options.map((id) => (
            <SelectItem key={id} value={id} className="text-xs">
              {ASSISTANT_MODELS[id].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasEffort ? (
        <Select value={effort} onValueChange={(value) => setAssistantEffort(EffortSchema.parse(value))}>
          <SelectTrigger size="sm" className="text-xs" aria-label="Effort level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EffortSchema.options.map((level) => (
              <SelectItem key={level} value={level} className="text-xs">
                {EFFORT_LABELS[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-muted-foreground">No effort levels</span>
      )}
    </div>
  );
}
