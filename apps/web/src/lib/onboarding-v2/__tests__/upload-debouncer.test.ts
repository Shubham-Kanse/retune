import { describe, expect, it } from "vitest";
import { beginUpload, endUpload, isUploadAborted } from "../upload-debouncer";

describe("upload debouncer", () => {
  it("returns a non-aborted signal for a fresh upload", () => {
    const signal = beginUpload("user-debounce-1");
    expect(isUploadAborted(signal)).toBe(false);
    endUpload("user-debounce-1", signal);
  });

  it("aborts the previous signal when a new upload begins", () => {
    const first = beginUpload("user-debounce-2");
    const second = beginUpload("user-debounce-2");
    expect(isUploadAborted(first)).toBe(true);
    expect(isUploadAborted(second)).toBe(false);
    endUpload("user-debounce-2", second);
  });

  it("isolates signals per user", () => {
    const a = beginUpload("user-a");
    const b = beginUpload("user-b");
    expect(isUploadAborted(a)).toBe(false);
    expect(isUploadAborted(b)).toBe(false);
    endUpload("user-a", a);
    endUpload("user-b", b);
  });

  it("treats a null signal as not aborted", () => {
    expect(isUploadAborted(null)).toBe(false);
  });

  it("endUpload only clears matching signal", () => {
    const first = beginUpload("user-c");
    const second = beginUpload("user-c"); // aborts first
    // endUpload with stale signal should be a no-op, not affect new in-flight
    endUpload("user-c", first);
    expect(isUploadAborted(second)).toBe(false);
    endUpload("user-c", second);
  });
});
