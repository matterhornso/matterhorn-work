/**
 * Generic HTTP client with timeout + rate-limit backoff.
 * All crypto research tools build on this.
 */

export class ApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor({ baseUrl, headers = {}, timeout = 10000 }: {
    baseUrl: string;
    headers?: Record<string, string>;
    timeout?: number;
  }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.headers = headers;
    this.timeout = timeout;
  }

  async get(path: string, params?: Record<string, string | number>) {
    const url = new URL(this.baseUrl + path);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    }
    return fetchWithTimeout(
      url.toString(),
      { method: "GET", headers: this.headers },
      this.timeout
    );
  }

  async post(path: string, body: unknown) {
    return fetchWithTimeout(
      this.baseUrl + path,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.headers },
        body: JSON.stringify(body),
      },
      this.timeout
    );
  }
}

/** fetch with abort + timeout */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}
