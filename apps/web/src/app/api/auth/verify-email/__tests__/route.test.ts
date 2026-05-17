import { beforeEach, describe, expect, it, vi } from "vitest";

const resendMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { resend: resendMock } }),
}));

describe("POST /api/auth/verify-email", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Email is required.");
  });

  it("returns 200 on successful resend", async () => {
    resendMock.mockResolvedValue({ error: null });
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(resendMock).toHaveBeenCalledWith({ type: "signup", email: "user@example.com" });
  });

  it("returns 400 when supabase resend fails", async () => {
    resendMock.mockResolvedValue({ error: { message: "Rate limit exceeded" } });
    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Rate limit exceeded");
  });
});
