/** @jsxImportSource react */
import * as React from "react";

import { cn } from "../lib/utils";

function ContextMenuContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-content"
      data-open=""
      data-side="bottom"
      className={cn(
        "dark z-50 max-h-(--available-height) min-w-48 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-sm outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 animate-none! **:data-[slot$=-item]:focus:bg-foreground/[0.08] **:data-[slot$=-item]:data-highlighted:bg-foreground/[0.08] **:data-[slot$=-separator]:bg-border/60 **:data-[slot$=-trigger]:focus:bg-foreground/[0.08] **:data-[slot$=-trigger]:aria-expanded:bg-foreground/[0.08]! **:data-[variant=destructive]:focus:bg-destructive/10! **:data-[variant=destructive]:text-destructive!",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuItem({
  className,
  disabled,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<"button"> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      data-slot="context-menu-item"
      data-inset={inset ? "" : undefined}
      data-variant={variant}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      className={cn(
        "group/context-menu-item relative flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium outline-none select-none hover:bg-foreground/[0.08] focus:bg-foreground/10 active:bg-foreground/10 data-inset:ps-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-separator"
      role="separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border/50", className)}
      {...props}
    />
  );
}

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "ms-auto text-xs text-muted-foreground group-focus/context-menu-item:text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut };
