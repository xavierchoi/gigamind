// Translation namespace types for type-safe i18n

// ============================================================================
// Supported languages and namespaces
// ============================================================================

// Supported languages
export type SupportedLanguage = 'ko' | 'en';

// Available translation namespaces
export type TranslationNamespace =
  | 'common'
  | 'commands'
  | 'errors'
  | 'prompts'
  | 'onboarding'
  | 'similar-links';

// ============================================================================
// Type-safe translation key utilities
// ============================================================================
//
// Design notes:
// - These utilities use TypeScript's recursive conditional types
// - Tested to work reliably with nesting depths up to 5-6 levels
// - For very deep nesting (>10 levels), TypeScript may hit recursion limits
// - Arrays are treated as objects; use with care for array-containing structures
//
// Performance considerations:
// - Large objects (100+ keys) may slow down type inference
// - Consider splitting large namespaces if IDE responsiveness degrades
// ============================================================================

/**
 * Recursively generates dot-notation paths for nested objects.
 *
 * @example
 * ```typescript
 * type Keys = NestedKeyOf<{ a: { b: string; c: { d: string } } }>
 * // Result: "a" | "a.b" | "a.c" | "a.c.d"
 * ```
 *
 * @example Usage with t() function
 * ```typescript
 * t('common:greeting.hello')  // Access nested key
 * t('errors:codes.unknown.minimal')  // Deep nested access
 *
 * // Type-safe key validation
 * const key: NestedKeyOf<CommonJSON> = 'greeting.hello';  // ✓ Valid
 * const bad: NestedKeyOf<CommonJSON> = 'greeting.invalid'; // ✗ Type error
 * ```
 *
 * @typeParam T - Object type to extract keys from
 * @returns Union of all valid dot-notation paths
 */
export type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? K | `${K}.${NestedKeyOf<T[K]>}`
        : K;
    }[keyof T & string]
  : never;

/**
 * Extracts the type at a given dot-notation path.
 *
 * @example
 * ```typescript
 * type Value = PathValue<{ a: { b: string } }, "a.b">
 * // Result: string
 *
 * // Use with translation return type validation
 * type HelloType = PathValue<CommonJSON, 'greeting.hello'>; // string
 * ```
 *
 * @typeParam T - Object type to navigate
 * @typeParam P - Dot-notation path string
 * @returns Type at the specified path, or never if path is invalid
 */
export type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

// ============================================================================
// Namespace type definitions (Manual Interfaces)
// ============================================================================
//
// DESIGN DECISION: Two-tier type system
//
// 1. Manual interfaces (defined here)
//    - Serve as documentation and specification
//    - Enable IDE autocompletion when editing JSON files
//    - May drift from actual JSON during rapid development
//    - Prefixed with namespace name: CommonTranslations, CommandTranslations, etc.
//
// 2. JSON-inferred types (defined in index.ts)
//    - Always in sync with actual JSON files (source of truth)
//    - Suffixed with JSON: CommonJSON, CommandsJSON, etc.
//    - Recommended for runtime type checking
//
// USAGE RECOMMENDATIONS:
//
//   // For type-safe translation access, use JSON-inferred types:
//   import { CommonJSON, CommonKey } from './index.js';
//   const key: CommonKey = 'greeting.hello';  // Compile-time validated
//
//   // For documentation/specification, reference manual interfaces:
//   import type { CommonTranslations } from './types.js';
//
// FUTURE: Consider adding compile-time validation that JSON matches interfaces
// using tools like zod or io-ts for schema generation.
// ============================================================================

