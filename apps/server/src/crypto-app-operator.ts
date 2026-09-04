import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import {
  MatterhornCryptoAppRegistry,
  type MatterhornCryptoAppCertificationState,
} from "./crypto-app-registry.js";
import type { MatterhornCryptoAppRuntimeCertificationReport } from "./crypto-app-runtime-certification.js";

type CertificationInput = {
  appId: string;
  manifestRevision: string;
  state: Exclude<MatterhornCryptoAppCertificationState, "pending">;
  report?: MatterhornCryptoAppConformanceReport | null;
  runtimeReport?: MatterhornCryptoAppRuntimeCertificationReport | null;
  reason?: string | null;
};

/**
 * Trusted-host registry boundary. It never signs manifests and never executes
 * probes; publisher signing and sealed runtime evidence remain external to the
 * production server. The registry re-verifies every submitted artifact.
 */
export class MatterhornCryptoAppOperator {
  constructor(private readonly registry: MatterhornCryptoAppRegistry) {}

  register(manifest: MatterhornCryptoAppManifest, targetEnvironment: "testnet" | "mainnet") {
    const entry = this.registry.register(manifest);
    const staticReport = this.registry.buildStaticConformanceReport(
      entry.appId,
      entry.manifestRevision,
      targetEnvironment,
    );
    return { entry, staticReport };
  }

  updateCertification(input: CertificationInput) {
    return this.registry.updateCertification(input);
  }

  list() {
    return this.registry.list();
  }

  inspect(appId: string, manifestRevision: string) {
    const entry = this.registry.get(appId, manifestRevision);
    if (!entry) return null;
    return {
      entry,
      certificationHistory: this.registry.certificationHistory(appId, manifestRevision),
    };
  }
}
