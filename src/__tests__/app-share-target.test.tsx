import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { getTestDB, renderApp } from './app-test-utils';

describe('App web share target', () => {
  it('creates a note from the share target URL and returns to the inbox', async () => {
    await renderApp('/share?title=Shared%20title&text=Read%20this&url=https%3A%2F%2Fexample.com%2Fpost');

    await waitFor(async () => {
      await expect(getTestDB().getAllNotes()).resolves.toMatchObject([
        {
          body: 'Shared title\nRead this\nhttps://example.com/post',
        },
      ]);
    });

    expect(window.location.pathname).toBe('/inbox');
    expect(await screen.findByText('https://example.com/post')).toBeInTheDocument();
  });
});
