import { describe, expect, it } from "vitest";
import {
  BASE_URL,
  CREDENTIALS,
  TestClient,
  loginAs,
  unique,
  uniqueIp,
} from "../helpers/client";
import {
  hashSessionToken,
  insertSessionWithToken,
  prisma,
} from "../helpers/db";

const SESSION_COOKIE = "ksp_session";

describe("POST /api/v1/auth/login", () => {
  it("sets an HttpOnly session cookie and never returns the token in the body", async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": uniqueIp(),
      },
      body: JSON.stringify(CREDENTIALS.admin),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(JSON.stringify(body)).not.toContain(CREDENTIALS.admin.password);

    const setCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
    expect(setCookie).toBeDefined();
    const lower = setCookie!.toLowerCase();
    expect(lower).toContain("httponly");
    expect(lower).toContain("samesite=lax");
    expect(lower).toContain("path=/");
    // COOKIE_SECURE=false for the local test server.
    expect(lower).not.toContain("secure");

    const rawToken = setCookie!.split(";")[0]!.split("=").slice(1).join("=");
    expect(rawToken.length).toBeGreaterThanOrEqual(40);
  });

  it("stores only the SHA-256 hash of the token, never the raw token", async () => {
    const client = new TestClient(uniqueIp());
    const login = await client.post("/api/v1/auth/login", CREDENTIALS.admin);
    expect(login.status).toBe(200);

    const rawToken = client.getCookie(SESSION_COOKIE);
    expect(rawToken).toBeTruthy();

    const byRaw = await prisma.session.findFirst({
      where: { tokenHash: rawToken! },
    });
    expect(byRaw).toBeNull();

    const byHash = await prisma.session.findFirst({
      where: { tokenHash: hashSessionToken(rawToken!) },
    });
    expect(byHash).not.toBeNull();
    expect(JSON.stringify(byHash)).not.toContain(rawToken!);
  });

  it("returns one generic 401 for unknown accounts and wrong passwords", async () => {
    const unknown = new TestClient(uniqueIp());
    const unknownResult = await unknown.post("/api/v1/auth/login", {
      identifier: unique("ghost"),
      password: "WrongPassword!1234",
    });

    const wrongPassword = new TestClient(uniqueIp());
    const wrongResult = await wrongPassword.post("/api/v1/auth/login", {
      identifier: "admin",
      password: "WrongPassword!1234",
    });

    for (const result of [unknownResult, wrongResult]) {
      expect(result.status).toBe(401);
      expect(result.body.error.code).toBe("UNAUTHENTICATED");
      expect(result.body.error.message).toBe("Invalid username or password.");
    }
    // Identical message: existence of an account is never revealed.
    expect(unknownResult.body.error.message).toBe(wrongResult.body.error.message);
  });

  it("rate-limits repeated failures with 429, Retry-After and an audit row", async () => {
    const ip = uniqueIp();
    const client = new TestClient(ip);
    const identifier = unique("ratelimit");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await client.post("/api/v1/auth/login", {
        identifier,
        password: "nope-nope-nope",
      });
      expect(result.status).toBe(401);
    }

    const blocked = await client.post("/api/v1/auth/login", {
      identifier,
      password: "nope-nope-nope",
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);

    const failures = await prisma.loginAttempt.count({
      where: { key: `acct:${identifier}` },
    });
    expect(failures).toBe(3); // the blocked attempt is not counted again

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "auth.login.failure",
        summary: { equals: { identifier, reason: "rate_limited" } },
      },
    });
    expect(audit).not.toBeNull();
  });
});

