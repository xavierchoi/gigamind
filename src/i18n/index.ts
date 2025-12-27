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
//
// These types are inferred directly from the Korean JSON files (source of truth).
// They provide compile-time validation and ensure type safety for translation keys.
//
// Note: Manual interfaces in types.ts (CommonTranslations, CommandTranslations, etc.)
// serve as documentation and may not be 100% in sync. Prefer these JSON-inferred
// types for actual usage.
// ============================================================================

/** JSON-inferred type for common.json translations */
export type CommonJSON = typeof koCommon;
/** JSON-inferred type for commands.json translations */
export type CommandsJSON = typeof koCommands;
/** JSON-inferred type for errors.json translations */
export type ErrorsJSON = typeof koErrors;
/** JSON-inferred type for prompts.json translations */
export type PromptsJSON = typeof koPrompts;
/** JSON-inferred type for onboarding.json translations */
export type OnboardingJSON = typeof koOnboarding;
/** JSON-inferred type for similar-links.json translations */
export type SimilarLinksJSON = typeof koSimilarLinks;

/**
 * Type-safe keys for each namespace.
 *
 * Usage:
 *   const key: CommonKey = 'greeting.hello';  // Type-checked!
 *   t(`common:${key}`);
 */
export type CommonKey = NestedKeyOf<CommonJSON>;
export type CommandsKey = NestedKeyOf<CommandsJSON>;
export type ErrorsKey = NestedKeyOf<ErrorsJSON>;
export type PromptsKey = NestedKeyOf<PromptsJSON>;
export type OnboardingKey = NestedKeyOf<OnboardingJSON>;
export type SimilarLinksKey = NestedKeyOf<SimilarLinksJSON>;

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
