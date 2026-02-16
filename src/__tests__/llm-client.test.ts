import { describe, it, expect, afterEach } from 'vitest';
import { getApiKey, setApiKey, clearApiKey, isLLMConfigured, getLLMClient } from '../llm/client.ts';

describe('LLM client', () => {
  afterEach(() => {
    localStorage.removeItem('keeper-openrouter-key');
  });

  it('setApiKey stores and getApiKey retrieves the key', () => {
    setApiKey('sk-or-test-123');
    const key = getApiKey();
    expect(key).toBe('sk-or-test-123');
  });

  it('isLLMConfigured returns true after key is set', () => {
    setApiKey('sk-or-test-123');
    const result = isLLMConfigured();
    expect(result).toBe(true);
  });

  it('clearApiKey removes the stored key', () => {
    setApiKey('sk-or-test-123');
    const keyBefore = getApiKey();
    expect(keyBefore).toBe('sk-or-test-123');
    clearApiKey();
    const keyAfter = getApiKey();
    expect(keyAfter).toBeNull();
    expect(isLLMConfigured()).toBe(false);
  });

  it('getLLMClient returns null without key and a client with key', () => {
    const configuredBefore = isLLMConfigured();
    expect(configuredBefore).toBe(false);
    const clientBefore = getLLMClient();
    expect(clientBefore).toBe(null);
    setApiKey('sk-or-test-123');
    const configuredAfter = isLLMConfigured();
    expect(configuredAfter).toBe(true);
    const clientAfter = getLLMClient();
    if (clientAfter === null) throw new Error('Expected client to be non-null');
    const model = clientAfter.getModel();
    expect(model).toBe('google/gemini-3-flash-preview');
  });

  it('returns a client with working setModel and getModel', () => {
    setApiKey('sk-or-test-123');
    const client = getLLMClient();
    if (client === null) throw new Error('Expected client to be non-null');
    const defaultModel = client.getModel();
    expect(defaultModel).toBe('google/gemini-3-flash-preview');
    client.setModel('openai/gpt-4o');
    const updatedModel = client.getModel();
    expect(updatedModel).toBe('openai/gpt-4o');
  });

  it('isLLMConfigured returns false for whitespace-only key', () => {
    setApiKey('sk-or-real');
    expect(isLLMConfigured()).toBe(true);
    setApiKey('   ');
    const result = isLLMConfigured();
    expect(result).toBe(false);
  });

  it('getLLMClient returns null for whitespace-only key', () => {
    setApiKey('sk-or-real');
    const proofClient = getLLMClient();
    if (proofClient === null) throw new Error('Expected client for real key');
    const proofModel = proofClient.getModel();
    expect(proofModel).toBe('google/gemini-3-flash-preview');
    setApiKey('   ');
    const configuredAfterWhitespace = isLLMConfigured();
    expect(configuredAfterWhitespace).toBe(false);
    const client = getLLMClient();
    expect(client).toBe(null);
  });
});
