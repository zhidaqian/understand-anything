import { GraphError, type GraphClient } from './graphClient.js';

export interface ResolvedDrive {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
}

/**
 * Graph sharing-URL encoding: base64url of the raw URL prefixed with "u!".
 * This is what lets /shares resolve ANY pasted SharePoint link (site, library,
 * or folder) without parsing tenant-specific URL shapes ourselves.
 */
export function encodeShareUrl(url: string): string {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return 'u!' + base64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Resolves a user-pasted SharePoint URL to the Graph drive that backs it.
 * The chat flow depends on this: the agent receives a URL, not a driveId.
 */
export async function resolveDriveFromUrl(
  client: GraphClient,
  url: string,
  graphBaseUrl = 'https://graph.microsoft.com/v1.0',
): Promise<ResolvedDrive> {
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error(`Not a SharePoint URL: "${url}" — expected an https:// link`);
  }

  const shareId = encodeShareUrl(trimmed);
  const requestUrl = `${graphBaseUrl}/shares/${shareId}/driveItem?$select=id,name,webUrl,parentReference,folder`;

  let response;
  try {
    response = await client.getJson(requestUrl);
  } catch (err) {
    if (err instanceof GraphError && (err.status === 404 || err.status === 403)) {
      throw new Error(
        `Could not resolve "${trimmed}": the app cannot access it (${err.status}). ` +
          'Check the URL and that the app registration has been granted access to this site.',
      );
    }
    throw err;
  }
  if (response.kind !== 'ok') {
    throw new Error(`Unexpected resync response while resolving "${trimmed}"`);
  }

  const item = response.body as {
    id?: string;
    name?: string;
    webUrl?: string;
    folder?: unknown;
    parentReference?: { driveId?: string };
  };
  const driveId = item.parentReference?.driveId;
  if (!driveId || !item.id) {
    throw new Error(`Resolved "${trimmed}" but the response carried no driveId`);
  }
  if (!item.folder) {
    throw new Error(
      `"${trimmed}" points at a single file, not a library or folder — paste the document library (or folder) link`,
    );
  }

  return {
    driveId,
    itemId: item.id,
    name: item.name ?? '',
    webUrl: item.webUrl ?? trimmed,
  };
}
