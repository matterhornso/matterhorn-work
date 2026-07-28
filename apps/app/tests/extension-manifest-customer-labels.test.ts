import { describe, expect, test } from "bun:test";

import { customerVisibleManifestLabel } from "../src/react-app/design-system/extension-detail-modal";

describe("extension manifest customer labels", () => {
  test("keeps compatibility identifiers out of customer-visible labels", () => {
    expect(customerVisibleManifestLabel("openwork-image-generation")).toBe(
      "matterhorn-image-generation",
    );
    expect(customerVisibleManifestLabel("OpenWork Browser")).toBe(
      "Matterhorn Desks Browser",
    );
    expect(customerVisibleManifestLabel("openai-image-config")).toBe(
      "openai-image-config",
    );
  });
});
