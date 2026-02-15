'use no memo';

const URL_RE = /https?:\/\/\S+/;

/** Strip trailing punctuation that's likely not part of the URL */
function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)>\]'"]+$/, '');
}

export function containsUrl(text: string | null): boolean {
  if (text === null || text === '') return false;
  return URL_RE.test(text);
}

export function extractUrls(text: string | null): string[] {
  if (text === null || text === '') return [];
  const raw = text.match(/https?:\/\/\S+/g) ?? [];
  return raw.map(cleanUrl);
}
