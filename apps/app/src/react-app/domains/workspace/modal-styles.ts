export const modalBodyClass = "min-h-0 flex-1 overflow-y-auto";

export const surfaceCardClass =
  "rounded-lg border border-dls-border bg-dls-surface p-5 shadow-sm";

export const softCardClass =
  "rounded-lg bg-dls-hover/70 p-4";

export const interactiveCardClass =
  "rounded-lg border border-dls-border bg-dls-surface p-5 text-left shadow-sm transition-colors hover:bg-dls-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export const iconTileClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--matterhorn-blue-rgb)/0.13)] text-primary";

export const sectionTitleClass =
  "text-[15px] font-medium tracking-[-0.2px] text-dls-text";

export const sectionBodyClass = "mt-1 text-[13px] leading-relaxed text-dls-secondary";

export const inputLabelClass = "text-[13px] font-medium text-dls-text";

export const inputHintClass = "text-[12px] leading-5 text-dls-secondary";

export const inputClass =
  "w-full rounded-md border border-dls-border bg-dls-hover/70 px-3 py-2.5 text-[14px] text-dls-text placeholder:text-dls-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";

export const subtleInputClass =
  "w-full rounded-md border border-dls-border bg-dls-hover/70 px-3 py-2.5 text-[14px] text-dls-text placeholder:text-dls-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";

const pillButtonBaseClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";

export const pillPrimaryClass = `${pillButtonBaseClass} bg-dls-accent text-[var(--dls-accent-fg)] hover:bg-[var(--dls-accent-hover)]`;

export const pillSecondaryClass = `${pillButtonBaseClass} border border-dls-border bg-dls-hover/80 text-dls-text hover:bg-dls-surface`;

export const pillGhostClass = `${pillButtonBaseClass} border border-transparent bg-dls-hover/70 text-dls-secondary hover:bg-dls-surface hover:text-dls-text`;

export const tagClass =
  "inline-flex items-center rounded-md bg-dls-hover/80 px-2 py-0.5 text-[11px] text-dls-secondary";

export const infoBannerClass =
  "rounded-lg bg-dls-hover/70 px-4 py-3 text-[13px] text-dls-secondary";

export const warningBannerClass =
  "rounded-lg border border-amber-7/20 bg-amber-3/30 px-4 py-3 text-[13px] text-amber-11";

export const errorBannerClass =
  "rounded-lg border border-red-7/20 bg-red-1/40 px-4 py-3 text-[13px] text-red-11";

export const successBannerClass =
  "rounded-lg border border-emerald-7/20 bg-emerald-3/30 px-4 py-3 text-[13px] text-emerald-11";

export const modalNoticeNeutralClass =
  "rounded-lg bg-dls-hover/70 px-3 py-2.5 text-[13px] leading-relaxed text-dls-text";

export const modalNoticeSuccessClass =
  "rounded-lg bg-emerald-2/25 px-3 py-2.5 text-[13px] leading-relaxed text-dls-text";

export const modalNoticeErrorClass =
  "rounded-lg bg-red-2/20 px-3 py-2.5 text-[13px] leading-relaxed text-dls-text";
