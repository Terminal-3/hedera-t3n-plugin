import {
  convertToModelMessages,
  validateUIMessages,
  type ToolSet,
  type UIMessage,
} from "ai";

export async function toValidatedModelMessages(
  messages: UIMessage[],
  tools: ToolSet
) {
  const validated = await validateUIMessages({
    messages,
    tools: tools as Parameters<typeof validateUIMessages>[0]["tools"],
  });
  const modelMessages = await convertToModelMessages(validated, { tools });

  return {
    validated,
    modelMessages,
  };
}
