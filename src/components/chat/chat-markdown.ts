import { markdown } from '@motioneffector/markdown';
import { escapeHtml } from '../../utils/html.ts';

export function renderMarkdownSafe(input: string): string {
  try {
    // @motioneffector/markdown sanitizes HTML by default (sanitize: true)
    let html = markdown(input);
    // Ensure all links open in a new tab
    html = html.replaceAll('<a href=', '<a target="_blank" rel="noopener noreferrer" href=');
    return html;
  } catch {
    return escapeHtml(input);
  }
}
