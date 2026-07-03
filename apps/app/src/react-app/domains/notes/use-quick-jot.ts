/** @jsxImportSource react */

import { useQuickJotContext } from "./quick-jot-provider";
import type { NoteAttachment } from "./notes-types";

export function useQuickJot() {
  const ctx = useQuickJotContext();
  return {
    isOpen: ctx.open,
    attachment: ctx.attachment,
    openQuickJot: (attachment?: NoteAttachment) => ctx.openQuickJot(attachment),
    closeQuickJot: ctx.closeQuickJot,
  };
}
