/** @jsxImportSource react */
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

export type CommandItem = {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action: () => void;
};

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) { setQuery(""); setSelected(0); return; }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selected];
        if (cmd) { cmd.action(); onClose(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, selected]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [query, commands]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--matterhorn-layer-modal)] flex items-start justify-center bg-black/50 pt-[20vh] backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Wallet commands"
    >
      <div className="w-full max-w-md mx-4 rounded-lg border border-dls-border bg-dls-sidebar shadow-sm overflow-hidden animate-in zoom-in-95 duration-150">
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
          placeholder="Type a command..."
          className="w-full h-14 bg-transparent px-4 text-sm text-dls-text placeholder:text-dls-secondary outline-none border-b border-dls-border"
        />
        <div className="max-h-64 overflow-y-auto py-2">
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={() => { cmd.action(); onClose(); }}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors",
                i === selected ? "bg-dls-hover text-dls-text" : "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
              )}
            >
              {cmd.icon && <span className="shrink-0">{cmd.icon}</span>}
              <span className="flex-1">{cmd.label}</span>
              {cmd.shortcut && <span className="text-[10px] text-dls-secondary font-mono bg-dls-surface px-1.5 py-0.5 rounded">{cmd.shortcut}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-dls-secondary">No commands found</div>
          )}
        </div>
      </div>
    </div>
  );
}
