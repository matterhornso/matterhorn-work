"use client";

import { Gauge, RotateCcw } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type ModelBehaviorOption = {
  value: string | null;
  label: string;
  description?: string;
};

type ModelBehaviorSelectProps = {
  value: string | null;
  label: string;
  title?: string;
  options?: ModelBehaviorOption[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
  isProviderDefault?: boolean;
  defaultLabel?: string;
};

export function ModelBehaviorSelect({
  value,
  label,
  title = t("model_behavior.title_reasoning_effort"),
  options,
  onChange,
  disabled = false,
  isProviderDefault = false,
  defaultLabel = t("settings.provider_default_label"),
}: ModelBehaviorSelectProps) {
  const levels = options?.flatMap((option) =>
    option.value ? [{ ...option, value: option.value }] : [],
  ) ?? [];

  if (!levels.length) {
    return null;
  }

  const defaultAvailable = options?.some((option) => option.value === null) ?? false;
  const valueIndex = levels.findIndex((option) => option.value === value);
  const labelIndex = levels.findIndex((option) => option.label === label);
  const selectedIndex = Math.max(0, valueIndex >= 0 ? valueIndex : labelIndex);
  const selected = levels[selectedIndex] ?? levels[0];
  const selectedLabel = selected.label || label;
  const progress = levels.length > 1
    ? (selectedIndex / (levels.length - 1)) * 100
    : 0;
  const description = selected.description
    ?? t("model_behavior.desc_generic", { label: selectedLabel.toLowerCase() });
  const controlLabel = `${title}: ${selectedLabel}`;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              type="button"
              disabled={disabled}
              aria-label={controlLabel}
              className="flex h-8 max-w-48 items-center gap-1.5 rounded-md px-2.5 text-sm text-gray-10 transition-colors hover:bg-gray-3 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:pointer-events-none disabled:opacity-50"
            />
          }
        >
          <Gauge aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{selectedLabel}</span>
        </TooltipTrigger>
        <TooltipContent>{controlLabel}</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        sideOffset={8}
        align="start"
        initialFocus={false}
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-4"
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-sm font-medium text-popover-foreground">{title}</p>
          <output
            htmlFor="model-behavior-effort"
            className="shrink-0 text-xs font-medium tabular-nums text-popover-foreground"
          >
            {selectedLabel}
          </output>
        </div>
        <p className="mt-1 min-h-8 text-xs leading-4 text-muted-foreground">
          {description}
        </p>

        <div className="mt-4">
          <div className="relative h-5">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-2 h-px bg-border"
            />
            <div
              aria-hidden="true"
              className="absolute left-0 top-2 h-px bg-foreground transition-[width] duration-150 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
            {levels.map((option, index) => {
              const left = levels.length > 1
                ? (index / (levels.length - 1)) * 100
                : 0;
              return (
                <span
                  key={option.value}
                  aria-hidden="true"
                  className={cn(
                    "absolute top-[5px] size-[7px] -translate-x-1/2 rounded-full border border-border bg-popover transition-colors duration-150 motion-reduce:transition-none",
                    index <= selectedIndex && "border-foreground bg-foreground",
                  )}
                  style={{ left: `${left}%` }}
                />
              );
            })}
            <input
              id="model-behavior-effort"
              type="range"
              min={0}
              max={Math.max(0, levels.length - 1)}
              step={1}
              value={selectedIndex}
              disabled={disabled || levels.length === 1}
              aria-label={title}
              aria-valuetext={selectedLabel}
              onChange={(event) => {
                const next = levels[Number(event.currentTarget.value)];
                if (next) onChange(next.value);
              }}
              className="absolute inset-x-0 top-0 h-5 w-full cursor-pointer appearance-none rounded-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:cursor-default [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-popover [&::-moz-range-thumb]:bg-foreground [&::-moz-range-track]:h-px [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-popover [&::-webkit-slider-thumb]:bg-foreground"
            />
          </div>

          <div
            className="mt-1 grid items-start"
            style={{ gridTemplateColumns: `repeat(${levels.length}, minmax(0, 1fr))` }}
          >
            {levels.map((option, index) => (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                aria-current={index === selectedIndex ? "true" : undefined}
                title={option.label}
                onClick={() => onChange(option.value)}
                className={cn(
                  "min-w-0 px-0.5 py-1 text-[10px] leading-3 text-muted-foreground transition-colors hover:text-popover-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:pointer-events-none disabled:opacity-50",
                  index === 0 && "text-left",
                  index === levels.length - 1 && "text-right",
                  index === selectedIndex && "font-medium text-popover-foreground",
                )}
              >
                <span className="block truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {defaultAvailable ? (
          <div className="mt-3 flex min-h-7 items-center justify-end border-t border-border/70 pt-3">
            {isProviderDefault ? (
              <span className="text-xs text-muted-foreground">
                {defaultLabel}
              </span>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(null)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:pointer-events-none disabled:opacity-50"
              >
                <RotateCcw aria-hidden="true" className="size-3" />
                {defaultLabel}
              </button>
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
