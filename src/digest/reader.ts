import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunLine = {
  at: string;
  // Parsed `at`, for ordering lines written with different offsets.
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

const isStatus = (v: unknown): v is RunStatus => v === 'ok' || v === 'retry' || v === 'fail';

// The edge: one raw line in, a typed RunLine or null out. Never throws.
const parseLine = (raw: string): RunLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || typeof job !== 'string' || job === '' || !isStatus(status)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  return {
    at,
    time,
    job,
    status,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' ? error : null,
  };
};

const toRow = (job: string, lines: RunLine[]): DigestRow => {
  // Stable sort: ties on time keep file order.
  const sorted = [...lines].sort((a, b) => a.time - b.time);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const lastError = sorted.findLast((l) => l.error !== null)?.error ?? null;
  return {
    job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
};

export const readNight: ReadNight = (runsDir, night) => {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.entries()]
    .map(([job, lines]) => toRow(job, lines))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
