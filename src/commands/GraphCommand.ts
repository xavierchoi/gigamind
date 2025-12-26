/**
 * GraphCommand - Command for launching the graph visualization server
 * Opens an interactive graph visualization of notes in the browser
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import type { Message } from "../components/Chat.js";
import { t } from "../i18n/index.js";
import i18next from "i18next";

export class GraphCommand extends BaseCommand {
  readonly name = "graph";
  readonly description = t('commands:graph.description');
  readonly usage = "/graph";

  /**
   * Execute the graph command
   */
  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    const { config, setMessages } = context;
    const userInput = "/graph";

    // Add user message and initial loading message
    setMessages((prev: Message[]) => [
      ...prev,
      { role: "user", content: userInput },
      { role: "assistant", content: t('common:processing.starting_graph_server') },
    ]);

    try {
      // Dynamically import the graph server to avoid loading it when not needed
      const { startGraphServer } = await import("../graph-server/index.js");

      // Start the graph server with the notes directory and current locale
      const locale = i18next.language || "ko";
      const result = await startGraphServer(config?.notesDir || "./notes", locale);

      // Update message with success info
      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: `${t('commands:graph.opened_message')}

**${t('commands:graph.url_label')}** ${result.url}

**${t('commands:graph.shortcuts_title')}**
- ${t('commands:graph.shortcuts.search')}
- ${t('commands:graph.shortcuts.zoom')}
- ${t('commands:graph.shortcuts.reset_view')}
- ${t('commands:graph.shortcuts.exit_focus')}
- ${t('commands:graph.shortcuts.fullscreen')}

${t('commands:graph.auto_shutdown')}`,
        },
      ]);

      return { handled: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Update message with error info
      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: t('errors:graph.error_starting_server', { error: errorMessage }),
        },
      ]);

      return { handled: true, error: errorMessage };
    }
  }
}

// Export singleton instance
export const graphCommand = new GraphCommand();
