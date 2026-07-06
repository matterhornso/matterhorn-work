/**
 * Browser notification utility for agent job alerts.
 * Requests permission once, sends notifications when jobs complete.
 */

const NOTIFICATION_ICON = "/matterhorn-logo.png";

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

/** Play a subtle sound on transaction completion (desktop only). */
export function playTxSound(type: "success" | "error" = "success"): void {
  try {
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    if (type === "success") {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    } else {
      osc.frequency.setValueAtTime(200, ctx.currentTime);
    }
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Ignore audio errors
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
  playTxSound(status === "approved" ? "success" : "error");
}
