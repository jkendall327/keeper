import { Suspense, startTransition, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchBar } from '../SearchBar.tsx';

// Hold the result render open, as happens during a slow route transition.
// The input must commit even though the rest of that transition cannot.
function setupSearch() {
  let ready = false;
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  function Results({ query }: { query: string }) {
    // Suspense deliberately uses a promise to pause a render.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (query !== '' && !ready) throw pending;
    return <p>Results: {query === '' ? 'all' : query}</p>;
  }
  function Harness() {
    const [query, setQuery] = useState('');
    return (
      <>
        <SearchBar value={query} onChange={(next) => {
          setQuery(next);
          return Promise.resolve();
        }} />
        <button onClick={() => { startTransition(() => { setQuery('external'); }); }}>Navigate</button>
        <Suspense fallback="Loading"><Results query={query} /></Suspense>
      </>
    );
  }
  render(<Harness />);
  return {
    input: screen.getByRole('textbox', { name: 'Search notes' }),
    finish: async () => {
      await act(async () => { ready = true; finish(); await pending; });
    },
  };
}

describe('SearchBar responsiveness', () => {
  it('echoes every edit before results render and keeps the latest query', async () => {
    const { input, finish } = setupSearch();
    for (const value of ['h', 'ho', 'horse', 'hors', 'horses']) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
      expect(screen.getByText('Results: all')).toBeInTheDocument();
    }
    await finish();
    expect(input).toHaveValue('horses');
    expect(screen.getByText('Results: horses')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Navigate'));
    expect(input).toHaveValue('external');
  });

  it.each(['Escape', 'button'])('clears pending typing with %s without restoring an old query', async (method) => {
    const { input, finish } = setupSearch();
    fireEvent.change(input, { target: { value: 'horse' } });
    expect(input).toHaveValue('horse');
    if (method === 'Escape') fireEvent.keyDown(input, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    await finish();
    expect(input).toHaveValue('');
    expect(screen.getByText('Results: all')).toBeInTheDocument();
  });
});
