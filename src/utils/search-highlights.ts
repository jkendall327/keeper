import { createElement } from 'react';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function createMatcher(query: string, substring: boolean) {
  const needle = query.trim().toLocaleLowerCase();
  const terms = Array.from(query.matchAll(/[\p{L}\p{N}\p{Co}]+/gu), (match) => normalize(match[0]));
  return (text: string) => matchRanges(text, needle, terms, substring);
}

function matchRanges(text: string, needle: string, terms: string[], substring: boolean) {
  if (substring) {
    if (needle === '') return [];
    const haystack = text.toLocaleLowerCase();
    if (!haystack.includes(needle)) return [];
    // Most text lowercases without changing its UTF-16 length. In that case
    // matches already use source offsets, so avoid a per-character offset map.
    if (haystack.length === text.length) {
      const ranges: { start: number; end: number }[] = [];
      for (let start = haystack.indexOf(needle); start !== -1; start = haystack.indexOf(needle, start + needle.length)) {
        ranges.push({ start, end: start + needle.length });
      }
      return ranges;
    }
    // Lowercasing can expand a character (for example İ). Keep offsets in
    // the original text so highlighted spans cannot shift or drop characters.
    const offsets: { start: number; end: number }[] = [];
    let originalIndex = 0;
    for (const character of text) {
      offsets.push(...Array.from(
        { length: character.toLocaleLowerCase().length },
        () => ({ start: originalIndex, end: originalIndex + character.length }),
      ));
      originalIndex += character.length;
    }
    const ranges: { start: number; end: number }[] = [];
    for (let start = haystack.indexOf(needle); start !== -1; start = haystack.indexOf(needle, start + needle.length)) {
      const first = offsets[start];
      const last = offsets[start + needle.length - 1];
      if (first !== undefined && last !== undefined) ranges.push({ start: first.start, end: last.end });
    }
    return ranges;
  }
  if (terms.length === 0) return [];
  return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}\p{Co}]+/gu)).flatMap((match) => {
    const token = normalize(match[0]);
    const matches = terms.some((term, index) =>
      index === terms.length - 1 ? token.startsWith(term) : token === term,
    );
    return matches ? [{ start: match.index, end: match.index + match[0].length }] : [];
  });
}

function textParts(text: string, match: ReturnType<typeof createMatcher>) {
  const parts: { text: string; highlighted: boolean }[] = [];
  let end = 0;
  for (const range of match(text)) {
    parts.push({ text: text.slice(end, range.start), highlighted: false });
    parts.push({ text: text.slice(range.start, range.end), highlighted: true });
    end = range.end;
  }
  parts.push({ text: text.slice(end), highlighted: false });
  return parts;
}

export function highlightText(text: string, query: string, substring = false) {
  if (query.trim() === '') return text;
  return textParts(text, createMatcher(query, substring)).map((part, index) => part.highlighted
    ? createElement('mark', { key: index }, part.text)
    : part.text);
}

// Work only on rendered text: never interpolate the search into HTML, URLs,
// attributes, or Markdown source.
export function highlightHtml(html: string, query: string, substring = false): string {
  if (query.trim() === '') return html;
  const match = createMatcher(query, substring);
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode() !== null) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('script, style, mark') != null) continue;
    const parts = textParts(node.data, match);
    if (!parts.some((part) => part.highlighted)) continue;
    node.replaceWith(...parts.map((part) => {
      if (!part.highlighted) return document.createTextNode(part.text);
      const mark = document.createElement('mark');
      mark.textContent = part.text;
      return mark;
    }));
  }
  return template.innerHTML;
}
