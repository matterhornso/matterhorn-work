/** @jsxImportSource react */

import { useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";

import {
  createMatterhornCryptoIntegrationSetup,
  MatterhornCryptoIntegrationSetupError,
  type MatterhornCryptoIntegrationTarget,
} from "@matterhorn-work/crypto-app-sdk";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

const TARGETS: ReadonlyArray<{
  id: MatterhornCryptoIntegrationTarget;
  label: string;
  description: string;
}> = [
  { id: "codex", label: "Codex", description: "Add Matterhorn as a local MCP server." },
  { id: "claude_code", label: "Claude Code", description: "Add Matterhorn with one local command." },
  { id: "matterhorn_skill", label: "Agent skill", description: "Use the MCP with bounded guard instructions." },
  { id: "generic_mcp", label: "Other MCP client", description: "Copy a standard MCP configuration." },
  { id: "cli", label: "Command line", description: "Check the local runtime before testing." },
  { id: "http_api", label: "HTTP API", description: "Use the authenticated message gateway directly." },
];

const CHECKOUT_TARGETS = new Set<MatterhornCryptoIntegrationTarget>([
  "codex",
  "claude_code",
  "matterhorn_skill",
  "generic_mcp",
]);

function setupErrorMessage(error: unknown): string | null {
  if (!(error instanceof MatterhornCryptoIntegrationSetupError)) {
    return "Matterhorn could not build these instructions.";
  }
  if (error.code === "integration_repository_path_required") return null;
  if (error.code === "integration_repository_path_invalid") {
    return "Use the full path to a trusted Matterhorn checkout. Relative paths and parent-directory shortcuts are not accepted.";
  }
  if (error.code === "integration_server_origin_invalid") {
    return "The connected Matterhorn server cannot be used for this setup.";
  }
  return "This setup option is not supported.";
}

export function DeveloperIntegrationSetup(props: { serverOrigin: string }) {
  const [target, setTarget] = useState<MatterhornCryptoIntegrationTarget>("codex");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const needsCheckout = CHECKOUT_TARGETS.has(target);

  const result = useMemo(() => {
    try {
      return {
        setup: createMatterhornCryptoIntegrationSetup({
          target,
          serverOrigin: props.serverOrigin,
          ...(needsCheckout ? { repositoryPath } : {}),
        }),
        error: null,
      };
    } catch (error) {
      return { setup: null, error: setupErrorMessage(error) };
    }
  }, [needsCheckout, props.serverOrigin, repositoryPath, target]);

  const selected = TARGETS.find((option) => option.id === target) ?? TARGETS[0];

  const copyArtifact = async (artifactId: string, content: string) => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedArtifactId(artifactId);
    } catch {
      setCopiedArtifactId(null);
      setCopyError(true);
    }
  };

  return (
    <section className="border-b border-border py-8" aria-labelledby="developer-setup-heading">
      <div className="max-w-3xl">
        <h2 id="developer-setup-heading" className="text-base font-semibold">Connect your development tool</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose where you work, then copy the generated setup. It adds client-only access to Matterhorn—never host approval or wallet signing.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Development tool">
        {TARGETS.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={target === option.id ? "secondary" : "outline"}
            className="min-h-11"
            aria-pressed={target === option.id}
            onClick={() => {
              setTarget(option.id);
              setCopiedArtifactId(null);
              setCopyError(false);
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{selected.description}</p>

      {needsCheckout ? (
        <div className="mt-5 max-w-2xl">
          <Label htmlFor="matterhorn-checkout-path">Matterhorn checkout path</Label>
          <Input
            id="matterhorn-checkout-path"
            className="mt-2 font-mono text-xs"
            value={repositoryPath}
            onChange={(event) => setRepositoryPath(event.target.value)}
            placeholder="/Users/you/code/matterhorn-work"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Use the full path on your computer. It stays in this browser and is only placed into the setup text below.
          </p>
        </div>
      ) : null}

      {result.error ? <p className="mt-4 text-sm text-destructive" role="alert">{result.error}</p> : null}

      {result.setup ? (
        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div>
            <h3 className="text-sm font-semibold">Do this</h3>
            <ol className="mt-3 space-y-4">
              {result.setup.steps.map((step, index) => (
                <li key={step.id} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>
                    <span className="block font-medium">{step.title}</span>
                    <span className="mt-1 block leading-5 text-muted-foreground">{step.instruction}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 border-t border-border pt-5">
              <h3 className="text-sm font-semibold">Check the connection</h3>
              <ol className="mt-3 space-y-3">
                {result.setup.verification.checks.map((check, index) => (
                  <li key={check.id} className="flex gap-3 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block font-medium">{check.title}</span>
                      <span className="mt-1 block leading-5 text-muted-foreground">{check.expected}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                This confirms the connection boundary. Testnet certification is a separate review.
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            {result.setup.artifacts.map((artifact) => {
              const copied = copiedArtifactId === artifact.id;
              return (
                <div key={artifact.id}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{artifact.destination ?? `${selected.label} setup`}</p>
                      <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{artifact.format}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => void copyArtifact(artifact.id, artifact.content)}
                    >
                      {copied ? <Check aria-hidden="true" className="size-4" /> : <Clipboard aria-hidden="true" className="size-4" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/25 p-4 text-xs leading-5" tabIndex={0}>
                    <code>{artifact.content}</code>
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      ) : needsCheckout && !repositoryPath.trim() ? (
        <p className="mt-6 border-t border-border py-5 text-sm text-muted-foreground">
          Add your checkout path to generate the setup. Nothing is sent to Matterhorn.
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground" aria-label="Generated setup safety">
        <span>Client token only</span>
        <span>No private keys</span>
        <span>No wallet submission</span>
        <span>Generated in your browser</span>
      </div>
      {copyError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          Copy failed. Select the setup text and copy it manually.
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {copiedArtifactId ? "Setup copied." : ""}
      </p>
    </section>
  );
}
