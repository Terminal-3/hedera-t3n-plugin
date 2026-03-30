import { NextResponse } from "next/server";

import { getBootstrapState } from "@/lib/bootstrap";

export const runtime = "nodejs";

export async function GET() {
  const state = await getBootstrapState();
  return NextResponse.json(state);
}
