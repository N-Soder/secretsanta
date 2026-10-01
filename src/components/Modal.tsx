import { useEffect, useRef, type ReactNode } from 'react';

// Native modal dialogs trap focus, make the background inert and support Escape.
export function Modal({ labelledBy, onClose, children, busy = false, returnFocus }: { returnFocus?: HTMLElement | null; labelledBy: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = returnFocus ?? document.activeElement;
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={labelledBy} aria-busy={busy} className="dialog m-auto max-h-[90dvh] max-w-[calc(100%-2rem)] sm:max-w-xl backdrop:bg-pine-dark/50 backdrop:backdrop-blur-sm" onCancel={event => { event.preventDefault(); if (!busy) close.current(); }}>
    {children}
  </dialog>;
}
