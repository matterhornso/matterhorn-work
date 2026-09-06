/** @jsxImportSource react */
import type { MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export type PrivateModePrivacyNoticeProps = {
  providerPrivacyPolicy?: MatterhornProviderPrivacyPolicy | null;
  privateModeAvailable?: boolean;
  privateModeEnabled?: boolean;
  privateModeUnavailableReason?: string | null;
  onPrivateModeChange?: (enabled: boolean) => void;
  onOpenPrivacyDetails?: () => void;
};

export function PrivateModePrivacyNotice(props: PrivateModePrivacyNoticeProps) {
  const providerPolicy = props.providerPrivacyPolicy;
  const needsPrivateSetup =
    Boolean(props.onPrivateModeChange) && !props.privateModeAvailable;

  let message: ReactNode;
  if (props.privateModeEnabled) {
    message = (
      <>
        Private is on · Matterhorn does not train on your chats, and Venice
        does not retain this request or response.
      </>
    );
  } else if (providerPolicy?.allowed === false) {
    message = (
      <>
        Sending blocked · {providerPolicy.providerName}&apos;s training and
        retention terms are not verified.
      </>
    );
  } else if (props.privateModeUnavailableReason) {
    message = (
      <>
        Private is unavailable · {props.privateModeUnavailableReason} Matterhorn
        does not train on your chats.
      </>
    );
  } else if (providerPolicy) {
    message = (
      <>
        Private is off · Matterhorn does not train on your chats.{" "}
        {providerPolicy.providerName} processes this chat · {providerPolicy.label}.
      </>
    );
  } else if (needsPrivateSetup) {
    message = (
      <>
        Private is off · Matterhorn does not train on your chats. Set up Venice
        for no prompt or response retention.
      </>
    );
  } else {
    message = <>Checking model privacy.</>;
  }

  return (
    <div
      className="mx-auto mb-2 flex max-w-[920px] items-start gap-2 px-4 text-[11px] leading-4 text-dls-secondary"
      aria-live="polite"
    >
      <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0">
        {message}{" "}
        {props.onOpenPrivacyDetails ? (
          <button
            type="button"
            className="whitespace-nowrap text-dls-text underline decoration-dls-border underline-offset-2 hover:decoration-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dls-text/30"
            onClick={props.onOpenPrivacyDetails}
          >
            Privacy details
          </button>
        ) : null}
      </p>
    </div>
  );
}
