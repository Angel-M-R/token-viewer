import { execFile as execFileCallback } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";
import {
  activePublisherMachineSchema,
  validateSnapshotDirectory,
  type ActivePublisherMachine,
} from "@tokenviewer/core";

const execFile = promisify(execFileCallback);

export const DEFAULT_PUSH_RETRIES = 2;

export type GitPublicationErrorCode =
  | "preflight"
  | "generation"
  | "validation"
  | "conflict"
  | "network"
  | "push_failed"
  | "retries_exhausted";

export class GitPublicationError extends Error {
  readonly code: GitPublicationErrorCode;
  readonly pendingCommit?: string;

  constructor(code: GitPublicationErrorCode, message: string, pendingCommit?: string) {
    super(message);
    this.name = "GitPublicationError";
    this.code = code;
    this.pendingCommit = pendingCommit;
  }
}

export interface PublishSnapshotsOptions<T> {
  checkoutPath: string;
  machine: ActivePublisherMachine;
  expectedRemoteUrl: string;
  generate: () => Promise<T>;
  maxPushRetries?: number;
  onPendingCommitChange?: (commit: string | undefined) => Promise<void>;
}

export interface PublisherDependencies {
  beforePushAttempt?: (attempt: number) => Promise<void>;
}

export interface PublishSnapshotsResult<T> {
  generation: T;
  recoveredCommit?: string;
  commit?: string;
  published: boolean;
  pushAttempts: number;
}

interface GitCommandError extends Error {
  stdout?: string;
  stderr?: string;
}

interface PushResult {
  attempts: number;
  commit: string;
}

export async function publishSnapshots<T>(
  options: PublishSnapshotsOptions<T>,
  dependencies: PublisherDependencies = {},
): Promise<PublishSnapshotsResult<T>> {
  const machine = parseActivePublisherMachine(options.machine);
  const maxPushRetries = options.maxPushRetries ?? DEFAULT_PUSH_RETRIES;
  if (!Number.isInteger(maxPushRetries) || maxPushRetries < 0) {
    throw new GitPublicationError("preflight", "maxPushRetries must be a non-negative integer");
  }

  await assertOperationalCheckout(options.checkoutPath, machine, options.expectedRemoteUrl);
  const pendingCommit = await pendingHead(options.checkoutPath, machine);
  let recoveredCommit: string | undefined;
  let pushAttempts = 0;

  if (pendingCommit) {
    await options.onPendingCommitChange?.(pendingCommit);
    const recovery = await rebaseAndPush(
      options.checkoutPath,
      machine,
      pendingCommit,
      maxPushRetries,
      options.onPendingCommitChange,
      dependencies,
    );
    recoveredCommit = recovery.commit;
    pushAttempts += recovery.attempts;
    await options.onPendingCommitChange?.(undefined);
  }

  await pullRebase(options.checkoutPath, pendingCommit);
  await assertCleanOwnedWorktree(options.checkoutPath, machine);

  let generation: T;
  try {
    generation = await options.generate();
  } catch (error) {
    throw asPublicationError("generation", "snapshot generation failed", error);
  }

  try {
    await validateSnapshotDirectory(`${options.checkoutPath}/snapshots`);
  } catch (error) {
    throw asPublicationError("validation", "full snapshot validation failed", error);
  }

  const changedPaths = await worktreeChanges(options.checkoutPath);
  assertOwnedSnapshotPaths(changedPaths, machine, "generated changes");
  if (changedPaths.length === 0) {
    return { generation, recoveredCommit, published: false, pushAttempts };
  }

  await git(options.checkoutPath, ["add", "--", `snapshots/${machine}`]);
  const stagedPaths = await lines(options.checkoutPath, ["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"]);
  assertOwnedSnapshotPaths(stagedPaths, machine, "staged changes");
  if (stagedPaths.length === 0) {
    throw new GitPublicationError("preflight", "snapshot changes disappeared before commit");
  }

  await git(options.checkoutPath, ["commit", "-m", `data(snapshots): update ${machine}`]);
  const commit = await head(options.checkoutPath);
  await options.onPendingCommitChange?.(commit);

  const publication = await pushWithRetries(
    options.checkoutPath,
    machine,
    commit,
    maxPushRetries,
    options.onPendingCommitChange,
    dependencies,
  );
  pushAttempts += publication.attempts;
  await options.onPendingCommitChange?.(undefined);

  return {
    generation,
    recoveredCommit,
    commit: publication.commit,
    published: true,
    pushAttempts,
  };
}

