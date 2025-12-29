/**
 * SimilarLinksCommand - Command for analyzing and merging similar dangling links
 * Helps identify and consolidate links with similar names into a standard notation
 */

import { BaseCommand } from "./BaseCommand.js";
import type { CommandContext, CommandResult } from "./types.js";
import type { Message } from "../components/Chat.js";
import { clusterDanglingLinks } from "../utils/graph/clusterAnalyzer.js";
import { mergeSimilarLinks } from "../utils/graph/linkMerger.js";
import { analyzeNoteGraph } from "../utils/graph/analyzer.js";
import type { SimilarLinkCluster } from "../utils/graph/types.js";

/**
 * Default similarity threshold for clustering
 */
const DEFAULT_THRESHOLD = 0.7;

export class SimilarLinksCommand extends BaseCommand {
  readonly name = "similar-links";
  readonly aliases = ["sim-links"];
  readonly description = "유사한 dangling link들을 분석하고 통합합니다";
  readonly usage = "/similar-links [analyze|merge]";
  readonly category = "notes" as const;

  /**
   * Execute the similar-links command
   */
  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const { config, setMessages } = context;

    if (!config?.notesDir) {
      return this.error("노트 디렉토리가 설정되지 않았습니다. /config에서 설정해주세요.");
    }

    const subcommand = args[0]?.toLowerCase() || "analyze";

