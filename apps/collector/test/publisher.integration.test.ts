import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  GitPublicationError,
  assertOperationalCheckout,
  publishSnapshots,
} from "../src/publisher.js";

const execFile = promisify(execFileCallback);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe.sequential("Git snapshot publisher", () => {
  it("rejects the wrong branch, remote, ownership, and pre-existing worktree changes", async () => {
    const setup = await repositories("tv-publisher-preflight-");

    await expect(
      assertOperationalCheckout(setup.angel, "angel-mac", `${setup.remote}-other`),
    ).rejects.toThrow(/expected private remote/);

    await git(setup.angel, ["switch", "-c", "feature"]);
    await expect(assertOperationalCheckout(setup.angel, "angel-mac", setup.remote)).rejects.toThrow(/master/);
    await git(setup.angel, ["switch", "master"]);

    await writeFile(join(setup.angel, "outside.txt"), "not snapshot data\n", "utf8");
    await expect(assertOperationalCheckout(setup.angel, "angel-mac", setup.remote)).rejects.toThrow(
      /only snapshots\/angel-mac/,
    );
    await rm(join(setup.angel, "outside.txt"));

    const beforeOwnershipFailure = await head(setup.angel);
    await expect(
      publishSnapshots({
        checkoutPath: setup.angel,
        machine: "angel-mac",
        expectedRemoteUrl: setup.remote,
        generate: () => writeSnapshot(setup.angel, "old-mac", "2026-07-26", "00:30:00"),
      }),
    ).rejects.toThrow(/only snapshots\/angel-mac/);
    expect(await head(setup.angel)).toBe(beforeOwnershipFailure);
    await rm(join(setup.angel, "snapshots"), { recursive: true });

  });

  it("rejects the retired identity before generation or Git", async () => {
    let generated = false;

    const error = await publishSnapshots({
      checkoutPath: "/checkout-must-not-be-inspected",
      machine: "old-mac" as "angel-mac",
      expectedRemoteUrl: "/remote-must-not-be-inspected",
      generate: async () => {
        generated = true;
      },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitPublicationError);
    expect(error).toMatchObject({ code: "preflight" });
    expect((error as Error).message).toContain("angel-mac or mac-m5");
    expect(generated).toBe(false);
  });

  it("does not create an empty commit for a no-op run", async () => {
    const setup = await repositories("tv-publisher-noop-");
    const before = await head(setup.angel);

    const result = await publishSnapshots({
      checkoutPath: setup.angel,
      machine: "angel-mac",
      expectedRemoteUrl: setup.remote,
      generate: async () => "no-op",
    });

    expect(result).toMatchObject({ generation: "no-op", published: false, pushAttempts: 0 });
    expect(await head(setup.angel)).toBe(before);
  });

  it("creates a data-only commit and publishes it to master", async () => {
    const setup = await repositories("tv-publisher-success-");

    const result = await publishSnapshots({
      checkoutPath: setup.angel,
      machine: "angel-mac",
      expectedRemoteUrl: setup.remote,
      generate: () => writeSnapshot(setup.angel, "angel-mac", "2026-07-26", "01:00:00"),
    });

    expect(result).toMatchObject({ published: true, pushAttempts: 1 });
    expect(await remoteHead(setup.remote)).toBe(result.commit);
    expect(await lines(setup.angel, ["show", "--pretty=", "--name-only", result.commit!])).toEqual([
      "snapshots/angel-mac/2026/07/2026-07-26.json",
    ]);
  });

  it("rebases and publishes concurrent commits from disjoint machine folders", async () => {
    const setup = await repositories("tv-publisher-concurrent-");
    let publishedAonM5 = false;

    const angelResult = await publishSnapshots(
      {
        checkoutPath: setup.angel,
        machine: "angel-mac",
        expectedRemoteUrl: setup.remote,
        generate: () => writeSnapshot(setup.angel, "angel-mac", "2026-07-26", "02:00:00"),
      },
      {
        beforePushAttempt: async () => {
          if (publishedAonM5) return;
          publishedAonM5 = true;
          await publishSnapshots({
            checkoutPath: setup.aonM5,
            machine: "mac-m5",
            expectedRemoteUrl: setup.remote,
            generate: () => writeSnapshot(setup.aonM5, "mac-m5", "2026-07-26", "03:00:00"),
          });
        },
      },
    );

    expect(angelResult.pushAttempts).toBe(2);
    const inspection = await clone(setup.remote, setup.root, "inspection");
    await expect(readFile(snapshotPath(inspection, "angel-mac", "2026-07-26"), "utf8")).resolves.toContain(
      '"machine": "angel-mac"',
    );
    await expect(readFile(snapshotPath(inspection, "mac-m5", "2026-07-26"), "utf8")).resolves.toContain(
      '"machine": "mac-m5"',
    );
  });

  it("retries a non-fast-forward push within the configured bound", async () => {
    const setup = await repositories("tv-publisher-nff-");
    let raced = false;

    const result = await publishSnapshots(
      {
        checkoutPath: setup.angel,
        machine: "angel-mac",
        expectedRemoteUrl: setup.remote,
        generate: () => writeSnapshot(setup.angel, "angel-mac", "2026-07-26", "04:00:00"),
        maxPushRetries: 1,
      },
      {
        beforePushAttempt: async () => {
          if (raced) return;
          raced = true;
           await commitAndPush(setup.aonM5, "race.txt", "race\n", "test: race");
        },
      },
    );

    expect(result.pushAttempts).toBe(2);
    expect(await remoteHead(setup.remote)).toBe(result.commit);
  });

  it("stops after exhausted retries and preserves the unpublished commit", async () => {
    const setup = await repositories("tv-publisher-exhausted-");

    const error = await publishSnapshots(
      {
        checkoutPath: setup.angel,
        machine: "angel-mac",
        expectedRemoteUrl: setup.remote,
        generate: () => writeSnapshot(setup.angel, "angel-mac", "2026-07-26", "05:00:00"),
        maxPushRetries: 1,
      },
      {
        beforePushAttempt: async (attempt) => {
          await git(setup.aonM5, ["pull", "--rebase", "origin", "master"]);
          await commitAndPush(setup.aonM5, `race-${attempt}.txt`, `${attempt}\n`, `test: race ${attempt}`);
        },
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitPublicationError);
    expect(error).toMatchObject({ code: "retries_exhausted" });
    expect(Number(await git(setup.angel, ["rev-list", "--count", "origin/master..HEAD"]))).toBe(1);
    expect(await head(setup.angel)).toBe((error as GitPublicationError).pendingCommit);
  });

  it("preserves a created commit when the network disappears", async () => {
    const setup = await repositories("tv-publisher-network-");
    const offlineRemote = `${setup.remote}.offline`;

    const error = await publishSnapshots(
      {
        checkoutPath: setup.angel,
        machine: "angel-mac",
        expectedRemoteUrl: setup.remote,
        generate: () => writeSnapshot(setup.angel, "angel-mac", "2026-07-26", "06:00:00"),
      },
      { beforePushAttempt: () => rename(setup.remote, offlineRemote) },
    ).catch((caught: unknown) => caught);
    await rename(offlineRemote, setup.remote);

    expect(error).toBeInstanceOf(GitPublicationError);
    expect(error).toMatchObject({ code: "network" });
    expect(await head(setup.angel)).toBe((error as GitPublicationError).pendingCommit);
  });

  it("stops on a real rebase conflict without discarding the unpublished commit", async () => {
    const setup = await repositories("tv-publisher-conflict-", true);
    let raced = false;

    const error = await publishSnapshots(
      {
        checkoutPath: setup.angel,
        machine: "angel-mac",
        expectedRemoteUrl: setup.remote,
        generate: () => writeSnapshot(setup.angel, "angel-mac", "2026-07-26", "07:00:00"),
      },
      {
        beforePushAttempt: async () => {
          if (raced) return;
          raced = true;
          await writeSnapshot(setup.aonM5, "angel-mac", "2026-07-26", "08:00:00");
          await git(setup.aonM5, ["add", "--", "snapshots/angel-mac"]);
          await git(setup.aonM5, ["commit", "-m", "data(snapshots): conflicting angel update"]);
          await git(setup.aonM5, ["push", "origin", "master"]);
        },
      },
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitPublicationError);
    expect(error).toMatchObject({ code: "conflict" });
    await expect(git(setup.angel, ["rev-parse", "REBASE_HEAD"])).resolves.toContain(
      (error as GitPublicationError).pendingCommit!,
    );
    expect(await lines(setup.angel, ["diff", "--name-only", "--diff-filter=U"])).toEqual([
      "snapshots/angel-mac/2026/07/2026-07-26.json",
    ]);
  });

  it("publishes a pending commit before invoking generation on the next run", async () => {
    const setup = await repositories("tv-publisher-recovery-");
    const offlineRemote = `${setup.remote}.offline`;
    const pendingChanges: (string | undefined)[] = [];

    const firstError = await publishSnapshots(
      {
        checkoutPath: setup.angel,
        machine: "angel-mac",
        expectedRemoteUrl: setup.remote,
        generate: () => writeSnapshot(setup.angel, "angel-mac", "2026-07-26", "09:00:00"),
        onPendingCommitChange: async (commit) => {
          pendingChanges.push(commit);
        },
      },
      { beforePushAttempt: () => rename(setup.remote, offlineRemote) },
    ).catch((caught: unknown) => caught);
    await rename(offlineRemote, setup.remote);
    const pendingCommit = (firstError as GitPublicationError).pendingCommit!;

    const result = await publishSnapshots({
      checkoutPath: setup.angel,
      machine: "angel-mac",
      expectedRemoteUrl: setup.remote,
      generate: async () => {
        expect(await remoteHead(setup.remote)).toBe(await head(setup.angel));
        return "recovered-before-generation";
      },
      onPendingCommitChange: async (commit) => {
        pendingChanges.push(commit);
      },
    });

    expect(result).toMatchObject({
      generation: "recovered-before-generation",
      recoveredCommit: pendingCommit,
      published: false,
    });
    expect(pendingChanges).toContain(pendingCommit);
    expect(pendingChanges.at(-1)).toBeUndefined();
  });
});

interface RepositorySetup {
  root: string;
  remote: string;
  angel: string;
  aonM5: string;
}

async function repositories(prefix: string, withBaseSnapshot = false): Promise<RepositorySetup> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  const remote = join(root, "origin.git");
  await git(root, ["init", "--bare", "--initial-branch=master", remote]);
  const seed = await clone(remote, root, "seed");
  await writeFile(join(seed, "README.md"), "temporary publisher test\n", "utf8");
  if (withBaseSnapshot) await writeSnapshot(seed, "angel-mac", "2026-07-26", "00:00:00");
  await git(seed, ["add", "."]);
  await git(seed, ["commit", "-m", "test: initialize remote"]);
  await git(seed, ["push", "origin", "master"]);
  const angel = await clone(remote, root, "angel");
  const aonM5 = await clone(remote, root, "former-employer-m5");
  return { root, remote, angel, aonM5 };
}

async function clone(remote: string, root: string, name: string): Promise<string> {
  const checkout = join(root, name);
  await git(root, ["clone", remote, checkout]);
  await git(checkout, ["config", "user.name", "TokenViewer Test"]);
  await git(checkout, ["config", "user.email", "tokenviewer@example.invalid"]);
  return checkout;
}

async function writeSnapshot(
  checkout: string,
  machine: "angel-mac" | "old-mac" | "mac-m5",
  date: string,
  generatedTime: string,
): Promise<string> {
  const path = snapshotPath(checkout, machine, date);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        machine,
        date,
        generatedAt: `${date}T${generatedTime}.000Z`,
        usage: [],
        quotaSamples: [],
        totals: {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          estimatedCost: 0,
          billedCost: 0,
          unpricedRequests: 0,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return path;
}

function snapshotPath(checkout: string, machine: string, date: string): string {
  return join(checkout, "snapshots", machine, date.slice(0, 4), date.slice(5, 7), `${date}.json`);
}

async function commitAndPush(checkout: string, path: string, content: string, message: string): Promise<void> {
  await writeFile(join(checkout, path), content, "utf8");
  await git(checkout, ["add", "--", path]);
  await git(checkout, ["commit", "-m", message]);
  await git(checkout, ["push", "origin", "master"]);
}

async function remoteHead(remote: string): Promise<string> {
  const output = await git(dirname(remote), ["ls-remote", remote, "refs/heads/master"]);
  return output.trim().split(/\s+/)[0] ?? "";
}

async function head(checkout: string): Promise<string> {
  return (await git(checkout, ["rev-parse", "HEAD"])).trim();
}

async function lines(checkout: string, args: string[]): Promise<string[]> {
  return (await git(checkout, args)).split("\n").map((line) => line.trim()).filter(Boolean);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFile("git", args, {
    cwd,
    env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout;
}
