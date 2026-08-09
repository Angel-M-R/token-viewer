#!/usr/bin/env node
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ACTIVE_PUBLISHER_MACHINES = new Set(["angel-mac", "mac-m5"]);
const DEFAULT_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

try {
  await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function main(argv) {
  const options = parseOptions(argv);
  if (options.help) {
    printUsage();
    return;
  }
  if (!ACTIVE_PUBLISHER_MACHINES.has(options.machine)) {
    throw new Error("--machine must be angel-mac or mac-m5");
  }
  if (!options.checkout) throw new Error("--checkout is required");
  if (!isAbsolute(options.checkout)) throw new Error("--checkout must be an absolute path");
  if (!Number.isInteger(options.hour) || options.hour < 0 || options.hour > 23) {
    throw new Error("--hour must be an integer from 0 to 23");
  }
  if (!Number.isInteger(options.minute) || options.minute < 0 || options.minute > 59) {
    throw new Error("--minute must be an integer from 0 to 59");
  }
  if (!options.dryRun && process.platform !== "darwin") {
    throw new Error("launchd installation is supported only on macOS");
  }

  const checkout = await realpath(options.checkout);
  const config = await readCollectorConfig();
  const configuredCheckout = await realpath(resolveHome(config.checkoutPath));
  if (config.machineName !== options.machine) {
    throw new Error(`collector config machineName must be ${options.machine}`);
  }
  if (configuredCheckout !== checkout) {
    throw new Error("collector config checkoutPath does not match --checkout");
  }
  if (typeof config.expectedRemoteUrl !== "string" || !config.expectedRemoteUrl.trim()) {
    throw new Error("collector config expectedRemoteUrl is required");
  }
  assertCredentialFreeRemote(config.expectedRemoteUrl);
  await assertOperationalCheckout(checkout, config.expectedRemoteUrl);

  const home = homedir();
  const label = `com.tokenviewer.collector.${options.machine}`;
  const logsDirectory = join(home, "Library", "Logs", "TokenViewer");
  const launchAgentsDirectory = join(home, "Library", "LaunchAgents");
  const plistPath = join(launchAgentsDirectory, `${label}.plist`);
  const template = await readFile(join(scriptDirectory, "com.tokenviewer.collector.plist.template"), "utf8");
  const plist = renderTemplate(template, {
    __LABEL__: label,
    __NODE_EXECUTABLE__: process.execPath,
    __CHECKOUT_PATH__: checkout,
    __PATH__: prependExecutableDirectory(options.path, process.execPath),
    __HOUR__: String(options.hour),
    __MINUTE__: String(options.minute),
    __STDOUT_PATH__: join(logsDirectory, `${options.machine}.out.log`),
    __STDERR_PATH__: join(logsDirectory, `${options.machine}.err.log`),
  });

  if (options.dryRun) {
    process.stdout.write(`Target: ${plistPath}\n${plist}`);
    return;
  }

  await mkdir(launchAgentsDirectory, { recursive: true });
  await mkdir(logsDirectory, { recursive: true });
  const temporaryPath = `${plistPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, plist, { encoding: "utf8", mode: 0o644 });
  await rename(temporaryPath, plistPath);
  await chmod(plistPath, 0o644);

  const domain = `gui/${process.getuid()}`;
  await runLaunchctl(["bootout", `${domain}/${label}`], true);
  await runLaunchctl(["bootstrap", domain, plistPath]);
  await runLaunchctl(["enable", `${domain}/${label}`]);
  process.stdout.write(`Installed ${label} at ${plistPath}\n`);
}

function parseOptions(argv) {
  const options = {
    machine: undefined,
    checkout: undefined,
    hour: 9,
    minute: 0,
    path: DEFAULT_PATH,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (["--machine", "--checkout", "--hour", "--minute", "--path"].includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--machine") options.machine = value;
      else if (argument === "--checkout") options.checkout = value;
      else if (argument === "--hour") options.hour = Number(value);
      else if (argument === "--minute") options.minute = Number(value);
      else options.path = value;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  return options;
}

async function readCollectorConfig() {
  const configRoot = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  const configPath = join(resolveHome(configRoot), "tokenviewer", "config.json");
  let value;
  try {
    value = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    throw new Error(`valid collector config required at ${configPath}`);
  }
  if (!value || typeof value !== "object") throw new Error(`valid collector config required at ${configPath}`);
  return value;
}

async function assertOperationalCheckout(checkout, expectedRemoteUrl) {
  const repositoryRoot = await realpath((await git(checkout, ["rev-parse", "--show-toplevel"])).trim());
  if (repositoryRoot !== checkout) throw new Error("--checkout must be the dedicated Git checkout root");
  const branch = (await git(checkout, ["branch", "--show-current"])).trim();
  if (branch !== "master") throw new Error("operational checkout must be on master");
  const remote = (await git(checkout, ["remote", "get-url", "origin"])).trim();
  if (remote !== expectedRemoteUrl) throw new Error("origin does not match collector config expectedRemoteUrl");
  await git(checkout, ["rev-parse", "--verify", "origin/master"]);
  if ((await git(checkout, ["status", "--porcelain"])).trim()) {
    throw new Error("operational checkout must be clean before launchd installation");
  }
}

function renderTemplate(template, replacements) {
  let rendered = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(placeholder, xmlEscape(value));
  }
  if (/__[A-Z_]+__/.test(rendered)) throw new Error("launchd template contains unresolved placeholders");
  return rendered;
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function resolveHome(path) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return isAbsolute(path) ? path : resolve(path);
}

function prependExecutableDirectory(path, executable) {
  const executableDirectory = dirname(executable);
  const remainingDirectories = path.split(":").filter((directory) => directory && directory !== executableDirectory);
  return [executableDirectory, ...remainingDirectories].join(":");
}

function assertCredentialFreeRemote(remote) {
  try {
    const url = new URL(remote);
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("expectedRemoteUrl must not contain credentials or URL parameters");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("expectedRemoteUrl")) throw error;
  }
}

async function git(checkout, args) {
  try {
    const result = await exec("git", ["-C", checkout, ...args], {
      env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
    });
    return result.stdout;
  } catch (error) {
    throw new Error(`git ${args[0]} failed: ${error.stderr?.trim() || error.message}`);
  }
}

async function runLaunchctl(args, ignoreFailure = false) {
  try {
    await exec("launchctl", args, { env: { ...process.env, LC_ALL: "C" } });
  } catch (error) {
    if (!ignoreFailure) throw new Error(`launchctl ${args[0]} failed: ${error.stderr?.trim() || error.message}`);
  }
}

function printUsage() {
  process.stdout.write(`Usage:
  node ops/macos/install-launchd.mjs --machine <angel-mac|mac-m5> --checkout <absolute-path> [--hour 9] [--minute 0] [--path <PATH>] [--dry-run]
`);
}
