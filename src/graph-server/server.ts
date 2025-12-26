/**
 * Graph Visualization Server
 * Express server for serving the graph visualization UI
 */

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGraphRouter } from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GraphServerOptions {
  notesDir: string;
  port?: number;
  locale?: string;
  autoShutdownMinutes?: number;
}

// Graph-specific translations
const graphTranslations: Record<string, Record<string, string>> = {
  ko: {
    // Page title
    page_title: "GigaMind — 지식 그래프",
    // Header stats
    stat_nodes: "노드",
    stat_edges: "연결",
    stat_dangling: "미해결",
    stat_orphan: "고립",
    // Search
    search_placeholder: "노드 검색...",
    search_results_count: "{{count}}개 결과",
    search_results_count_one: "1개 결과",
    search_clear: "지우기",
    search_no_results: "일치하는 노드 없음",
    // Filters
    filter_notes: "노트",
    filter_orphan: "고립",
    filter_dangling: "미해결",
    filter_notes_title: "노트",
    filter_orphan_title: "고립 노드",
    filter_dangling_title: "미해결 참조",
    // Controls
    zoom_out_title: "축소 (-)",
    zoom_in_title: "확대 (+)",
    reset_view_title: "보기 초기화 (0)",
    toggle_labels_title: "레이블 표시/숨김",
    // Minimap
    minimap_title: "전체 보기",
    minimap_collapse_title: "접기",
    // Sidebar
    sidebar_close: "닫기",
    sidebar_inbound: "인바운드",
    sidebar_outbound: "아웃바운드",
    sidebar_backlinks: "백링크",
    sidebar_forward_links: "포워드 링크",
    sidebar_no_backlinks: "백링크 없음",
    sidebar_no_forward_links: "포워드 링크 없음",
    // Focus mode
    focus_mode_label: "포커스 모드",
    focus_exit: "나가기",
    // Load more
    load_progress: "{{loaded}}개 중 {{total}}개 노드 표시",
    load_more: "더 불러오기",
    load_full_graph: "전체 그래프 불러오기",
    loading_full_graph: "전체 그래프 불러오는 중...",
    loading_more_nodes: "노드 더 불러오는 중...",
    // Loading state
    loading_text: "신경 그래프 초기화 중...",
    // Errors
    load_failed: "그래프 데이터 로드 실패",
    // Shortcuts hint
    shortcuts_search: "검색",
    shortcuts_zoom: "줌",
    shortcuts_reset: "초기화",
    shortcuts_similar: "유사",
    shortcuts_exit: "나가기",
    shortcuts_fullscreen: "전체화면",
    // Toast messages
    create_note_btn: "이 개념으로 노트 생성",
    create_note_hint: "클릭하면 GigaMind 명령어가 클립보드에 복사됩니다",
    toast_invalid_node: "유효하지 않은 노드입니다",
    toast_clipboard_unavailable: "클립보드 API를 사용할 수 없습니다. 명령어: ",
    toast_copied: "명령어가 클립보드에 복사되었습니다",
    toast_copy_failed: "복사 실패. 수동으로 입력해주세요: ",
    // Similar Links panel
    similar_links_toggle_title: "유사 링크 분석",
    similar_links_label: "유사",
    similar_links_title: "유사 링크",
    similar_links_threshold: "임계값",
    similar_links_analyze: "분석",
    similar_links_loading: "유사 링크 분석 중...",
    similar_links_no_results: "유사한 dangling link가 없습니다",
    similar_links_recommended: "추천",
    similar_links_occurrences: "회",
    similar_links_merge: "통합",
    similar_links_merge_confirm: "{{count}}개 링크를 '{{target}}'으로 통합하시겠습니까?",
    similar_links_merge_success: "{{files}}개 파일에서 {{links}}개 링크가 통합되었습니다",
    similar_links_merge_error: "병합 중 오류가 발생했습니다",
    similar_links_error: "유사 링크 분석 실패",
    merge_confirm_title: "통합 확인",
    merge_preserve_alias: "원본 표기를 alias로 보존",
    merge_cancel: "취소",
    merge_confirm: "통합",
  },
  en: {
    // Page title
    page_title: "GigaMind — Knowledge Graph",
    // Header stats
    stat_nodes: "nodes",
    stat_edges: "edges",
    stat_dangling: "dangling",
    stat_orphan: "orphan",
    // Search
    search_placeholder: "Search nodes...",
    search_results_count: "{{count}} results",
    search_results_count_one: "1 result",
    search_clear: "Clear",
    search_no_results: "No matching nodes",
    // Filters
    filter_notes: "Notes",
    filter_orphan: "Orphan",
    filter_dangling: "Dangling",
    filter_notes_title: "Notes",
    filter_orphan_title: "Orphan nodes",
    filter_dangling_title: "Dangling references",
    // Controls
    zoom_out_title: "Zoom out (-)",
    zoom_in_title: "Zoom in (+)",
    reset_view_title: "Reset view (0)",
    toggle_labels_title: "Toggle labels",
    // Minimap
    minimap_title: "Overview",
    minimap_collapse_title: "Collapse",
    // Sidebar
    sidebar_close: "Close",
    sidebar_inbound: "inbound",
    sidebar_outbound: "outbound",
    sidebar_backlinks: "Backlinks",
    sidebar_forward_links: "Forward Links",
    sidebar_no_backlinks: "No backlinks",
    sidebar_no_forward_links: "No forward links",
    // Focus mode
    focus_mode_label: "Focus Mode",
    focus_exit: "Exit",
    // Load more
    load_progress: "Showing {{loaded}} of {{total}} nodes",
    load_more: "Load More",
    load_full_graph: "Load Full Graph",
    loading_full_graph: "Loading full graph...",
    loading_more_nodes: "Loading more nodes...",
    // Loading state
    loading_text: "Initializing neural graph...",
    // Errors
    load_failed: "Failed to load graph data",
    // Shortcuts hint
    shortcuts_search: "search",
    shortcuts_zoom: "zoom",
    shortcuts_reset: "reset",
    shortcuts_similar: "similar",
    shortcuts_exit: "exit",
    shortcuts_fullscreen: "fullscreen",
    // Toast messages
    create_note_btn: "Create note from this concept",
    create_note_hint: "Click to copy GigaMind command to clipboard",
    toast_invalid_node: "Invalid node",
    toast_clipboard_unavailable: "Clipboard API unavailable. Command: ",
    toast_copied: "Command copied to clipboard",
    toast_copy_failed: "Copy failed. Please enter manually: ",
    // Similar Links panel
    similar_links_toggle_title: "Similar Links Analysis",
    similar_links_label: "Similar",
    similar_links_title: "Similar Links",
    similar_links_threshold: "Threshold",
    similar_links_analyze: "Analyze",
    similar_links_loading: "Analyzing similar links...",
    similar_links_no_results: "No similar dangling links found",
    similar_links_recommended: "Recommended",
    similar_links_occurrences: "x",
    similar_links_merge: "Merge",
    similar_links_merge_confirm: "Merge {{count}} links to '{{target}}'?",
    similar_links_merge_success: "{{links}} links merged in {{files}} files",
    similar_links_merge_error: "Error occurred during merge",
    similar_links_error: "Failed to analyze similar links",
    merge_confirm_title: "Confirm Merge",
    merge_preserve_alias: "Preserve original text as alias",
    merge_cancel: "Cancel",
    merge_confirm: "Merge",
  },
};

