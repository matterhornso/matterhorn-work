/** @jsxImportSource react */
import { Cloud, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/i18n";
import { useBetaAuth } from "./beta-auth-provider";

export type BetaAuthButtonProps = {
  mode?: "sign-in" | "sign-up" | "menu";
  size?: "default" | "sm" | "xs" | "icon-xs";
  variant?: "default" | "secondary" | "outline" | "ghost";
};

/**
 * Beta auth button.
 *
 * A single CTA for sign-in/sign-up that mirrors the status-bar pattern. When
 * mode is "menu" (default), it renders a sign-in button that delegates to the
 * browser flow.
 */
export function BetaAuthButton({
  mode = "sign-in",
  size = "xs",
  variant = "secondary",
}: BetaAuthButtonProps) {
  const auth = useBetaAuth();

  if (!auth.isLoaded) {
    return (
      <Button variant={variant} size={size} disabled>
        <Cloud className="size-3.5 animate-pulse" />
        <span>Checking...</span>
      </Button>
    );
  }

  if (auth.isSignedIn) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={(
            <Button
              variant={variant}
              size={size}
              onClick={auth.signOut}
              aria-label="Sign out"
            >
              <Cloud className="size-3.5" />
              <span>Signed in</span>
            </Button>
          )}
        />
        <TooltipContent>Click to sign out</TooltipContent>
      </Tooltip>
    );
  }

  const isSignUp = mode === "sign-up";
  const label = isSignUp ? "Create account" : t("den.signin_button");
  const icon = isSignUp ? <UserPlus className="size-3.5" /> : <LogIn className="size-3.5" />;
  const onClick = isSignUp ? auth.openSignUp : auth.openSignIn;

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button variant={variant} size={size} onClick={onClick} aria-label={label}>
            {icon}
            <span>{label}</span>
          </Button>
        )}
      />
      <TooltipContent>
        {isSignUp
          ? "Create a Matterhorn account in your browser"
          : t("den.signin_title")}
      </TooltipContent>
    </Tooltip>
  );
}