export async function assertOperationalCheckout(
  checkoutPath: string,
  machine: ActivePublisherMachine,
  expectedRemoteUrl: string,
): Promise<void> {
  parseActivePublisherMachine(machine);
  if (!expectedRemoteUrl.trim()) {
    throw new GitPublicationError("preflight", "expectedRemoteUrl is required for publication");
  }
  assertCredentialFreeRemote(expectedRemoteUrl);

  let configuredRoot: string;
  let repositoryRoot: string;
  try {
    configuredRoot = await realpath(checkoutPath);
    repositoryRoot = await realpath((await git(checkoutPath, ["rev-parse", "--show-toplevel"])).trim());
  } catch (error) {
    throw asPublicationError("preflight", "operational checkout is not a Git repository", error);
  }
  if (configuredRoot !== repositoryRoot) {
    throw new GitPublicationError("preflight", "checkoutPath must be the root of the dedicated operational checkout");
  }

  const branch = (await git(checkoutPath, ["branch", "--show-current"])).trim();
  if (branch !== "master") {
    throw new GitPublicationError("preflight", `operational checkout must be on master (found ${branch || "detached HEAD"})`);
  }

  const remote = (await git(checkoutPath, ["remote", "get-url", "origin"])).trim();
  if (remote !== expectedRemoteUrl) {
    throw new GitPublicationError("preflight", "origin does not match the expected remote");
  }

  await git(checkoutPath, ["rev-parse", "--verify", "origin/master"]);
  await assertCleanOwnedWorktree(checkoutPath, machine);
  await pendingHead(checkoutPath, machine);
}

async function rebaseAndPush(
  checkoutPath: string,
  machine: ActivePublisherMachine,
  pendingCommit: string,
  maxPushRetries: number,
  onPendingCommitChange: PublishSnapshotsOptions<unknown>["onPendingCommitChange"],
  dependencies: PublisherDependencies,
): Promise<PushResult> {
  await pullRebase(checkoutPath, pendingCommit);
  const rebasedCommit = await head(checkoutPath);
  await onPendingCommitChange?.(rebasedCommit);
  return pushWithRetries(
    checkoutPath,
    machine,
    rebasedCommit,
    maxPushRetries,
    onPendingCommitChange,
    dependencies,
  );
}

async function pushWithRetries(
  checkoutPath: string,
  machine: ActivePublisherMachine,
  initialCommit: string,
  maxPushRetries: number,
  onPendingCommitChange: PublishSnapshotsOptions<unknown>["onPendingCommitChange"],
  dependencies: PublisherDependencies,
): Promise<PushResult> {
  let commit = initialCommit;
  for (let attempt = 1; ; attempt += 1) {
    await dependencies.beforePushAttempt?.(attempt);
    try {
      await git(checkoutPath, ["push", "origin", "master"]);
      return { attempts: attempt, commit };
    } catch (pushError) {
      try {
        await git(checkoutPath, ["fetch", "origin", "master"]);
      } catch (fetchError) {
        throw asPublicationError("network", "Git network operation failed; unpublished commit preserved", fetchError, commit);
      }

      const behind = Number.parseInt((await git(checkoutPath, ["rev-list", "--count", "HEAD..origin/master"])).trim(), 10);
      if (!Number.isFinite(behind) || behind < 1) {
        throw asPublicationError("push_failed", "Git push failed; unpublished commit preserved", pushError, commit);
      }
      if (attempt > maxPushRetries) {
        throw new GitPublicationError(
          "retries_exhausted",
          `Git push retry limit exhausted after ${attempt} attempts; unpublished commit preserved`,
          commit,
        );
      }

      await pullRebase(checkoutPath, commit);
      commit = await head(checkoutPath);
      await onPendingCommitChange?.(commit);
      const pendingPaths = await lines(checkoutPath, ["diff", "--name-only", "origin/master..HEAD"]);
      assertOwnedSnapshotPaths(pendingPaths, machine, "rebased unpublished commit");
    }
  }
}

