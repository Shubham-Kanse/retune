import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selectQueue: any[] = [];
const updateWhere = vi.fn();
const updateSet = vi.fn(() => ({ where: updateWhere }));
const updateMock = vi.fn(() => ({ set: updateSet }));
const insertOnConflict = vi.fn();
const insertValues = vi.fn(() => ({ onConflictDoNothing: insertOnConflict }));
const insertMock = vi.fn(() => ({ values: insertValues }));

const selectLimit = vi.fn(async () => selectQueue.shift() ?? []);
const selectWhere = vi.fn(() => ({ limit: selectLimit }));
const selectFrom = vi.fn(() => ({ where: selectWhere }));
const selectMock = vi.fn(() => ({ from: selectFrom }));

vi.mock("@/lib/api-handler", () => ({
  withAuth: (handler: any) => (request: Request) => handler(request, { userId: "u1" }),
}));

vi.mock("@/lib/preflight-table", () => ({
  ensureGenerationPreflightsTable: vi.fn(async () => undefined),
}));

vi.mock("@/lib/drift-preflight-token", () => ({
  verifyPreflightToken: vi.fn(() => ({
    preflight_id: "pf-1",
    user_id: "u1",
    jd_hash: "hash-1",
  })),
}));

vi.mock("@/lib/api-config", () => ({
  apiUrl: (path: string) => `http://api.local${path}`,
}));

vi.mock("@retune/db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
    insert: insertMock,
  },
}));

vi.mock("@retune/db/schema", () => ({
  applications: {},
  generationPreflights: {
    id: "id",
    userId: "userId",
    jdHash: "jdHash",
    usedAt: "usedAt",
    revokedAt: "revokedAt",
    expiresAt: "expiresAt",
    updatedAt: "updatedAt",
  },
  profiles: {
    userId: "userId",
  },
}));

describe("POST /api/generate preflight consume semantics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    selectQueue.length = 0;
  });

  function req(body: unknown) {
    return new NextRequest("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("does not consume preflight when upstream generation start fails", async () => {
    selectQueue.push([
      {
        id: "pf-1",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        usedAt: null,
      },
    ]);

    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: "upstream_down" }),
    })) as any;

    const { POST } = await import("@/app/api/generate/route");
    const res = await POST(
      req({
        jd_text: "example jd",
        jd_hash: "hash-1",
        preflight_token: "tok",
      }),
    );

    expect(res.status).toBe(503);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("aborts spawned generation and returns 428 when concurrent consume is lost", async () => {
    selectQueue.push(
      [
        {
          id: "pf-1",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          usedAt: null,
        },
      ],
      [], // consumed verification query: no row matched consume timestamp
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ generation_id: "g-1" }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as any);
    global.fetch = fetchMock as any;

    const { POST } = await import("@/app/api/generate/route");
    const res = await POST(
      req({
        jd_text: "example jd",
        jd_hash: "hash-1",
        preflight_token: "tok",
      }),
    );

    expect(res.status).toBe(428);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://api.local/generate/g-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(insertMock).not.toHaveBeenCalled();
  });
});

