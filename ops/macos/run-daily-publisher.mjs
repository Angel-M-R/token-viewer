#!/usr/bin/env node
import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

// Some networks intermittently reset SSH to GitHub on one port while the other works,
// so each retry routes SSH through a different GitHub endpoint. The first attempt keeps
// the user's own SSH configuration. A caller-provided GIT_SSH_COMMAND is always respected.
const SSH_BASE = "ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=2";
const SSH_ROUTES = [
  { name: "configured", command: SSH_BASE },
  { name: "ssh.github.com:443", command: `${SSH_BASE} -o HostName=ssh.github.com -o Port=443 -o HostKeyAlias=github.com` },
  { name: "github.com:22", command: `${SSH_BASE} -o HostName=github.com -o Port=22` },
];
const retryDelayMs = parseDelay(process.env.TOKENVIEWER_RETRY_DELAY_MS, 60_000);

try {
  const checkout = await parseCheckout(process.argv.slice(2));
  await runWithRetries(checkout);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function runWithRetries(checkout) {
  for (let attempt = 1; ; attempt += 1) {
    const route = SSH_ROUTES[attempt - 1];
    const sshCommand = process.env.GIT_SSH_COMMAND || route.command;
    try {
      await publishOnce(checkout, { GIT_SSH_COMMAND: sshCommand });
      if (attempt > 1) process.stderr.write(`attempt ${attempt} (${route.name}) succeeded\n`);
      return;
    } catch (error) {
      if (attempt >= SSH_ROUTES.length) throw error;
      process.stderr.write(
        `attempt ${attempt} (${route.name}) failed, retrying: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      await sleep(retryDelayMs * attempt);
    }
  }
}

// An unpublished commit left by a failed attempt is recovered by the next publish run.
async function publishOnce(checkout, env) {
  await run("git", ["-C", checkout, "pull", "--rebase", "origin", "master"], env);
  await run("pnpm", ["--dir", checkout, "--filter", "collector...", "build"], env);
  await run("pnpm", ["--dir", checkout, "--filter", "collector", "run", "publish"], env);
}

async function parseCheckout(argv) {
  if (argv.length !== 2 || argv[0] !== "--checkout" || !argv[1]) {
    throw new Error("Usage: run-daily-publisher --checkout <absolute-path>");
  }
  if (!isAbsolute(argv[1])) throw new Error("--checkout must be an absolute path");
  return realpath(argv[1]);
}

function parseDelay(value, fallback) {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function run(command, args, extraEnv) {
  try {
    await exec(command, args, {
      env: { ...process.env, ...extraEnv, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error.stderr?.trim() || error.stdout?.trim() || error.message;
    throw new Error(`${command} ${args[0] ?? "command"} failed${detail ? `: ${detail}` : ""}`);
  }
}
