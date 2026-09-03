/** @jsxImportSource react */

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";

import {
  createMatterhornServerClient,
  MatterhornServerError,
} from "../../../app/lib/matterhorn-server";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { resolveMatterhornConnection } from "../../shell/matterhorn-connection";
import {
  capturePendingCoworkerInviteFromBrowser,
  takePendingCoworkerInvite,
} from "./coworker-invite-fragment";

const QUERY_KEY = ["coworker-access"] as const;

type CoworkerAccessClient = ReturnType<typeof createMatterhornServerClient>;

async function connect(): Promise<{
  client: CoworkerAccessClient;
  access: Awaited<ReturnType<CoworkerAccessClient["getCoworkerAccess"]>>;
}> {
  const connection = await resolveMatterhornConnection();
  if (!connection.normalizedBaseUrl) throw new Error("connection_unavailable");
  const client = createMatterhornServerClient({
    baseUrl: connection.normalizedBaseUrl,
    token: connection.resolvedToken || undefined,
  });
  return { client, access: await client.getCoworkerAccess() };
}

function messageFor(error: unknown): string {
  if (error instanceof MatterhornServerError) {
    if (error.code === "coworker_account_session_required") return "Sign in with your Matterhorn account to continue.";
    if (error.code === "coworker_access_invite_invalid") return "That invite is not valid. Ask Matterhorn for a new link.";
    if (error.code === "coworker_access_invite_expired") return "That invite has expired. Ask Matterhorn for a new link.";
    if (error.code === "coworker_access_invite_consumed") return "That invite has already been used.";
    if (error.code === "coworker_access_already_active") return "This account already has coworker access.";
    if (error.code === "coworker_invite_mode_required") return "Coworker invitations are not enabled here.";
  }
  return "Matterhorn could not check this invite. Try again.";
}

export function CoworkerAccessRoute() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [inviteToken, setInviteToken] = useState("");
  const [inviteLoaded, setInviteLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    capturePendingCoworkerInviteFromBrowser();
    const fragment = takePendingCoworkerInvite();
    if (!fragment.detected) return;
    if (fragment.token) {
      setInviteToken(fragment.token);
      setInviteLoaded(true);
      return;
    }
    setError("This invite link is not valid. Ask Matterhorn for a new link.");
  }, []);

  const access = useQuery({ queryKey: QUERY_KEY, queryFn: connect, retry: false });
  const allowed = access.data?.access.status.allowed === true;

  const accept = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const active = access.data ?? await connect();
      await active.client.acceptCoworkerInvite(inviteToken);
      setInviteToken("");
      setInviteLoaded(false);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }, [access.data, inviteToken, queryClient]);

  return (
    <main className="min-h-dvh overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 sm:py-10">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6 min-h-11" onClick={() => navigate("/session")}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Matterhorn
        </Button>

        <header className="border-b border-border pb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Coworker access</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Crypto coworkers can research, monitor, and prepare wallet reviews. Your connected wallet always signs and sends.
          </p>
        </header>

        {access.isLoading ? (
          <div className="flex min-h-52 items-center gap-3 text-sm text-muted-foreground" role="status">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            Checking your access…
          </div>
        ) : access.isError || !access.data ? (
          <section className="py-8" aria-live="polite">
            <h2 className="text-base font-semibold">Access check unavailable</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{messageFor(access.error)}</p>
            <Button className="mt-5 min-h-11" onClick={() => void access.refetch()}>Try again</Button>
          </section>
        ) : allowed ? (
          <section className="py-8" aria-live="polite">
            <div className="flex items-start gap-3">
              <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <h2 className="text-base font-semibold">Your access is ready</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  Open Matterhorn and choose a coworker to start.
                </p>
              </div>
            </div>
            <Button className="mt-6 min-h-11" onClick={() => navigate("/session?panel=coworkers")}>
              Open Matterhorn
            </Button>
          </section>
        ) : access.data.access.mode !== "invite" ? (
          <section className="py-8" aria-live="polite">
            <h2 className="text-base font-semibold">Coworkers are not available here</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              This Matterhorn deployment has not enabled Crypto Coworkers.
            </p>
          </section>
        ) : (
          <section className="py-8">
            <div className="flex items-start gap-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <h2 className="text-base font-semibold">Accept your invite</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  This one-time invite unlocks Crypto Coworkers for your Matterhorn account.
                </p>
              </div>
            </div>

            <form className="mt-6 max-w-md space-y-4" onSubmit={(event) => {
              event.preventDefault();
              void accept();
            }}>
              {inviteLoaded ? (
                <div>
                  <p className="text-sm font-medium" role="status">Invite ready</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    The one-time code was removed from the address bar and is not saved by your browser.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="-ml-2 mt-2 min-h-11"
                    onClick={() => {
                      setInviteToken("");
                      setInviteLoaded(false);
                    }}
                  >
                    Use a different invite
                  </Button>
                </div>
              ) : (
                <div>
                  <Label htmlFor="coworker-invite">Invite code</Label>
                  <Input
                    id="coworker-invite"
                    className="mt-2"
                    value={inviteToken}
                    onChange={(event) => setInviteToken(event.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
              )}
              {error ? <p className="text-sm leading-6 text-destructive" role="alert">{error}</p> : null}
              <Button type="submit" className="min-h-11" disabled={busy || !inviteToken}>
                {busy ? "Accepting…" : "Accept invite"}
              </Button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
