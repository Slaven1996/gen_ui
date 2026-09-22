import { Logger, type FactoryProvider } from '@nestjs/common';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import { AppConfigService } from '../../config/app-config.service.js';
import { AI_KEY_VARS } from '../../config/env.schema.js';

export const AI_LANGUAGE_MODEL = Symbol('AI_LANGUAGE_MODEL');

/** `null` when the selected provider has no API key; the chat endpoint then answers 503. */
export type AiLanguageModel = LanguageModel | null;

type ProviderFactory = (settings: { apiKey: string }) => (modelId: string) => LanguageModel;

/** Non-default providers are optional dependencies, loaded only when selected. */
async function loadOptionalProvider(pkg: string, factoryName: string): Promise<ProviderFactory> {
  try {
    const mod = (await import(pkg)) as Record<string, ProviderFactory | undefined>;
    const factory = mod[factoryName];
    if (!factory) throw new Error(`${pkg} has no export "${factoryName}"`);
    return factory;
  } catch (error) {
    throw new Error(
      `AI_PROVIDER needs "${pkg}". Install it with: pnpm --filter backend add ${pkg}`,
      { cause: error },
    );
  }
}

export const aiLanguageModelProvider: FactoryProvider<AiLanguageModel> = {
  provide: AI_LANGUAGE_MODEL,
  inject: [AppConfigService],
  useFactory: async (config: AppConfigService): Promise<AiLanguageModel> => {
    const provider = config.get('AI_PROVIDER');
    const modelId = config.get('AI_MODEL');
    const keyVar = AI_KEY_VARS[provider];
    const apiKey = config.get(keyVar);

    if (!apiKey) {
      new Logger('AiModule').warn(`${keyVar} is not set — POST /api/ai/chat will return 503.`);
      return null;
    }

    switch (provider) {
      case 'anthropic':
        return createAnthropic({ apiKey })(modelId);
      case 'openai':
        return (await loadOptionalProvider('@ai-sdk/openai', 'createOpenAI'))({ apiKey })(modelId);
      case 'google':
        return (await loadOptionalProvider('@ai-sdk/google', 'createGoogleGenerativeAI'))({ apiKey })(
          modelId,
        );
      case 'gateway':
        // Plain "provider/model" ids resolve through the AI Gateway, which reads
        // AI_GATEWAY_API_KEY from the environment.
        return modelId;
    }
  },
};