describe("session lifecycle", () => {
  it("rejects requests without a session cookie with 401", async () => {
    const anon = new TestClient(uniqueIp());
    const result = await anon.get("/api/v1/auth/me");
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("revokes the session on logout", async () => {
    const client = await loginAs("admin");
    expect((await client.get("/api/v1/auth/me")).status).toBe(200);

    const out = await client.post("/api/v1/auth/logout");
    expect(out.status).toBe(200);

    const after = await client.get("/api/v1/auth/me");
    expect(after.status).toBe(401);
  });

  it("rejects an expired session token", async () => {
    const admin = await loginAs("admin");
    const created = await admin.post("/api/v1/users", {
      displayName: "Expired Session User",
      username: unique("expired"),
      role: "VERIFIER",
      password: "ExpiredSession!1234",
    });
    expect(created.status).toBe(201);

    const token = await insertSessionWithToken(created.body.user.id, {
      expiresAt: new Date(Date.now() - 1_000),
    });
    const client = new TestClient();
    client.setRawCookie(SESSION_COOKIE, token);
    expect((await client.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("rejects a revoked session token", async () => {
    const admin = await loginAs("admin");
    const created = await admin.post("/api/v1/users", {
      displayName: "Revoked Session User",
      username: unique("revoked"),
      role: "VERIFIER",
      password: "RevokedSession!1234",
    });
    expect(created.status).toBe(201);

    const token = await insertSessionWithToken(created.body.user.id, {
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: new Date(),
    });
    const client = new TestClient();
    client.setRawCookie(SESSION_COOKIE, token);
    expect((await client.get("/api/v1/auth/me")).status).toBe(401);
  });

  it("kills a signed-in session the moment the account is deactivated", async () => {
    const admin = await loginAs("admin");
    const username = unique("victim");
    const created = await admin.post("/api/v1/users", {
      displayName: "Deactivation Victim",
      username,
      role: "SELLER",
      password: "DeactivateMe!1234",
    });
    expect(created.status).toBe(201);
    const userId = created.body.user.id;

    const victim = new TestClient(uniqueIp());
    const signIn = await victim.post("/api/v1/auth/login", {
      identifier: username,
      password: "DeactivateMe!1234",
    });
    expect(signIn.status).toBe(200);
    expect((await victim.get("/api/v1/auth/me")).status).toBe(200);

    const deactivate = await admin.post(`/api/v1/users/${userId}/deactivate`);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.user.active).toBe(false);

    const after = await victim.get("/api/v1/auth/me");
    expect(after.status).toBe(401);

    // Deactivation is idempotent.
    const again = await admin.post(`/api/v1/users/${userId}/deactivate`);
    expect(again.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "user.deactivate", targetId: userId },
    });
    expect(audit).not.toBeNull();
  });
});

describe("POST /api/v1/auth/change-password", () => {
  it("rejects a wrong current password with 422 and no session changes", async () => {
    const admin = await loginAs("admin");
    const username = unique("chpw");
    const created = await admin.post("/api/v1/users", {
      displayName: "Change Password User",
      username,
      role: "SELLER",
      password: "OriginalPass!1234",
    });
    expect(created.status).toBe(201);

    const client = new TestClient(uniqueIp());
    await client.post("/api/v1/auth/login", {
      identifier: username,
      password: "OriginalPass!1234",
    });

    const wrong = await client.post("/api/v1/auth/change-password", {
      currentPassword: "NotThePassword!1",
      newPassword: "BrandNewPass!1234",
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe("VALIDATION_ERROR");
    expect(wrong.body.error.details?.[0]?.path).toBe("currentPassword");

    // Session and password both unchanged.
    expect((await client.get("/api/v1/auth/me")).status).toBe(200);
    const oldPasswordStillWorks = await new TestClient(uniqueIp()).post(
      "/api/v1/auth/login",
      { identifier: username, password: "OriginalPass!1234" },
    );
    expect(oldPasswordStillWorks.status).toBe(200);
  });

  it("revokes every other session but keeps the current one", async () => {
    const admin = await loginAs("admin");
    const username = unique("chpw2");
    const password = "TwoSessions!Pass1234";
    const created = await admin.post("/api/v1/users", {
      displayName: "Two Sessions User",
      username,
      role: "SELLER",
      password,
    });
    expect(created.status).toBe(201);

    const device1 = new TestClient(uniqueIp());
    const device2 = new TestClient(uniqueIp());
    expect(
      (await device1.post("/api/v1/auth/login", { identifier: username, password }))
        .status,
    ).toBe(200);
    expect(
      (await device2.post("/api/v1/auth/login", { identifier: username, password }))
        .status,
    ).toBe(200);

    const changed = await device1.post("/api/v1/auth/change-password", {
      currentPassword: password,
      newPassword: "RotatedPass!Pass1234",
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ ok: true });

    // Current device survives…
    expect((await device1.get("/api/v1/auth/me")).status).toBe(200);
    // …every other session dies immediately.
    expect((await device2.get("/api/v1/auth/me")).status).toBe(401);

    // Old password no longer works; the new one does.
    const oldLogin = await new TestClient(uniqueIp()).post("/api/v1/auth/login", {
      identifier: username,
      password,
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await new TestClient(uniqueIp()).post("/api/v1/auth/login", {
      identifier: username,
      password: "RotatedPass!Pass1234",
    });
    expect(newLogin.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "auth.password.change" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain("RotatedPass!Pass1234");
  });
});
