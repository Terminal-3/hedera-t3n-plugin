export type GuidedActionEvent = {
  action: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  humanMessage: string;
  timestamp: string;
};
