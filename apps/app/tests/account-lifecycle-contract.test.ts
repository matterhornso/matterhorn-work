import { describe, expect, test } from "bun:test";

const denSource = await Bun.file(new URL("../src/app/lib/den.ts", import.meta.url)).text();
const accountViewSource = await Bun.file(
  new URL("../src/react-app/domains/settings/pages/cloud-account-view.tsx", import.meta.url),
).text();
const accountSecuritySource = await Bun.file(
  new URL("../src/react-app/domains/settings/cloud/account-security-section.tsx", import.meta.url),
).text();
const denSessionSource = await Bun.file(
  new URL("../src/react-app/domains/settings/cloud/use-den-session.tsx", import.meta.url),
).text();

describe("account lifecycle contract", () => {
  test("exposes first-party session and account lifecycle requests", () => {
    expect(denSource).toContain('"/api/auth/account/security"');
    expect(denSource).toContain('"/api/auth/account/revoke-other-sessions"');
    expect(denSource).toContain('"/api/auth/account/change-password"');
    expect(denSource).toContain('"/api/auth/account"');
    expect(denSource).toContain('method: "DELETE"');
  });

  test("renders signed-in security controls even when optional Cloud products are unavailable", () => {
    expect(accountViewSource).toContain("<AccountSecuritySection");
    expect(accountViewSource).toContain("{isSignedIn && user ? (");
    expect(accountViewSource).toContain("onSessionEnded={session.onSessionEnded}");
    expect(denSessionSource).toContain("onSessionEnded: (message?: string | null) => clearSignedInState(message)");
  });

  test("requires reauthentication and explicit confirmation for destructive changes", () => {
    expect(accountSecuritySource).toContain('autoComplete="current-password"');
    expect(accountSecuritySource).toContain('autoComplete="new-password"');
    expect(accountSecuritySource).toContain("newPassword.length >= 12");
    expect(accountSecuritySource).toContain("confirmationEmail.trim().toLowerCase() === user.email.toLowerCase()");
    expect(accountSecuritySource).toContain("deletionBlockers.length > 0");
    expect(accountSecuritySource).toContain('variant="destructive"');
  });

  test("keeps account actions accessible on touch screens and communicates progress", () => {
    expect(accountSecuritySource.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(5);
    expect(accountSecuritySource).toContain("Checking active sessions…");
    expect(accountSecuritySource).toContain("Signing out…");
    expect(accountSecuritySource).toContain("Changing password…");
    expect(accountSecuritySource).toContain("Deleting account…");
    expect(accountSecuritySource).toContain("aria-invalid=");
  });
});
