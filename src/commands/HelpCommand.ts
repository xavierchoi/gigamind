import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import type { Message } from "../components/Chat.js";

/**
 * Help command - displays available commands and usage hints.
 * Corresponds to the /help command in the chat interface.
 */
export class HelpCommand extends BaseCommand {
  readonly name = "help";
  readonly description = "도움말";
  readonly usage = "/help";

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    const { setMessages } = context;

    const helpText = `**사용 가능한 명령어:**
/help - 도움말
/config - 설정 보기
/clear - 대화 내역 정리
/import - 외부 노트 가져오기
/session list - 최근 세션 목록 보기
/session export - 현재 세션 마크다운으로 저장
/graph - 노트 그래프 시각화 (브라우저)
/search <query> - 노트 검색
/clone <질문> - 내 노트 기반으로 나처럼 답변
/note <내용> - 새 노트 작성
/sync - Git 동기화 (준비 중)

---

**이렇게 말해도 돼요:**
- "프로젝트 관련 노트 찾아줘" -> 노트 검색
- "내가 이 주제에 대해 어떻게 생각했더라?" -> 클론 모드
- "내 노트에서 OO 찾아줘" -> 노트 검색
- "OO에 대해 메모해줘" -> 노트 작성
- "내 관점에서 설명해줘" -> 클론 모드

**키보드 단축키:**
- Ctrl+C: 종료
- Esc: 응답 취소
- 방향키 위/아래: 입력 히스토리`;

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