export interface GraphServer {
  app: Express;
  port: number;
  url: string;
  shutdown: () => void;
}

/**
 * Create and configure the Express server
 */
export function createGraphServer(options: GraphServerOptions): GraphServer {
  const { notesDir, port = 3847, locale = "ko", autoShutdownMinutes = 30 } = options;

  const app = express();

  // Middleware
  app.use(express.json());

  // CORS restricted to localhost origins only
  app.use((_req: Request, res: Response, next: NextFunction) => {
    const origin = _req.headers.origin;
    const allowedOrigins = [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
    ];
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
  });

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://d3js.org; " +  // D3.js CDN 허용
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +   // Google Fonts CSS 허용
      "img-src 'self' data:; " +               // data: URI 이미지 허용
      "connect-src 'self'; " +                 // API 연결은 자기 자신만
      "font-src 'self' https://fonts.gstatic.com; " +  // Google Fonts 폰트 파일 허용
      "object-src 'none'; " +                  // Flash 등 플러그인 차단
      "frame-ancestors 'none'"                 // iframe 삽입 차단
    );
    next();
  });

  // API routes
  app.use("/api", createGraphRouter(notesDir));

  // i18n endpoint - returns translations for the graph UI
  app.get("/api/i18n", (_req: Request, res: Response) => {
    const translations = graphTranslations[locale] || graphTranslations.ko;
    res.json({ locale, translations });
  });

  // Serve static files
  const publicPath = path.join(__dirname, "public");
  app.use(express.static(publicPath));

  // Fallback to index.html for SPA
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, "index.html"));
  });

  // Activity tracking for auto-shutdown
  let lastActivity = Date.now();
  let shutdownTimer: NodeJS.Timeout | null = null;
  let server: ReturnType<typeof app.listen> | null = null;

  const updateActivity = () => {
    lastActivity = Date.now();
  };

  // Track activity on API requests
  app.use((req: Request, _res: Response, next) => {
    if (req.path.startsWith("/api")) {
      updateActivity();
    }
    next();
  });

  const shutdown = () => {
    if (shutdownTimer) {
      clearInterval(shutdownTimer);
      shutdownTimer = null;
    }
    if (server) {
      server.close();
      server = null;
    }
  };

  // Start server - bind to localhost only for security
  server = app.listen(port, "127.0.0.1", () => {
    console.log(`Graph server running at http://localhost:${port}`);
  });

  // Auto-shutdown check
  if (autoShutdownMinutes > 0) {
    shutdownTimer = setInterval(() => {
      const idleTime = Date.now() - lastActivity;
      const idleMinutes = idleTime / (1000 * 60);

      if (idleMinutes >= autoShutdownMinutes) {
        console.log(`Graph server shutting down after ${autoShutdownMinutes} minutes of inactivity`);
        shutdown();
        process.exit(0);
      }
    }, 60 * 1000); // Check every minute
  }

  return {
    app,
    port,
    url: `http://localhost:${port}`,
    shutdown,
  };
}
