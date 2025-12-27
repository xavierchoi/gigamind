import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import type { Message } from "../components/Chat.js";
import { t } from "../i18n/index.js";

/**
 * Help command - displays available commands and usage hints.
 * Corresponds to the /help command in the chat interface.
 */
export class HelpCommand extends BaseCommand {
  readonly name = "help";
  get description() { return t('commands:help.description'); }
  readonly usage = "/help";

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages } = context;

    const helpText = `**${t('commands:help.title')}**
/help - ${t('commands:help.description')}
/config - ${t('commands:config.description')}
/clear - ${t('commands:clear.description')}
/import - ${t('commands:import.description')}
/session list - ${t('commands:session.list_description')}
/session export - ${t('commands:session.export_description')}
/graph - ${t('commands:graph.description')}
/search <query> - ${t('commands:search.description')}
/clone <질문> - ${t('commands:clone.description')}
/note <내용> - ${t('commands:note.description')}
/sync - ${t('commands:sync.description')}

---

**${t('commands:help.natural_language_section')}**
- ${t('commands:help.natural_language_examples.search_notes')}
- ${t('commands:help.natural_language_examples.clone_mode')}
- ${t('commands:help.natural_language_examples.find_in_notes')}
- ${t('commands:help.natural_language_examples.take_memo')}
- ${t('commands:help.natural_language_examples.my_perspective')}

**${t('commands:help.shortcuts_section')}**
- ${t('commands:help.shortcuts.exit')}
- ${t('commands:help.shortcuts.cancel')}
- ${t('commands:help.shortcuts.history')}`;

    setMessages((prev: Message[]) => [
      ...prev,
      { role: "user", content: "/help" },
      { role: "assistant", content: helpText },
    ]);

    return {
      handled: true,
    };
  }
}

// Export singleton instance
export const helpCommand = new HelpCommand();
