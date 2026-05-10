export interface ModelOption {
  id: string;
  name: string;
}

interface FetchModelsResult {
  models: ModelOption[];
  error: string | null;
}

let cachedModels: ModelOption[] | null = null;

export async function fetchModels(apiKey: string): Promise<FetchModelsResult> {
  if (cachedModels !== null) return { models: cachedModels, error: null };
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { models: [], error: `API returned ${String(res.status)}` };
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null || !('data' in data)) {
      return { models: [], error: 'Unexpected API response format' };
    }
    const models = (data as Record<string, unknown>)['data'];
    if (!Array.isArray(models)) return { models: [], error: 'Unexpected API response format' };
    const filtered: ModelOption[] = [];
    for (const m of models) {
      if (typeof m !== 'object' || m === null) continue;
      const obj = m as Record<string, unknown>;
      if (typeof obj['id'] !== 'string') continue;
      const arch = obj['architecture'];
      if (typeof arch === 'object' && arch !== null) {
        const a = arch as Record<string, unknown>;
        const inputMods = Array.isArray(a['input_modalities']) ? a['input_modalities'] : [];
        const outputMods = Array.isArray(a['output_modalities']) ? a['output_modalities'] : [];
        if (!inputMods.includes('text') || !outputMods.includes('text')) continue;
      }
      const name = typeof obj['name'] === 'string' ? obj['name'] : obj['id'];
      filtered.push({ id: obj['id'], name });
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    cachedModels = filtered;
    return { models: filtered, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { models: [], error: `Failed to fetch models: ${msg}` };
  }
}