    if (subcommand === "analyze" || subcommand === "") {
      return this.handleAnalyze(context);
    } else if (subcommand === "merge") {
      return this.handleMerge(args.slice(1), context);
    } else {
      return this.error(`알 수 없는 서브커맨드: ${subcommand}\n\n사용법: ${this.usage}`);
    }
  }

  /**
   * Handle the analyze subcommand
   * Displays clustered similar dangling links
   */
  private async handleAnalyze(context: CommandContext): Promise<CommandResult> {
    const { config, setMessages } = context;
    const userInput = "/similar-links analyze";

    // Add user message and loading message
    setMessages((prev: Message[]) => [
      ...prev,
      { role: "user", content: userInput },
      { role: "assistant", content: "유사 링크 분석 중..." },
    ]);

    try {
      // Analyze the note graph
      const stats = await analyzeNoteGraph(config!.notesDir, { useCache: true });

      // Cluster dangling links
      const clusters = clusterDanglingLinks(stats.danglingLinks, {
        threshold: DEFAULT_THRESHOLD,
        minClusterSize: 2,
        maxResults: 50,
      });

      // Format the output
      const output = this.formatAnalysisResult(clusters);

      // Update message with results
      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: output },
      ]);

      return { handled: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `분석 중 오류가 발생했습니다: ${errorMessage}` },
      ]);

      return { handled: true, error: errorMessage };
    }
  }

  /**
   * Handle the merge subcommand
   * Merges similar links into a standard notation
   */
  private async handleMerge(args: string[], context: CommandContext): Promise<CommandResult> {
    const { config, setMessages, refreshStats } = context;

    // Parse arguments: merge <clusterIndex> "<standardNotation>"
    if (args.length < 2) {
      return this.error(
        `## 사용법\n\n` +
        `\`/similar-links merge <클러스터번호> "<표준표기>"\`\n\n` +
        `### 예시\n` +
        `- \`/similar-links merge 1 "Waymo"\` - 클러스터 #1을 "Waymo"로 통합\n\n` +
        `**팁:** 먼저 \`/similar-links\`로 클러스터 목록을 확인하세요.`
      );
    }

    const clusterIndex = parseInt(args[0], 10);
    if (isNaN(clusterIndex) || clusterIndex < 1) {
      return this.error("클러스터 인덱스는 1 이상의 숫자여야 합니다.");
    }

    // Extract the standard notation (handle quoted strings)
    let standardNotation = args.slice(1).join(" ");
    // Remove surrounding quotes if present
    if (
      (standardNotation.startsWith('"') && standardNotation.endsWith('"')) ||
      (standardNotation.startsWith("'") && standardNotation.endsWith("'"))
    ) {
      standardNotation = standardNotation.slice(1, -1);
    }

    if (!standardNotation.trim()) {
      return this.error("표준 표기를 지정해주세요.");
    }

    // 위키링크 문법에 위험한 문자 검증
    if (standardNotation.includes("[[") || standardNotation.includes("]]")) {
      return this.error("표준 표기에 '[[' 또는 ']]'를 포함할 수 없습니다.");
    }
    if (standardNotation.includes("|")) {
      return this.error("표준 표기에 '|' 문자를 포함할 수 없습니다.");
    }

    const userInput = `/similar-links merge ${clusterIndex} "${standardNotation}"`;

    // Add user message and loading message
    setMessages((prev: Message[]) => [
      ...prev,
      { role: "user", content: userInput },
      { role: "assistant", content: "유사 링크 병합 중..." },
    ]);

    try {
      // Get current clusters
      const stats = await analyzeNoteGraph(config!.notesDir, { useCache: false });
      const clusters = clusterDanglingLinks(stats.danglingLinks, {
        threshold: DEFAULT_THRESHOLD,
        minClusterSize: 2,
        maxResults: 50,
      });

      if (clusterIndex > clusters.length) {
        setMessages((prev: Message[]) => [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: `클러스터 #${clusterIndex}을(를) 찾을 수 없습니다. (총 ${clusters.length}개 클러스터)`,
          },
        ]);
        return { handled: true };
      }

      const cluster = clusters[clusterIndex - 1];
      const oldTargets = cluster.members.map((m) => m.target);

      // Perform the merge
      const result = await mergeSimilarLinks(config!.notesDir, {
        oldTargets,
        newTarget: standardNotation,
        preserveAsAlias: true,
      });

      // Format result message
      let resultMessage = `## 병합 완료\n\n`;
      resultMessage += `**클러스터 #${clusterIndex}** -> \`${standardNotation}\`\n\n`;
      resultMessage += `- 수정된 파일: ${result.filesModified}개\n`;
      resultMessage += `- 치환된 링크: ${result.linksReplaced}개\n`;

      if (result.modifiedFiles.length > 0) {
        resultMessage += `\n### 수정된 파일 목록\n`;
        for (const file of result.modifiedFiles.slice(0, 10)) {
          const displayPath = file.replace(config!.notesDir, "").replace(/^\//, "");
          resultMessage += `- ${displayPath}\n`;
        }
        if (result.modifiedFiles.length > 10) {
          resultMessage += `... 외 ${result.modifiedFiles.length - 10}개 파일\n`;
        }
      }

      if (result.errors.size > 0) {
        resultMessage += `\n### 오류 발생 파일\n`;
        for (const [file, error] of result.errors) {
          resultMessage += `- ${file}: ${error}\n`;
        }
      }

      // Update message with results
      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: resultMessage },
      ]);

      // Refresh stats if callback is available
      if (refreshStats) {
        try {
          await refreshStats();
        } catch (e) {
          // 병합은 성공했으므로 stats 갱신 실패는 무시
          console.error("Failed to refresh stats:", e);
        }
      }

      return { handled: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      setMessages((prev: Message[]) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: `병합 중 오류가 발생했습니다: ${errorMessage}` },
      ]);

      return { handled: true, error: errorMessage };
    }
  }

  /**
   * Format the analysis result for display
   */
  private formatAnalysisResult(clusters: SimilarLinkCluster[]): string {
    if (clusters.length === 0) {
      return `## 유사 Dangling Link 분석 (임계값: ${DEFAULT_THRESHOLD})\n\n유사한 dangling link 클러스터가 없습니다.`;
    }

    let output = `## 유사 Dangling Link 분석 (임계값: ${DEFAULT_THRESHOLD})\n`;
    output += `${"=".repeat(40)}\n\n`;

    clusters.forEach((cluster, index) => {
      const clusterNum = index + 1;
      output += `### 클러스터 #${clusterNum} (유사도: ${cluster.averageSimilarity.toFixed(2)})\n`;
      output += `  **추천:** ${cluster.representativeTarget}\n\n`;

      cluster.members.forEach((member, memberIndex) => {
        const totalCount = member.sources.reduce((sum, s) => sum + s.count, 0);
        const isRepresentative = member.target === cluster.representativeTarget;
        const prefix = memberIndex === cluster.members.length - 1 ? "  \\`-" : "  |-";

        if (isRepresentative) {
          output += `${prefix} **${member.target}** (${totalCount}회)\n`;
        } else {
          output += `${prefix} ${member.target} (${totalCount}회) [${member.similarity.toFixed(2)}]\n`;
        }
      });

      output += `\n  > \`/similar-links merge ${clusterNum} "${cluster.representativeTarget}"\`\n\n`;
    });

    return output;
  }
}

// Export singleton instance
export const similarLinksCommand = new SimilarLinksCommand();