export interface CommonTranslations {
  greeting: {
    hello: string;
    hello_with_name: string;
    what_can_i_help: string;
    welcome_to_gigamind: string;
  };
  loading: {
    loading_app: string;
    validating_api_key: string;
    analyzing_notes: string;
    folder_dialog_opened: string;
  };
  processing: {
    processing: string;
    searching_notes: string;
    writing_note: string;
    analyzing_my_notes: string;
    starting_graph_server: string;
    files_matched: string;
    files_found: string;
    related_files_checked: string;
  };
  thinking: {
    thinking: string;
    thinking_with_time: string;
  };
  working: {
    using_tool: string;
    exploring_notes_with_tool: string;
  };
  cancel_hint: {
    esc_to_cancel: string;
  };
  request_cancelled: {
    cancelled: string;
  };
  settings_saved: {
    saved: string;
    cancelled: string;
  };
  time_display: {
    current_time: string;
    minutes_ago: string;
    last_activity: string;
  };
  help_hint: {
    help_command: string;
  };
  input: {
    placeholder: string;
    waiting_for_response: string;
    enter_message: string;
    characters: string;
  };
  keyboard_shortcuts: {
    ctrl_c_exit: string;
    enter_send: string;
    arrows_history: string;
    esc_cancel: string;
    shortcuts_footer: string;
    overlay_title: string;
    overlay_close_hint: string;
    shortcut_exit: string;
    shortcut_show_shortcuts: string;
    shortcut_send_message: string;
    shortcut_input_history: string;
    shortcut_autocomplete: string;
    shortcut_example_prompts: string;
    shortcut_cancel: string;
  };
  session: {
    previous_session_found: string;
    message_count: string;
    first_message: string;
    last_message: string;
    continue_session_prompt: string;
    restore_session: string;
    new_session: string;
    session_restored: string;
    no_saved_sessions: string;
    session_manager_not_initialized: string;
    recent_sessions_list: string;
    session_exported: string;
    session_export_failed: string;
    no_messages: string;
    load_no_id: string;
    session_not_found: string;
    session_loaded: string;
    search_no_query: string;
    search_no_results: string;
    search_results: string;
    role_user: string;
    role_assistant: string;
    load_hint: string;
    delete_no_id: string;
    delete_confirm: string;
    delete_current_session_error: string;
    session_deleted: string;
    delete_failed: string;
    export_not_found: string;
    export_no_messages: string;
    export_title: string;
    export_session_id: string;
    export_start_time: string;
    export_last_modified: string;
    export_message_count: string;
    export_tags: string;
    export_user: string;
    export_gigamind: string;
  };
  example_prompts: {
    title: string;
    hint: string;
    organize_today: string;
    brainstorm_ideas: string;
    create_todo_list: string;
    find_project_ideas: string;
    what_did_i_think: string;
  };
  command_hints: {
    available_commands: string;
  };
  messages: {
    hidden_count: string;
  };
  status: {
    notes: string;
    connections: string;
    dangling: string;
    orphan: string;
    sync: string;
    just_now: string;
    minutes_ago: string;
    hours_ago: string;
    days_ago: string;
    working: string;
  };
  loading_phases: {
    thinking: string;
    searching: string;
    reading: string;
    writing: string;
    analyzing: string;
    delegating: string;
  };
  search_progress: {
    files_scanned: string;
    files_matched: string;
    files_scanned_matched: string;
  };
  splash: {
    waking_up: string;
  };
  intent: {
    search_agent: string;
    note_agent: string;
    clone_agent: string;
    research_agent: string;
    import_agent: string;
    sync_agent: string;
    uncertain_prefix: string;
    uncertain_suffix: string;
  };
  config_menu: {
    title: string;
    user_name: string;
    notes_dir: string;
    model: string;
    feedback_level: string;
    note_detail: string;
    language: string;
    save_and_exit: string;
    cancel: string;
    not_set: string;
    current: string;
    current_bilingual: string;
    model_changed: string;
    feedback_level_changed: string;
    note_detail_changed: string;
    language_changed: string;
    user_name_changed: string;
    notes_dir_changed: string;
    select_model: string;
    select_feedback_level: string;
    select_note_detail: string;
    select_language: string;
    note_detail_description: string;
    language_description: string;
    edit: string;
    name_placeholder: string;
    path_placeholder: string;
    nav_select_cancel: string;
    nav_edit_cancel: string;
    nav_save_cancel: string;
    nav_bilingual: string;
    detail_verbose: string;
    detail_balanced: string;
    detail_concise: string;
    detail_verbose_desc: string;
    detail_balanced_desc: string;
    detail_concise_desc: string;
    lang_korean: string;
    lang_english: string;
    lang_korean_desc: string;
    lang_english_desc: string;
    reset_defaults: string;
    reset_confirm_title: string;
    reset_confirm_message: string;
    reset_confirm_note: string;
    reset_confirm_prompt: string;
    reset_success: string;
    reset_cancelled: string;
    api_key: string;
    api_key_checking: string;
    api_key_configured: string;
    api_key_not_configured: string;
    api_key_description: string;
    api_key_placeholder: string;
    api_key_input_label: string;
    api_key_input_entered: string;
    api_key_validating: string;
    api_key_changed: string;
    api_key_error_empty: string;
    api_key_error_format: string;
    api_key_error_invalid: string;
    api_key_error_unknown: string;
    api_key_error_validation: string;
    'model.sonnet': string;
    'model.opus': string;
    'feedback.minimal': string;
    'feedback.medium': string;
    'feedback.detailed': string;
  };
  path_validation: {
    empty: string;
    is_file: string;
    not_writable: string;
    parent_not_exists: string;
    parent_not_writable: string;
    valid_exists: string;
    valid_will_create: string;
    expanded_path: string;
    validating: string;
  };
  question_collector: {
    progress: string;
    select_option: string;
    other_input: string;
    other_placeholder: string;
    skip: string;
    cancel: string;
    submit: string;
    selected: string;
    multi_select_hint: string;
    toggle_selection: string;
    keyboard_hints: string;
    question_cancelled: string;
  };
  graph: {
    create_note_btn: string;
    create_note_hint: string;
    toast_invalid_node: string;
    toast_clipboard_unavailable: string;
    toast_copied: string;
    toast_copy_failed: string;
  };
  time: {
    just_now: string;
    seconds_ago: string;
    minutes_ago: string;
    hours_ago: string;
    yesterday: string;
    days_ago: string;
    weeks_ago: string;
    months_ago: string;
    years_ago: string;
    soon: string;
    seconds_later: string;
    minutes_later: string;
    hours_later: string;
    tomorrow: string;
    days_later: string;
    weeks_later: string;
    months_later: string;
    years_later: string;
  };
  subagent: {
    request_cancelled: string;
  };
  folder_dialog: {
    title: string;
  };
  session_preview: {
    title: string;
    last_activity: string;
    minutes_ago: string;
    message_count: string;
    message_count_unit: string;
    first_message: string;
    recent_preview: string;
    restore_prompt: string;
    button: {
      restore: string;
      new: string;
      toggle_preview: string;
    };
  };
  import: {
    title: string;
    source: {
      obsidian: string;
      markdown: string;
      cancel: string;
    };
    prompt: {
      select_source: string;
      enter_path: string;
      enter_path_direct: string;
      open_folder_dialog: string;
    };
    status: {
      analyzing: string;
      searching_files: string;
      searching_images: string;
      building_wikilink_map: string;
      copying_images: string;
      processing_note: string;
      cancelling: string;
      rolling_back: string;
    };
    error: {
      path_not_found: string;
      no_markdown_files: string;
      dialog_error: string;
      import_failed: string;
      check_path: string;
    };
    progress: {
      notes_found: string;
      images_found: string;
      processing: string;
      source: string;
    };
    hint: {
      home_dir_unix: string;
      home_dir_windows: string;
      esc_cancel: string;
    };
    folder_dialog: {
      title: string;
      opening: string;
      instruction: string;
    };
    complete: {
      title: string;
      notes_imported: string;
      images_imported: string;
      source: string;
      notes_location: string;
      images_location: string;
      restart_hint: string;
      press_enter: string;
    };
    cancelled: {
      title: string;
      rolled_back: string;
      partial_notes: string;
      partial_images: string;
      source: string;
      press_enter: string;
    };
    actions: {
      retry: string;
    };
  };
}

