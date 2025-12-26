// Translation namespace types for type-safe i18n

export interface CommonTranslations {
  appName: string;
  welcome: string;
  goodbye: string;
  loading: string;
  error: string;
  success: string;
  cancel: string;
  confirm: string;
  yes: string;
  no: string;
  help: string;
  version: string;
  language: string;
}

export interface CommandTranslations {
  init: {
    description: string;
    success: string;
    alreadyInitialized: string;
    creatingConfig: string;
  };
  search: {
    description: string;
    noResults: string;
    searching: string;
    resultsFound: string;
  };
  add: {
    description: string;
    success: string;
    failed: string;
  };
  sync: {
    description: string;
    syncing: string;
    success: string;
    failed: string;
  };
  graph: {
    description: string;
    starting: string;
    running: string;
    stopped: string;
  };
}

export interface ErrorTranslations {
  notInitialized: string;
  configNotFound: string;
  invalidConfig: string;
  fileNotFound: string;
  permissionDenied: string;
  networkError: string;
  unknownError: string;
  apiKeyMissing: string;
  apiKeyInvalid: string;
  rateLimitExceeded: string;
}

export interface PromptTranslations {
  enterQuery: string;
  selectOption: string;
  confirmAction: string;
  enterPath: string;
  enterApiKey: string;
}

export interface OnboardingTranslations {
  welcome: string;
  intro: string;
  step1: {
    title: string;
    description: string;
  };
  step2: {
    title: string;
    description: string;
  };
  step3: {
    title: string;
    description: string;
  };
  complete: string;
  skipOnboarding: string;
}

export interface SimilarLinksTranslations {
  title: string;
  cluster: string;
  recommended: string;
  similarity: string;
  occurrences: string;
  merge: string;
  mergeConfirm: string;
  mergeSuccess: string;
  mergeError: string;
  noSimilarLinks: string;
  threshold: string;
  analyze: string;
  cancel: string;
  preserveAlias: string;
}

// Combined translations type
export interface Translations {
  common: CommonTranslations;
  commands: CommandTranslations;
  errors: ErrorTranslations;
  prompts: PromptTranslations;
  onboarding: OnboardingTranslations;
  'similar-links': SimilarLinksTranslations;
}

// Supported languages
export type SupportedLanguage = 'ko' | 'en';

// Type-safe translation key helper
export type TranslationKey<NS extends keyof Translations> = keyof Translations[NS];