async function pullRebase(checkoutPath: string, pendingCommit?: string): Promise<void> {
  try {
    await git(checkoutPath, ["pull", "--rebase", "origin", "master"]);
  } catch (error) {
    const conflictPaths = await lines(checkoutPath, ["diff", "--name-only", "--diff-filter=U"]).catch(() => []);
    if (conflictPaths.length > 0) {
      throw new GitPublicationError(
        "conflict",
        `Git rebase conflict requires manual intervention (${conflictPaths.join(", ")}); unpublished commit preserved`,
        pendingCommit,
      );
    }
    throw asPublicationError("network", "Git pull --rebase failed; unpublished commit preserved", error, pendingCommit);
  }
}

async function pendingHead(checkoutPath: string, machine: ActivePublisherMachine): Promise<string | undefined> {
  const ahead = Number.parseInt((await git(checkoutPath, ["rev-list", "--count", "origin/master..HEAD"])).trim(), 10);
  if (!Number.isFinite(ahead) || ahead < 1) return undefined;
  const pendingPaths = await lines(checkoutPath, ["diff", "--name-only", "origin/master..HEAD"]);
  assertOwnedSnapshotPaths(pendingPaths, machine, "unpublished commits");
  return head(checkoutPath);
}

async function assertCleanOwnedWorktree(checkoutPath: string, machine: ActivePublisherMachine): Promise<void> {
  const changes = await worktreeChanges(checkoutPath);
  if (changes.length > 0) {
    assertOwnedSnapshotPaths(changes, machine, "existing worktree changes");
    throw new GitPublicationError("preflight", "operational checkout must start with a clean worktree");
  }
}

async function worktreeChanges(checkoutPath: string): Promise<string[]> {
  const [unstaged, staged, untracked] = await Promise.all([
    lines(checkoutPath, ["diff", "--name-only", "--diff-filter=ACDMRTUXB"]),
    lines(checkoutPath, ["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"]),
    lines(checkoutPath, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...new Set([...unstaged, ...staged, ...untracked])].sort();
}

function assertOwnedSnapshotPaths(paths: readonly string[], machine: ActivePublisherMachine, context: string): void {
  const prefix = `snapshots/${machine}/`;
  const invalid = paths.filter((path) => !path.startsWith(prefix) || !path.endsWith(".json"));
  if (invalid.length > 0) {
    throw new GitPublicationError(
      "preflight",
      `${context} must contain only ${prefix}*.json (found ${invalid.join(", ")})`,
    );
  }
}

function parseActivePublisherMachine(machine: unknown): ActivePublisherMachine {
  const result = activePublisherMachineSchema.safeParse(machine);
  if (!result.success) {
    throw new GitPublicationError("preflight", "machine must be angel-mac or mac-m5");
  }
  return result.data;
}

function assertCredentialFreeRemote(remote: string): void {
  try {
    const url = new URL(remote);
    if (url.username || url.password || url.search || url.hash) {
      throw new GitPublicationError("preflight", "expected remote must not contain embedded credentials or parameters");
    }
  } catch (error) {
    if (error instanceof GitPublicationError) throw error;
    // SCP-style SSH and filesystem remotes are valid Git URLs. Exact matching still applies.
  }
}

async function head(checkoutPath: string): Promise<string> {
  return (await git(checkoutPath, ["rev-parse", "HEAD"])).trim();
}

async function lines(checkoutPath: string, args: string[]): Promise<string[]> {
  return (await git(checkoutPath, args))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function git(checkoutPath: string, args: string[]): Promise<string> {
  try {
    const result = await execFile("git", ["-C", checkoutPath, ...args], {
      env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout;
  } catch (error) {
    const commandError = error as GitCommandError;
    const detail = commandError.stderr?.trim() || commandError.stdout?.trim() || commandError.message;
    const safeCommand = args[0] ?? "command";
    throw new Error(`git ${safeCommand} failed${detail ? `: ${detail}` : ""}`);
  }
}

function asPublicationError(
  code: GitPublicationErrorCode,
  message: string,
  cause: unknown,
  pendingCommit?: string,
): GitPublicationError {
  if (cause instanceof GitPublicationError) return cause;
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new GitPublicationError(code, `${message}: ${detail}`, pendingCommit);
}
