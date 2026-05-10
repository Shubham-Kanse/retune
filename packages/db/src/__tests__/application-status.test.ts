import { describe, expect, it } from "vitest";
import {
  type ApplicationStatus,
  getValidNextStatuses,
  isValidStatusTransition,
} from "../application-status";

describe("Application Status State Machine", () => {
  describe("isValidStatusTransition", () => {
    it("allows pending -> generating", () => {
      expect(isValidStatusTransition("pending", "generating")).toBe(true);
    });

    it("allows pending -> failed", () => {
      expect(isValidStatusTransition("pending", "failed")).toBe(true);
    });

    it("allows pending -> archived", () => {
      expect(isValidStatusTransition("pending", "archived")).toBe(true);
    });

    it("allows generating -> completed", () => {
      expect(isValidStatusTransition("generating", "completed")).toBe(true);
    });

    it("allows generating -> failed", () => {
      expect(isValidStatusTransition("generating", "failed")).toBe(true);
    });

    it("allows generating -> cancelled", () => {
      expect(isValidStatusTransition("generating", "cancelled")).toBe(true);
    });

    it("allows completed -> submitted", () => {
      expect(isValidStatusTransition("completed", "submitted")).toBe(true);
    });

    it("allows completed -> archived", () => {
      expect(isValidStatusTransition("completed", "archived")).toBe(true);
    });

    it("allows failed -> generating (retry)", () => {
      expect(isValidStatusTransition("failed", "generating")).toBe(true);
    });

    it("allows failed -> pending", () => {
      expect(isValidStatusTransition("failed", "pending")).toBe(true);
    });

    it("allows cancelled -> pending (retry)", () => {
      expect(isValidStatusTransition("cancelled", "pending")).toBe(true);
    });

    it("allows submitted -> archived", () => {
      expect(isValidStatusTransition("submitted", "archived")).toBe(true);
    });

    it("blocks completed -> generating (no direct rerun)", () => {
      expect(isValidStatusTransition("completed", "generating")).toBe(false);
    });

    it("blocks completed -> pending", () => {
      expect(isValidStatusTransition("completed", "pending")).toBe(false);
    });

    it("blocks archived -> any status", () => {
      const targets: ApplicationStatus[] = [
        "pending",
        "generating",
        "completed",
        "failed",
        "submitted",
        "cancelled",
      ];
      for (const to of targets) {
        expect(isValidStatusTransition("archived", to)).toBe(false);
      }
    });

    it("blocks pending -> completed (must go through generating)", () => {
      expect(isValidStatusTransition("pending", "completed")).toBe(false);
    });

    it("blocks generating -> pending directly", () => {
      expect(isValidStatusTransition("generating", "pending")).toBe(false);
    });

    it("blocks generating -> submitted", () => {
      expect(isValidStatusTransition("generating", "submitted")).toBe(false);
    });
  });

  describe("getValidNextStatuses", () => {
    it("returns correct next statuses for pending", () => {
      const next = getValidNextStatuses("pending");
      expect(next).toContain("generating");
      expect(next).toContain("failed");
      expect(next).toContain("archived");
      expect(next).not.toContain("completed");
    });

    it("returns empty array for archived", () => {
      expect(getValidNextStatuses("archived")).toEqual([]);
    });

    it("returns generating for failed (retry path)", () => {
      expect(getValidNextStatuses("failed")).toContain("generating");
    });
  });
});
