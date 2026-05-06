import { useEffect, useRef } from 'react';

export function useNoteModalHistoryClose(onClose: () => void | Promise<void>) {
  const onCloseRef = useRef(onClose);
  const ignoreNextPopState = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    history.pushState({ noteModal: true }, '');

    const handlePopState = () => {
      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false;
        return;
      }
      void onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (history.state != null && (history.state as { noteModal?: boolean }).noteModal === true) {
        ignoreNextPopState.current = true;
        history.back();
      }
    };
  }, []);
}
