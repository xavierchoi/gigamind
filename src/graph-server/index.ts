/**
 * Graph Server Launcher
 * Starts the graph visualization server and opens the browser
 */

import { spawn, exec } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StartServerResult {
  url: string;
  port: number;
  pid?: number;
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 10; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Wait for the server to be ready
 */
async function waitForServer(url: string, maxWaitMs = 10000): Promise<boolean> {
  const startTime = Date.now();
  const heartbeatUrl = `${url}/api/heartbeat`;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(heartbeatUrl);
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/**
 * Open URL in default browser (cross-platform)
 */
function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";

  exec(`${command} ${url}`, (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
      console.log(`Please open manually: ${url}`);
    }
  });
}

/**
 * Start the graph server
 */
export async function startGraphServer(notesDir: string): Promise<StartServerResult> {
  const basePort = 3847;
  const port = await findAvailablePort(basePort);
  const url = `http://localhost:${port}`;

  // Check if server is already running on this port
  try {
    const response = await fetch(`${url}/api/heartbeat`);
    if (response.ok) {
      // Server already running, just open browser
      openBrowser(url);
      return { url, port };
    }
  } catch {
    // Server not running, start it
  }

  // Start server as detached child process
  const serverScript = path.join(__dirname, "startServer.js");

  // Use node to run the server
  const child = spawn(
    "node",
    ["--experimental-specifier-resolution=node", serverScript, notesDir, String(port)],
    {
      detached: true,
      stdio: "ignore",
      cwd: path.dirname(__dirname),
      env: {
        ...process.env,
        GRAPH_SERVER_NOTES_DIR: notesDir,
        GRAPH_SERVER_PORT: String(port),
      },
    }
  );

  child.unref();

  // Wait for server to be ready
  const ready = await waitForServer(url);
  if (!ready) {
    throw new Error("Graph server failed to start");
  }

  // Open browser
  openBrowser(url);

  return {
    url,
    port,
    pid: child.pid,
  };
}

/**
 * Stop the graph server (if we have the PID)
 */
export function stopGraphServer(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    console.error("Failed to stop graph server:", error);
  }
}
