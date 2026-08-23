const URL_RE = /https?:\/\/\S+/;

/** Strip trailing punctuation that's likely not part of the URL */
function cleanUrl(url: string): string {
  let cleaned = url.replace(/[.,;:!?>\]'"]+$/, "");
  const openParentheses = (cleaned.match(/\(/g) ?? []).length;
  let closeParentheses = (cleaned.match(/\)/g) ?? []).length;

  while (cleaned.endsWith(")") && closeParentheses > openParentheses) {
    cleaned = cleaned.slice(0, -1);
    closeParentheses--;
  }

  return cleaned;
}

export function containsUrl(text: string | null): boolean {
  if (text === null || text === "") return false;
  return URL_RE.test(text);
}

export function extractUrls(text: string | null): string[] {
  if (text === null || text === "") return [];
  const raw = text.match(/https?:\/\/\S+/g) ?? [];
  return raw.map(cleanUrl);
}

/** Return the URL when the whole note is exactly one URL, otherwise null. */
export function extractSingleUrl(text: string | null): string | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed === "" || /\s/.test(trimmed)) return null;
  const urls = extractUrls(trimmed);
  if (urls.length !== 1) return null;
  return urls[0] === trimmed ? urls[0] : null;
}
