/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import type {
  MatterhornProjectFeedbackKind,
  MatterhornProjectFeedbackRequest,
  MatterhornProjectFeedbackTarget,
} from "@matterhorn-work/types/project-data-ledger";

import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ProjectFeedbackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matterhornServerClient?: MatterhornServerClient | null;
  runtimeWorkspaceId?: string | null;
  entrypoint: string;
  target?: MatterhornProjectFeedbackTarget;
  onSubmitted?: () => void;
  onError?: (message: string) => void;
};

type FeedbackKindOption = {
  kind: MatterhornProjectFeedbackKind;
  label: string;
  helper: string;
  requiresComment?: boolean;
};

const FEEDBACK_KIND_OPTIONS: FeedbackKindOption[] = [
  { kind: "thumbs_up", label: "Worked well", helper: "This helped." },
  { kind: "thumbs_down", label: "Felt rough", helper: "This needs work." },
  { kind: "bug", label: "Bug", helper: "Something broke.", requiresComment: true },
  { kind: "feature_request", label: "Request", helper: "Something is missing.", requiresComment: true },
  { kind: "comment", label: "Comment", helper: "General note.", requiresComment: true },
  { kind: "rating", label: "Rating", helper: "Score this flow." },
];

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

function feedbackRequiresComment(kind: MatterhornProjectFeedbackKind) {
  return FEEDBACK_KIND_OPTIONS.some((option) => option.kind === kind && option.requiresComment);
}

function feedbackErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not send feedback.";
}

export function ProjectFeedbackDialog(props: ProjectFeedbackDialogProps) {
  const [kind, setKind] = useState<MatterhornProjectFeedbackKind>("comment");
  const [rating, setRating] = useState<number>(4);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
  }, [props.open]);

  const workspaceId = props.runtimeWorkspaceId?.trim() ?? "";
  const canSubmit = Boolean(props.matterhornServerClient && workspaceId);
  const trimmedComment = comment.trim();
  const commentRequired = feedbackRequiresComment(kind);
  const submitDisabled = submitting || !canSubmit || (commentRequired && !trimmedComment);

  const contextLabel = useMemo(() => {
    const source = props.target?.sourceType;
    if (source === "chat") return "chat";
    if (source === "task") return "task";
    if (source === "output") return "output";
    if (source === "memory") return "memory";
    if (source === "note") return "note";
    if (source === "settings") return "settings";
    if (source === "wallet") return "wallet";
    return props.entrypoint || "workspace";
  }, [props.entrypoint, props.target?.sourceType]);

  const submit = async () => {
    const client = props.matterhornServerClient;
    if (!client || !workspaceId) {
      setError("Open a connected workspace before sending feedback.");
      return;
    }
    const payload: MatterhornProjectFeedbackRequest = {
      kind,
      target: props.target,
      ...(kind === "rating" ? { rating } : {}),
      ...(trimmedComment ? { comment: trimmedComment } : {}),
    };
    setSubmitting(true);
    setError(null);
    try {
      await client.submitProjectFeedback(workspaceId, payload);
      props.onSubmitted?.();
      props.onOpenChange(false);
      setKind("comment");
      setRating(4);
      setComment("");
    } catch (nextError) {
      const message = feedbackErrorMessage(nextError);
      setError(message);
      props.onError?.(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-full max-w-lg gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Feedback is stored locally for product quality and routing. It is not used for training by default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FEEDBACK_KIND_OPTIONS.map((option) => (
              <button
                key={option.kind}
                type="button"
                className={cn(
                  "rounded-lg border border-dls-border bg-background px-3 py-2 text-left transition-colors hover:bg-dls-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                  kind === option.kind && "border-dls-text bg-dls-surface",
                )}
                onClick={() => setKind(option.kind)}
                aria-pressed={kind === option.kind}
              >
                <span className="block text-xs font-medium text-dls-text">{option.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-dls-secondary">{option.helper}</span>
              </button>
            ))}
          </div>

          {kind === "rating" ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-dls-secondary">Rating</span>
              <div className="flex gap-1">
                {RATING_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border border-dls-border text-xs text-dls-secondary transition-colors hover:bg-dls-hover hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                      rating === value && "border-dls-text bg-dls-surface text-dls-text",
                    )}
                    onClick={() => setRating(value)}
                    aria-pressed={rating === value}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="block">
            <span className="text-xs font-medium text-dls-text">
              Comment{commentRequired ? "" : " optional"}
            </span>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.currentTarget.value)}
              className="mt-2 min-h-28 text-sm"
              maxLength={5000}
              placeholder={`What should we know about this ${contextLabel}?`}
            />
          </label>

          {!canSubmit ? (
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
              Connect the Matterhorn Desks engine and open a workspace to save feedback locally.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={submitting} />}>
            Cancel
          </DialogClose>
          <Button onClick={() => void submit()} disabled={submitDisabled}>
            {submitting ? "Sending..." : "Send feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
