import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@retune/auth", () => {
  return {
    LocalAuthProvider: vi.fn().mockImplementation(() => ({
      signIn: vi.fn(),
    })),
  };
});

describe("POST /api/auth/login", () => {
  function buildRequest(body: string, ip: string) {
    return new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body,
    });
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 and sets session cookie on valid credentials", async () => {
    const { LocalAuthProvider } = await import("@retune/auth");
    const signIn = vi.fn().mockResolvedValue({ session: { userId: "u1" }, token: "tok" });
    vi.mocked(LocalAuthProvider).mockImplementation(() => ({ signIn }) as never);
    const { POST } = await import("@/app/api/auth/login/route");

    const req = buildRequest(JSON.stringify({ email: "a@b.com", password: "secret" }), "10.0.0.1");
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(signIn).toHaveBeenCalledWith("a@b.com", "secret");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session=tok");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).toContain("SameSite=lax");
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = buildRequest("{", "10.0.0.2");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(buildRequest(JSON.stringify({ email: "a@b.com" }), "10.0.0.3"));
    expect(res.status).toBe(400);
  });

  it("returns 401 for auth failure", async () => {
    const { LocalAuthProvider } = await import("@retune/auth");
    const signIn = vi.fn().mockRejectedValue(new Error("bad creds"));
    vi.mocked(LocalAuthProvider).mockImplementation(() => ({ signIn }) as never);
    const { POST } = await import("@/app/api/auth/login/route");

    const req = buildRequest(JSON.stringify({ email: "a@b.com", password: "wrong" }), "10.0.0.4");
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid email or password");
  });

  it("rate limits after repeated failed attempts", async () => {
    const { LocalAuthProvider } = await import("@retune/auth");
    const signIn = vi.fn().mockRejectedValue(new Error("bad creds"));
    vi.mocked(LocalAuthProvider).mockImplementation(() => ({ signIn }) as never);
    const { POST } = await import("@/app/api/auth/login/route");

    let res: Response | undefined;
    for (let i = 0; i < 6; i++) {
      res = await POST(
        buildRequest(JSON.stringify({ email: "a@b.com", password: "wrong" }), "10.0.0.5"),
      );
    }
    expect(res?.status).toBe(429);
  });

  it("allows login again after the rate-limit window expires", async () => {
    const baseNow = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => baseNow);

    const { LocalAuthProvider } = await import("@retune/auth");
    const signIn = vi
      .fn()
      .mockRejectedValueOnce(new Error("bad creds"))
      .mockRejectedValueOnce(new Error("bad creds"))
      .mockRejectedValueOnce(new Error("bad creds"))
      .mockRejectedValueOnce(new Error("bad creds"))
      .mockRejectedValueOnce(new Error("bad creds"));
    vi.mocked(LocalAuthProvider).mockImplementation(() => ({ signIn }) as never);
    const { POST } = await import("@/app/api/auth/login/route");

    for (let i = 0; i < 5; i++) {
      const res = await POST(
        buildRequest(JSON.stringify({ email: "a@b.com", password: "wrong" }), "10.0.0.6"),
      );
      expect(res.status).toBe(401);
    }

    const blocked = await POST(
      buildRequest(JSON.stringify({ email: "a@b.com", password: "wrong" }), "10.0.0.6"),
    );
    expect(blocked.status).toBe(429);

    nowSpy.mockImplementation(() => baseNow + 900001);

    signIn.mockResolvedValueOnce({ session: { userId: "u1" }, token: "tok" });
    const recovered = await POST(
      buildRequest(JSON.stringify({ email: "a@b.com", password: "secret" }), "10.0.0.6"),
    );
    expect(recovered.status).toBe(200);
  });
});
