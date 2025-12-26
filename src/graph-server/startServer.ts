/**
 * Standalone server starter script
 * This is spawned as a detached process by the CLI
 */

import { createGraphServer } from "./server.js";

const notesDir = process.env.GRAPH_SERVER_NOTES_DIR || process.argv[2] || "./notes";
const port = parseInt(process.env.GRAPH_SERVER_PORT || process.argv[3] || "3847", 10);
const locale = process.env.GRAPH_SERVER_LOCALE || "ko";

console.log(`Starting graph server...`);
console.log(`Notes directory: ${notesDir}`);
console.log(`Port: ${port}`);
console.log(`Locale: ${locale}`);

const server = createGraphServer({
  notesDir,
  port,
  locale,
  autoShutdownMinutes: 30,
});

console.log(`Graph visualization available at: ${server.url}`);

// Handle process signals
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  server.shutdown();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  server.shutdown();
  process.exit(0);
});
