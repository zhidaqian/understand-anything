export interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type HttpFetch = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<HttpResponse>;

export type GraphResult =
  | { kind: 'ok'; body: unknown }
  | { kind: 'resync'; location: string };

export class GraphError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

export interface GraphClientOptions {
  getToken: () => string | Promise<string>;
  fetch?: HttpFetch;
  sleep?: (ms: number) => Promise<void>;
  maxThrottleRetries?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Thin Graph HTTP wrapper enforcing the two behaviors an exhaustive scanner
 * cannot skip: honoring Retry-After on 429/503 (rejected calls still count
 * against quota) and surfacing 410 Gone as an explicit resync signal instead
 * of an error, since delta tokens expire by design.
 */
export class GraphClient {
  private readonly getToken: () => string | Promise<string>;
  private readonly fetchImpl: HttpFetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxThrottleRetries: number;

  constructor(options: GraphClientOptions) {
    this.getToken = options.getToken;
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as HttpFetch);
    this.sleep = options.sleep ?? defaultSleep;
    this.maxThrottleRetries = options.maxThrottleRetries ?? 6;
  }

  async getJson(url: string): Promise<GraphResult> {
    for (let attempt = 0; attempt <= this.maxThrottleRetries; attempt++) {
      const token = await this.getToken();
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 429 || res.status === 503) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const waitSeconds = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : 2 ** attempt;
        await this.sleep(waitSeconds * 1000);
        continue;
      }

      if (res.status === 410) {
        const location = res.headers.get('Location');
        if (!location) {
          throw new GraphError('410 Gone without a Location header to resync from', 410, await res.text());
        }
        return { kind: 'resync', location };
      }

      if (res.status < 200 || res.status >= 300) {
        throw new GraphError(`Graph request failed with ${res.status}`, res.status, await res.text());
      }

      return { kind: 'ok', body: await res.json() };
    }
    throw new GraphError(
      `Still throttled after ${this.maxThrottleRetries} retries`,
      429,
      'retry budget exhausted',
    );
  }
}
