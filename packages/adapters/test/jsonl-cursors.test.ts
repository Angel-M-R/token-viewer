import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claudeAdapter } from "../src/claude.js";
import { readCompleteJsonlLines } from "../src/source-files.js";

const envBackup = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in envBackup)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, envBackup);
});

describe.sequential("JSONL cursor handling", () => {
  it.sequential("advances to the last complete line and leaves partial lines for the next scan", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tv-jsonl-"));
    const file = join(dir, "session.jsonl");
    await writeFile(file, "{\"a\":1}\n{\"b\":2}", "utf-8");
    const cursors: Record<string, { size: number; mtimeMs: number; lastByteOffset?: number }> = {};

    const lines = await readCompleteJsonlLines(file, {
      onFileComplete(path, cursor) {
        cursors[path] = cursor;
      },
    });

    expect(lines.map((line) => line.line)).toEqual(["{\"a\":1}"]);
    expect(cursors[file]?.lastByteOffset).toBe(Buffer.byteLength("{\"a\":1}\n"));
  });

  it.sequential("skips unchanged files and reparses from zero after truncation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tv-jsonl-"));
    const file = join(dir, "session.jsonl");
    await writeFile(file, "one\ntwo\n", "utf-8");
    const firstStat = await stat(file);
    const skipped: string[] = [];

    const unchanged = await readCompleteJsonlLines(file, {
      cursors: {
        [file]: {
          size: firstStat.size,
          mtimeMs: firstStat.mtimeMs,
          lastByteOffset: firstStat.size,
        },
      },
      onFileSkipped(path) {
        skipped.push(path);
      },
    });
    expect(unchanged).toEqual([]);
    expect(skipped).toEqual([file]);

    await writeFile(file, "new\n", "utf-8");
    const rotated = await readCompleteJsonlLines(file, {
      cursors: {
        [file]: {
          size: firstStat.size,
          mtimeMs: firstStat.mtimeMs,
          lastByteOffset: firstStat.size,
        },
      },
    });
    expect(rotated.map((line) => line.line)).toEqual(["new"]);
  });
});

describe.sequential("claude adapter", () => {
  it.sequential("deduplicates streaming usage by request and emits source metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "tv-claude-"));
    process.env.CLAUDE_CONFIG_DIR = root;
    const projectDir = join(root, "projects", "my-project");
    await writeFile(join(projectDir, "placeholder"), "", "utf-8").catch(async () => {
      await import("node:fs/promises").then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
    });
    const file = join(projectDir, "session-1.jsonl");
    await writeFile(
      file,
      [
        JSON.stringify({
          type: "assistant",
          requestId: "req-1",
          timestamp: "2026-07-05T10:00:00.000Z",
          message: {
            id: "msg-1",
            role: "assistant",
            model: "claude-sonnet-4",
            usage: { input_tokens: 10, output_tokens: 4 },
          },
        }),
        JSON.stringify({
          type: "assistant",
          requestId: "req-1",
          timestamp: "2026-07-05T10:00:01.000Z",
          message: {
            id: "msg-1",
            role: "assistant",
            model: "claude-sonnet-4",
            usage: { input_tokens: 20, output_tokens: 8 },
          },
        }),
        "",
      ].join("\n"),
      "utf-8",
    );

    const cursors: Record<string, { size: number; mtimeMs: number; lastByteOffset?: number }> = {};
    const records = [];
    for await (const record of claudeAdapter().usage({
      onFileComplete(path, cursor) {
        cursors[path] = cursor;
      },
    })) {
      records.push(record);
    }

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      agent: "claude",
      inputTokens: 20,
      outputTokens: 8,
      project: "my-project",
      sourceFile: file,
    });
    expect(records[0]?.recordHash).toMatch(/^[a-f0-9]{64}$/);

    const second = [];
    for await (const record of claudeAdapter().usage({ cursors })) {
      second.push(record);
    }
    expect(second).toEqual([]);
  });
});
