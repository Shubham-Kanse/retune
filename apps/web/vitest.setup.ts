// Polyfill DOMMatrix for pdf-parse (pdfjs-dist) in jsdom environment
if (typeof globalThis.DOMMatrix === "undefined") {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m13 = 0;
    m14 = 0;
    m21 = 0;
    m22 = 1;
    m23 = 0;
    m24 = 0;
    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;
    m41 = 0;
    m42 = 0;
    m43 = 0;
    m44 = 1;
    is2D = true;
    isIdentity = true;
    inverse() {
      return new DOMMatrixPolyfill();
    }
    multiply() {
      return new DOMMatrixPolyfill();
    }
    translate() {
      return new DOMMatrixPolyfill();
    }
    scale() {
      return new DOMMatrixPolyfill();
    }
    rotate() {
      return new DOMMatrixPolyfill();
    }
    transformPoint() {
      return { x: 0, y: 0, z: 0, w: 1 };
    }
    toFloat32Array() {
      return new Float32Array(16);
    }
    toFloat64Array() {
      return new Float64Array(16);
    }
    toString() {
      return "matrix(1, 0, 0, 1, 0, 0)";
    }
    static fromMatrix() {
      return new DOMMatrixPolyfill();
    }
    static fromFloat32Array() {
      return new DOMMatrixPolyfill();
    }
    static fromFloat64Array() {
      return new DOMMatrixPolyfill();
    }
  }
  (globalThis as unknown as Record<string, unknown>).DOMMatrix = DOMMatrixPolyfill;
  (globalThis as unknown as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixPolyfill;
}

// ──────────────────────────────────────────────────────────────────
// Default test env vars — applied before module-load so libraries
// that read process.env at import time (csrf.ts JWT_SECRET, env.ts
// schema, etc.) don't crash. Individual tests can override these
// via process.env after import; vi.mock takes precedence anyway.
// ──────────────────────────────────────────────────────────────────
process.env.JWT_SECRET ??= "test-jwt-secret-with-at-least-32-characters-of-padding";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key-with-padding-to-pass-min-length";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key-with-padding-to-pass";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-key-with-padding-to-pass-min-length";
process.env.AI_PROVIDER ??= "anthropic";
// `NODE_ENV` is typed as readonly on @types/node — assign via index access
// to bypass the type guard. Vitest already sets NODE_ENV=test by default,
// so this is a defensive default for cases where it isn't.
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test";
