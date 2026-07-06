import type {
  Classification,
  DriveItem,
  FileRecord,
  FileStatus,
  Reconciliation,
} from './types.js';

export type ApplyOutcome = 'upserted' | 'unchanged' | 'removed' | 'skipped-folder';

interface InventorySnapshot {
  records: FileRecord[];
}

/**
 * The scan's durable memory: one record per enumerated file, upserted by id.
 * Coverage is provable because every record must terminate as done, error, or
 * removed — reconcile() checks exactly that equation.
 */
export class Inventory {
  private records = new Map<string, FileRecord>();

  applyDeltaItem(item: DriveItem): ApplyOutcome {
    if (item.deleted) {
      const existing = this.records.get(item.id);
      if (existing) {
        existing.status = 'removed';
      } else {
        this.records.set(item.id, {
          id: item.id,
          name: item.name ?? '',
          path: item.parentReference?.path ?? '',
          size: item.size ?? 0,
          lastModified: item.lastModifiedDateTime ?? '',
          status: 'removed',
          attempts: 0,
        });
      }
      return 'removed';
    }

    if (item.folder) return 'skipped-folder';

    const lastModified = item.lastModifiedDateTime ?? '';
    const existing = this.records.get(item.id);
    // A finished record for an unchanged file stays finished — this is what
    // keeps incremental rescans from redoing completed work.
    if (existing && existing.status === 'done' && existing.lastModified === lastModified) {
      return 'unchanged';
    }

    this.records.set(item.id, {
      id: item.id,
      name: item.name ?? '',
      path: `${item.parentReference?.path ?? ''}/${item.name ?? ''}`,
      size: item.size ?? 0,
      lastModified,
      status: 'pending',
      attempts: 0,
    });
    return 'upserted';
  }

  takeBatch(limit: number): FileRecord[] {
    const batch: FileRecord[] = [];
    for (const record of this.records.values()) {
      if (record.status === 'pending') {
        batch.push(record);
        if (batch.length >= limit) break;
      }
    }
    return batch;
  }

  markDone(id: string, classification: Classification): void {
    const record = this.mustGet(id);
    record.status = 'done';
    record.classification = classification;
    record.lastError = undefined;
  }

  markError(id: string, message: string, maxAttempts: number): 'retry' | 'failed' {
    const record = this.mustGet(id);
    record.attempts++;
    record.lastError = message;
    if (record.attempts >= maxAttempts) {
      record.status = 'error';
      return 'failed';
    }
    return 'retry';
  }

  get(id: string): FileRecord | undefined {
    return this.records.get(id);
  }

  byStatus(status: FileStatus): FileRecord[] {
    return [...this.records.values()].filter((r) => r.status === status);
  }

  reconcile(): Reconciliation {
    let pending = 0;
    let done = 0;
    let error = 0;
    let removed = 0;
    for (const record of this.records.values()) {
      if (record.status === 'pending') pending++;
      else if (record.status === 'done') done++;
      else if (record.status === 'error') error++;
      else removed++;
    }
    const enumerated = this.records.size - removed;
    return {
      enumerated,
      pending,
      done,
      error,
      removed,
      complete: pending === 0 && done + error === enumerated,
    };
  }

  toJSON(): InventorySnapshot {
    return { records: [...this.records.values()] };
  }

  static fromJSON(snapshot: InventorySnapshot): Inventory {
    const inventory = new Inventory();
    for (const record of snapshot.records) {
      inventory.records.set(record.id, { ...record });
    }
    return inventory;
  }

  private mustGet(id: string): FileRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`No inventory record for file id ${id}`);
    return record;
  }
}