export interface CommandTranslations {
  help: {
    title: string;
    description: string;
    natural_language_section: string;
    natural_language_examples: {
      search_notes: string;
      clone_mode: string;
      find_in_notes: string;
      take_memo: string;
      my_perspective: string;
    };
    shortcuts_section: string;
    shortcuts: {
      exit: string;
      cancel: string;
      history: string;
    };
  };
  search: {
    description: string;
    usage: string;
    example: string;
    enter_query: string;
  };
  note: {
    description: string;
    usage: string;
    enter_content: string;
    examples: {
      title: string;
      meeting_idea: string;
      react_summary: string;
      book_memo: string;
    };
    help_text: string;
  };
  clone: {
    description: string;
    short_description: string;
    usage: string;
    enter_question: string;
    examples: {
      title: string;
      project_opinion: string;
      productivity: string;
      book_recommendation: string;
    };
    help_text: string;
  };
  graph: {
    description: string;
    opened_message: string;
    url_label: string;
    shortcuts_title: string;
    shortcuts: {
      search: string;
      zoom: string;
      reset_view: string;
      exit_focus: string;
      fullscreen: string;
    };
    auto_shutdown: string;
  };
  session: {
    description: string;
    list_description: string;
    export_description: string;
    load_description: string;
    search_description: string;
    delete_description: string;
    usage_title: string;
    usage_list: string;
    usage_export: string;
    usage_load: string;
    usage_search: string;
    usage_delete: string;
  };
  config: {
    description: string;
  };
  import: {
    description: string;
    title: string;
    completed: string;
    cancelled_partial: string;
    notes_imported: string;
    images_copied: string;
    source_label: string;
    destination_label: string;
    before_cancel: string;
  };
  clear: {
    description: string;
  };
  sync: {
    description: string;
    not_implemented: string;
    see_help: string;
  };
  unknown_command: {
    message: string;
    see_help: string;
  };
  ambiguous_command: {
    message: string;
  };
  welcome_message: {
    setup_complete: string;
    setup_complete_with_name: string;
    ready_to_chat: string;
    import_configured: string;
    import_source_obsidian: string;
    import_source_markdown: string;
    import_path_label: string;
    import_start_hint: string;
    capabilities_title: string;
    capability_organize: string;
    capability_search: string;
    capability_clone: string;
  };
}

