/**
 * requireIdentity() middleware — the three auth paths and their
 * production/dev semantics. See src/lib/auth-middleware.ts.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { Hono } from "hono";
import { getIdentity, ownsRow, requireIdentity } from "../src/lib/auth-middleware";

const JWT_SECRET = "test-supabase-jwt-secret-0123456789";
const USER_A = "11111111-2222-4333-8444-555555555555";

function hs256Jwt(claims: Record<string, unknown>, secret = JWT_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

function appWithGuard(): Hono {
  const app = new Hono();
  app.get("/whoami", requireIdentity(), (c) => c.json(getIdentity(c)));
  return app;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

interface EnvPatch {
  [key: string]: string | undefined;
}

async function withEnv<T>(patch: EnvPatch, fn: () => Promise<T>): Promise<T> {
  const saved: EnvPatch = {};
  for (const k of Object.keys(patch)) {
    saved[k] = process.env[k];
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(patch)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("valid HS256 supabase JWT resolves the subject as the identity", async () => {
  await withEnv(
    { SUPABASE_JWT_SECRET: JWT_SECRET, RETUNE_INTERNAL_API_KEY: undefined },
    async () => {
      const token = hs256Jwt({
        sub: USER_A,
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 60,
      });
      const res = await appWithGuard().fetch(
        new Request("http://test/whoami", { headers: { authorization: `Bearer ${token}` } }),
      );
      assert.equal(res.status, 200);
      const body = await json(res);
      assert.equal(body.user_id, USER_A);
      assert.equal(body.method, "supabase_jwt");
      assert.equal(body.enforced, true);
    },
  );
});

test("tampered JWT signature is rejected with 401", async () => {
  await withEnv({ SUPABASE_JWT_SECRET: JWT_SECRET }, async () => {
    const token = hs256Jwt(
      { sub: USER_A, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 60 },
      "wrong-secret-wrong-secret-wrong",
    );
    const res = await appWithGuard().fetch(
      new Request("http://test/whoami", { headers: { authorization: `Bearer ${token}` } }),
    );
    assert.equal(res.status, 401);
    assert.equal((await json(res)).error, "invalid_token");
  });
});

test("expired JWT is rejected with 401", async () => {
  await withEnv({ SUPABASE_JWT_SECRET: JWT_SECRET }, async () => {
    const token = hs256Jwt({
      sub: USER_A,
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    const res = await appWithGuard().fetch(
      new Request("http://test/whoami", { headers: { authorization: `Bearer ${token}` } }),
    );
    assert.equal(res.status, 401);
  });
});

test("non-UUID subject is rejected", async () => {
  await withEnv({ SUPABASE_JWT_SECRET: JWT_SECRET }, async () => {
    const token = hs256Jwt({
      sub: "not-a-uuid",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const res = await appWithGuard().fetch(
      new Request("http://test/whoami", { headers: { authorization: `Bearer ${token}` } }),
    );
    assert.equal(res.status, 401);
  });
});

test("Bearer token without any JWT verification config is a hard 401", async () => {
  await withEnv(
    {
      SUPABASE_JWT_SECRET: undefined,
      SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
    },
    async () => {
      const res = await appWithGuard().fetch(
        new Request("http://test/whoami", { headers: { authorization: "Bearer whatever" } }),
      );
      assert.equal(res.status, 401);
      assert.equal((await json(res)).error, "jwt_verification_not_configured");
    },
  );
});

test("internal key + user id header resolves enforced internal_key identity", async () => {
  await withEnv({ RETUNE_INTERNAL_API_KEY: "internal-key-0123456789" }, async () => {
    const res = await appWithGuard().fetch(
      new Request("http://test/whoami", {
        headers: {
          "x-retune-internal-key": "internal-key-0123456789",
          "x-retune-user-id": USER_A,
        },
      }),
    );
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.user_id, USER_A);
    assert.equal(body.method, "internal_key");
    assert.equal(body.enforced, true);
  });
});

test("wrong internal key is rejected with 401", async () => {
  await withEnv({ RETUNE_INTERNAL_API_KEY: "internal-key-0123456789" }, async () => {
    const res = await appWithGuard().fetch(
      new Request("http://test/whoami", {
        headers: { "x-retune-internal-key": "nope", "x-retune-user-id": USER_A },
      }),
    );
    assert.equal(res.status, 401);
  });
});

test("dev fallback applies when no credentials are configured outside production", async () => {
  await withEnv({ RETUNE_INTERNAL_API_KEY: undefined, NODE_ENV: "test" }, async () => {
    const res = await appWithGuard().fetch(new Request("http://test/whoami"));
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.method, "dev_fallback");
    assert.equal(body.enforced, false);
  });
});

test("production refuses the trust-the-header fallback", async () => {
  await withEnv({ RETUNE_INTERNAL_API_KEY: undefined, NODE_ENV: "production" }, async () => {
    const res = await appWithGuard().fetch(new Request("http://test/whoami"));
    assert.equal(res.status, 401);
    assert.equal((await json(res)).error, "unauthenticated");
  });
});

test("ownsRow enforces ownership only for real credentials", () => {
  assert.equal(ownsRow({ user_id: USER_A, method: "supabase_jwt", enforced: true }, USER_A), true);
  assert.equal(
    ownsRow({ user_id: USER_A, method: "supabase_jwt", enforced: true }, "other"),
    false,
  );
  assert.equal(
    ownsRow({ user_id: USER_A, method: "dev_fallback", enforced: false }, "other"),
    true,
  );
});
