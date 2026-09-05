import { createElement } from 'react';

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function matchRanges(text: string, query: string) {
  const terms = Array.from(query.matchAll(/[\p{L}\p{N}\p{Co}]+/gu), (match) => normalize(match[0]));
  if (terms.length === 0) return [];
  return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}\p{Co}]+/gu)).flatMap((match) => {
    const token = normalize(match[0]);
    const matches = terms.some((term, index) =>
      index === terms.length - 1 ? token.startsWith(term) : token === term,
    );
    return matches ? [{ start: match.index, end: match.index + match[0].length }] : [];
  });
}

function textParts(text: string, query: string) {
  const parts: { text: string; highlighted: boolean }[] = [];
  let end = 0;
  for (const range of matchRanges(text, query)) {
    parts.push({ text: text.slice(end, range.start), highlighted: false });
    parts.push({ text: text.slice(range.start, range.end), highlighted: true });
    end = range.end;
  }
  parts.push({ text: text.slice(end), highlighted: false });
  return parts;
}

export function highlightText(text: string, query: string) {
  if (query.trim() === '') return text;
  return textParts(text, query).map((part, index) => part.highlighted
    ? createElement('mark', { key: index }, part.text)
    : part.text);
}

// Work only on rendered text: never interpolate the search into HTML, URLs,
// attributes, or Markdown source.
export function highlightHtml(html: string, query: string): string {
  if (query.trim() === '') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode() !== null) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('script, style, mark') != null) continue;
    const parts = textParts(node.data, query);
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
