import type { GraphClient } from './graphClient.js';
import type { DeltaPage, DriveItem } from './types.js';

export interface WalkOptions {
  client: GraphClient;
  driveId: string;
  /** Saved @odata.deltaLink from a prior walk; omit for a full enumeration. */
  deltaLink?: string;
  graphBaseUrl?: string;
  select?: string[];
  pageSize?: number;
  /** Hard cap so a malformed paging loop fails loudly instead of spinning. */
  maxPages?: number;
  onItem: (item: DriveItem) => void | Promise<void>;
}

export interface WalkResult {
  deltaLink: string;
  pages: number;
  items: number;
  resyncs: number;
}

const DEFAULT_SELECT = [
  'id',
  'name',
  'size',
  'file',
  'folder',
  'deleted',
  'parentReference',
  'lastModifiedDateTime',
];

function parseDeltaPage(body: unknown): DeltaPage {
  if (typeof body !== 'object' || body === null || !Array.isArray((body as DeltaPage).value)) {
    throw new Error('Delta response is not a page: missing "value" array');
  }
  return body as DeltaPage;
}

/**
 * Walks a drive's delta stream to completion. Delta enumeration is the only
 * Graph mechanism that guarantees every item is returned even while writes
 * happen mid-scan (items may then appear on multiple pages, so consumers must
 * upsert by id). Returns the deltaLink checkpoint for the next incremental run.
 */
export async function walkDelta(options: WalkOptions): Promise<WalkResult> {
  const base = options.graphBaseUrl ?? 'https://graph.microsoft.com/v1.0';
  const select = (options.select ?? DEFAULT_SELECT).join(',');
  const pageSize = options.pageSize ?? 999;
  const maxPages = options.maxPages ?? 100_000;

  let url =
    options.deltaLink ??
    `${base}/drives/${options.driveId}/root/delta?$select=${select}&$top=${pageSize}`;

  const result: WalkResult = { deltaLink: '', pages: 0, items: 0, resyncs: 0 };

  while (url) {
    if (result.pages >= maxPages) {
      throw new Error(`Delta walk exceeded ${maxPages} pages without completing`);
    }

    const response = await options.client.getJson(url);
    if (response.kind === 'resync') {
      result.resyncs++;
      url = response.location;
      continue;
    }

    const page = parseDeltaPage(response.body);
    result.pages++;

    for (const item of page.value) {
      result.items++;
      await options.onItem(item);
    }

    const deltaLink = page['@odata.deltaLink'];
    if (deltaLink) {
      result.deltaLink = deltaLink;
      return result;
    }

    const nextLink = page['@odata.nextLink'];
    if (!nextLink) {
      throw new Error('Delta page carried neither @odata.nextLink nor @odata.deltaLink');
    }
    url = nextLink;
  }

  throw new Error('unreachable: delta walk ended without a deltaLink');
}
