import "server-only";

import { chessUserAgent } from "@/lib/env";

/**
 * Shared HTTP plumbing for the upstream chess APIs.
 *
 * Both providers throttle aggressively and answer with 429 rather than
 * queueing, so every call goes through a per-host serial gate plus a
 * bounded retry that honours Retry-After.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/** Marks a username the upstream API has never heard of. */
export class PlayerNotFoundError extends Error {
  constructor(handle: string, platform: string) {
    super(`No ${platform} player called "${handle}".`);
    this.name = "PlayerNotFoundError";
  }
}

type Gate = { last: number; chain: Promise<unknown> };

const gates = new Map<string, Gate>();

/**
 * Serializes requests per host and keeps at least `minGapMs` between them.
 * Chess.com tolerates parallel reads of *different* endpoints but starts
 * returning 429 under burst; Lichess documents a strict serial expectation.
 */
async function throttled<T>(host: string, minGapMs: number, task: () => Promise<T>): Promise<T> {
  const gate = gates.get(host) ?? { last: 0, chain: Promise.resolve() };
  gates.set(host, gate);

  const run = gate.chain.then(async () => {
    const wait = gate.last + minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      gate.last = Date.now();
    }
  });

  // Keep the chain alive even when a link rejects, or one failure would
  // poison every subsequent request to that host.
  gate.chain = run.catch(() => undefined);
  return run;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchOptions {
  host: string;
  minGapMs?: number;
  accept?: string;
  token?: string;
  /** Retries on 429/5xx. */
  attempts?: number;
  signal?: AbortSignal;
}

export async function fetchUpstream(url: string, options: FetchOptions): Promise<Response> {
  const { host, minGapMs = 350, accept = "application/json", token, attempts = 3, signal } = options;

  return throttled(host, minGapMs, async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        // 600ms, 1.2s, 2.4s … with a little jitter to avoid lockstep retries.
        const backoff = 600 * 2 ** (attempt - 1) + Math.random() * 250;
        await sleep(backoff);
      }

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            "User-Agent": chessUserAgent(),
            Accept: accept,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          cache: "no-store",
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        lastError = error;
        continue;
      }

      if (response.ok) return response;

      if (response.status === 404) {
        throw new UpstreamError(`Not found: ${url}`, 404, false);
      }

      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
        // Lichess answers 429 with a full-minute cooldown. Respect it when
        // given, but never stall a request handler for more than 10s.
        await sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 2_000, 10_000));
        lastError = new UpstreamError("Rate limited upstream", 429, true);
        continue;
      }

      if (response.status >= 500) {
        lastError = new UpstreamError(`Upstream ${response.status}`, response.status, true);
        continue;
      }

      throw new UpstreamError(
        `Upstream ${response.status} for ${url}`,
        response.status,
        false,
      );
    }

    if (lastError instanceof UpstreamError) throw lastError;
    throw new UpstreamError(
      `Upstream request failed: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
      502,
      true,
    );
  });
}

export async function fetchJson<T>(url: string, options: FetchOptions): Promise<T> {
  const response = await fetchUpstream(url, options);
  return (await response.json()) as T;
}

/**
 * Streams an NDJSON body, yielding one parsed object per line. Lichess sends
 * game exports this way and a popular player's history is large enough that
 * buffering the whole body is wasteful.
 */
export async function* streamNdjson<T>(
  url: string,
  options: FetchOptions,
): AsyncGenerator<T, void, unknown> {
  const response = await fetchUpstream(url, { ...options, accept: "application/x-ndjson" });
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineAt = buffer.indexOf("\n");

      while (newlineAt !== -1) {
        const line = buffer.slice(0, newlineAt).trim();
        buffer = buffer.slice(newlineAt + 1);
        if (line) yield JSON.parse(line) as T;
        newlineAt = buffer.indexOf("\n");
      }
    }

    const tail = buffer.trim();
    if (tail) yield JSON.parse(tail) as T;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
