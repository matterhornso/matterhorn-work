import { sendEmail, type EmailSendConfig, type SendEmailResult } from "@matterhorn-work/email";
import type { MatterhornAuthStore, MatterhornEmailOutboxItem } from "./auth-store.js";

export type MatterhornEmailDeliver = (input:
  | {
    to: string;
    template: "verification";
    props: { verificationCode: string };
    config: EmailSendConfig;
  }
  | {
    to: string;
    template: "passwordReset";
    props: { resetLink: string };
    config: EmailSendConfig;
  }
) => Promise<SendEmailResult>;

function deliveryInput(item: MatterhornEmailOutboxItem, config: EmailSendConfig) {
  return item.template === "verification"
    ? {
      to: item.recipient,
      template: "verification" as const,
      props: { verificationCode: item.props.verificationCode ?? "" },
      config,
    }
    : {
      to: item.recipient,
      template: "passwordReset" as const,
      props: { resetLink: item.props.resetLink ?? "" },
      config,
    };
}

export async function drainMatterhornEmailOutbox(input: {
  authStore: MatterhornAuthStore;
  config: EmailSendConfig;
  deliver?: MatterhornEmailDeliver;
  onDeferred?: (item: MatterhornEmailOutboxItem) => void;
}): Promise<{ accepted: number; deferred: number }> {
  const deliver = input.deliver ?? sendEmail;
  let accepted = 0;
  let deferred = 0;
  for (const item of input.authStore.claimDueEmailOutbox()) {
    try {
      const result = await deliver(deliveryInput(item, input.config));
      input.authStore.markEmailAccepted(item.id, result.messageId);
      accepted += 1;
    } catch (error) {
      const errorCode = error instanceof Error && "reason" in error
        ? String((error as { reason?: unknown }).reason ?? "email_delivery_failed")
        : "email_delivery_failed";
      input.authStore.markEmailFailed(item.id, errorCode, item.attempts);
      input.onDeferred?.(item);
      deferred += 1;
    }
  }
  return { accepted, deferred };
}
