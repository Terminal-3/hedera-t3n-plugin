import { NextResponse } from "next/server";

import { refreshBootstrapState } from "@/lib/bootstrap";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { attemptUpload?: boolean };
  const state = await refreshBootstrapState({ attemptUpload: body.attemptUpload === true });

  return NextResponse.json(state);
}
