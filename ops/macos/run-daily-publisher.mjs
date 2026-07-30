#!/usr/bin/env node
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

try {
  const checkout = await parseCheckout(process.argv.slice(2));
  await run("git", ["-C", checkout, "pull", "--rebase", "origin", "master"]);
  await run("pnpm", ["--dir", checkout, "--filter", "collector...", "build"]);
  await run("pnpm", ["--dir", checkout, "--filter", "collector", "publish"]);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function parseCheckout(argv) {
  if (argv.length !== 2 || argv[0] !== "--checkout" || !argv[1]) {
    throw new Error("Usage: run-daily-publisher --checkout <absolute-path>");
  }
  if (!isAbsolute(argv[1])) throw new Error("--checkout must be an absolute path");
  return realpath(argv[1]);
}

async function run(command, args) {
  try {
    await exec(command, args, {
      env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error.stderr?.trim() || error.stdout?.trim() || error.message;
    throw new Error(`${command} ${args[0] ?? "command"} failed${detail ? `: ${detail}` : ""}`);
  }
}
