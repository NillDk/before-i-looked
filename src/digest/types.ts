// Plan morning-digest § 1. The contract every part of § 2 starts against: one row per job for
// one night of runs/<night>.jsonl.
export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // null in the log; views render it as '—'.
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // The last error the job logged this night, or null if it never logged one.
  lastError: string | null;
  // As written in the log, offset kept (styleguide: never convert to UTC).
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job.
  rows: DigestRow[];
  // Lines that didn't parse: counted, never thrown.
  badLines: number;
};

// null when runs/<night>.jsonl doesn't exist; an empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
