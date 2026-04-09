export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image"; data: string; mimeType: string };
export type ToolResult = {
  content: Array<TextContent | ImageContent>;
  details: Record<string, unknown>;
};

export function abortedResult(): ToolResult {
  return { content: [{ type: "text", text: "Aborted" }], details: { status: "aborted" } };
}
