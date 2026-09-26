import React, { useEffect, useRef } from 'react';

interface DialogProps {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Dialog({ label, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 w-full h-full max-w-none max-h-none p-0 bg-void text-paper open:flex flex-col safe-t safe-x"
    >
      {children}
    </dialog>
  );
}
