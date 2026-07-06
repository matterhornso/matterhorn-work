import { describe, expect, test } from "bun:test";

import {
  DESKTOP_WALLET_RUNTIME_CAPABILITY,
  ELECTRON_WALLET_RUNTIME_CAPABILITY,
  UNKNOWN_WALLET_RUNTIME_CAPABILITY,
  WALLET_PROTOCOLS,
  WEB_WALLET_RUNTIME_CAPABILITY,
  getWalletRuntimeCapability,
} from "@matterhorn-work/types";

describe("wallet runtime contract", () => {
  test("Sui is an explicit wallet protocol in every runtime capability", () => {
    expect(WALLET_PROTOCOLS).toContain("sui");

    for (const capability of [
      WEB_WALLET_RUNTIME_CAPABILITY,
      DESKTOP_WALLET_RUNTIME_CAPABILITY,
      ELECTRON_WALLET_RUNTIME_CAPABILITY,
      UNKNOWN_WALLET_RUNTIME_CAPABILITY,
    ]) {
      expect(capability.protocols.sui).toBeDefined();
      expect(capability.protocols.sui.custody).toBe(false);
      expect(capability.protocols.sui.secretInputsAllowed).toBe(false);
    }
  });

  test("web Sui uses connected-wallet signing while desktop and Electron use external handoffs", () => {
    expect(WEB_WALLET_RUNTIME_CAPABILITY.protocols.sui).toMatchObject({
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "client_signer",
    });

    expect(DESKTOP_WALLET_RUNTIME_CAPABILITY.protocols.sui).toMatchObject({
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
    });

    expect(ELECTRON_WALLET_RUNTIME_CAPABILITY.protocols.sui).toMatchObject({
      canRead: true,
      canPreview: true,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "external_signer",
    });
  });

  test("unknown runtime does not claim Sui support", () => {
    expect(getWalletRuntimeCapability("unknown").protocols.sui).toMatchObject({
      canRead: false,
      canPreview: false,
      canSubmit: false,
      liveSubmissionEnabled: false,
      signerRequirement: "none",
    });
  });
});
