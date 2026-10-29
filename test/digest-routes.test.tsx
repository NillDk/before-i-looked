import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

let runsDir: string;
let config: RigConfig;

const lines = (...rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // Two jobs; file order differs from job order so sorting is actually tested.
  writeFileSync(
    join(runsDir, '2026-01-01.jsonl'),
    lines(
      { at: '2026-01-01T06:00:00+01:00', job: 'backup', status: 'ok', owner: 'ops', error: null },
      { at: '2026-01-01T07:00:00+01:00', job: 'alpha-sync', status: 'retry', owner: null, error: 'timeout' },
      { at: '2026-01-01T07:30:00+01:00', job: 'alpha-sync', status: 'fail', owner: null, error: 'timeout' },
    ),
  );
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-01-03.jsonl'),
    lines(
      { at: '2026-01-03T06:00:00+01:00', job: 'backup', status: 'ok', owner: 'ops', error: null },
    ) + 'this is not json\n',
  );
  config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const app = () => createApp(config);

describe('digest page /digest/:night', () => {
  it('renders a normal night with its jobs and — for a null owner', async () => {
    const res = await app().request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha-sync');
    expect(html).toContain('backup');
    expect(html).toContain('—');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-12-31');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log');
  });

  it('answers 404 for a malformed night', async () => {
    const res = await app().request('/digest/nope');
    expect(res.status).toBe(404);
  });

  it('renders the empty night as "nothing ran"', async () => {
    const res = await app().request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('renders a night with a bad line and says so', async () => {
    const res = await app().request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line could not be read');
  });
});

describe('digest JSON /api/digest/:night', () => {
  it('returns rows sorted by job for a normal night', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string; owner: string | null }[]; badLines: number };
    expect(body.night).toBe('2026-01-01');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha-sync', 'backup']);
    expect(body.rows[0]!.owner).toBeNull();
    expect(body.rows[1]!.owner).toBe('ops');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-12-31');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-12-31' });
  });

  it('answers 404 for a malformed night', async () => {
    const res = await app().request('/api/digest/nope');
    expect(res.status).toBe(404);
  });

  it('returns no rows and no bad lines for the empty night', async () => {
    const res = await app().request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts the bad line for a night with one', async () => {
    const res = await app().request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for a normal night', async () => {
    const html = await (await app().request('/digest/2026-01-01')).text();
    const json = (await (await app().request('/api/digest/2026-01-01')).json()) as { rows: { job: string }[] };
    const positions = json.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
