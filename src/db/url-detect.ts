'use no memo';

const URL_RE = /https?:\/\/\S+/;

export function containsUrl(text: string | null): boolean {
  if (text === null || text === '') return false;
  return URL_RE.test(text);
}

export function extractUrls(text: string | null): string[] {
  if (text === null || text === '') return [];
  return text.match(/https?:\/\/\S+/g) ?? [];
}
