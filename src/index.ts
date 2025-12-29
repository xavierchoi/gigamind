#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { runEvalCli } from "./eval/cli.js";

async function main() {
  // Check for eval subcommand before starting Ink
  if (process.argv[2] === "eval") {
    const exitCode = await runEvalCli(process.argv.slice(3));
    process.exit(exitCode);
  }

  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}

main().catch((err) => {
  console.error("GigaMind 실행 중 오류 발생:", err);
  process.exit(1);
});
