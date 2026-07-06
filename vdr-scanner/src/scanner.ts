import { walkDelta, type WalkResult } from './deltaWalker.js';
import type { GraphClient } from './graphClient.js';
import type { Inventory } from './inventory.js';
import type { Classifier } from './classifier.js';
import type { FileRecord, Reconciliation } from './types.js';

export interface ScanOptions {
  client: GraphClient;
  driveId: string;
  inventory: Inventory;
  classifier: Classifier;
  fetchContent: (record: FileRecord) => Promise<string>;
  /** Saved checkpoint from the previous scan; omit for the initial full scan. */
  deltaLink?: string;
  graphBaseUrl?: string;
  pageSize?: number;
  batchSize?: number;
  maxAttempts?: number;
  onProgress?: (reconciliation: Reconciliation) => void;
}

export interface ScanReport {
  enumeration: WalkResult;
  reconciliation: Reconciliation;
  processed: number;
  failed: number;
  /** Checkpoint to persist and pass as deltaLink on the next scan. */
  deltaLink: string;
}

/**
 * One full scan cycle: enumerate via delta (guaranteed-complete), drain the
 * pending queue through the classifier with a per-file retry cap, then prove
 * coverage by reconciliation. Throws if the books don't balance — an
 * exhaustive scanner must fail loudly rather than report partial coverage.
 */
export async function runScan(options: ScanOptions): Promise<ScanReport> {
  const batchSize = options.batchSize ?? 50;
  const maxAttempts = options.maxAttempts ?? 3;
  const { inventory } = options;

  const enumeration = await walkDelta({
    client: options.client,
    driveId: options.driveId,
    deltaLink: options.deltaLink,
    graphBaseUrl: options.graphBaseUrl,
    pageSize: options.pageSize,
    onItem: (item) => {
      inventory.applyDeltaItem(item);
    },
  });

  let processed = 0;
  let failed = 0;

  for (;;) {
    const batch = inventory.takeBatch(batchSize);
    if (batch.length === 0) break;

    await Promise.all(
      batch.map(async (record) => {
        try {
          const content = await options.fetchContent(record);
          const classification = await options.classifier.classify({
            id: record.id,
            name: record.name,
            path: record.path,
            content,
          });
          inventory.markDone(record.id, classification);
          processed++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (inventory.markError(record.id, message, maxAttempts) === 'failed') {
            failed++;
          }
        }
      }),
    );

    options.onProgress?.(inventory.reconcile());
  }

  const reconciliation = inventory.reconcile();
  if (!reconciliation.complete) {
    throw new Error(
      `Reconciliation failed: enumerated=${reconciliation.enumerated} done=${reconciliation.done} error=${reconciliation.error} pending=${reconciliation.pending}`,
    );
  }

  return {
    enumeration,
    reconciliation,
    processed,
    failed,
    deltaLink: enumeration.deltaLink,
  };
}