// ============================================================================
// Error Type Definitions
// ============================================================================
//
// STRUCTURE OVERVIEW:
// - 36 error codes organized by category (api, validation, fs, config, subagent)
// - 3 verbosity levels per error (minimal, medium, detailed)
// - Recovery hints for actionable errors
// - Specific interfaces for common UI error displays
//
// DESIGN RATIONALE:
// The current structure prioritizes type safety and explicit documentation over
// simplicity. Each error type is fully specified to enable compile-time validation.
//
// POTENTIAL SIMPLIFICATIONS (future consideration):
//
// 1. Use mapped types to reduce boilerplate:
//    type ErrorCode = 'unknown' | 'internal' | 'api_invalid_key' | ...;
//    type ErrorCodes = Record<ErrorCode, ErrorLevelMessages>;
//
// 2. Use a single generic error interface:
//    interface ErrorDisplay<T extends string = string> {
//      title: string;
//      message: string;
//      hints?: string[];
//      actions?: Record<T, string>;
//    }
//
// 3. Use a registry pattern for runtime extensibility:
//    const errorRegistry = new Map<ErrorCode, ErrorDefinition>();
//
// Current structure is kept for backwards compatibility.
// ============================================================================

// Error message with three verbosity levels
export interface ErrorLevelMessages {
  minimal: string;
  medium: string;
  detailed: string;
}

