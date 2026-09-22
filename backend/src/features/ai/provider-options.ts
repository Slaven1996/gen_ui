import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import type { streamText } from 'ai';
import type { AppConfigService } from '../../config/app-config.service.js';

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;

export function buildProviderOptions(config: AppConfigService): ProviderOptions | undefined {
  if (config.get('AI_PROVIDER') !== 'anthropic') return undefined;

  const effort = config.get('AI_EFFORT');

  // Claude Opus 5 / Sonnet 5 think adaptively. Do NOT add `budgetTokens`,
  // `temperature` or `topP`: these models reject them with a 400.
  const anthropic = {
    thinking: {
      type: 'adaptive',
      // The default ("omitted") streams empty reasoning; summaries give the UI something to show.
      display: config.get('AI_SEND_REASONING') ? 'summarized' : 'omitted',
    },
    ...(effort && { effort }),
    // Server-side refusal fallback — the provider adds the required beta header itself.
    ...(config.get('AI_REFUSAL_FALLBACK') && { fallbacks: 'default' as const }),
  } satisfies AnthropicLanguageModelOptions;

  return { anthropic };
}
