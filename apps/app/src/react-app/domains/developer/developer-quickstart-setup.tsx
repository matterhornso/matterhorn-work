/** @jsxImportSource react */

import { useMemo, useState } from "react";
import { Check, Clipboard } from "lucide-react";

import {
  createMatterhornCryptoAppQuickstartCommand,
  MatterhornCryptoAppQuickstartError,
  type MatterhornCryptoAppQuickstartProtocol,
} from "@matterhorn-work/crypto-app-sdk";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

const PROTOCOLS: ReadonlyArray<{
  value: MatterhornCryptoAppQuickstartProtocol;
  label: string;
}> = [
  { value: "sui", label: "Sui testnet" },
  { value: "hyperliquid", label: "Hyperliquid testnet" },
  { value: "bittensor", label: "Bittensor test network" },
];

const DEFAULT_APP_IDS: Record<MatterhornCryptoAppQuickstartProtocol, string> = {
  sui: "your-company.sui-testnet",
  hyperliquid: "your-company.hyperliquid-testnet",
  bittensor: "your-company.bittensor-testnet",
};

const DEFAULT_DIRECTORIES: Record<MatterhornCryptoAppQuickstartProtocol, string> = {
  sui: "./matterhorn-sui-app",
  hyperliquid: "./matterhorn-hyperliquid-app",
  bittensor: "./matterhorn-bittensor-app",
};

function commandErrorMessage(error: unknown): string {
  if (!(error instanceof MatterhornCryptoAppQuickstartError)) {
    return "Matterhorn could not build this command.";
  }
  if (error.issues.includes("output_directory_invalid")) {
    return "Choose a normal folder name without line breaks.";
  }
  if (error.issues.some((issue) => issue.includes("app_id"))) {
    return "Use a lowercase app ID such as company.sui-testnet.";
  }
  return "Use a public HTTPS adapter URL without credentials, query parameters, or a custom port.";
}

export function DeveloperQuickstartSetup() {
  const [protocol, setProtocol] = useState<MatterhornCryptoAppQuickstartProtocol>("sui");
  const [appId, setAppId] = useState(DEFAULT_APP_IDS.sui);
  const [endpoint, setEndpoint] = useState("");
  const [outputDirectory, setOutputDirectory] = useState(DEFAULT_DIRECTORIES.sui);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const result = useMemo(() => {
    if (!appId.trim() || !endpoint.trim() || !outputDirectory.trim()) {
      return { command: null, error: null };
    }
    try {
      return {
        command: createMatterhornCryptoAppQuickstartCommand({
          protocol,
          appId: appId.trim(),
          endpoint: endpoint.trim(),
          outputDirectory: outputDirectory.trim(),
        }),
        error: null,
      };
    } catch (error) {
      return { command: null, error: commandErrorMessage(error) };
    }
  }, [appId, endpoint, outputDirectory, protocol]);

  const resetCopyState = () => {
    setCopied(false);
    setCopyError(false);
  };

  const chooseProtocol = (value: MatterhornCryptoAppQuickstartProtocol | null) => {
    if (!value) return;
    const appIdWasDefault = Object.values(DEFAULT_APP_IDS).includes(appId);
    const directoryWasDefault = Object.values(DEFAULT_DIRECTORIES).includes(outputDirectory);
    setProtocol(value);
    if (appIdWasDefault) setAppId(DEFAULT_APP_IDS[value]);
    if (directoryWasDefault) setOutputDirectory(DEFAULT_DIRECTORIES[value]);
    resetCopyState();
  };

  const copyCommand = async () => {
    if (!result.command) return;
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(result.command);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <section className="border-b border-border py-8" aria-labelledby="developer-quickstart-heading">
      <div className="max-w-3xl">
        <h2 id="developer-quickstart-heading" className="text-base font-semibold">Create a testnet starter</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose a network and copy one command. It creates a read-only starter on your computer and does not contact the adapter.
        </p>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="quickstart-protocol">Network</Label>
          <Select
            value={protocol}
            items={PROTOCOLS}
            onValueChange={chooseProtocol}
          >
            <SelectTrigger id="quickstart-protocol" className="mt-2 w-full" aria-label="Test network">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {PROTOCOLS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="quickstart-app-id">App ID</Label>
          <Input
            id="quickstart-app-id"
            className="mt-2 font-mono text-xs"
            value={appId}
            onChange={(event) => {
              setAppId(event.target.value);
              resetCopyState();
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">A lowercase public name for this integration.</p>
        </div>

        <div>
          <Label htmlFor="quickstart-endpoint">Public test adapter URL</Label>
          <Input
            id="quickstart-endpoint"
            className="mt-2 font-mono text-xs"
            value={endpoint}
            onChange={(event) => {
              setEndpoint(event.target.value);
              resetCopyState();
            }}
            placeholder="https://adapter.your-domain.example/v1"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
          />
        </div>

        <div>
          <Label htmlFor="quickstart-directory">New folder</Label>
          <Input
            id="quickstart-directory"
            className="mt-2 font-mono text-xs"
            value={outputDirectory}
            onChange={(event) => {
              setOutputDirectory(event.target.value);
              resetCopyState();
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">The command refuses to overwrite an existing folder.</p>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Run from your Matterhorn checkout</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Review the command, then run it in your terminal.</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={!result.command}
            onClick={() => void copyCommand()}
          >
            {copied ? <Check aria-hidden="true" className="size-4" /> : <Clipboard aria-hidden="true" className="size-4" />}
            {copied ? "Copied" : "Copy command"}
          </Button>
        </div>
        {result.command ? (
          <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-muted/25 p-4 text-xs leading-5" tabIndex={0}>
            <code>{result.command}</code>
          </pre>
        ) : (
          <p className="mt-3 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
            Add your public test adapter URL to generate the command.
          </p>
        )}
        {result.error ? <p className="mt-3 text-sm text-destructive" role="alert">{result.error}</p> : null}
        {copyError ? <p className="mt-3 text-sm text-destructive" role="alert">Copy failed. Select the command and copy it manually.</p> : null}
        <p className="sr-only" aria-live="polite">{copied ? "Quickstart command copied." : ""}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground" aria-label="Quickstart safety">
        <span>Read-only testnet starter</span>
        <span>No credentials or keys</span>
        <span>No wallet access</span>
        <span>No certification granted</span>
      </div>
    </section>
  );
}