// Error codes with their level-based messages
export interface ErrorCodes {
  unknown: ErrorLevelMessages;
  internal: ErrorLevelMessages;
  api_invalid_key: ErrorLevelMessages;
  api_rate_limit: ErrorLevelMessages;
  api_quota_exceeded: ErrorLevelMessages;
  api_network_error: ErrorLevelMessages;
  api_timeout: ErrorLevelMessages;
  api_server_error: ErrorLevelMessages;
  api_model_unavailable: ErrorLevelMessages;
  api_context_too_long: ErrorLevelMessages;
  api_authentication_failed: ErrorLevelMessages;
  validation_required_field: ErrorLevelMessages;
  validation_invalid_format: ErrorLevelMessages;
  validation_invalid_path: ErrorLevelMessages;
  validation_invalid_config: ErrorLevelMessages;
  validation_tool_input: ErrorLevelMessages;
  fs_file_not_found: ErrorLevelMessages;
  fs_permission_denied: ErrorLevelMessages;
  fs_no_space: ErrorLevelMessages;
  fs_path_too_long: ErrorLevelMessages;
  fs_directory_not_found: ErrorLevelMessages;
  fs_file_exists: ErrorLevelMessages;
  fs_read_error: ErrorLevelMessages;
  fs_write_error: ErrorLevelMessages;
  fs_access_denied: ErrorLevelMessages;
  config_not_found: ErrorLevelMessages;
  config_parse_error: ErrorLevelMessages;
  config_invalid_value: ErrorLevelMessages;
  config_missing_api_key: ErrorLevelMessages;
  config_notes_dir_not_found: ErrorLevelMessages;
  subagent_unknown: ErrorLevelMessages;
  subagent_execution_failed: ErrorLevelMessages;
  subagent_timeout: ErrorLevelMessages;
  subagent_tool_failed: ErrorLevelMessages;
  subagent_max_iterations: ErrorLevelMessages;
  subagent_not_initialized: ErrorLevelMessages;
}

// Recovery hints for specific error codes
export interface ErrorRecoveryHints {
  api_invalid_key: string;
  api_rate_limit: string;
  api_quota_exceeded: string;
  api_network_error: string;
  api_timeout: string;
  api_context_too_long: string;
  fs_no_space: string;
  fs_permission_denied: string;
  config_missing_api_key: string;
  config_notes_dir_not_found: string;
  subagent_max_iterations: string;
}

// Format-related strings for error display
export interface ErrorFormat {
  hint: string;
  error_code: string;
  cause: string;
  path: string;
  status_code: string;
  fallback_error: string;
  standard_error_minimal: string;
  standard_error_medium: string;
  standard_error_detailed: string;
}

// User-friendly error messages with solution hints
export interface ErrorWithSolution {
  title: string;
  solution_header: string;
  full_message: string;
}

export interface ApiKeyInvalidError extends ErrorWithSolution {
  check_config: string;
  check_console: string;
}

export interface AuthenticationFailedError extends ErrorWithSolution {
  check_api_key: string;
  check_expiry: string;
}

export interface RateLimitError extends ErrorWithSolution {
  wait_and_retry: string;
}

export interface QuotaExceededError extends ErrorWithSolution {
  check_usage: string;
  upgrade_plan: string;
}

export interface NetworkErrorMessage extends ErrorWithSolution {
  check_internet: string;
  check_vpn_proxy: string;
}

export interface TimeoutError extends ErrorWithSolution {
  check_network: string;
  retry_later: string;
}

export interface ServerErrorMessage extends ErrorWithSolution {
  retry_later: string;
  check_status: string;
}

export interface GenericError {
  title: string;
  error_with_message: string;
  solution_hint: string;
  full_message: string;
}

export interface InitializationError {
  title: string;
  error_during_init: string;
  solution_header: string;
  retry_hint: string;
  reset_config_hint: string;
  exit_hint: string;
}

export interface ValidationErrors {
  api_key_required: string;
  invalid_api_key_format: string;
  api_key_validation_failed: string;
  api_key_validation_error: string;
  unknown_error: string;
}

export interface SearchErrors {
  error_during_search: string;
}

export interface CloneErrors {
  error_during_clone: string;
}

export interface NoteErrors {
  error_during_note: string;
  error_during_note_friendly: string;
}

export interface GraphErrors {
  error_starting_server: string;
}

