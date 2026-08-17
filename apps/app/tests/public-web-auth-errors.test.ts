import { describe, expect, test } from "bun:test";

import { DenApiError } from "../src/app/lib/den";
import { publicWebAuthErrorMessage } from "../src/react-app/domains/cloud/public-web-auth-errors";
import { publicSignupAvailabilityMessage } from "../src/react-app/domains/cloud/public-web-signin-page";

describe("public web authentication errors", () => {
  test("explains signup deployment states without making sign-in look unavailable", () => {
    expect(publicSignupAvailabilityMessage(null)).toBeNull();
    expect(
      publicSignupAvailabilityMessage({
        signupsAvailable: true,
        signupStatus: "open",
        emailVerificationRequired: true,
        passwordResetAvailable: true,
        legalAcceptanceRequired: true,
        minimumPasswordLength: 12,
        turnstileSiteKey: "site-key",
      }),
    ).toBeNull();
    expect(
      publicSignupAvailabilityMessage({
        signupsAvailable: false,
        signupStatus: "setup_required",
        emailVerificationRequired: true,
        passwordResetAvailable: false,
        legalAcceptanceRequired: true,
        minimumPasswordLength: 12,
        turnstileSiteKey: "site-key",
      }),
    ).toContain("secure email delivery");
    expect(
      publicSignupAvailabilityMessage({
        signupsAvailable: false,
        signupStatus: "paused",
        emailVerificationRequired: true,
        passwordResetAvailable: true,
        legalAcceptanceRequired: true,
        minimumPasswordLength: 12,
        turnstileSiteKey: "site-key",
      }),
    ).toContain("temporarily paused");
  });

  test("keeps safe signup pauses actionable for existing users", () => {
    expect(
      publicWebAuthErrorMessage(
        new DenApiError(
          503,
          "signups_paused",
          "New accounts are paused while we prepare more beta places.",
        ),
      ),
    ).toBe("New accounts are paused while we prepare more beta places.");
  });

  test("keeps delivery recovery copy without exposing provider details", () => {
    expect(
      publicWebAuthErrorMessage(
        new DenApiError(
          503,
          "email_delivery_unavailable",
          "Account email is temporarily unavailable. Try again shortly.",
        ),
      ),
    ).toBe("Account email is temporarily unavailable. Try again shortly.");
  });

  test("hides unknown server failures", () => {
    expect(
      publicWebAuthErrorMessage(
        new DenApiError(500, "internal_error", "smtp host secret failed"),
      ),
    ).toBe("Account access is temporarily unavailable. Please try again shortly.");
  });

  test("explains network timeouts without raw errors", () => {
    expect(publicWebAuthErrorMessage(new Error("request timed out after 10s"))).toBe(
      "The request took too long. Check your connection and try again.",
    );
  });
});
