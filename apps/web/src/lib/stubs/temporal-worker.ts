/**
 * Stub for @temporalio/worker in the Next.js web app.
 *
 * The Temporal worker runs in apps/worker as a separate process.
 * The web app only needs the Temporal client (for starting workflows).
 * @temporalio/worker pulls in webpack + swc + esbuild native binaries
 * that Turbopack cannot bundle — this stub prevents that import chain.
 */

export const Worker = {};
export const NativeConnection = {};
export const Runtime = {};
export const defaultPayloadConverter = {};
export const bundleWorkflowCode = async () => ({ code: "" });
export const makeTelemetryFilterString = () => "";

export function build_worker(): never {
  throw new Error("build_worker is not available in the web app. Use apps/worker.");
}
