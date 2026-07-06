import { describe, expect, it } from 'vitest';
import { GraphClient, type HttpFetch, type HttpResponse } from '../../vdr-scanner/src/graphClient.js';
import { encodeShareUrl, resolveDriveFromUrl } from '../../vdr-scanner/src/resolveDrive.js';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return {
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function clientWith(fetch: HttpFetch) {
  return new GraphClient({ getToken: () => 't', fetch, sleep: async () => {} });
}

describe('encodeShareUrl', () => {
  it('produces the documented u!-prefixed base64url form', () => {
    // Worked example from the Graph shares-API docs.
    const encoded = encodeShareUrl('https://onedrive.live.com/redir?resid=1231244193912!12&authKey=1201919!12921!1');
    expect(encoded).toBe(
      'u!aHR0cHM6Ly9vbmVkcml2ZS5saXZlLmNvbS9yZWRpcj9yZXNpZD0xMjMxMjQ0MTkzOTEyITEyJmF1dGhLZXk9MTIwMTkxOSExMjkyMSEx',
    );
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe('resolveDriveFromUrl', () => {
  const libraryUrl = 'https://contoso.sharepoint.com/sites/ProjectFalcon/Shared%20Documents';

  it('resolves a pasted library URL to its backing drive', async () => {
    const requested: string[] = [];
    const client = clientWith(async (url) => {
      requested.push(url);
      return jsonResponse(200, {
        id: 'root-item-1',
        name: 'Shared Documents',
        webUrl: libraryUrl,
        folder: { childCount: 812 },
        parentReference: { driveId: 'b!drive-falcon' },
      });
    });

    const resolved = await resolveDriveFromUrl(client, `  ${libraryUrl}  `);
    expect(resolved).toEqual({
      driveId: 'b!drive-falcon',
      itemId: 'root-item-1',
      name: 'Shared Documents',
      webUrl: libraryUrl,
    });
    expect(requested[0]).toContain(`/shares/${encodeShareUrl(libraryUrl)}/driveItem`);
  });

  it('rejects non-https input before calling Graph', async () => {
    const client = clientWith(async () => {
      throw new Error('should not be called');
    });
    await expect(resolveDriveFromUrl(client, 'ProjectFalcon docs')).rejects.toThrow(/expected an https:\/\/ link/);
  });

  it('turns 403/404 into an actionable access message', async () => {
    const client = clientWith(async () => jsonResponse(404, { error: 'itemNotFound' }));
    await expect(resolveDriveFromUrl(client, libraryUrl)).rejects.toThrow(/cannot access it \(404\)/);
  });

  it('rejects links that point at a single file instead of a library', async () => {
    const client = clientWith(async () =>
      jsonResponse(200, {
        id: 'file-9',
        name: 'contract.pdf',
        file: { mimeType: 'application/pdf' },
        parentReference: { driveId: 'b!drive-falcon' },
      }),
    );
    await expect(resolveDriveFromUrl(client, `${libraryUrl}/contract.pdf`)).rejects.toThrow(
      /single file, not a library/,
    );
  });
});
