import type { HttpFetch, HttpResponse } from '../../vdr-scanner/src/graphClient.js';
import type { DriveItem } from '../../vdr-scanner/src/types.js';

interface MockFile {
  id: string;
  name: string;
  folder: string;
  content: string;
  version: number;
  deleted: boolean;
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return {
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * In-memory simulation of a Graph drive's /delta endpoint: paging via
 * skip/token query params, incremental change feeds, injectable 429 throttle
 * bursts and 410 token expiry, and version-stamped mutations so delta
 * semantics (only changes since token) are real.
 */
export class MockGraphDrive {
  private files = new Map<string, MockFile>();
  private version = 0;
  private throttleBudget = 0;
  private expireTokensBefore = 0;
  requestCount = 0;
  throttledCount = 0;

  constructor(
    public readonly driveId: string,
    private readonly pageSize = 10,
  ) {}

  addFile(id: string, name: string, folder: string, content: string): void {
    this.version++;
    this.files.set(id, { id, name, folder, content, version: this.version, deleted: false });
  }

  modifyFile(id: string, content: string): void {
    const file = this.mustGet(id);
    this.version++;
    file.content = content;
    file.version = this.version;
  }

  deleteFile(id: string): void {
    const file = this.mustGet(id);
    this.version++;
    file.deleted = true;
    file.version = this.version;
  }

  getContent(id: string): string {
    const file = this.mustGet(id);
    if (file.deleted) throw new Error(`File ${id} is deleted`);
    return file.content;
  }

  get liveFileCount(): number {
    return [...this.files.values()].filter((f) => !f.deleted).length;
  }

  /** The next `count` requests answer 429 with Retry-After: 0. */
  injectThrottle(count: number): void {
    this.throttleBudget = count;
  }

  /** Delta tokens older than the current version stop working (410 Gone). */
  expireExistingTokens(): void {
    this.expireTokensBefore = this.version;
  }

  readonly fetch: HttpFetch = async (url) => {
    this.requestCount++;

    if (this.throttleBudget > 0) {
      this.throttleBudget--;
      this.throttledCount++;
      return jsonResponse(429, { error: 'throttled' }, { 'Retry-After': '0' });
    }

    const parsed = new URL(url);
    const sinceToken = parsed.searchParams.get('mgd_token');
    const skip = Number(parsed.searchParams.get('mgd_skip') ?? '0');
    const since = sinceToken === null ? -1 : Number(sinceToken);

    if (since >= 0 && since < this.expireTokensBefore && skip === 0) {
      const fresh = this.deltaUrl(-1, 0);
      return jsonResponse(410, { error: 'resyncRequired' }, { Location: fresh });
    }

    // Full enumeration (since=-1) returns all live items; incremental returns
    // items whose version is newer than the token, including deletions.
    const changed = [...this.files.values()]
      .filter((f) => f.version > since)
      .filter((f) => since >= 0 || !f.deleted)
      .sort((a, b) => a.version - b.version);

    const page = changed.slice(skip, skip + this.pageSize);
    const items: DriveItem[] = page.map((f) =>
      f.deleted
        ? { id: f.id, name: f.name, deleted: { state: 'deleted' } }
        : {
            id: f.id,
            name: f.name,
            size: f.content.length,
            lastModifiedDateTime: `v${f.version}`,
            file: { mimeType: 'application/pdf' },
            parentReference: { path: f.folder, driveId: this.driveId },
          },
    );

    const body: Record<string, unknown> = { value: items };
    if (skip + this.pageSize < changed.length) {
      body['@odata.nextLink'] = this.deltaUrl(since, skip + this.pageSize);
    } else {
      body['@odata.deltaLink'] = this.deltaUrl(this.version, 0);
    }
    return jsonResponse(200, body);
  };

  private deltaUrl(since: number, skip: number): string {
    const token = since < 0 ? '' : `&mgd_token=${since}`;
    return `https://mock.graph/drives/${this.driveId}/root/delta?mgd_skip=${skip}${token}`;
  }

  private mustGet(id: string): MockFile {
    const file = this.files.get(id);
    if (!file) throw new Error(`No mock file ${id}`);
    return file;
  }
}
