/** @jsxImportSource react */

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

import type { NoteAttachment } from "./notes-types";

export type QuickJotContextValue = {
  open: boolean;
  attachment: NoteAttachment | undefined;
  openQuickJot: (attachment?: NoteAttachment) => void;
  closeQuickJot: () => void;
};

const QuickJotContext = createContext<QuickJotContextValue | undefined>(undefined);

export function QuickJotProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [attachment, setAttachment] = useState<NoteAttachment | undefined>(undefined);

  const openQuickJot = useCallback((nextAttachment?: NoteAttachment) => {
    setAttachment(nextAttachment);
    setOpen(true);
  }, []);

  const closeQuickJot = useCallback(() => {
    setOpen(false);
  }, []);

  const value = useMemo<QuickJotContextValue>(
    () => ({
      open,
      attachment,
      openQuickJot,
      closeQuickJot,
    }),
    [open, attachment, openQuickJot, closeQuickJot],
  );

  return (
    <QuickJotContext.Provider value={value}>
      {children}
    </QuickJotContext.Provider>
  );
}

export function useQuickJotContext(): QuickJotContextValue {
  const ctx = use(QuickJotContext);
  if (!ctx) {
    throw new Error("useQuickJotContext must be used within QuickJotProvider");
  }
  return ctx;
}
