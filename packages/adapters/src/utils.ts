import { computeRecordHash, type HashableUsageRecord, type UsageRecord } from "@tokenviewer/core";

export function withRecordHash(record: HashableUsageRecord): UsageRecord {
  return {
    ...record,
    recordHash: computeRecordHash(record),
  };
}

export function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  }

  return undefined;
}

export function isAtOrAfter(timestamp: string | undefined, since: Date | undefined): boolean {
  if (!since || !timestamp) {
    return true;
  }

  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) && date >= since;
}

export function contentToText(content: unknown): string | null {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const parts = content.map(contentToText).filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(" ") : null;
  }

  const record = asRecord(content);
  if (!record) {
    return null;
  }

  for (const field of ["text", "content", "message", "value"]) {
    const text = contentToText(record[field]);
    if (text) {
      return text;
    }
  }

  return null;
}

export function uniqueStrings(values: (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
