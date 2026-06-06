/**
 * Browser notification utility for agent job alerts.
 * Requests permission once, sends notifications when jobs complete.
 */

const NOTIFICATION_ICON = "/favicon.ico";

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function sendJobNotification(title: string, body: string, tag?: string): void {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // Don't spam when app is open

  try {
    new Notification(title, {
      body,
      icon: NOTIFICATION_ICON,
      tag: tag ?? `matterhorn-${Date.now()}`,
      silent: false,
    });
  } catch {
    // Ignore notification errors
  }
}

export function sendJobCompleted(name: string, status: "approved" | "rejected" | "failed", txHash?: string): void {
  const title = status === "approved" ? `Job completed: ${name}` : `Job ${status}: ${name}`;
  const body = status === "approved"
    ? txHash
      ? `Transaction confirmed. Hash: ${txHash.slice(0, 10)}...`
      : "Transaction approved by user."
    : status === "rejected"
      ? "You rejected the transaction proposal. Job paused."
      : "The job failed to execute. Check the job history for details.";
  sendJobNotification(title, body, `job-${name}`);
}