export interface ImportErrors {
  cancelled: string;
  failed: string;
  dialog_error: string;
}

export interface ConfigErrors {
  save_error: string;
}

export interface ErrorTranslations {
  codes: ErrorCodes;
  recovery_hints: ErrorRecoveryHints;
  format: ErrorFormat;
  api_key_invalid: ApiKeyInvalidError;
  authentication_failed: AuthenticationFailedError;
  rate_limit: RateLimitError;
  quota_exceeded: QuotaExceededError;
  network_error: NetworkErrorMessage;
  timeout: TimeoutError;
  server_error: ServerErrorMessage;
  generic: GenericError;
  initialization: InitializationError;
  validation: ValidationErrors;
  search: SearchErrors;
  clone: CloneErrors;
  note: NoteErrors;
  graph: GraphErrors;
  import: ImportErrors;
  config: ConfigErrors;
  api_key_not_set: string;
}

export interface PromptTranslations {
  enterQuery: string;
  selectOption: string;
  confirmAction: string;
  enterPath: string;
  enterApiKey: string;
}

export interface OnboardingTranslations {
  welcome: {
    title: string;
    description_partner: string;
    description_setup: string;
    time_estimate: string;
    default_hint: string;
    press_enter: string;
  };
  api_key: {
    prompt: string;
    description: string;
    console_hint: string;
    how_to_get_title: string;
    step_1: string;
    step_2: string;
    step_3: string;
    step_4: string;
    placeholder: string;
    input_label: string;
    input_entered: string;
    validating: string;
    validated: string;
    retry_hint: string;
    invalid_hint: string;
    quota_hint: string;
    error_empty: string;
    error_invalid_format: string;
    error_validation_failed: string;
    error_unknown: string;
    error_validation_error: string;
  };
  notes_dir: {
    prompt: string;
    options: {
      home_default: string;
      documents: string;
      custom: string;
    };
    dialog_title: string;
    open_folder_dialog: string;
    dialog_error: string;
    manual_input: string;
    placeholder: string;
    folder_dialog_opened: string;
    folder_dialog_hint: string;
  };
  user_name: {
    prompt: string;
    placeholder: string;
  };
  use_cases: {
    prompt: string;
    options: {
      ideas: string;
      projects: string;
      reading: string;
      meetings: string;
      learning: string;
    };
    controls: string;
    selected_count: string;
  };
  existing_notes: {
    prompt: string;
    options: {
      yes: string;
      no: string;
    };
  };
  import_source: {
    title: string;
    prompt: string;
    options: {
      obsidian: string;
      markdown: string;
    };
  };
  import_path: {
    prompt: string;
    dialog_title: string;
    placeholder_obsidian_mac: string;
    placeholder_obsidian_windows: string;
    placeholder_markdown_mac: string;
    placeholder_markdown_windows: string;
    home_hint_mac: string;
    home_hint_windows: string;
    manual_input: string;
    folder_dialog_hint: string;
  };
  importing: {
    analyzing: string;
    markdown_files: string;
    folders: string;
  };
  complete: {
    title: string;
    ready: string;
    welcome_with_name: string;
    import_scheduled: string;
    import_hint: string;
    features_title: string;
    feature_search: string;
    feature_clone: string;
    feature_natural: string;
    transition_hint: string;
  };
  navigation: {
    step_indicator: string;
    esc_previous: string;
  };
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

// ============================================================================
// Deprecated: TranslationKey type
// ============================================================================
//
// The following type was intended for type-safe translation key access:
//
//   export type TranslationKey<NS extends keyof Translations> = keyof Translations[NS];
//
// However, this only provides first-level keys and doesn't work with nested
// structures like 'greeting.hello' or 'codes.unknown.minimal'.
//
// For nested key access, use NestedKeyOf<T> with the actual JSON type instead:
//
//   import commonJson from './locales/ko/common.json';
//   type CommonKey = NestedKeyOf<typeof commonJson>;
//   // Result: "greeting" | "greeting.hello" | "greeting.hello_with_name" | ...
//
// ============================================================================
