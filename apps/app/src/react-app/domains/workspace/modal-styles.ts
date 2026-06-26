export const modalBodyClass = "min-h-0 flex-1 overflow-y-auto";

export const surfaceCardClass =
  "rounded-[28px] border border-transparent bg-dls-surface/82 p-5 shadow-[0_18px_56px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.07)]";

export const softCardClass =
  "rounded-[24px] bg-dls-hover/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

export const interactiveCardClass =
  "rounded-[28px] border border-transparent bg-dls-surface/82 p-5 text-left shadow-[0_18px_56px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-dls-surface focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.16)]";

export const iconTileClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(var(--matterhorn-blue-rgb),0.13)] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";

export const sectionTitleClass =
  "text-[15px] font-medium tracking-[-0.2px] text-dls-text";

export const sectionBodyClass = "mt-1 text-[13px] leading-relaxed text-dls-secondary";

export const inputLabelClass = "text-[13px] font-medium text-dls-text";

export const inputHintClass = "text-[12px] leading-5 text-dls-secondary";

export const inputClass =
  "w-full rounded-2xl border border-transparent bg-dls-hover/70 px-4 py-3 text-[14px] text-dls-text placeholder:text-dls-secondary focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.12)] disabled:cursor-not-allowed disabled:opacity-60";

export const subtleInputClass =
  "w-full rounded-2xl border border-transparent bg-dls-hover/70 px-4 py-3 text-[14px] text-dls-text placeholder:text-dls-secondary focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.12)] disabled:cursor-not-allowed disabled:opacity-60";

const pillButtonBaseClass =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(var(--dls-accent-rgb),0.18)] disabled:cursor-not-allowed disabled:opacity-60";

export const pillPrimaryClass = `${pillButtonBaseClass} bg-dls-accent text-[var(--dls-accent-fg)] hover:bg-[var(--dls-accent-hover)]`;

export const pillSecondaryClass = `${pillButtonBaseClass} border border-transparent bg-dls-hover/80 text-dls-text hover:bg-dls-surface`;

export const pillGhostClass = `${pillButtonBaseClass} border border-transparent bg-dls-hover/70 text-dls-secondary hover:bg-dls-surface hover:text-dls-text`;

export const tagClass =
  "inline-flex items-center rounded-full bg-dls-hover/80 px-2.5 py-1 text-[11px] text-dls-secondary";

export const infoBannerClass =
  "rounded-[24px] bg-dls-hover/70 px-4 py-3 text-[13px] text-dls-secondary";

export const warningBannerClass =
  "rounded-[20px] border border-amber-7/20 bg-amber-3/30 px-4 py-3 text-[13px] text-amber-11";

export const errorBannerClass =
  "rounded-[20px] border border-red-7/20 bg-red-1/40 px-4 py-3 text-[13px] text-red-11";

export const successBannerClass =
  "rounded-[20px] border border-emerald-7/20 bg-emerald-3/30 px-4 py-3 text-[13px] text-emerald-11";

export const modalNoticeNeutralClass =
  "rounded-2xl bg-dls-hover/70 px-3 py-2.5 text-[13px] leading-relaxed text-dls-text";

export const modalNoticeSuccessClass =
  "rounded-2xl bg-emerald-2/25 px-3 py-2.5 text-[13px] leading-relaxed text-dls-text";

export const modalNoticeErrorClass =
  "rounded-2xl bg-red-2/20 px-3 py-2.5 text-[13px] leading-relaxed text-dls-text";
