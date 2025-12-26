import i18next from 'i18next';
import type { SupportedLanguage } from './types.js';

export type { SupportedLanguage };

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

export const t = i18next.t.bind(i18next);

export function getCurrentLanguage(): SupportedLanguage {
  return (i18next.language as SupportedLanguage) || 'ko';
}

export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
}
