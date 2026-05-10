const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const FENCE_RE = /^\s*(```|~~~)/;

export function normalizeAssistantReply(input: string): string {
  const lines = input.replace(/\r\n?/g, '\n').trim().split('\n');
  const result: string[] = [];
  let inFence = false;
  let pendingBlank = false;

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      if (pendingBlank && shouldKeepBlank(result, line, inFence)) result.push('');
      pendingBlank = false;
      result.push(line);
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      result.push(line);
      continue;
    }

    if (line.trim() === '') {
      pendingBlank = true;
      continue;
    }

    if (pendingBlank && shouldKeepBlank(result, line, inFence)) {
      result.push('');
    }
    pendingBlank = false;
    result.push(line);
  }

  return result.join('\n');
}

function shouldKeepBlank(previousLines: string[], nextLine: string, inFence: boolean): boolean {
  if (inFence || previousLines.length === 0) return false;
  const previousLine = previousLines[previousLines.length - 1];
  if (previousLine === undefined) return false;
  if (FENCE_RE.test(nextLine)) return true;
  return !LIST_ITEM_RE.test(previousLine) && !LIST_ITEM_RE.test(nextLine);
}
