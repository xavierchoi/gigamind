#!/usr/bin/env npx tsx
/**
 * GigaMind Multilingual Synthetic Note Generator - CLI
 *
 * Generates multilingual synthetic notes and evaluation queries
 * using OpenRouter API.
 *
 * Usage:
 *   npx tsx scripts/generate-multilingual-notes.ts [options]
 *
 * Options:
 *   -o, --output <path>   Output directory (default: ~/gigamind-notes/synthetic)
 *   -e, --eval <path>     Eval output directory (default: ~/gigamind-notes/eval)
 *   -l, --lang <code>     Generate only for specific language (ko|en|ja|zh)
 *   -r, --resume          Resume from checkpoint
 *   -t, --test            Test mode (5 notes per language)
 *   -v, --verbose         Enable verbose output
 *   --api-key <key>       OpenRouter API key (or set OPENROUTER_API_KEY)
 *   --model <name>        Model to use (default: xiaomi/mimo-v2-flash:free)
 *   -h, --help            Show this help message
 */

import path from "node:path";
import os from "node:os";
import { MultilingualGenerator } from "./multilingual/index.js";
import type { GeneratorOptions, SupportedLanguage } from "./multilingual/types.js";

function parseArgs(args: string[]): GeneratorOptions {
  const gigamindNotesDir = path.join(os.homedir(), "gigamind-notes");

  const options: GeneratorOptions = {
    outputDir: path.join(gigamindNotesDir, "synthetic"),
    evalDir: path.join(gigamindNotesDir, "eval"),
    resume: false,
    test: false,
    verbose: false,
    checkpointInterval: 10,
    apiKey: "",
    model: "xiaomi/mimo-v2-flash:free",
    maxRetries: 3,
    retryDelayMs: 1000,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case "--output":
      case "-o":
        options.outputDir = args[++i];
        break;
      case "--eval":
      case "-e":
        options.evalDir = args[++i];
        break;
      case "--lang":
      case "-l":
        options.lang = args[++i] as SupportedLanguage;
        break;
      case "--resume":
      case "-r":
        options.resume = true;
        break;
      case "--test":
      case "-t":
        options.test = true;
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--api-key":
        options.apiKey = args[++i];
        break;
      case "--model":
        options.model = args[++i];
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
    i++;
  }

  // Check for API key in environment if not provided
  if (!options.apiKey) {
    options.apiKey = process.env.OPENROUTER_API_KEY || "";
  }

  // Use hardcoded key as fallback for this project
  if (!options.apiKey) {
    options.apiKey = "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";
  }

  return options;
}

function printUsage(): void {
  console.log(`
GigaMind Multilingual Synthetic Note Generator

Generates multilingual synthetic notes and evaluation queries using OpenRouter API.

Usage:
  npx tsx scripts/generate-multilingual-notes.ts [options]

Options:
  -o, --output <path>   Output directory for notes
                        (default: ~/gigamind-notes/synthetic)
  -e, --eval <path>     Output directory for queries
                        (default: ~/gigamind-notes/eval)
  -l, --lang <code>     Generate only for specific language (ko|en|ja|zh)
  -r, --resume          Resume from checkpoint
  -t, --test            Test mode (5 notes per language)
  -v, --verbose         Enable verbose output
  --api-key <key>       OpenRouter API key (or set OPENROUTER_API_KEY env var)
  --model <name>        Model to use (default: xiaomi/mimo-v2-flash:free)
  -h, --help            Show this help message

Examples:
  # Generate all notes (410 total)
  npx tsx scripts/generate-multilingual-notes.ts

  # Test mode (5 notes per language = 20 total)
  npx tsx scripts/generate-multilingual-notes.ts --test

  # Generate only Korean notes
  npx tsx scripts/generate-multilingual-notes.ts --lang ko

  # Resume from checkpoint
  npx tsx scripts/generate-multilingual-notes.ts --resume

  # Verbose output
  npx tsx scripts/generate-multilingual-notes.ts --test --verbose

Language Distribution:
  Korean (ko):   150 notes
  English (en):  120 notes
  Japanese (ja):  80 notes
  Chinese (zh):   60 notes
  Total:         410 notes

Query Generation:
  - 3 queries per note (~1,230 total)
  - 70% same-language queries
  - 30% cross-lingual queries
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.verbose) {
    console.log("Options:", JSON.stringify(options, null, 2));
  }

  const generator = new MultilingualGenerator(options);

  try {
    await generator.run();
    console.log("\nGeneration complete!");
    process.exit(0);
  } catch (error) {
    console.error("\nGeneration failed:", error);
    process.exit(1);
  }
}

main();
