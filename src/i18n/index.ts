import i18next from 'i18next';
import type { SupportedLanguage, TranslationNamespace, NestedKeyOf, PathValue } from './types.js';

export type { SupportedLanguage, TranslationNamespace, NestedKeyOf, PathValue };

// Import Korean translations
import koCommon from './locales/ko/common.json' with { type: 'json' };
import koCommands from './locales/ko/commands.json' with { type: 'json' };
import koErrors from './locales/ko/errors.json' with { type: 'json' };
import koPrompts from './locales/ko/prompts.json' with { type: 'json' };
import koOnboarding from './locales/ko/onboarding.json' with { type: 'json' };
import koSimilarLinks from './locales/ko/similar-links.json' with { type: 'json' };

// Import English translations
import enCommon from './locales/en/common.json' with { type: 'json' };
import enCommands from './locales/en/commands.json' with { type: 'json' };
import enErrors from './locales/en/errors.json' with { type: 'json' };
import enPrompts from './locales/en/prompts.json' with { type: 'json' };
import enOnboarding from './locales/en/onboarding.json' with { type: 'json' };
import enSimilarLinks from './locales/en/similar-links.json' with { type: 'json' };

// ============================================================================
// JSON-inferred types for type-safe translation access
// ============================================================================

/** Type of common.json translations */
export type CommonTranslations = typeof koCommon;
/** Type of commands.json translations */
export type CommandsTranslations = typeof koCommands;
/** Type of errors.json translations */
export type ErrorsTranslations = typeof koErrors;
/** Type of prompts.json translations */
export type PromptsTranslations = typeof koPrompts;
/** Type of onboarding.json translations */
export type OnboardingTranslations = typeof koOnboarding;
/** Type of similar-links.json translations */
export type SimilarLinksTranslations = typeof koSimilarLinks;

/**
 * Type-safe keys for each namespace.
 *
 * Usage:
 *   const key: CommonKey = 'greeting.hello';  // Type-checked!
 *   t(`common:${key}`);
 */
export type CommonKey = NestedKeyOf<CommonTranslations>;
export type CommandsKey = NestedKeyOf<CommandsTranslations>;
export type ErrorsKey = NestedKeyOf<ErrorsTranslations>;
export type PromptsKey = NestedKeyOf<PromptsTranslations>;
export type OnboardingKey = NestedKeyOf<OnboardingTranslations>;
export type SimilarLinksKey = NestedKeyOf<SimilarLinksTranslations>;

// ============================================================================
// i18next initialization
// ============================================================================

export async function initI18n(language: string = 'ko') {
  await i18next.init({
    lng: language,
    fallbackLng: 'ko',
    ns: ['common', 'commands', 'errors', 'prompts', 'onboarding', 'similar-links'],
    defaultNS: 'common',
    resources: {
      ko: {
        common: koCommon,
        commands: koCommands,
        errors: koErrors,
        prompts: koPrompts,
        onboarding: koOnboarding,
        'similar-links': koSimilarLinks,
      },
      en: {
        common: enCommon,
        commands: enCommands,
        errors: enErrors,
        prompts: enPrompts,
        onboarding: enOnboarding,
        'similar-links': enSimilarLinks,
      },
    },
  });
  return i18next;
}

/**
 * Translation function.
 *
 * Usage examples:
 *   t('common:greeting.hello')
 *   t('errors:codes.unknown.minimal')
 *   t('common:processing.files_matched', { count: 5 })
 *
 * For type-safe keys, use the exported key types:
 *   const key: CommonKey = 'greeting.hello';
 *   t(`common:${key}`);
 */
export const t = i18next.t.bind(i18next);

export function getCurrentLanguage(): SupportedLanguage {
  return (i18next.language as SupportedLanguage) || 'ko';
}

export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
}
