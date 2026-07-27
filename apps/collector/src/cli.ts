#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { activePublisherMachineSchema } from "@tokenviewer/core";
import { loadCollectorConfig, saveCollectorConfig } from "./config.js";
import {
  fetchGitHubUserLogin,
  pollCopilotAccessToken,
  requestCopilotDeviceCode,
} from "./copilot-auth.js";
import { runCollector, statusCollector } from "./scan.js";

async function main(argv: string[]): Promise<number> {
  const command = argv[0] ?? "help";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "status") {
    const status = await statusCollector();
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return 0;
  }

  if (command === "init") {
    const parsed = parseArgs({
      args: argv.slice(1),
      options: {
        "machine-name": { type: "string" },
        "checkout-path": { type: "string" },
        "expected-remote-url": { type: "string" },
        agents: { type: "string" },
      },
      allowPositionals: false,
    });
    const rl = createInterface({ input, output });
    try {
      const machineName = activePublisherMachineSchema.parse(
        (
          parsed.values["machine-name"] ??
          (await rl.question("machineName (angel-mac or aon-mac-m5): "))
        ).trim(),
      );
      const checkoutPath = (
        parsed.values["checkout-path"] ?? (await rl.question("operational checkout path: "))
      ).trim();
      const agents = parsed.values.agents?.split(",").map((agent) => agent.trim()).filter(Boolean) as
        | Parameters<typeof saveCollectorConfig>[0]["agents"]
        | undefined;
      await saveCollectorConfig({
        machineName,
        checkoutPath,
        expectedRemoteUrl: parsed.values["expected-remote-url"]?.trim() || undefined,
        agents,
      });
      process.stdout.write("collector configurado\n");
      return 0;
    } finally {
      rl.close();
    }
  }

  if (command === "copilot") {
    const subcommand = argv[1] ?? "status";

    if (subcommand === "login") {
      const device = await requestCopilotDeviceCode();
      process.stdout.write(`Copilot device code: ${device.userCode}\nVerify at: ${device.verificationUri}\n`);
      const token = await pollCopilotAccessToken(device);
      const login = await fetchGitHubUserLogin(token);
      const config = await loadCollectorConfig();
      await saveCollectorConfig({ ...config, copilotToken: token });
      process.stdout.write(`copilot configurado${login ? ` para ${login}` : ""}\n`);
      return 0;
    }

    if (subcommand === "status") {
      const config = await loadCollectorConfig();
      process.stdout.write(
        config.copilotToken
          ? `copilot configurado (${maskToken(config.copilotToken)})\n`
          : "copilot no configurado\n",
      );
      return 0;
    }

    if (subcommand === "logout") {
      const config = await loadCollectorConfig();
      const { copilotToken: _copilotToken, ...rest } = config;
      await saveCollectorConfig(rest);
      process.stdout.write("copilot desconectado\n");
      return 0;
    }

    process.stderr.write(`subcomando copilot desconocido: ${subcommand}\n`);
    printHelp();
    return 1;
  }

  if (command === "run") {
    const parsed = parseArgs({
      args: argv.slice(1),
      options: {
        "dry-run": { type: "boolean", default: false },
        publish: { type: "boolean", default: false },
        full: { type: "boolean", default: false },
        out: { type: "string" },
        agents: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: false,
    });

    if (parsed.values.help) {
      printHelp();
      return 0;
    }

    const summary = await runCollector({
      dryRun: Boolean(parsed.values["dry-run"]),
      publish: Boolean(parsed.values.publish),
      full: parsed.values.full,
      out: parsed.values.out,
      agents: parsed.values.agents?.split(",").map((agent) => agent.trim()).filter(Boolean),
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  }

  process.stderr.write(`comando desconocido: ${command}\n`);
  printHelp();
  return 1;
}

function printHelp(): void {
  process.stdout.write(`tokenviewer-collector

Usage:
  tokenviewer-collector init --machine-name <angel-mac|aon-mac-m5> --checkout-path <path> [--expected-remote-url <url>] [--agents claude,codex]
  tokenviewer-collector run --dry-run [--full] [--out <path>] [--agents claude,codex]
  tokenviewer-collector run [--publish] [--full] [--agents claude,codex]
  tokenviewer-collector status
  tokenviewer-collector copilot login
  tokenviewer-collector copilot status
  tokenviewer-collector copilot logout
`);
}

function maskToken(token: string): string {
  return token.length <= 8 ? "****" : `${token.slice(0, 4)}...${token.slice(-4)}`;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
