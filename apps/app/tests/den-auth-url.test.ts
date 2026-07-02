import { describe, expect, test } from "bun:test";
import { buildDenAuthUrl, normalizeDenBaseUrl } from "../src/app/lib/den";
import en from "../src/i18n/locales/en";

function isUnavailableDefaultCloudUrl(value: string): boolean {
  try {
    const url = new URL(normalizeDenBaseUrl(value) ?? "");
    return url.hostname.toLowerCase() === "app.matterhorn.work";
  } catch {
    return false;
  }
}

describe("Den auth URL behavior", () => {
  test("buildDenAuthUrl returns a real Matterhorn Cloud URL", () => {
    const url = buildDenAuthUrl("https://app.matterhorn.work", "sign-in");
    expect(url).toStartWith("https://app.matterhorn.work");
    expect(url).toContain("mode=sign-in");
  });

  test("buildDenAuthUrl respects a custom Cloud control plane URL", () => {
    const url = buildDenAuthUrl("https://cloud.example.com", "sign-up");
    expect(url).toStartWith("https://cloud.example.com");
    expect(url).toContain("mode=sign-up");
  });

  test("isUnavailableDefaultCloudUrl flags the default hostname", () => {
    expect(isUnavailableDefaultCloudUrl("https://app.matterhorn.work")).toBe(true);
    expect(isUnavailableDefaultCloudUrl("https://cloud.example.com")).toBe(false);
    expect(isUnavailableDefaultCloudUrl("https://app.matterhorn.work/api/den")).toBe(true);
  });

  test("auth i18n strings do not contain customer-facing OpenWork copy", () => {
    const authStrings = [
      en["den.signin_code_note"],
      en["den.signin_link_placeholder"],
      en["den.signin_title"],
      en["den.cloud_section_title"],
    ];
    for (const value of authStrings) {
      expect(value).not.toContain("OpenWork Labs");
      expect(value).not.toContain("OpenWork");
    }
  });

  test("auth i18n strings reference matterhorn-work deep links", () => {
    expect(en["den.signin_code_note"]).toContain("matterhorn-work://den-auth");
    expect(en["den.signin_link_placeholder"]).toContain("matterhorn-work://den-auth");
  });
});
