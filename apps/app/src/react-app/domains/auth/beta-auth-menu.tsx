/** @jsxImportSource react */
import { useCallback, useState } from "react";
import {
  Cloud,
  LogIn,
  LogOut,
  Settings,
  User,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";
import { useStatusToasts } from "@/react-app/domains/shell-feedback/status-toasts";
import { useBetaAuth } from "./beta-auth-provider";

export type BetaAuthMenuProps = {
  /** If true, the trigger is rendered as a compact icon button. */
  compact?: boolean;
};

function UserAvatar({ name, email }: { name: string | null; email: string | null }) {
  const initial = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">
      {initial}
    </span>
  );
}

/**
 * Beta profile/auth menu.
 *
 * Provides the public beta account identity entry point:
 *   - signed in: name/email, settings link, sign out
 *   - signed out: sign in, sign up, continue offline
 *
 * This component never requests or displays wallet secrets, recovery phrases,
 * provider credentials, or signing material. Account auth is separate from Web3
 * wallet connection.
 */
export function BetaAuthMenu({ compact }: BetaAuthMenuProps) {
  const auth = useBetaAuth();
  const navigate = useNavigate();
  const { showToast } = useStatusToasts();
  const [signOutBusy, setSignOutBusy] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (signOutBusy) return;

    setSignOutBusy(true);
    try {
      await auth.signOut();
    } catch {
      showToast({
        title: "Could not sign out",
        description:
          "Your session is still active. Check your connection and try again.",
        tone: "error",
      });
    } finally {
      setSignOutBusy(false);
    }
  }, [auth, showToast, signOutBusy]);

  if (!auth.isLoaded) {
    return (
      <Button variant="ghost" size={compact ? "icon-xs" : "xs"} disabled>
        <Cloud className="size-3.5 animate-pulse" />
      </Button>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(
            <Button
              variant="secondary"
              size={compact ? "icon-xs" : "xs"}
              aria-label={t("den.signin_title")}
            >
              <Cloud className="size-3.5" />
              {compact ? null : <span>{t("den.signin_button")}</span>}
            </Button>
          )}
        />
        <DropdownMenuContent align="end" side="top" sideOffset={6}>
          <DropdownMenuLabel>{t("den.signin_title")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={auth.openSignIn}>
            <LogIn className="size-4" />
            Sign in to Matterhorn account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={auth.openSignUp}>
            <UserPlus className="size-4" />
            Create Matterhorn account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <User className="size-4" />
            Continue offline — local workspaces stay available
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const displayName = auth.user?.name?.trim() || auth.user?.email?.trim() || "Account";
  const subtitle = auth.user?.email?.trim() ?? "Signed in to Matterhorn";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(
          <Button
            variant="ghost"
            size={compact ? "icon-xs" : "xs"}
            className="gap-2"
            aria-label={`Signed in as ${displayName}`}
          >
            <UserAvatar name={auth.user?.name ?? null} email={auth.user?.email ?? null} />
            {compact ? null : (
              <span className="max-w-[16ch] truncate">{displayName}</span>
            )}
          </Button>
        )}
      />
      <DropdownMenuContent align="end" side="top" sideOffset={6}>
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{displayName}</span>
            <span className="text-muted-foreground">{subtitle}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings/cloud-account")}>
          <Settings className="size-4" />
          Cloud account
        </DropdownMenuItem>
        <DropdownMenuItem onClick={auth.openSignIn}>
          <Cloud className="size-4" />
          Switch account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signOutBusy} onClick={handleSignOut}>
          <LogOut className="size-4" />
          {signOutBusy ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
