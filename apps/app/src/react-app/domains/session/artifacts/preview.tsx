/** @jsxImportSource react */
import { useState, type ComponentProps } from "react";
import { ChevronRight, Copy, Image as ImageIcon, ImageOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { ErrorState } from "../../shell/error-state";
import { MarkdownBlock } from "../surface/markdown";

interface PreviewLoadingProps extends ComponentProps<"div"> {}

export function PreviewLoading({ className, ...props }: PreviewLoadingProps) {
  return (
    <div className={cn("flex h-full items-center justify-center text-muted-foreground", className)} {...props}>
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

interface PreviewErrorProps extends ComponentProps<"div"> {
  message: string;
}

export function PreviewError({ message, className, ...props }: PreviewErrorProps) {
  return (
    <div className={cn("flex h-full flex-col p-4", className)} {...props}>
      <ErrorState
        error={new Error(message)}
        title="Could not load outputs"
        className="flex-1 rounded-md bg-destructive/10 px-3 py-2"
      />
    </div>
  );
}

interface PlainTextProps extends ComponentProps<"pre"> {
  content: string;
}

export function PlainText({ content, className, ...props }: PlainTextProps) {
  return <pre className={cn("h-full min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-foreground [overflow-wrap:anywhere]", className)} {...props}>{content}</pre>;
}

const receiptFieldLabels: Record<string, string> = {
  kind: "Status",
  network: "Network",
  objectId: "Object ID",
  transactionDigest: "Transaction digest",
  packageId: "Package ID",
  kioskId: "Kiosk ID",
  transferPolicyId: "Transfer policy",
  custody: "Custody",
  containsSignatureMaterial: "Signing data",
  recordedAt: "Recorded",
};

function jsonRecord(content: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(content);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
  catch {
    return null;
  }
}

function receiptValue(key: string, value: unknown): string {
  if (key === "custody" && typeof value === "boolean") return value ? "Matterhorn custody" : "External wallet";
  if (key === "containsSignatureMaterial" && typeof value === "boolean") return value ? "Included" : "Not stored";
  if (key === "network" && typeof value === "string") {
    return value
      .split(/[-_]/)
      .filter(Boolean)
      .map((part, index) => index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
      .join(" ");
  }
  if (key === "recordedAt" && typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (key === "kind" && typeof value === "string") {
    return value
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function compactReceiptValue(value: string): string {
  if (value.length <= 34) return value;
  return `${value.slice(0, 14)}...${value.slice(-10)}`;
}

interface StructuredJsonPreviewProps extends ComponentProps<"div"> {
  content: string;
  receipt?: boolean;
}

export function StructuredJsonPreview({ content, receipt = false, className, ...props }: StructuredJsonPreviewProps) {
  const record = jsonRecord(content);
  if (!record) return <PlainText content={content} className={className} />;

  if (receipt) {
    const kind = record.kind == null ? "Receipt" : receiptValue("kind", record.kind);
    const network = record.network == null ? null : receiptValue("network", record.network);
    const safetyEntries = ["custody", "containsSignatureMaterial"]
      .flatMap((key) => record[key] == null ? [] : [[key, record[key]] as const]);
    const identifierEntries = ["objectId", "transactionDigest", "kioskId", "transferPolicyId", "packageId"]
      .flatMap((key) => record[key] == null ? [] : [[key, record[key]] as const]);
    const recorded = record.recordedAt == null ? null : receiptValue("recordedAt", record.recordedAt);

    return (
      <div className={cn("h-full overflow-auto px-3 py-3", className)} {...props}>
        <section className="rounded-lg bg-dls-surface-muted/[0.14] px-3 py-3">
          <p className="text-[10px] font-medium text-muted-foreground">Receipt</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h4 className="text-sm font-semibold text-foreground">{kind}</h4>
            {network ? <span className="text-xs text-muted-foreground">{network}</span> : null}
          </div>
          {safetyEntries.length ? (
            <dl className="mt-3 grid gap-2 @md/artifact:grid-cols-2">
              {safetyEntries.map(([key, value]) => (
                <div key={key} className="min-w-0 rounded-md bg-dls-surface-muted/[0.12] px-2.5 py-2">
                  <dt className="text-[10px] font-medium text-muted-foreground">{receiptFieldLabels[key]}</dt>
                  <dd className="mt-0.5 truncate text-xs text-foreground" title={receiptValue(key, value)}>
                    {receiptValue(key, value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>

        {identifierEntries.length ? (
          <section className="mt-4">
            <h4 className="px-1 text-xs font-semibold text-foreground">Identifiers</h4>
            <div className="mt-2 grid gap-2">
              {identifierEntries.map(([key, value]) => {
                const displayValue = receiptValue(key, value);
                return (
                  <div key={key} className="min-w-0 rounded-lg bg-dls-surface-muted/[0.10] px-3 py-2.5">
                    <p className="text-[10px] font-medium text-muted-foreground">{receiptFieldLabels[key]}</p>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      <code className="min-w-0 flex-1 truncate text-xs text-foreground" title={displayValue}>
                        {compactReceiptValue(displayValue)}
                      </code>
                      <button
                        type="button"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-dls-surface-muted/[0.18] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-border-hover"
                        onClick={() => void navigator.clipboard.writeText(displayValue)}
                        aria-label={`Copy ${receiptFieldLabels[key]}`}
                        title={`Copy ${receiptFieldLabels[key]}`}
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {recorded ? (
          <div className="mt-4 flex min-w-0 items-baseline justify-between gap-3 px-1 text-xs">
            <span className="text-muted-foreground">Recorded</span>
            <span className="min-w-0 truncate text-right text-foreground" title={recorded}>{recorded}</span>
          </div>
        ) : null}

        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            Raw receipt data
          </summary>
          <pre className="mt-1 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-dls-surface-muted/[0.10] p-3 text-[11px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {JSON.stringify(record, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  const entries = Object.entries(record).slice(0, 12);
  const rawLabel = "Raw JSON";

  return (
    <div className={cn("h-full overflow-auto px-4 py-3", className)} {...props}>
      <div className="grid gap-0.5">
        {entries.map(([key, value]) => {
          const displayValue = receiptValue(key, value);
          return (
            <div key={key} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-baseline gap-3 rounded-md px-2 py-2 hover:bg-dls-surface-muted/[0.055]">
              <span className="text-[11px] font-medium text-muted-foreground">
                {receiptFieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2")}
              </span>
              <span className="min-w-0 break-all text-xs leading-5 text-foreground" title={displayValue}>
                {compactReceiptValue(displayValue)}
              </span>
            </div>
          );
        })}
      </div>
      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-dls-surface-muted/[0.055] hover:text-foreground">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          {rawLabel}
        </summary>
        <pre className="mt-1 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-dls-surface-muted/[0.055] p-3 text-[11px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
          {JSON.stringify(record, null, 2)}
        </pre>
      </details>
    </div>
  );
}

interface MarkdownPreviewProps extends ComponentProps<"div"> {
  content: string;
}

export function MarkdownPreview({ content, className, ...props }: MarkdownPreviewProps) {
  return (
    <div className={cn("h-full overflow-auto p-4", className)} {...props}>
      <MarkdownBlock text={content} />
    </div>
  );
}

interface TextHTMLPreviewProps {
  type: "text";
  title: string;
  content: string;
}

interface BinaryHTMLPreviewProps {
  type: "binary";
  title: string;
  url: string;
}

type HTMLPreviewProps = { className?: string } & (TextHTMLPreviewProps | BinaryHTMLPreviewProps);

export function HTMLPreview({ className, ...props }: HTMLPreviewProps) {
  if (props.type === "text") {
    return <iframe srcDoc={props.content} title={props.title} className={cn("h-full w-full border-0", className)} sandbox="allow-scripts allow-same-origin" />;
  }

  return <iframe src={props.url} title={props.title} className={cn("h-full w-full border-0", className)} sandbox="allow-scripts allow-same-origin" />;
}

interface ImagePreviewProps extends ComponentProps<"div"> {
  src: string;
  alt: string;
}

export function ImagePreview({ src, alt, className, ...props }: ImagePreviewProps) {
  return (
    <div className={cn("flex h-full items-center justify-center overflow-auto bg-muted/30 p-3", className)} {...props}>
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

interface GeneratedImagePreviewProps extends ComponentProps<"div"> {
  src: string;
  alt: string;
  prompt?: string;
  provider?: string;
  model?: string;
  size?: string;
  mock?: boolean;
}

export function GeneratedImagePreview({
  src,
  alt,
  prompt,
  provider,
  model,
  size,
  mock = false,
  className,
  ...props
}: GeneratedImagePreviewProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const providerModel = [provider, model].filter(Boolean).join(" / ");

  return (
    <div className={cn("h-full overflow-auto px-4 py-5", className)} {...props}>
      <div className="mx-auto grid max-w-3xl gap-4">
        {mock ? (
          <div className="flex min-h-56 items-center justify-center rounded-lg bg-dls-surface-raised px-6 py-10 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex size-10 items-center justify-center rounded-md bg-dls-surface-muted/45 text-muted-foreground">
                <ImageIcon className="size-5" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-foreground">Mock preview</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                This placeholder confirms the image workflow works. No production image was rendered.
              </p>
            </div>
          </div>
        ) : imageFailed ? (
          <div className="flex min-h-56 items-center justify-center rounded-lg bg-dls-surface-raised px-6 py-10 text-center">
            <div className="max-w-sm">
              <ImageOff className="mx-auto size-5 text-muted-foreground" />
              <h4 className="mt-3 text-sm font-semibold text-foreground">Preview unavailable</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The image file is saved. Download it or open it externally to inspect it.
              </p>
            </div>
          </div>
        ) : (
          <figure className="flex min-h-56 items-center justify-center overflow-hidden rounded-lg bg-dls-surface-raised p-3">
            <img
              src={src}
              alt={alt}
              className="max-h-[min(70vh,720px)] max-w-full rounded-md object-contain"
              onError={() => setImageFailed(true)}
            />
          </figure>
        )}

        <section className="min-w-0 border-t border-dls-border-subtle pt-4">
          <p className="text-[11px] font-medium text-muted-foreground">Prompt</p>
          <p className="mt-1 text-sm leading-6 text-foreground">
            {prompt || "Prompt details are unavailable for this image."}
          </p>
          {providerModel || size ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {[providerModel, size].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

interface PreviewUnavailableProps extends ComponentProps<"div"> {}

export function PreviewUnavailable({ className, ...props }: PreviewUnavailableProps) {
  return <div className={cn("p-4 text-sm text-muted-foreground", className)} {...props}>Preview unavailable. Open externally to view this file.</div>;
}
