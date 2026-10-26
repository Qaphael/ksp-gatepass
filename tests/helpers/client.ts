/**
 * Cookie-aware HTTP client for integration tests. All requests go through the
 * real running server (production build), never mocks.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON bodies are intentionally loose in tests */

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";

export { BASE_URL };

export interface JsonResult<T = any> {
  status: number;
  headers: Headers;
  body: T;
}

/** Short unique suffix so parallel-ish test data never collides. */
export function unique(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Unique fake client IP so per-IP rate-limit keys never leak between tests. */
export function uniqueIp(): string {
  const a = Math.floor(Math.random() * 254) + 1;
  const b = Math.floor(Math.random() * 254) + 1;
  return `10.77.${a}.${b}`;
}

export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly ip?: string) {}

  cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  setRawCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  private applySetCookies(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired =
        /expires=thu, 01 jan 1970/i.test(cookie) || value === "";
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0 && !headers.has("cookie")) {
      headers.set("cookie", this.cookieHeader());
    }
    if (this.ip && !headers.has("x-forwarded-for")) {
      headers.set("x-forwarded-for", this.ip);
    }
    const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
    this.applySetCookies(response);
    return response;
  }

  async json<T = any>(path: string, init: RequestInit = {}): Promise<JsonResult<T>> {
    const response = await this.request(path, init);
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, headers: response.headers, body };
  }

  get<T = any>(path: string): Promise<JsonResult<T>> {
    return this.json<T>(path);
  }

  post<T = any>(path: string, body?: unknown): Promise<JsonResult<T>> {
    return this.json<T>(path, {
      method: "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  patch<T = any>(path: string, body: unknown): Promise<JsonResult<T>> {
    return this.json<T>(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

export const CREDENTIALS = {
  admin: { identifier: "admin", password: "AdminTest!Pass1234" },
  seller: { identifier: "seller", password: "SellerTest!Pass1234" },
  verifier: { identifier: "verifier", password: "VerifierTest!Pass1234" },
  supervisor: { identifier: "supervisor", password: "SupervisorTest!Pass1234" },
} as const;

export async function loginAs(
  role: keyof typeof CREDENTIALS,
  ip?: string,
): Promise<TestClient> {
  const client = new TestClient(ip ?? `10.9.${Math.floor(Math.random() * 250)}.1`);
  const result = await client.post("/api/v1/auth/login", CREDENTIALS[role]);
  if (result.status !== 200) {
    throw new Error(
      `loginAs(${role}) failed: ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  return client;
}
