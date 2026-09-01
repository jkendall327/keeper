import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { getTestDB, renderApp } from './app-test-utils.tsx';

const markdownTracker = vi.hoisted(() => ({ renderCount: 0 }));

vi.mock('../components/MarkdownPreview.tsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/MarkdownPreview.tsx')>();
  return {
    MarkdownPreview: (props: React.ComponentProps<typeof actual.MarkdownPreview>) => {
      markdownTracker.renderCount += 1;
      return <actual.MarkdownPreview {...props} />;
    },
  };
});

describe('note modal rendering', () => {
  it('opens a note without rendering the note grid again', async () => {
    const user = userEvent.setup();
    await getTestDB().createNote({ body: 'Open without grid work' });
    await renderApp();
    const initialRenderCount = markdownTracker.renderCount;

    await user.click(await screen.findByText('Open without grid work'));

    expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeInTheDocument();
    expect(markdownTracker.renderCount).toBe(initialRenderCount);
  });
});
