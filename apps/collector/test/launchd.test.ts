import { execFile as execFileCallback } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const installer = join(repositoryRoot, "ops", "macos", "install-launchd.mjs");
const dailyRunner = join(repositoryRoot, "ops", "macos", "run-daily-publisher.mjs");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe.sequential("launchd installer", () => {
  it.each(["angel-mac", "mac-m5"] as const)(
    "renders a daily credential-free job for active machine %s without installing it",
    async (machine) => {
    const root = await mkdtemp(join(tmpdir(), "tv-launchd-"));
    temporaryRoots.push(root);
    const remote = join(root, "origin.git");
    const seed = join(root, "seed");
    const checkout = join(root, `${machine} checkout & snapshots`);
    const configHome = join(root, "config");
    await git(root, ["init", "--bare", "--initial-branch=master", remote]);
    await git(root, ["clone", remote, seed]);
    await configureIdentity(seed);
    await writeFile(join(seed, "README.md"), "launchd test\n", "utf8");
    await git(seed, ["add", "README.md"]);
    await git(seed, ["commit", "-m", "test: initialize launchd remote"]);
    await git(seed, ["push", "origin", "master"]);
    await git(root, ["clone", remote, checkout]);
    await configureIdentity(checkout);
    const configPath = join(configHome, "tokenviewer", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({
        machineName: machine,
        checkoutPath: checkout,
        expectedRemoteUrl: remote,
        copilotToken: "must-not-appear",
      })}\n`,
      "utf8",
    );

    const result = await execFile(process.execPath, [
      installer,
      "--machine",
      machine,
      "--checkout",
      checkout,
      "--hour",
      "7",
      "--minute",
      "30",
      "--dry-run",
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, XDG_CONFIG_HOME: configHome },
    });

    expect(result.stdout).toContain(`com.tokenviewer.collector.${machine}`);
    expect(result.stdout).toContain("<key>WorkingDirectory</key>");
    expect(result.stdout).toContain("<key>PATH</key>");
    expect(result.stdout).toContain(`<string>${process.execPath}</string>`);
    const renderedPath = result.stdout.match(/<key>PATH<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    expect(renderedPath?.split(":")).toContain(dirname(process.execPath));
    expect(result.stdout).toContain("<key>StartCalendarInterval</key>");
    expect(result.stdout).toContain("run-daily-publisher.mjs");
    expect(result.stdout).toContain("<string>--checkout</string>");
    expect(result.stdout).toContain("<integer>7</integer>");
    expect(result.stdout).toContain("<integer>30</integer>");
    expect(result.stdout).toContain(`Library/Logs/TokenViewer/${machine}.out.log`);
    expect(result.stdout).toContain(`${machine} checkout &amp; snapshots`);
    expect(result.stdout).not.toMatch(/must-not-appear|copilotToken|expectedRemoteUrl|__[A-Z_]+__/);
    },
  );

  it("rejects retired old-mac before creating or loading a plist", async () => {
    const root = await mkdtemp(join(tmpdir(), "tv-launchd-retired-"));
    temporaryRoots.push(root);
    const remote = join(root, "origin.git");
    const seed = join(root, "seed");
    const checkout = join(root, "retired-checkout");
    const configHome = join(root, "config");
    const fakeBin = join(root, "bin");
    const launchctlMarker = join(root, "launchctl-called");
    await git(root, ["init", "--bare", "--initial-branch=master", remote]);
    await git(root, ["clone", remote, seed]);
    await configureIdentity(seed);
    await writeFile(join(seed, "README.md"), "launchd retired identity test\n", "utf8");
    await git(seed, ["add", "README.md"]);
    await git(seed, ["commit", "-m", "test: initialize retired launchd remote"]);
    await git(seed, ["push", "origin", "master"]);
    await git(root, ["clone", remote, checkout]);
    await configureIdentity(checkout);
    const configPath = join(configHome, "tokenviewer", "config.json");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify({ machineName: "old-mac", checkoutPath: checkout, expectedRemoteUrl: remote })}\n`,
      "utf8",
    );
    await mkdir(fakeBin, { recursive: true });
    const fakeLaunchctl = join(fakeBin, "launchctl");
    await writeFile(fakeLaunchctl, '#!/bin/sh\n: > "$LAUNCHCTL_MARKER"\n', "utf8");
    await chmod(fakeLaunchctl, 0o755);

    const result = await execFile(process.execPath, [
      installer,
      "--machine",
      "old-mac",
      "--checkout",
      checkout,
    ], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        HOME: root,
        XDG_CONFIG_HOME: configHome,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        LAUNCHCTL_MARKER: launchctlMarker,
      },
    }).catch((error: { stderr?: string }) => error);

    expect(result.stderr).toContain("angel-mac or mac-m5");
    expect(await exists(join(root, "Library", "LaunchAgents", "com.tokenviewer.collector.old-mac.plist"))).toBe(false);
    expect(await exists(launchctlMarker)).toBe(false);
  });

  it("rejects any machine outside the fixed registry before installation", async () => {
    const result = await execFile(process.execPath, [
      installer,
      "--machine",
      "third-mac",
      "--checkout",
      "/tmp/not-used",
      "--dry-run",
    ]).catch((error: { stderr?: string }) => error);

    expect(result.stderr).toContain("angel-mac or mac-m5");
  });

  it("pulls, rebuilds the collector dependency graph, then publishes", async () => {
    const root = await mkdtemp(join(tmpdir(), "tv-daily-runner-"));
    temporaryRoots.push(root);
    const checkout = join(root, "operational checkout");
    const fakeBin = join(root, "bin");
    const commandLog = join(root, "commands.log");
    await mkdir(checkout, { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    for (const command of ["git", "pnpm"]) {
      const executable = join(fakeBin, command);
      await writeFile(
        executable,
        `#!/bin/sh\nprintf '%s:%s\\n' '${command}' "$*" >> "$COMMAND_LOG"\n`,
        "utf8",
      );
      await chmod(executable, 0o755);
    }

    await execFile(process.execPath, [dailyRunner, "--checkout", checkout], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        COMMAND_LOG: commandLog,
      },
    });

    const canonicalCheckout = await realpath(checkout);
    expect((await readFile(commandLog, "utf8")).trim().split("\n")).toEqual([
      `git:-C ${canonicalCheckout} pull --rebase origin master`,
      `pnpm:--dir ${canonicalCheckout} --filter collector... build`,
      `pnpm:--dir ${canonicalCheckout} --filter collector run publish`,
    ]);
  });
});

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

async function configureIdentity(checkout: string): Promise<void> {
  await git(checkout, ["config", "user.name", "TokenViewer Test"]);
  await git(checkout, ["config", "user.email", "tokenviewer@example.invalid"]);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFile("git", args, {
    cwd,
    env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
  });
  return result.stdout;
}
