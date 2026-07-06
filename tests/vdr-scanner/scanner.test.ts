import { describe, expect, it } from 'vitest';
import { GraphClient } from '../../vdr-scanner/src/graphClient.js';
import { Inventory } from '../../vdr-scanner/src/inventory.js';
import { runScan } from '../../vdr-scanner/src/scanner.js';
import type { Classifier } from '../../vdr-scanner/src/classifier.js';
import type { Classification } from '../../vdr-scanner/src/types.js';
import { MockGraphDrive } from './mockGraph.js';

const IRL_KEYWORDS: Record<string, string> = {
  charter: 'CORP-01',
  financials: 'FIN-01',
  tax: 'TAX-01',
  contract: 'COM-01',
  employment: 'HR-01',
};

/** Deterministic stand-in for the LLM prompt tool. */
class KeywordClassifier implements Classifier {
  constructor(private readonly failIds = new Set<string>()) {}

  async classify(file: { id: string; name: string; content: string }): Promise<Classification> {
    if (this.failIds.has(file.id)) {
      throw new Error(`simulated model failure for ${file.id}`);
    }
    const irlItems = Object.entries(IRL_KEYWORDS)
      .filter(([keyword]) => file.name.includes(keyword) || file.content.includes(keyword))
      .map(([, itemId]) => itemId);
    return {
      docType: irlItems.length > 0 ? 'diligence document' : 'other',
      irlItems,
      topics: irlItems.length > 0 ? ['diligence'] : [],
      parties: [],
      confidence: irlItems.length > 0 ? 0.9 : 0.3,
      summary: `Classified ${file.name}`,
    };
  }
}

function makeClient(drive: MockGraphDrive) {
  return new GraphClient({
    getToken: () => 'test-token',
    fetch: drive.fetch,
    sleep: async () => {},
  });
}

function seedVdr(drive: MockGraphDrive, count: number) {
  const kinds = ['charter', 'financials', 'tax', 'contract', 'employment', 'misc'];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    drive.addFile(`f${i}`, `${kind}-${i}.pdf`, `/vdr/${kind}`, `This is the ${kind} document number ${i}.`);
  }
}

describe('runScan (end to end)', () => {
  it('classifies every file and proves coverage: done + error == enumerated', async () => {
    const drive = new MockGraphDrive('vdr-drive', 25);
    seedVdr(drive, 500);

    const inventory = new Inventory();
    const report = await runScan({
      client: makeClient(drive),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      inventory,
      classifier: new KeywordClassifier(),
      fetchContent: async (record) => drive.getContent(record.id),
      batchSize: 40,
    });

    expect(report.reconciliation.complete).toBe(true);
    expect(report.reconciliation.enumerated).toBe(500);
    expect(report.reconciliation.done).toBe(500);
    expect(report.reconciliation.error).toBe(0);
    expect(report.processed).toBe(500);
    expect(report.deltaLink).toContain('mgd_token=');
  });

  it('gives failing files three strikes, records them as errors, and still reconciles', async () => {
    const drive = new MockGraphDrive('vdr-drive', 10);
    seedVdr(drive, 60);

    const inventory = new Inventory();
    const report = await runScan({
      client: makeClient(drive),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      inventory,
      classifier: new KeywordClassifier(new Set(['f5', 'f17'])),
      fetchContent: async (record) => drive.getContent(record.id),
      maxAttempts: 3,
    });

    expect(report.reconciliation.complete).toBe(true);
    expect(report.reconciliation.done).toBe(58);
    expect(report.reconciliation.error).toBe(2);
    expect(inventory.get('f5')?.attempts).toBe(3);
    expect(inventory.get('f5')?.lastError).toContain('simulated model failure');
  });

  it('incremental rescan touches only changed files and keeps prior work', async () => {
    const drive = new MockGraphDrive('vdr-drive', 25);
    seedVdr(drive, 200);

    const inventory = new Inventory();
    const client = makeClient(drive);
    const first = await runScan({
      client,
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      inventory,
      classifier: new KeywordClassifier(),
      fetchContent: async (record) => drive.getContent(record.id),
    });
    expect(first.processed).toBe(200);

    drive.modifyFile('f10', 'This is the updated charter document.');
    drive.modifyFile('f11', 'This is the updated financials document.');
    drive.addFile('f200', 'contract-200.pdf', '/vdr/contract', 'This is the contract document number 200.');
    drive.deleteFile('f0');

    const second = await runScan({
      client,
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      inventory,
      classifier: new KeywordClassifier(),
      fetchContent: async (record) => drive.getContent(record.id),
      deltaLink: first.deltaLink,
    });

    // Only the two modified files and the one new file were reprocessed.
    expect(second.processed).toBe(3);
    expect(second.reconciliation.enumerated).toBe(200);
    expect(second.reconciliation.done).toBe(200);
    expect(second.reconciliation.removed).toBe(1);
    expect(second.reconciliation.complete).toBe(true);
    expect(inventory.get('f0')?.status).toBe('removed');
  });

  it('inventory state survives persistence round-trips between scans', async () => {
    const drive = new MockGraphDrive('vdr-drive', 25);
    seedVdr(drive, 50);

    const inventory = new Inventory();
    const first = await runScan({
      client: makeClient(drive),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      inventory,
      classifier: new KeywordClassifier(),
      fetchContent: async (record) => drive.getContent(record.id),
    });

    // Simulate the durable queue: serialize, "restart", deserialize.
    const restored = Inventory.fromJSON(JSON.parse(JSON.stringify(inventory.toJSON())));
    drive.addFile('f50', 'tax-50.pdf', '/vdr/tax', 'This is the tax document number 50.');

    const second = await runScan({
      client: makeClient(drive),
      driveId: drive.driveId,
      graphBaseUrl: 'https://mock.graph',
      inventory: restored,
      classifier: new KeywordClassifier(),
      fetchContent: async (record) => drive.getContent(record.id),
      deltaLink: first.deltaLink,
    });

    expect(second.processed).toBe(1);
    expect(second.reconciliation.enumerated).toBe(51);
    expect(second.reconciliation.done).toBe(51);
  });

  it('refuses to report success when coverage cannot be proven', async () => {
    const drive = new MockGraphDrive('vdr-drive', 10);
    seedVdr(drive, 20);

    const inventory = new Inventory();
    // A classifier that hangs the queue by always failing keeps attempts
    // climbing until error status — reconciliation still balances. To force a
    // genuine imbalance we corrupt the inventory after enumeration.
    const brokenInventory = new Proxy(inventory, {
      get(target, prop, receiver) {
        if (prop === 'takeBatch') {
          return () => []; // pretend there is nothing to do while files are pending
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    await expect(
      runScan({
        client: makeClient(drive),
        driveId: drive.driveId,
        graphBaseUrl: 'https://mock.graph',
        inventory: brokenInventory as Inventory,
        classifier: new KeywordClassifier(),
        fetchContent: async (record) => drive.getContent(record.id),
      }),
    ).rejects.toThrow(/Reconciliation failed/);
  });
});
