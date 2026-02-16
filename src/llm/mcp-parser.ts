'use no memo';

import type { ToolCall } from './tools.ts';

/**
 * Parse MCP-formatted tool call blocks from a response string.
 *
 * Expected format in the response text:
 *
 * ```tool_call
 * {"name": "tool_name", "args": {"key": "value"}}
 * ```
 *
 * Returns the extracted tool calls and the remaining text
 * (everything not inside a tool_call block).
 */
export interface ParseResult {
  toolCalls: ToolCall[];
  text: string;
}

const TOOL_CALL_REGEX = /```tool_call\s*\n([\s\S]*?)```/g;

function tryParseToolCall(jsonStr: string): ToolCall | null {
  try {
    const parsed: unknown = JSON.parse(jsonStr.trim());
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'name' in parsed &&
      typeof (parsed as Record<string, unknown>)['name'] === 'string'
    ) {
      const obj = parsed as Record<string, unknown>;
      const args = typeof obj['args'] === 'object' && obj['args'] !== null
        ? obj['args'] as Record<string, unknown>
        : {};
      return { name: obj['name'] as string, args };
    }
    return null;
  } catch (err: unknown) {
    console.warn('Failed to parse tool call JSON:', err);
    return null;
  }
}

export function parseMCPResponse(response: string): ParseResult {
  const toolCalls: ToolCall[] = [];
  let text = response;

  const matches = response.matchAll(TOOL_CALL_REGEX);
  for (const match of matches) {
    const jsonStr = match[1];
    if (jsonStr === undefined) continue;
    const toolCall = tryParseToolCall(jsonStr);
    if (toolCall !== null) {
      toolCalls.push(toolCall);
    }
    // Remove the matched block from the text
    text = text.replace(match[0], '');
  }

  return { toolCalls, text: text.trim() };
}
