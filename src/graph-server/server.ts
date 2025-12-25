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
  autoShutdownMinutes?: number;
}

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
  const { notesDir, port = 3847, autoShutdownMinutes = 30 } = options;

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
