/**
 * GraphCommand - Command for launching the graph visualization server
 * Opens an interactive graph visualization of notes in the browser
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import type { Message } from "../components/Chat.js";

export class GraphCommand extends BaseCommand {
  readonly name = "graph";
  readonly description = "그래프 시각화";
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
      { role: "assistant", content: "그래프 시각화 서버를 시작하는 중..." },
    ]);

    try {
      // Dynamically import the graph server to avoid loading it when not needed
      const { startGraphServer } = await import("../graph-server/index.js");

      // Start the graph server with the notes directory
      const result = await startGraphServer(config?.notesDir || "./notes");

      // Update message with success info
      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: `그래프가 브라우저에서 열렸습니다.

**URL:** ${result.url}

**단축키:**
- / : 노트 검색
- +/- : 확대/축소
- 0 : 뷰 초기화
- ESC : 포커스 모드 종료
- F : 전체화면

서버는 30분 동안 비활성 시 자동 종료됩니다.`,
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
          content: `그래프 서버 시작 중 오류가 발생했습니다: ${errorMessage}`,
        },
      ]);

      return { handled: true, error: errorMessage };
    }
  }
}

// Export singleton instance
export const graphCommand = new GraphCommand();
