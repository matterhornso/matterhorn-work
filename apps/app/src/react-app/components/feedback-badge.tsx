/** @jsxImportSource react */
import { MessageCircleMore } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildFeedbackUrl } from "@/app/lib/feedback";

export function FeedbackBadge({ context }: { context: string }) {
  const url = buildFeedbackUrl({ entrypoint: context });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-dls-secondary hover:text-dls-text h-7 px-2 text-xs"
            onClick={() => {
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            <MessageCircleMore className="size-3.5" />
            Feedback
          </Button>
        }
      />
      <TooltipContent side="bottom">
        <p className="text-xs">Report a bug or suggest a feature for {context}</p>
      </TooltipContent>
    </Tooltip>
  );
}
