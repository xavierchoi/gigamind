#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { App } from "./app.js";

async function main() {
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}

main().catch((err) => {
  console.error("GigaMind 실행 중 오류 발생:", err);
  process.exit(1);
});
