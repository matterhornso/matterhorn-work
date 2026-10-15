/** @jsxImportSource react */
import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

const SHORT_VIEWPORT_QUERY = "(max-height: 540px)";
const shortViewport = () => window.matchMedia(SHORT_VIEWPORT_QUERY).matches;
const serverViewport = () => false;
function subscribeViewport(onChange: () => void) {
  const query = window.matchMedia(SHORT_VIEWPORT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Keep compact menus out of the scrolling composer's clipping boundary. */
export function ResponsiveComposerMenu(props: {
  children: ReactNode;
  className: string;
  label: string;
  menuRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const short = useSyncExternalStore(subscribeViewport, shortViewport, serverViewport);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const boundary = props.triggerRef.current?.closest(".matterhorn-prompt-composer");
    if (!(boundary instanceof HTMLElement)) return;
    const measure = () => setNarrow(boundary.clientWidth > 0 && boundary.clientWidth <= 640);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(boundary);
    return () => observer.disconnect();
  }, [props.triggerRef]);
  const compact = short || narrow;
  if (!compact) {
    return <div ref={props.menuRef} role="dialog" aria-label={props.label} className={props.className}>{props.children}</div>;
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent
        ref={props.menuRef}
        showCloseButton={false}
        finalFocus={props.triggerRef}
        initialFocus={() => props.menuRef.current?.querySelector<HTMLButtonElement>("[data-composer-menu-body] button:not([disabled])") ?? false}
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 bg-dls-surface p-0 sm:max-w-lg"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dls-border px-3 py-1">
          <DialogTitle className="text-sm font-medium text-dls-text">{props.label}</DialogTitle>
          <DialogClose data-composer-menu-close render={<Button variant="ghost" size="icon-sm" className="size-11" />}>
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close {props.label}</span>
          </DialogClose>
        </div>
        <div data-composer-menu-body className="min-h-0 overflow-y-auto overscroll-contain [&_.matterhorn-tool-menu-frame]:h-auto [&_.matterhorn-tool-menu-list]:max-h-none">
          {props.children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
