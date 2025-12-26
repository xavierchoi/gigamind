import type { Command, CommandContext, CommandResult, CommandDefinition } from "./types.js";

// Re-export types
export type {
  Command,
  CommandContext,
  CommandResult,
  CommandDefinition,
  AppState,
  StreamingCallbacks,
} from "./types.js";

// Re-export base class
export { BaseCommand } from "./BaseCommand.js";

// Export command implementations
export { HelpCommand, helpCommand } from "./HelpCommand.js";
export { CloneCommand, cloneCommand } from "./CloneCommand.js";
export { NoteCommand, noteCommand } from "./NoteCommand.js";
export { GraphCommand, graphCommand } from "./GraphCommand.js";
export { SessionCommand, sessionCommand } from "./SessionCommand.js";
export { SearchCommand, searchCommand } from "./SearchCommand.js";
export { ClearCommand, clearCommand } from "./ClearCommand.js";
export { SimilarLinksCommand, similarLinksCommand } from "./SimilarLinksCommand.js";

/**
 * CommandRegistry manages all registered commands and routes execution.
 * This is the central hub for command handling in the application.
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private aliasMap: Map<string, string> = new Map();

  /**
   * Register a command with the registry.
   * @param command - The command to register
   */
  register(command: Command): void {
    this.commands.set(command.name.toLowerCase(), command);

    // Register aliases
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasMap.set(alias.toLowerCase(), command.name.toLowerCase());
      }
    }
  }

  /**
   * Register multiple commands at once.
   * @param commands - Array of commands to register
   */
  registerAll(commands: Command[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  /**
   * Create and register a command from a definition object.
   * Useful for simple commands that don't need a full class.
   */
  registerFromDefinition(definition: CommandDefinition): void {
    const command: Command = {
      ...definition,
      canHandle(commandName: string): boolean {
        const normalizedName = commandName.toLowerCase();
        if (definition.name.toLowerCase() === normalizedName) {
          return true;
        }
        if (definition.aliases?.some((alias) => alias.toLowerCase() === normalizedName)) {
          return true;
        }
        return false;
      },
    };
    this.register(command);
  }

  /**
   * Get a command by name or alias.
   * @param name - Command name or alias (without leading /)
   * @returns The command if found, undefined otherwise
   */
  get(name: string): Command | undefined {
    const normalizedName = name.toLowerCase();

    // Try direct lookup first
    const directCommand = this.commands.get(normalizedName);
    if (directCommand) {
      return directCommand;
    }

    // Try alias lookup
    const aliasTarget = this.aliasMap.get(normalizedName);
    if (aliasTarget) {
      return this.commands.get(aliasTarget);
    }

    return undefined;
  }

  /**
   * Check if a command exists by name or alias.
   * @param name - Command name or alias (without leading /)
   */
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  /**
   * Find commands by prefix matching.
   * Returns exact match if found, otherwise returns all commands that start with the prefix.
   * @param prefix - Command prefix (without leading /)
   * @returns Array of matching command names (primary names only, not aliases)
   */
  findByPrefix(prefix: string): string[] {
    const normalizedPrefix = prefix.toLowerCase();

    // Check for exact match first (including aliases)
    if (this.has(normalizedPrefix)) {
      const command = this.get(normalizedPrefix);
      if (command) {
        return [command.name];
      }
    }

    // Find all commands and aliases that start with the prefix
    const matches = new Set<string>();

    // Check command names
    for (const name of this.commands.keys()) {
      if (name.startsWith(normalizedPrefix)) {
        matches.add(name);
      }
    }

    // Check aliases and resolve to primary names
    for (const [alias, primaryName] of this.aliasMap.entries()) {
      if (alias.startsWith(normalizedPrefix)) {
        matches.add(primaryName);
      }
    }

    return Array.from(matches);
  }

  /**
   * Execute a command by name.
   * @param commandName - Command name (without leading /)
   * @param args - Command arguments
   * @param context - Execution context
   * @returns CommandResult or null if command not found
   */
  async execute(
    commandName: string,
    args: string[],
    context: CommandContext
  ): Promise<CommandResult | null> {
    const command = this.get(commandName);

    if (!command) {
      return null;
    }

    // Check if command requires args but none provided
    if (command.requiresArgs && args.length === 0) {
      return {
        handled: true,
        response: {
          role: "assistant",
          content: `${command.usage}\n\n사용법을 확인해주세요.`,
        },
      };
    }

    return command.execute(args, context);
  }

  /**
   * Get all registered commands.
   */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get all command names (including aliases).
   */
  getAllNames(): string[] {
    const names = Array.from(this.commands.keys());
    const aliases = Array.from(this.aliasMap.keys());
    return [...names, ...aliases];
  }

  /**
   * Get commands grouped by category.
   */
  getByCategory(): Map<string, Command[]> {
    const byCategory = new Map<string, Command[]>();

    for (const command of this.commands.values()) {
      const category = command.category || "general";
      const existing = byCategory.get(category) || [];
      existing.push(command);
      byCategory.set(category, existing);
    }

    return byCategory;
  }

  /**
   * Generate help text for all commands.
   * @param options - Formatting options
   */
  getHelpText(options?: {
    includeAliases?: boolean;
    groupByCategory?: boolean;
    format?: "plain" | "markdown";
  }): string {
    const { includeAliases = true, groupByCategory = false, format = "markdown" } = options || {};

    const commands = Array.from(this.commands.values());

    if (groupByCategory) {
      return this.formatHelpByCategory(commands, includeAliases, format);
    }

    return this.formatHelpList(commands, includeAliases, format);
  }

  private formatHelpList(
    commands: Command[],
    includeAliases: boolean,
    format: "plain" | "markdown"
  ): string {
    const lines: string[] = [];

    if (format === "markdown") {
      lines.push("**사용 가능한 명령어:**\n");
    } else {
      lines.push("사용 가능한 명령어:\n");
    }

    for (const command of commands) {
      let line = `/${command.name}`;

      if (includeAliases && command.aliases && command.aliases.length > 0) {
        const aliasStr = command.aliases.map((a) => `/${a}`).join(", ");
        line += ` (${aliasStr})`;
      }

      line += ` - ${command.description}`;
      lines.push(line);
    }

    return lines.join("\n");
  }

  private formatHelpByCategory(
    commands: Command[],
    includeAliases: boolean,
    format: "plain" | "markdown"
  ): string {
    const byCategory = new Map<string, Command[]>();

    for (const command of commands) {
      const category = command.category || "general";
      const existing = byCategory.get(category) || [];
      existing.push(command);
      byCategory.set(category, existing);
    }

    const categoryNames: Record<string, string> = {
      general: "일반",
      notes: "노트",
      session: "세션",
      ai: "AI",
      system: "시스템",
    };

    const lines: string[] = [];

    for (const [category, categoryCommands] of byCategory) {
      const displayName = categoryNames[category] || category;

      if (format === "markdown") {
        lines.push(`\n**${displayName} 명령어:**`);
      } else {
        lines.push(`\n${displayName} 명령어:`);
      }

      for (const command of categoryCommands) {
        let line = `/${command.name}`;

        if (includeAliases && command.aliases && command.aliases.length > 0) {
          const aliasStr = command.aliases.map((a) => `/${a}`).join(", ");
          line += ` (${aliasStr})`;
        }

        line += ` - ${command.description}`;
        lines.push(line);
      }
    }

    return lines.join("\n");
  }

  /**
   * Clear all registered commands.
   * Useful for testing or resetting the registry.
   */
  clear(): void {
    this.commands.clear();
    this.aliasMap.clear();
  }

  /**
   * Get the number of registered commands.
   */
  get size(): number {
    return this.commands.size;
  }
}

/**
 * Default global command registry instance.
 * Use this for the main application.
 */
export const commandRegistry = new CommandRegistry();

/**
 * Create a new command registry.
 * Useful for testing or isolated contexts.
 */
export function createCommandRegistry(): CommandRegistry {
  return new CommandRegistry();
}
