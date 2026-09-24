import { useLayoutEffect, useRef, useState } from 'react';
import { observeNoteCard, type CardVisibility } from '../components/note-card-visibility.ts';
import type { NoteWithTags, Reminder } from '../db/types.ts';

interface CardLayout {
  note: NoteWithTags;
  reminder: Reminder | null;
  showLinkPreviews: boolean;
  isMobile: boolean;
  searchQuery: string;
  substringSearch: boolean;
}

export function useNoteCardVisibility(layout: CardLayout, keepVisible: boolean) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState<(CardVisibility & CardLayout) | null>(null);
  const { note, reminder, showLinkPreviews, isMobile, searchQuery, substringSearch } = layout;
  const measuredCurrentContent = measurement !== null && measurement.note === note &&
    measurement.reminder === reminder && measurement.showLinkPreviews === showLinkPreviews &&
    measurement.isMobile === isMobile && measurement.searchQuery === searchQuery &&
    measurement.substringSearch === substringSearch;
  const visible = keepVisible || !measuredCurrentContent || measurement.visible;

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (card === null) return;
    return observeNoteCard(card, (visibility) => {
      setMeasurement({ ...visibility, note, reminder, showLinkPreviews, isMobile, searchQuery, substringSearch });
    });
  }, [note, reminder, showLinkPreviews, isMobile, searchQuery, substringSearch]);

  return { cardRef, visible, height: measurement?.height };
}
