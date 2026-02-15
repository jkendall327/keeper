'use no memo';

import { createLLMClient, type LLMClient } from '@motioneffector/llm';

const STORAGE_KEY = 'keeper-openrouter-key';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (err: unknown) {
    console.warn('Failed to read API key from localStorage:', err);
    return null;
  }
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isLLMConfigured(): boolean {
  const key = getApiKey();
  return key !== null && key.trim() !== '';
}

export function getLLMClient(): LLMClient | null {
  const key = getApiKey();
  if (key === null || key.trim() === '') return null;
  return createLLMClient({
    apiKey: key,
    model: 'anthropic/claude-sonnet-4',
    baseUrl: 'https://openrouter.ai/api/v1',
  });
}
