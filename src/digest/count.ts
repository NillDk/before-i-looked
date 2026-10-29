import { readRunLines } from './reader.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Line counts by status for one night; zeros when the file is missing. Bad lines aren't counted.
export function countNight(runsDir: string, night: string): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of readRunLines(runsDir, night)?.lines ?? []) counts[line.status]++;
  return counts;
}
