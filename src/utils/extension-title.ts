import {
  DEFAULT_EXTENSION_TITLE_MAX_LENGTH,
  MAX_EXTENSION_TITLE_MAX_LENGTH,
  MIN_EXTENSION_TITLE_MAX_LENGTH,
} from '../db/types.ts';

export function normalizeExtensionTitleMaxLength(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error('Extension title length must be a whole number');
  }
  if (parsed < MIN_EXTENSION_TITLE_MAX_LENGTH || parsed > MAX_EXTENSION_TITLE_MAX_LENGTH) {
    throw new Error(
      `Extension title length must be between ${String(MIN_EXTENSION_TITLE_MAX_LENGTH)} and ${String(MAX_EXTENSION_TITLE_MAX_LENGTH)}`,
    );
  }
  return parsed;
}

export function parseExtensionTitleMaxLength(value: string | undefined): number {
  if (value === undefined) return DEFAULT_EXTENSION_TITLE_MAX_LENGTH;
  return normalizeExtensionTitleMaxLength(Number(value));
}

export function truncateExtensionTitle(title: string, maxLength: number): string {
  const chars = Array.from(title);
  if (chars.length <= maxLength) return title;
  return `${chars.slice(0, maxLength - 3).join('')}...`;
}
