export interface CardVisibility {
  visible: boolean;
  height: number;
}

interface Registration {
  notify: (visibility: CardVisibility) => void;
  width: number | null;
}

// Share observers across cards: scrolling processes only entries whose proximity
// changes, rather than scanning the entire collection for every scroll event.
const registrations = new Map<HTMLElement, Registration>();
let intersections: IntersectionObserver | null = null;
let sizes: ResizeObserver | null = null;
let pendingFrame: number | null = null;
const pendingMeasurements = new Set<HTMLElement>();

function remeasure(element: HTMLElement, registration: Registration) {
  intersections?.unobserve(element);
  registration.notify({ visible: true, height: 0 });
  pendingMeasurements.add(element);
  if (pendingFrame !== null) return;
  // Re-observe after React has restored the content, so the next intersection
  // entry carries its real size instead of the previous placeholder's size.
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    for (const target of pendingMeasurements) {
      if (registrations.has(target)) intersections?.observe(target);
    }
    pendingMeasurements.clear();
  });
}

function fontsChanged() {
  for (const [element, registration] of registrations) remeasure(element, registration);
}

export function observeNoteCard(element: HTMLElement, notify: Registration['notify']): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') return () => { /* Render normally without observers. */ };
  const fonts = (document as Partial<Document>).fonts;
  if (intersections === null) {
    intersections = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const registration = registrations.get(entry.target as HTMLElement);
        if (registration === undefined || pendingMeasurements.has(entry.target as HTMLElement)) continue;
        const height = entry.boundingClientRect.height;
        registration.notify({ visible: entry.isIntersecting || height <= 0, height });
      }
    }, { rootMargin: '1200px 0px' });
    sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const registration = registrations.get(element);
        if (registration === undefined) continue;
        const width = entry.contentRect.width;
        if (registration.width !== null && Math.abs(registration.width - width) > 0.5) {
          remeasure(element, registration);
        }
        registration.width = width;
      }
    });
    fonts?.addEventListener('loadingdone', fontsChanged);
  }
  registrations.set(element, { notify, width: null });
  intersections.observe(element);
  sizes?.observe(element);
  return () => {
    intersections?.unobserve(element);
    sizes?.unobserve(element);
    registrations.delete(element);
    pendingMeasurements.delete(element);
    if (registrations.size === 0) {
      intersections?.disconnect();
      sizes?.disconnect();
      intersections = null;
      sizes = null;
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
      fonts?.removeEventListener('loadingdone', fontsChanged);
    }
  };
}
