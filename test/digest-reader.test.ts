import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28')!;
  const row = (job: string) => night.rows.find((r) => r.job === job)!;

  it('has one row per job, sorted, and counts the bad line', () => {
    expect(night.night).toBe('2026-10-28');
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night.badLines).toBe(1);
  });

  it('folds retries and keeps the last error', () => {
    expect(row('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a row with no owner', () => {
    expect(row('digest/render').owner).toBeNull();
  });

  it('reports a failed job', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });
});

describe('readNight edges', () => {
  it('returns null for a missing night', () => {
    expect(readNight(tmp, '1999-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    writeFileSync(join(tmp, '2026-01-01.jsonl'), '');
    expect(readNight(tmp, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts invalid lines and orders by time, ties by file order', () => {
    const lines = [
      '{"at":"2026-01-02T02:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"retry","owner":"x","error":"e1"}',
      '{"at":"2026-01-02T02:00:00+01:00","job":"a","status":"fail","owner":"y"}',
      '{"at":"nope","job":"a","status":"ok"}',
      '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"maybe"}',
      '[1,2]',
      '',
    ];
    writeFileSync(join(tmp, '2026-01-02.jsonl'), lines.join('\n') + '\n');
    const night = readNight(tmp, '2026-01-02')!;
    expect(night.badLines).toBe(3);
    expect(night.rows).toEqual([
      {
        job: 'a',
        owner: 'y',
        runs: 3,
        retries: 1,
        lastStatus: 'fail',
        lastError: 'e1',
        firstAt: '2026-01-02T01:00:00+01:00',
        lastAt: '2026-01-02T02:00:00+01:00',
      },
    ]);
  });
});
