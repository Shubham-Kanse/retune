import { apiUrl } from "@/lib/api-config";
import { withAuthParams } from "@/lib/api-handler";
import { NextResponse } from "next/server";

export const DELETE = withAuthParams(async (_req, _session, { id }) => {
  const res = await fetch(apiUrl(`/generate/${id}`), { method: "DELETE" });
  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
});
