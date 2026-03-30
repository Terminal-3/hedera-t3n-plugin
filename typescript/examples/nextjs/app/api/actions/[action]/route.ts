import { NextResponse } from "next/server";

import { parseGuidedActionBody } from "@/lib/guided-actions";
import { executeGuidedAction } from "@/lib/server/guided-actions-server";
import { redactError } from "@/lib/redaction";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> }
) {
  const { action } = await context.params;

  try {
    const body = parseGuidedActionBody(await request.json().catch(() => ({})));
    const result = await executeGuidedAction({
      action,
      chatId: body.chatId,
      input: body.input,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        action,
        error: redactError(error),
      },
      { status: 400 }
    );
  }
}
