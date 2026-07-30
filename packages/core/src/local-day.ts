export const SNAPSHOT_TIME_ZONE = "Europe/Madrid" as const;

const localDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SNAPSHOT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Resolves the `Europe/Madrid` local calendar day (`YYYY-MM-DD`) of an instant.
 * Returns `null` when the instant cannot be parsed.
 */
export function localSnapshotDate(instant: Date | string | number | undefined): string | null {
  if (instant === undefined) return null;
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = Object.fromEntries(
    localDateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const { year, month, day } = parts;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}
