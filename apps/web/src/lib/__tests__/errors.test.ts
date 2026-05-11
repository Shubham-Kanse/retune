import { safeFetch, safeQuery, toErrorResponse, withInfraFallback } from "@/lib/errors";
import { AuthError, BillingError, ValidationError } from "@/lib/errors";
import { describe, expect, it } from "vitest";

describe("Error Handling", () => {
  it("should convert AuthError to proper response", () => {
    const error = new AuthError("Invalid credentials");
    const response = toErrorResponse(error);

    expect(response).toEqual({
      error: "Invalid credentials",
      code: "AUTH_ERROR",
      status: 401,
    });
  });

  it("should convert ValidationError to proper response", () => {
    const error = new ValidationError("Invalid input");
    const response = toErrorResponse(error);

    expect(response).toEqual({
      error: "Invalid input",
      code: "VALIDATION_ERROR",
      status: 400,
    });
  });

  it("should convert BillingError to proper response", () => {
    const error = new BillingError("Limit reached");
    const response = toErrorResponse(error);

    expect(response).toEqual({
      error: "Limit reached",
      code: "BILLING_ERROR",
      status: 402,
    });
  });

  it("should handle unknown errors safely", () => {
    const error = new Error("Unknown error");
    const response = toErrorResponse(error);

    expect(response).toEqual({
      error: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });

  it("should handle non-Error objects", () => {
    const response = toErrorResponse("string error");

    expect(response).toEqual({
      error: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });

  it("withInfraFallback returns fallback on ENOTFOUND", async () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND db.example.com"), { code: "ENOTFOUND" });
    await expect(withInfraFallback(async () => { throw err; }, "fallback")).resolves.toBe("fallback");
  });

  it("safeQuery returns fallback on timeout infra errors", async () => {
    const err = Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
    await expect(safeQuery(async () => { throw err; }, 42)).resolves.toBe(42);
  });

  it("safeQuery rethrows non-infrastructure errors", async () => {
    await expect(
      safeQuery(async () => {
        throw new Error("validation failed");
      }, 42),
    ).rejects.toThrow("validation failed");
  });

  it("safeFetch returns fallback on infra failure", async () => {
    const originalFetch = global.fetch;
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND api.example.com"), { code: "ENOTFOUND" });
    try {
      global.fetch = (async () => {
        throw err;
      }) as typeof fetch;
      await expect(safeFetch("http://example.com", undefined, ["x"])).resolves.toEqual(["x"]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("safeFetch returns fallback on non-ok response", async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = (async () => new Response("oops", { status: 500 })) as typeof fetch;
      await expect(safeFetch("http://example.com", undefined, ["x"])).resolves.toEqual(["x"]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
