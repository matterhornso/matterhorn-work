import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppConformanceReport } from "./crypto-app-conformance.js";
import {
  buildCryptoAppRuntimeCertificationReport,
  expectedCryptoAppRuntimeProbeActionIds,
  requiredCryptoAppRuntimeCertificationProbes,
} from "./crypto-app-runtime-certification.js";
import { sha256 } from "./guarded-runtime-crypto.js";

export function passingCryptoAppRuntimeReportForTest(
  manifest: MatterhornCryptoAppManifest,
  staticReport: MatterhornCryptoAppConformanceReport,
) {
  return buildCryptoAppRuntimeCertificationReport(manifest, staticReport, {
    probes: requiredCryptoAppRuntimeCertificationProbes(manifest).map((id) => ({
      id,
      passed: true,
      evidenceHash: sha256({ appId: manifest.appId, manifestRevision: manifest.manifestRevision, id }),
      actionIds: expectedCryptoAppRuntimeProbeActionIds(manifest, id),
    })),
    now: () => new Date("2026-09-01T12:00:30.000Z"),
  });
}
