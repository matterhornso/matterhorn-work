/** @jsxImportSource react */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  message: string | ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  variant?: "danger" | "warning";
  confirmButtonVariant?: "secondary" | "ghost" | "outline" | "destructive";
  cancelButtonVariant?: "secondary" | "ghost" | "outline" | "destructive";
  confirmationPhrase?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal(props: ConfirmModalProps) {
  const [confirmation, setConfirmation] = useState("");
  const variant = props.variant ?? "warning";
  const confirmVariant = props.confirmButtonVariant ?? (variant === "danger" ? "destructive" : undefined);
  const cancelVariant = props.cancelButtonVariant ?? "outline";
  const confirmationMatches = !props.confirmationPhrase || confirmation === props.confirmationPhrase;

  useEffect(() => {
    if (props.open) setConfirmation("");
  }, [props.open]);

  let iconTileClass = "bg-amber-3/50 text-amber-11";
  if (variant === "danger") iconTileClass = "bg-red-3/50 text-red-11";

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className={iconTileClass}>
            <AlertTriangle />
          </AlertDialogMedia>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.message}</AlertDialogDescription>
          {props.confirmationPhrase ? (
            <label className="grid gap-2 text-sm text-dls-secondary">
              Type <span className="font-semibold text-dls-text">{props.confirmationPhrase}</span> to continue.
              <Input
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                aria-label={`Type ${props.confirmationPhrase} to confirm`}
              />
            </label>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant={cancelVariant}>
            {props.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            disabled={!confirmationMatches}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
