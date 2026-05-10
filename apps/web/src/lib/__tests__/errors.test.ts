import { toErrorResponse } from "@/lib/errors";
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
});
