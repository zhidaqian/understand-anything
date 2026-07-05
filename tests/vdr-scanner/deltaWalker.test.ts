import { describe, expect, it } from 'vitest';
import { GraphClient } from '../../vdr-scanner/src/graphClient.js';
import { walkDelta } from '../../vdr-scanner/src/deltaWalker.js';
import type { DriveItem } from '../../vdr-scanner/src/types.js';
import { MockGraphDrive } from './mockGraph.js';

function makeClient(drive: MockGraphDrive, sleeps: number[] = []) {
  return new GraphClient({
    getToken: () => 'test-token',
    fetch: drive.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
}

function seed(drive: MockGraphDrive, count: number) {
  for (let i = 0; i < count; i++) {
    drive.addFile(`f${i}`, `doc-${i}.pdf`, '/vdr/folder', `content of document ${i}`);
  }
}

describe('walkDelta', () => {
  it('enumerates every file across many pages and returns a deltaLink', async () => {
    const drive = new MockGraphDrive('drive1', 7);
    seed(drive, 100);

    const seen: DriveItem[] = [];
    const result = await walkDelta({
      client: makeClient(drive),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      onItem: (item) => {
        seen.push(item);
      },
    });

    expect(seen).toHaveLength(100);
    expect(new Set(seen.map((i) => i.id)).size).toBe(100);
    expect(result.pages).toBe(Math.ceil(100 / 7));
    expect(result.deltaLink).toContain('mgd_token=');
  });

  it('survives 429 throttling by honoring Retry-After and completing the walk', async () => {
    const drive = new MockGraphDrive('drive1', 5);
    seed(drive, 20);
    drive.injectThrottle(3);

    const sleeps: number[] = [];
    const seen: string[] = [];
    await walkDelta({
      client: makeClient(drive, sleeps),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      onItem: (item) => {
        seen.push(item.id);
      },
    });

    expect(seen).toHaveLength(20);
    expect(drive.throttledCount).toBe(3);
    expect(sleeps).toHaveLength(3);
  });

  it('recovers from an expired delta token via 410 resync and still sees all changes', async () => {
    const drive = new MockGraphDrive('drive1', 5);
    seed(drive, 12);

    const first = await walkDelta({
      client: makeClient(drive),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      onItem: () => {},
    });

    drive.addFile('late1', 'late-1.pdf', '/vdr/folder', 'late file');
    drive.expireExistingTokens();

    const seen: string[] = [];
    const second = await walkDelta({
      client: makeClient(drive),
      driveId: drive.driveId,
      deltaLink: first.deltaLink,
      graphBaseUrl: 'https://mock.graph',
      onItem: (item) => {
        seen.push(item.id);
      },
    });

    expect(second.resyncs).toBe(1);
    // Resync degrades to full re-enumeration — completeness is preserved.
    expect(seen).toContain('late1');
    expect(seen).toHaveLength(13);
  });

  it('incremental walk from a deltaLink returns only changes, including deletions', async () => {
    const drive = new MockGraphDrive('drive1', 5);
    seed(drive, 30);

    const first = await walkDelta({
      client: makeClient(drive),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      onItem: () => {},
    });

    drive.modifyFile('f3', 'updated content');
    drive.addFile('f30', 'doc-30.pdf', '/vdr/folder', 'new doc');
    drive.deleteFile('f7');

    const seen: DriveItem[] = [];
    await walkDelta({
      client: makeClient(drive),
      driveId: drive.driveId,
      deltaLink: first.deltaLink,
      graphBaseUrl: 'https://mock.graph',
      onItem: (item) => {
        seen.push(item);
      },
    });

    expect(seen).toHaveLength(3);
    expect(seen.find((i) => i.id === 'f7')?.deleted).toBeTruthy();
    expect(seen.map((i) => i.id).sort()).toEqual(['f3', 'f30', 'f7']);
  });

  it('fails loudly when the page budget is exceeded instead of spinning forever', async () => {
    const drive = new MockGraphDrive('drive1', 1);
    seed(drive, 10);

    await expect(
      walkDelta({
        client: makeClient(drive),
        driveId: drive.driveId,
        graphBaseUrl: 'https://mock.graph',
        maxPages: 3,
        onItem: () => {},
      }),
    ).rejects.toThrow(/exceeded 3 pages/);
  });
});
