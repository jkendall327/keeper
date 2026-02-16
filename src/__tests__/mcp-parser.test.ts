import { describe, it, expect } from 'vitest';
import { parseMCPResponse } from '../llm/mcp-parser.ts';

describe('MCP parser', () => {
  it('extracts a single tool call', () => {
    const response = `Let me search for that.

\`\`\`tool_call
{"name": "search_notes", "args": {"query": "shopping"}}
\`\`\``;
    const result = parseMCPResponse(response);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe('search_notes');
    const args = result.toolCalls[0]?.args as Record<string, string>;
    expect(args['query']).toBe('shopping');
    expect(result.text).toBe('Let me search for that.');
  });

  it('extracts multiple tool calls', () => {
    const response = `I'll do both.

\`\`\`tool_call
{"name": "list_notes", "args": {}}
\`\`\`

And also:

\`\`\`tool_call
{"name": "list_tags", "args": {}}
\`\`\``;
    const result = parseMCPResponse(response);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]?.name).toBe('list_notes');
    expect(result.toolCalls[1]?.name).toBe('list_tags');
    expect(result.text).toContain("I'll do both.");
    expect(result.text).toContain('And also:');
  });

  it('returns empty array and full text when no tool calls', () => {
    // Prove the parser can extract tool calls from valid input
    const withTool = parseMCPResponse('```tool_call\n{"name": "list_notes", "args": {}}\n```');
    expect(withTool.toolCalls[0]?.name).toBe('list_notes');

    // Now verify plain text produces no tool calls
    const response = 'Here is your answer with no tools needed.';
    const result = parseMCPResponse(response);
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBe('Here is your answer with no tools needed.');
  });

  it('handles malformed JSON gracefully', () => {
    // Prove valid JSON in tool_call blocks gets extracted
    const valid = parseMCPResponse('```tool_call\n{"name": "get_note", "args": {"id": "1"}}\n```');
    expect(valid.toolCalls[0]?.name).toBe('get_note');

    // Malformed JSON should be skipped, not crash
    const response = `Trying something.

\`\`\`tool_call
{not valid json}
\`\`\`

After the bad block.`;
    const result = parseMCPResponse(response);
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toContain('Trying something.');
    expect(result.text).toContain('After the bad block.');
  });

  it('provides empty args when args key is missing', () => {
    const response = `\`\`\`tool_call
{"name": "list_notes"}
\`\`\``;
    const result = parseMCPResponse(response);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe('list_notes');
    expect(result.toolCalls[0]?.args).toEqual({});
  });

  it('skips blocks without a name field', () => {
    // Prove valid blocks with name field are extracted
    const valid = parseMCPResponse('```tool_call\n{"name": "list_tags", "args": {}}\n```');
    expect(valid.toolCalls[0]?.name).toBe('list_tags');

    // Block missing the name field should be skipped
    const response = `\`\`\`tool_call
{"args": {"query": "test"}}
\`\`\``;
    const result = parseMCPResponse(response);
    expect(result.toolCalls).toEqual([]);
  });
});
