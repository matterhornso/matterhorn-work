/**
 * Bittensor read tools.
 *
 * V1 is intentionally read-only plus quote-only. Matterhorn never handles
 * seed phrases or private keys; signed actions must use an external wallet.
 */

import { ApiClient } from "./api-client.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const TAO_APP_BASE_URL = "https://api.tao.app";
const CACHE_MS = 60_000;
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const FORBIDDEN_CHAT_CREDENTIAL_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;
const FORBIDDEN_CHAT_CREDENTIAL_VALUE_RE =
  /\b(seed phrase|mnemonic|private key|api secret|raw signature|signed payload|wallet export)\b\s*(?:is|=|:|=>|to sign|for signing)?\s*["'`<]?[A-Za-z0-9_+=/@:.-]{8,}/i;
const FORBIDDEN_CHAT_CREDENTIAL_COMMAND_RE =
  /\b(?:use|sign with|submit with|authenticate with|broadcast with)\b.{0,80}\b(seed phrase|mnemonic|private key|api secret|raw signature|signed payload|wallet export)\b/i;

export type BittensorProviderStatus = "ok" | "provider_unavailable";

export interface BittensorSubnetSummary {
  netuid: number;
  name: string;
  symbol: string;
  category: string;
  benefitSummary: string;
  ownerColdkey: string | null;
  ownerHotkey: string | null;
  priceTao: number | null;
  emission: number | null;
  tempo: number | null;
  updatedAt: string;
  source: string;
  block?: number | null;
  freshness?: string | null;
}

export type BittensorSubnetServiceAdapterKind =
  | "universal"
  | "inference"
  | "data_search"
  | "compute"
  | "creative_media"
  | "agent_tooling"
  | "unsupported";

export type BittensorSubnetServiceIntent =
  | "explain"
  | "metagraph"
  | "stake_guidance"
  | "wallet_guidance"
  | "service_call";

export interface BittensorSubnetServiceAdapterContract {
  version: "matterhorn.bittensor.adapter.v1";
  netuid: number;
  adapter: BittensorSubnetServiceAdapterKind;
  capabilityLevel: BittensorCapabilityManifest["capabilityLevel"];
  supportedIntents: BittensorSubnetServiceIntent[];
  endpointConfigured: boolean;
  requiredAuth: BittensorCapabilityManifest["requiredAuth"];
  costModel: BittensorCapabilityManifest["costModel"];
  timeoutMs: number | null;
  requestSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  privacy: {
    sendsTaskText: boolean;
    sendsSs58Address: boolean;
    sendsWalletData: false;
    sendsKeyMaterial: false;
  };
  safetyNotes: string[];
  unsupportedBehavior: {
    status: "explain_and_monitor_only" | "adapter_missing" | "unsupported";
    message: string;
    fallbackIntents: BittensorSubnetServiceIntent[];
  };
}

export interface BittensorSubnetServiceAdapterContractValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export type BittensorSubnetServiceAdapterContractRuntimeSummary = Pick<
  BittensorSubnetServiceAdapterContract,
  "version" | "supportedIntents" | "endpointConfigured" | "requiredAuth" | "costModel" | "privacy" | "unsupportedBehavior"
>;

export interface BittensorSubnetServiceAdapterContractTestCase {
  name: string;
  contract: BittensorSubnetServiceAdapterContract;
  expectedOk?: boolean;
  expectedServiceCallReady?: boolean;
  expectedUnsupportedStatus?: BittensorSubnetServiceAdapterContract["unsupportedBehavior"]["status"];
}

export interface BittensorSubnetServiceAdapterContractTestResult {
  name: string;
  passed: boolean;
  expectedOk: boolean;
  actualOk: boolean;
  expectedServiceCallReady: boolean;
  serviceCallReady: boolean;
  endpointConfigured: boolean;
  supportedIntents: BittensorSubnetServiceIntent[];
  unsupportedStatus: BittensorSubnetServiceAdapterContract["unsupportedBehavior"]["status"];
  errors: string[];
  warnings: string[];
}

export interface BittensorSubnetServiceAdapterContractTestReport {
  kind: "subnet_adapter_contract_test_report";
  total: number;
  passed: number;
  failed: number;
  results: BittensorSubnetServiceAdapterContractTestResult[];
  warnings: string[];
  updatedAt: string;
}

export interface BittensorSubnetAdapterConfigTemplate {
  kind: "bittensor_subnet_adapter_config_template";
  adapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
  name: string;
  description: string;
  recommendedFor: string[];
  config: {
    netuid: number | "<NETUID>";
    name: string;
    serviceAdapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
    endpoint: string;
    metadataEndpoint: string;
    requiredAuth: "none" | "api_key";
    costModel: "free_read" | "provider_priced" | "tao_fee";
    authEnv?: string;
    timeoutMs: number;
    safetyNotes: string[];
  };
  env: {
    adaptersJson: string;
    endpointAllowlist: string;
    credentialEnv?: string;
    credentialValue: "<set-outside-matterhorn>" | null;
  };
  requestSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  preflightSteps: string[];
  safetyNotes: string[];
}

export interface BittensorSubnetAdapterTemplateReport {
  kind: "bittensor_subnet_adapter_template_report";
  generatedAt: string;
  templates: BittensorSubnetAdapterConfigTemplate[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterCandidateProfile {
  kind: "bittensor_subnet_adapter_candidate_profile";
  id: string;
  adapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
  netuid: number | "<NETUID>";
  title: string;
  category: string;
  targetUseCases: string[];
  requiredMatterhornGates: string[];
  noExecutionCanary: {
    kind: "matterhorn.bittensor.adapter.no_execution_canary.v1";
    purpose: string;
    fixtureTask: string;
    expectedMetadata: {
      version: "matterhorn.bittensor.adapter.v1";
      serviceAdapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
      safeModeRequired: true;
      requestHashRequired: true;
      privacy: {
        sendsWalletData: false;
        sendsKeyMaterial: false;
      };
    };
    forbiddenFieldClasses: string[];
    passCriteria: string[];
  };
  operatorQuestions: string[];
  nextActions: string[];
  safetyNotes: string[];
}

export interface BittensorSubnetAdapterCandidateProfileReport {
  kind: "bittensor_subnet_adapter_candidate_profile_report";
  generatedAt: string;
  profiles: BittensorSubnetAdapterCandidateProfile[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterOnboardingGate {
  id: string;
  label: string;
  status: "pass" | "warning" | "blocked" | "not_configured";
  summary: string;
  nextAction: string;
}

export interface BittensorSubnetAdapterOnboardingPlan {
  kind: "bittensor_subnet_adapter_onboarding_plan";
  generatedAt: string;
  status: "ready_for_preview_review" | "needs_configuration" | "needs_conformance" | "blocked";
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  candidateProfiles: BittensorSubnetAdapterCandidateProfileReport;
  templates: BittensorSubnetAdapterTemplateReport;
  doctor: BittensorSubnetAdapterDoctorReport;
  conformance: BittensorSubnetAdapterConformanceReport;
  gates: BittensorSubnetAdapterOnboardingGate[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterLaunchGateRequirement {
  id: string;
  label: string;
  status: "pass" | "manual_review" | "blocked" | "not_configured";
  detail: string;
  nextAction: string;
}

export interface BittensorSubnetAdapterLaunchGateReport {
  kind: "bittensor_subnet_adapter_launch_gate";
  checkedAt: string;
  status: "blocked" | "mock_ready" | "manual_review_required";
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  onboarding: BittensorSubnetAdapterOnboardingPlan;
  readyMockCount: number;
  readyRealCount: number;
  blockedCount: number;
  requirements: BittensorSubnetAdapterLaunchGateRequirement[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterCanaryReviewItem {
  id: string;
  label: string;
  required: boolean;
  evidence: string;
  blockerIfMissing: boolean;
}

export interface BittensorSubnetAdapterCanaryReviewChecklist {
  kind: "bittensor_subnet_adapter_canary_review";
  generatedAt: string;
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  candidateProfile: BittensorSubnetAdapterCandidateProfile | null;
  fixtureTask: string | null;
  reviewItems: BittensorSubnetAdapterCanaryReviewItem[];
  stopConditions: string[];
  allowedNextActions: string[];
  warnings: string[];
}

export interface BittensorSubnetAdapterEvidenceBundle {
  kind: "bittensor_subnet_adapter_evidence_bundle";
  generatedAt: string;
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  onboarding: BittensorSubnetAdapterOnboardingPlan;
  launchGate: BittensorSubnetAdapterLaunchGateReport;
  preflight: BittensorSubnetAdapterPreflightPacket;
  canaryReview: BittensorSubnetAdapterCanaryReviewChecklist;
  requiredArtifacts: Array<{
    id: string;
    label: string;
    source: "onboarding" | "launch_gate" | "preflight" | "canary_review" | "operator";
    requiredBeforeRealCanary: boolean;
  }>;
  exportWarnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterEvidenceExport {
  kind: "bittensor_subnet_adapter_evidence_export";
  generatedAt: string;
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  summary: {
    onboardingStatus: BittensorSubnetAdapterOnboardingPlan["status"];
    launchGateStatus: BittensorSubnetAdapterLaunchGateReport["status"];
    preflightStatus: BittensorSubnetAdapterPreflightPacket["status"];
    readyForConformance: boolean;
    readyForCanaryEvidence: boolean;
    requiredArtifactCount: number;
    warningCount: number;
    nextActionCount: number;
  };
  markdown: string;
  warnings: string[];
}

export interface BittensorSubnetAdapterEvidenceReviewDecision {
  kind: "bittensor_subnet_adapter_evidence_review";
  generatedAt: string;
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  status: "blocked" | "mock_dry_run_ready" | "manual_real_canary_review_required";
  summary: string;
  requiredArtifactCount: number;
  missingRequiredArtifactCount: number;
  launchGateStatus: BittensorSubnetAdapterLaunchGateReport["status"];
  onboardingStatus: BittensorSubnetAdapterOnboardingPlan["status"];
  allowedNextActions: string[];
  blockedReasons: string[];
  warnings: string[];
  nextPrompt: string;
}

export interface BittensorSubnetDetail extends BittensorSubnetSummary {
  metagraphSummary: {
    neurons: number | null;
    totalStake: number | null;
    block: number | null;
  };
  topValidators: Array<{
    uid: number | null;
    hotkey: string | null;
    coldkey: string | null;
    stake: number | null;
    trust: number | null;
    dividends: number | null;
  }>;
  knownUseCases: string[];
  risks: string[];
  links: Array<{ label: string; url: string }>;
}

export interface BittensorStakePosition {
  netuid: number;
  subnetName: string;
  validatorHotkey: string | null;
  alphaAmount: number | null;
  taoValue: number | null;
  slippageRisk: "unknown" | "low" | "medium" | "high";
}

export interface BittensorWalletSnapshot {
  ss58Address: string;
  taoBalance: number | null;
  stakePositions: BittensorStakePosition[];
  estimatedValueTao: number | null;
  providerStatus: BittensorProviderStatus;
  updatedAt: string;
  message?: string;
  source?: string;
  block?: number | null;
  freshness?: string | null;
  warnings?: string[];
}

export interface BittensorActionQuote {
  action: "stake" | "unstake" | "transfer" | "compare";
  netuid: number | null;
  amountTao: number | null;
  priceTao?: number | null;
  idealAlpha?: number | null;
  expectedAlpha: number | null;
  feeTao: number | null;
  slippageBps: number | null;
  rateTolerance?: number | null;
  source?: string;
  block?: number | null;
  freshness?: string | null;
  warnings: string[];
  requiresExternalSignature: true;
}

export interface BittensorProvider {
  listSubnets(): Promise<BittensorSubnetSummary[]>;
  getSubnet(netuid: number): Promise<BittensorSubnetDetail>;
  getWallet(ss58Address: string): Promise<BittensorWalletSnapshot>;
  quoteAction(input: BittensorActionQuoteInput): Promise<BittensorActionQuote>;
}

export type BittensorActionQuoteInput = {
  action: "stake" | "unstake" | "transfer" | "compare";
  netuid?: number | null;
  amountTao?: number | string | null;
  validatorHotkey?: string | null;
  recipient?: string | null;
};

export type BittensorChatIntent =
  | "learn"
  | "discover"
  | "wallet"
  | "stake_plan"
  | "subnet_use"
  | "monitor";

export interface BittensorPlan {
  intent: BittensorChatIntent;
  confidence: number;
  summary: string;
  userGoal: string;
  netuids: number[];
  ss58Address: string | null;
  steps: string[];
  suggestedToolNames: string[];
  safetyNotes: string[];
  responseCards: Array<
    | "subnet_comparison"
    | "wallet_snapshot"
    | "validator_selection"
    | "staking_quote"
    | "signed_action_review"
    | "subnet_result"
    | "watchlist"
    | "intelligence_report"
    | "readiness_report"
    | "adapter_marketplace"
    | "adapter_roadmap"
    | "adapter_operator_handoff"
    | "adapter_canary_outcome_report"
    | "adapter_canary_gate"
    | "adapter_provider_registry"
  >;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
}

export interface BittensorCapabilityManifest {
  netuid: number;
  name: string;
  category: string;
  utilitySummary: string;
  capabilityLevel: "universal_read" | "adapter_ready" | "adapter_required" | "unsupported";
  userBenefits: string[];
  examplePrompts: string[];
  supportedChatIntents: BittensorChatIntent[];
  serviceAdapter: BittensorSubnetServiceAdapterKind;
  requiredAuth: "none" | "api_key" | "external_wallet" | "unknown";
  costModel: "free_read" | "tao_fee" | "provider_priced" | "unknown";
  requestSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  adapterContract: BittensorSubnetServiceAdapterContract;
  dataFreshness: {
    source: string;
    block: number | null;
    freshness: string | null;
    updatedAt: string;
    liveReadReady: boolean;
  };
  adapterStatus: {
    configured: boolean;
    adapter: BittensorCapabilityManifest["serviceAdapter"];
    message: string;
    requiredAuth: BittensorCapabilityManifest["requiredAuth"];
    costModel: BittensorCapabilityManifest["costModel"];
  };
  safetyNotes: string[];
}

export type BittensorSubnetAdapterMarketplaceEntryStatus =
  | "universal_only"
  | "needs_adapter"
  | "mock_ready"
  | "manual_review_required"
  | "blocked"
  | "unsupported";

export interface BittensorSubnetAdapterMarketplaceEntry {
  netuid: number;
  name: string;
  category: string;
  utilitySummary: string;
  serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
  capabilityLevel: BittensorCapabilityManifest["capabilityLevel"];
  status: BittensorSubnetAdapterMarketplaceEntryStatus;
  configured: boolean;
  serviceCallReady: boolean;
  endpointMode: BittensorSubnetAdapterDoctorEndpoint["mode"] | "none";
  requiredAuth: BittensorCapabilityManifest["requiredAuth"];
  costModel: BittensorCapabilityManifest["costModel"];
  source: string;
  freshness: string | null;
  block: number | null;
  adapterMessage: string;
  nextActions: string[];
  warnings: string[];
  examplePrompts: string[];
}

export interface BittensorSubnetAdapterMarketplace {
  kind: "bittensor_subnet_adapter_marketplace";
  generatedAt: string;
  status: "pass" | "warning" | "fail";
  total: number;
  summary: {
    universalOnly: number;
    needsAdapter: number;
    mockReady: number;
    manualReviewRequired: number;
    blocked: number;
    unsupported: number;
  };
  entries: BittensorSubnetAdapterMarketplaceEntry[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterMarketplaceExport {
  kind: "bittensor_subnet_adapter_marketplace_export";
  generatedAt: string;
  status: BittensorSubnetAdapterMarketplace["status"];
  summary: BittensorSubnetAdapterMarketplace["summary"] & {
    total: number;
    warningCount: number;
  };
  markdown: string;
  warnings: string[];
}

export interface BittensorSubnetAdapterRoadmapRecommendation {
  serviceAdapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
  priority: "high" | "medium" | "low";
  candidateNetuids: number[];
  statusCounts: Record<BittensorSubnetAdapterMarketplaceEntryStatus, number>;
  rationale: string;
  nextPrompt: string;
  warnings: string[];
}

export interface BittensorSubnetAdapterRoadmap {
  kind: "bittensor_subnet_adapter_roadmap";
  generatedAt: string;
  goal: string | null;
  status: "pass" | "warning";
  marketplaceSummary: BittensorSubnetAdapterMarketplace["summary"] & { total: number };
  recommendations: BittensorSubnetAdapterRoadmapRecommendation[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterRoadmapExport {
  kind: "bittensor_subnet_adapter_roadmap_export";
  generatedAt: string;
  status: BittensorSubnetAdapterRoadmap["status"];
  goal: string | null;
  summary: {
    recommendationCount: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    warningCount: number;
  };
  markdown: string;
  warnings: string[];
}

export interface BittensorSignerStatus {
  mode: "read_only" | "injected_substrate" | "desktop_handoff" | "sidecar";
  available: boolean;
  canSign: boolean;
  canSubmit: boolean;
  network: "finney" | "test" | "local";
  address: string | null;
  message: string;
}

export type BittensorExtrinsicAction =
  | "stake"
  | "unstake"
  | "move_stake"
  | "transfer"
  | "set_child_hotkey"
  | "register"
  | "serve";

export interface BittensorExtrinsicPreview {
  action: BittensorExtrinsicAction;
  network: "finney" | "test" | "local";
  netuid: number | null;
  amountTao: number | null;
  coldkey: string | null;
  hotkey: string | null;
  destination: string | null;
  feeTao: number | null;
  slippageBps: number | null;
  expectedAlpha: number | null;
  unsignedPayload: Record<string, unknown>;
  signer: BittensorSignerStatus;
  warnings: string[];
  consequenceSummary: string;
  requiresExternalSignature: true;
}

export interface BittensorSignedResult {
  status: "submitted" | "sidecar_unavailable" | "rejected" | "invalid_signature";
  txHash: string | null;
  blockHash: string | null;
  message: string;
  explorerUrl: string | null;
}

export interface BittensorSigningHandoff {
  id: string;
  action: BittensorExtrinsicAction;
  network: BittensorSignerStatus["network"];
  netuid: number | null;
  payload: Record<string, unknown>;
  payloadJson: string;
  payloadSha256: string;
  suggestedFilename: string;
  signerMode: BittensorSignerStatus["mode"];
  createdAt: string;
  expiresAt: string;
  instructions: string[];
  warnings: string[];
  consequenceSummary: string;
}

export type BittensorSigningReceiptStatus =
  | "awaiting_signature"
  | "signed_payload_received"
  | BittensorSignedResult["status"];

export interface BittensorSigningReceipt {
  id: string;
  handoffId: string | null;
  action: BittensorExtrinsicAction;
  network: BittensorSignerStatus["network"];
  netuid: number | null;
  payloadSha256: string;
  signatureSha256: string | null;
  signerMode: BittensorSignerStatus["mode"];
  signerAddress: string | null;
  status: BittensorSigningReceiptStatus;
  txHash: string | null;
  blockHash: string | null;
  explorerUrl: string | null;
  message: string;
  consequenceSummary: string;
  warnings: string[];
  nextActions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BittensorSigningSafetyCheck {
  label: string;
  status: "pass" | "warning" | "fail";
  summary: string;
}

export interface BittensorSigningSafetyChecklist {
  kind: "signing_safety_checklist";
  status: "pass" | "warning" | "fail";
  previewAction: BittensorExtrinsicAction;
  network: BittensorSignerStatus["network"];
  checks: BittensorSigningSafetyCheck[];
  warnings: string[];
  nextActions: string[];
  consequenceSummary: string;
}

export interface BittensorSubnetInvocation {
  netuid: number;
  intent: "explain" | "metagraph" | "stake_guidance" | "wallet_guidance" | "service_call";
  adapter: BittensorCapabilityManifest["serviceAdapter"];
  supported: boolean;
  result: Record<string, unknown>;
  message: string;
  warnings: string[];
  adapterContract?: BittensorSubnetServiceAdapterContractRuntimeSummary;
  contractValidation?: BittensorSubnetServiceAdapterContractValidation;
}

export interface BittensorSubnetInvocationPreview {
  netuid: number;
  subnetName: string;
  intent: BittensorSubnetInvocation["intent"];
  adapter: BittensorCapabilityManifest["serviceAdapter"];
  supported: boolean;
  configured: boolean;
  requiredAuth: BittensorCapabilityManifest["requiredAuth"];
  costModel: BittensorCapabilityManifest["costModel"];
  request: {
    netuid: number;
    intent: BittensorSubnetInvocation["intent"];
    task: string | null;
    ss58Address: string | null;
  };
  requestJson: string;
  requestSha256: string;
  confirmationPrompt: string;
  requestSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  adapterContract: BittensorSubnetServiceAdapterContractRuntimeSummary;
  contractValidation: BittensorSubnetServiceAdapterContractValidation;
  safetyNotes: string[];
  warnings: string[];
  consequenceSummary: string;
  requiresConfirmation: true;
}

export interface BittensorValidatorCandidate {
  netuid: number;
  subnetName: string;
  uid: number | null;
  hotkey: string | null;
  coldkey: string | null;
  stake: number | null;
  trust: number | null;
  dividends: number | null;
  score: number;
  reasons: string[];
  warnings: string[];
  source: string;
}

export interface BittensorValidatorComparison {
  netuid: number;
  subnetName: string;
  strategy: "balanced" | "yield" | "safety";
  candidates: BittensorValidatorCandidate[];
  warnings: string[];
  source: string;
  updatedAt: string;
}

export type BittensorRiskLevel = "unknown" | "low" | "medium" | "high";

export interface BittensorIntelligenceSignal {
  label: string;
  value: string;
  tone: "default" | "good" | "warning" | "danger" | "muted";
  explanation: string;
}

export interface BittensorCopilotAction {
  label: string;
  prompt: string;
  reason: string;
  riskLevel: BittensorRiskLevel;
}

export interface BittensorWatchSuggestion {
  kind: BittensorWatch["kind"];
  label: string;
  netuid: number | null;
  ss58Address: string | null;
  validatorHotkey?: string | null;
  threshold: number | null;
  reason: string;
}

export interface BittensorValidatorExposureInsight {
  validatorHotkey: string;
  taoValue: number | null;
  subnetCount: number;
  netuids: number[];
  share: number | null;
  risk: BittensorRiskLevel;
  prompt: string;
}

export interface BittensorValidatorIntelligenceReport {
  kind: "validator";
  netuid: number;
  subnetName: string;
  validatorHotkey: string;
  coldkey: string | null;
  uid: number | null;
  score: number;
  stake: number | null;
  trust: number | null;
  dividends: number | null;
  source: string;
  foundInSample: boolean;
  risk: BittensorRiskLevel;
  signals: BittensorIntelligenceSignal[];
  warnings: string[];
  nextQuestions: string[];
  copilotActions: BittensorCopilotAction[];
  watchSuggestions: BittensorWatchSuggestion[];
  updatedAt: string;
}

export interface BittensorStakingPlanStep {
  netuid: number;
  subnetName: string;
  validatorHotkey: string | null;
  amountTao: number;
  strategy: BittensorValidatorComparison["strategy"];
  expectedAlpha: number | null;
  slippageBps: number | null;
  source: string;
  warnings: string[];
  rationale: string;
}

export interface BittensorStakingPlan {
  kind: "staking_plan";
  goal: string;
  totalAmountTao: number;
  strategy: BittensorValidatorComparison["strategy"];
  steps: BittensorStakingPlanStep[];
  unsignedPreviews: BittensorExtrinsicPreview[];
  assumptions: string[];
  warnings: string[];
  nextQuestions: string[];
  copilotActions: BittensorCopilotAction[];
  watchSuggestions: BittensorWatchSuggestion[];
  updatedAt: string;
}

export interface BittensorSubnetIntelligenceReport {
  kind: "subnet";
  netuid: number;
  name: string;
  category: string;
  score: number;
  rating: "limited_provider_context" | "usable_with_caveats" | "strong_public_context";
  mechanismSummary: {
    available: boolean;
    count: number | null;
    note: string;
  };
  market: {
    priceTao: number | null;
    emission: number | null;
    tempo: number | null;
    source: string;
    block: number | null;
    freshness: string | null;
  };
  metagraph: {
    neurons: number | null;
    totalStake: number | null;
    validatorsSampled: number;
    topValidatorStakeShare: number | null;
    concentrationRisk: BittensorRiskLevel;
    dataQuality: BittensorRiskLevel;
  };
  capability: Pick<BittensorCapabilityManifest, "capabilityLevel" | "serviceAdapter" | "adapterStatus" | "userBenefits">;
  signals: BittensorIntelligenceSignal[];
  warnings: string[];
  nextQuestions: string[];
  copilotActions: BittensorCopilotAction[];
  watchSuggestions: BittensorWatchSuggestion[];
  updatedAt: string;
}

export interface BittensorWalletIntelligenceReport {
  kind: "wallet";
  ss58Address: string;
  freeTao: number | null;
  stakeTotalTao: number | null;
  estimatedValueTao: number | null;
  subnetCount: number;
  validatorCount: number;
  largestPositionShare: number | null;
  concentrationRisk: BittensorRiskLevel;
  slippageRisk: BittensorRiskLevel;
  staleDataRisk: BittensorRiskLevel;
  largestPositions: BittensorStakePosition[];
  validatorExposure: BittensorValidatorExposureInsight[];
  signals: BittensorIntelligenceSignal[];
  warnings: string[];
  nextQuestions: string[];
  copilotActions: BittensorCopilotAction[];
  watchSuggestions: BittensorWatchSuggestion[];
  source: string;
  block: number | null;
  freshness: string | null;
  updatedAt: string;
}

export interface BittensorWalletChangeReport {
  kind: "wallet_change";
  ss58Address: string;
  baselineAvailable: boolean;
  previousUpdatedAt: string | null;
  currentUpdatedAt: string;
  freeTaoDelta: number | null;
  stakeTotalDelta: number | null;
  estimatedValueDelta: number | null;
  positionCountDelta: number;
  addedNetuids: number[];
  removedNetuids: number[];
  addedValidators: string[];
  removedValidators: string[];
  changedPositions: Array<{
    netuid: number;
    subnetName: string;
    validatorHotkey: string | null;
    previousTaoValue: number | null;
    currentTaoValue: number | null;
    deltaTao: number | null;
  }>;
  riskChanges: string[];
  summary: string;
  warnings: string[];
  source: string;
  block: number | null;
  freshness: string | null;
  updatedAt: string;
}

export interface BittensorWalletBaselineClearReport {
  kind: "wallet_baseline_clear";
  ss58Address: string;
  cleared: boolean;
  previousUpdatedAt: string | null;
  persistentSnapshotsCleared: number;
  updatedAt: string;
  summary: string;
  warnings: string[];
}

export interface BittensorWalletTimelineSnapshot {
  kind: "wallet_timeline_snapshot";
  version: "matterhorn.bittensor.wallet_timeline.v1";
  ss58Address: string;
  capturedAt: string;
  walletUpdatedAt: string;
  taoBalance: number | null;
  stakeTotalTao: number | null;
  estimatedValueTao: number | null;
  positionCount: number;
  positions: BittensorStakePosition[];
  providerStatus: BittensorProviderStatus;
  source: string;
  block: number | null;
  freshness: string | null;
  warnings: string[];
  contentSha256: string;
}

export interface BittensorWalletTimelineValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface BittensorWalletTimelineStoreStatus {
  kind: "wallet_timeline_store_status";
  enabled: boolean;
  path: string | null;
  walletCount: number;
  snapshotCount: number;
  retentionLimit: number;
  warnings: string[];
  updatedAt: string;
}

export interface BittensorWalletTimelineExport {
  kind: "wallet_timeline_export";
  generatedAt: string;
  ss58Address: string | null;
  status: BittensorWalletTimelineStoreStatus;
  snapshots: BittensorWalletTimelineSnapshot[];
  warnings: string[];
}

export interface BittensorDecisionOption {
  label: string;
  summary: string;
  prompt: string;
  priority: "now" | "next" | "later";
  riskLevel: BittensorRiskLevel;
  rationale: string;
  requiresExternalSignature: boolean;
}

export interface BittensorDecisionBrief {
  kind: "decision_brief";
  focus: "wallet" | "subnet" | "general";
  title: string;
  summary: string;
  score: number;
  risk: BittensorRiskLevel;
  source: string;
  warnings: string[];
  assumptions: string[];
  signals: BittensorIntelligenceSignal[];
  options: BittensorDecisionOption[];
  watchSuggestions: BittensorWatchSuggestion[];
  updatedAt: string;
  related: Record<string, unknown>;
}

export interface BittensorWatchPolicyRule {
  label: string;
  kind: BittensorWatch["kind"];
  trigger: string;
  threshold: number | null;
  reason: string;
  actionPrompt: string;
  riskLevel: BittensorRiskLevel;
  watch: Partial<BittensorWatch>;
}

export interface BittensorWatchPolicyPreset {
  kind: "watch_policy";
  scope: "wallet" | "validator" | "subnet" | "general";
  label: string;
  summary: string;
  priority: "now" | "next" | "later";
  source: string;
  rules: BittensorWatchPolicyRule[];
  copilotActions: BittensorCopilotAction[];
  warnings: string[];
  updatedAt: string;
  related: Record<string, unknown>;
}

export type BittensorWatch = {
  id: string;
  ownerScope?: string;
  kind: "subnet" | "wallet" | "validator" | "emissions" | "slippage";
  label: string;
  netuid: number | null;
  ss58Address: string | null;
  validatorHotkey: string | null;
  threshold: number | null;
  reason: string | null;
  lastAlertAt: string | null;
  createdAt: string;
};

export interface BittensorWatchEvaluation {
  watch: BittensorWatch;
  status: "ok" | "warning" | "unavailable";
  summary: string;
  observedValue: number | string | null;
  threshold: number | null;
  alertLevel?: BittensorRiskLevel;
  actionPrompt?: string | null;
  copilotActions?: BittensorCopilotAction[];
  alertKey?: string;
  shouldNotify?: boolean;
  notificationIntent?: "none" | "review_wallet" | "review_validator" | "review_subnet" | "review_emissions" | "review_slippage";
  source: string;
  checkedAt: string;
}

export interface BittensorReadinessCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  summary: string;
  details?: Record<string, unknown>;
}

export interface BittensorReadinessReport {
  status: "pass" | "warning" | "fail";
  checkedAt: string;
  checks: BittensorReadinessCheck[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorReadinessOperatorReport {
  kind: "readiness_operator_report";
  status: BittensorReadinessReport["status"];
  checkedAt: string;
  liveChecks: BittensorReadinessCheck[];
  fallbackChecks: BittensorReadinessCheck[];
  blockedChecks: BittensorReadinessCheck[];
  operatorSummary: string;
  operatorPrompts: BittensorCopilotAction[];
  warnings: string[];
  blockers: string[];
  source: "readiness_audit";
  related: { report: BittensorReadinessReport };
}

export type BittensorChatCardKind =
  | "subnet_comparison"
  | "wallet_snapshot"
  | "validator_selection"
  | "staking_quote"
  | "signed_action_review"
  | "subnet_result"
  | "watchlist"
  | "signer_status"
  | "signing_handoff"
  | "unsupported_adapter"
  | "readiness_report"
  | "adapter_onboarding"
  | "adapter_launch_gate"
  | "adapter_evidence_bundle"
  | "adapter_evidence_review"
  | "adapter_operator_handoff"
  | "adapter_marketplace"
  | "adapter_roadmap"
  | "adapter_approval_audit"
  | "adapter_approval_template"
  | "adapter_canary_packet"
  | "adapter_canary_outcome_report"
  | "adapter_canary_gate"
  | "adapter_provider_registry"
  | "adapter_manifest_validation"
  | "adapter_result_validation"
  | "customer_guidance"
  | "intelligence_report";

export interface BittensorChatCardItem {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning" | "danger" | "muted";
}

export interface BittensorChatCardAction {
  label: string;
  kind: "copy_payload" | "open_url" | "sign_externally" | "send_to_chat";
  href?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface BittensorChatCard {
  kind: BittensorChatCardKind;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  tone?: "default" | "good" | "warning" | "danger";
  items: BittensorChatCardItem[];
  actions?: BittensorChatCardAction[];
  warnings?: string[];
  data?: Record<string, unknown>;
}

export type BittensorChatExecutionStatus =
  | "answered"
  | "clarification_required"
  | "unsigned_preview"
  | "unsupported";

export type BittensorChatContext = {
  id: string;
  ss58Address: string | null;
  netuid: number | null;
  amountTao: string | null;
  validatorHotkey: string | null;
  coldkey: string | null;
  recipient: string | null;
  destination: string | null;
  lastIntent: BittensorChatIntent | null;
  lastExecution: BittensorChatExecutionStatus | null;
  updatedAt: string;
  warnings: string[];
};

export type BittensorChatExecutionInput = {
  message: string;
  contextId?: string | null;
  context?: Partial<BittensorChatContext> | null;
  ss58Address?: string | null;
  netuid?: number | null;
  amountTao?: number | string | null;
  validatorHotkey?: string | null;
  coldkey?: string | null;
  recipient?: string | null;
  destination?: string | null;
  limit?: number | null;
  strategy?: BittensorValidatorComparison["strategy"] | null;
  rateTolerance?: number | null;
};

export type BittensorChatExecutionResult = {
  plan: BittensorPlan;
  responseText: string;
  cards: BittensorChatCard[];
  data: Record<string, unknown>;
  warnings: string[];
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  execution: BittensorChatExecutionStatus;
  context?: BittensorChatContext | null;
};

export type BittensorExtrinsicPrepareInput = {
  action: BittensorExtrinsicAction;
  netuid?: number | null;
  amountTao?: number | string | null;
  coldkey?: string | null;
  hotkey?: string | null;
  destination?: string | null;
  originNetuid?: number | null;
  destinationNetuid?: number | null;
  rateTolerance?: number | null;
};

export type BittensorSignedSubmitInput = {
  preview: BittensorExtrinsicPreview;
  signature?: string | null;
  signerAddress?: string | null;
};

export type BittensorSubnetInvokeInput = {
  intent?: BittensorSubnetInvocation["intent"];
  task?: string | null;
  ss58Address?: string | null;
  reviewedRequestSha256?: string | null;
};

export type BittensorValidatorCompareInput = {
  netuid: number;
  hotkeys?: string[] | null;
  limit?: number | null;
  strategy?: BittensorValidatorComparison["strategy"] | null;
};

export interface BittensorSubtensorSidecarStatus {
  configured: boolean;
  network: "finney" | "test" | "local";
  canRead: boolean;
  canPrepare: boolean;
  canSubmit: boolean;
  message: string;
}

export interface BittensorSubtensorSidecarHealth extends BittensorSubtensorSidecarStatus {
  reachable: boolean;
  status: "healthy" | "unreachable" | "unconfigured";
  latencyMs: number | null;
  checkedAt: string;
}

export interface BittensorConfiguredSubnetAdapter {
  netuid: number;
  name: string;
  serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
  endpoint: string;
  metadataEndpoint?: string | null;
  requiredAuth: BittensorCapabilityManifest["requiredAuth"];
  costModel: BittensorCapabilityManifest["costModel"];
  timeoutMs: number;
  authEnv?: string | null;
  safetyNotes: string[];
}

export type BittensorSubnetAdapterDoctorEntryStatus = "ready" | "warning" | "blocked";

export interface BittensorSubnetAdapterDoctorEndpoint {
  configured: boolean;
  mode: "mock" | "https" | "http" | "invalid" | "missing";
  origin: string | null;
  host: string | null;
  allowed: boolean;
  reason: string;
}

export interface BittensorSubnetAdapterDoctorAuth {
  required: BittensorCapabilityManifest["requiredAuth"];
  envConfigured: boolean;
  credentialPresent: boolean | null;
  message: string;
}

export interface BittensorSubnetAdapterDoctorEntry {
  index: number;
  status: BittensorSubnetAdapterDoctorEntryStatus;
  netuid: number | null;
  name: string;
  serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
  requiredAuth: BittensorCapabilityManifest["requiredAuth"];
  costModel: BittensorCapabilityManifest["costModel"];
  timeoutMs: number | null;
  endpoint: BittensorSubnetAdapterDoctorEndpoint;
  auth: BittensorSubnetAdapterDoctorAuth;
  contractValidation: BittensorSubnetServiceAdapterContractValidation;
  serviceCallReady: boolean;
  errors: string[];
  warnings: string[];
  safetyNotes: string[];
}

export interface BittensorSubnetAdapterDoctorReport {
  kind: "bittensor_subnet_adapter_doctor";
  status: "pass" | "warning" | "fail";
  checkedAt: string;
  rawConfigured: boolean;
  rawEntryCount: number;
  readyCount: number;
  warningCount: number;
  blockedCount: number;
  entries: BittensorSubnetAdapterDoctorEntry[];
  errors: string[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterDryRunCase {
  name: string;
  netuid: number;
  adapter: BittensorCapabilityManifest["serviceAdapter"];
  mode: BittensorSubnetAdapterDoctorEndpoint["mode"];
  status: "pass" | "fail" | "skipped";
  requestSha256: string | null;
  previewSupported: boolean;
  missingHashRejected: boolean;
  mismatchedHashRejected: boolean;
  invocationSupported: boolean;
  redactionPassed: boolean;
  errors: string[];
  warnings: string[];
}

export interface BittensorSubnetAdapterDryRunReport {
  kind: "bittensor_subnet_adapter_dry_run";
  status: "pass" | "warning" | "fail";
  checkedAt: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cases: BittensorSubnetAdapterDryRunCase[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterDryRunExport {
  kind: "bittensor_subnet_adapter_dry_run_export";
  generatedAt: string;
  status: BittensorSubnetAdapterDryRunReport["status"];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    warningCount: number;
  };
  markdown: string;
  warnings: string[];
}

export interface BittensorSubnetAdapterConformanceCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  summary: string;
}

export interface BittensorSubnetAdapterConformanceCase {
  name: string;
  netuid: number;
  adapter: BittensorCapabilityManifest["serviceAdapter"];
  mode: BittensorSubnetAdapterDoctorEndpoint["mode"];
  status: "pass" | "warning" | "fail" | "skipped";
  metadataEndpoint: BittensorSubnetAdapterDoctorEndpoint;
  metadata: {
    version: string | null;
    netuid: number | null;
    serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
    supportedIntents: string[];
    safeModeRequired: boolean | null;
    requestHashRequired: boolean | null;
    maxResponseBytes: number | null;
    healthStatus: string | null;
  } | null;
  checks: BittensorSubnetAdapterConformanceCheck[];
  errors: string[];
  warnings: string[];
}

export interface BittensorSubnetAdapterConformanceReport {
  kind: "bittensor_subnet_adapter_conformance";
  status: "pass" | "warning" | "fail";
  checkedAt: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  cases: BittensorSubnetAdapterConformanceCase[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterConformanceExport {
  kind: "bittensor_subnet_adapter_conformance_export";
  generatedAt: string;
  status: BittensorSubnetAdapterConformanceReport["status"];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    warningCount: number;
  };
  markdown: string;
  warnings: string[];
}

export interface BittensorSubnetAdapterOperatorHandoff {
  kind: "bittensor_subnet_adapter_operator_handoff";
  generatedAt: string;
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  status: "blocked" | "mock_rehearsal_ready" | "manual_review_required";
  evidenceReview: BittensorSubnetAdapterEvidenceReviewDecision;
  evidenceExport: BittensorSubnetAdapterEvidenceExport;
  conformanceExport: BittensorSubnetAdapterConformanceExport;
  dryRunExport: BittensorSubnetAdapterDryRunExport;
  providerRegistry: BittensorSubnetAdapterProviderRegistryReference;
  markdown: string;
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterRunResult {
  ok: boolean;
  mode: "mock" | "http";
  adapterKind: BittensorCapabilityManifest["serviceAdapter"];
  netuid: number;
  requestSha256: string;
  message: string;
  output: Record<string, unknown> | null;
  warnings: string[];
  usage: {
    units: number | null;
    label: string | null;
  } | null;
  costEstimate: {
    amount: number | null;
    currency: string | null;
    model: BittensorCapabilityManifest["costModel"];
  } | null;
  status?: number;
}

export interface BittensorSubnetAdapterRuntimeApproval {
  netuid: number;
  serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
  requestSha256: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string | null;
  reason: string | null;
}

export interface BittensorSubnetAdapterRuntimeApprovalAuditEntry {
  netuid: number;
  serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
  requestSha256Prefix: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string | null;
  expired: boolean;
  reason: string | null;
}

export interface BittensorSubnetAdapterRuntimeApprovalAudit {
  kind: "bittensor_subnet_adapter_runtime_approval_audit";
  checkedAt: string;
  status: "pass" | "warning";
  configured: boolean;
  activeCount: number;
  expiredCount: number;
  invalidCount: number;
  entries: BittensorSubnetAdapterRuntimeApprovalAuditEntry[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterRuntimeApprovalTemplate {
  kind: "bittensor_subnet_adapter_runtime_approval_template";
  generatedAt: string;
  approval: BittensorSubnetAdapterRuntimeApproval;
  env: {
    key: "BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON";
    value: string;
  };
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterCanaryOperatorPacket {
  kind: "bittensor_subnet_adapter_canary_operator_packet";
  generatedAt: string;
  requested: {
    adapter: string | null;
    netuid: number | null;
  };
  status: "blocked" | "needs_preview_hash" | "approval_template_ready";
  previewRequestSha256Prefix: string | null;
  evidenceExport: BittensorSubnetAdapterEvidenceExport;
  evidenceReview: BittensorSubnetAdapterEvidenceReviewDecision;
  approvalTemplate: BittensorSubnetAdapterRuntimeApprovalTemplate | null;
  providerRegistry: BittensorSubnetAdapterProviderRegistryReference;
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterCanaryPacketExport {
  kind: "bittensor_subnet_adapter_canary_packet_export";
  generatedAt: string;
  requested: BittensorSubnetAdapterCanaryOperatorPacket["requested"];
  status: BittensorSubnetAdapterCanaryOperatorPacket["status"];
  markdown: string;
  warnings: string[];
}

export interface BittensorSubnetAdapterCanaryOutcomeReport {
  kind: "bittensor_subnet_adapter_canary_outcome_report";
  generatedAt: string;
  requested: {
    adapter: BittensorCapabilityManifest["serviceAdapter"] | null;
    netuid: number | null;
  };
  status: "blocked" | "pass" | "warning" | "fail";
  mode: "mock" | "http" | "https" | "unknown";
  supported: boolean;
  requestHash: {
    expectedPrefix: string | null;
    actualPrefix: string | null;
    matches: boolean;
    expectedPresent: boolean;
    actualPresent: boolean;
  };
  resultValidation: BittensorSubnetAdapterResultValidation;
  canaryGate: BittensorSubnetAdapterCanaryGateAudit;
  providerRegistry: BittensorSubnetAdapterProviderRegistryReference;
  summary: {
    validationStatus: BittensorSubnetAdapterResultValidation["status"];
    canaryGateStatus: BittensorSubnetAdapterCanaryGateAudit["status"];
    matchingReviewedProviderCount: number;
    warningCount: number;
    fullHashRedacted: true;
  };
  markdown: string;
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterCanaryGateAudit {
  kind: "bittensor_subnet_adapter_canary_gate_audit";
  checkedAt: string;
  status: "safe_idle" | "preview_ready" | "canary_armed" | "blocked";
  realAdaptersEnabled: boolean;
  canaryAcknowledgementEnabled: boolean;
  endpointAllowlistCount: number;
  configuredAdapterCount: number;
  configuredRealAdapterCount: number;
  readyRealAdapterCount: number;
  activeApprovalCount: number;
  expiredApprovalCount: number;
  invalidApprovalCount: number;
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  approvalAudit: BittensorSubnetAdapterRuntimeApprovalAudit;
  doctorSummary: {
    status: BittensorSubnetAdapterDoctorReport["status"];
    readyCount: number;
    warningCount: number;
    blockedCount: number;
  };
}


export interface BittensorSubnetAdapterProviderRegistryEvidence {
  providerIdentityReviewed: boolean;
  privacyReviewed: boolean;
  termsReviewed: boolean;
  rateLimitsDocumented: boolean;
  rollbackOwnerConfirmed: boolean;
  canaryFixtureReviewed: boolean;
}

export interface BittensorSubnetAdapterProviderRegistryEntry {
  providerId: string;
  displayName: string;
  reviewStatus: "candidate" | "reviewed" | "blocked";
  serviceAdapters: Array<Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">>;
  netuids: number[];
  endpointOrigin: string | null;
  website: string | null;
  contact: string | null;
  evidence: BittensorSubnetAdapterProviderRegistryEvidence;
  readyForCanary: boolean;
  errors: string[];
  warnings: string[];
}

export interface BittensorSubnetAdapterProviderRegistryTemplate {
  kind: "bittensor_subnet_adapter_provider_registry_template";
  generatedAt: string;
  env: {
    key: "BITTENSOR_SUBNET_ADAPTER_PROVIDER_REGISTRY_JSON";
    value: string;
  };
  provider: BittensorSubnetAdapterProviderRegistryEntry;
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterProviderRegistry {
  kind: "bittensor_subnet_adapter_provider_registry";
  generatedAt: string;
  status: "empty" | "needs_review" | "ready_for_canary" | "blocked";
  configured: boolean;
  providerCount: number;
  readyForCanaryCount: number;
  blockedCount: number;
  entries: BittensorSubnetAdapterProviderRegistryEntry[];
  template: BittensorSubnetAdapterProviderRegistryTemplate;
  warnings: string[];
  nextActions: string[];
}


export interface BittensorSubnetAdapterProviderRegistryReference {
  status: BittensorSubnetAdapterProviderRegistry["status"];
  providerCount: number;
  readyForCanaryCount: number;
  matchingReadyProviderCount: number;
  matchingProviderIds: string[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterSpec {
  kind: "bittensor_subnet_adapter_spec";
  version: "matterhorn.bittensor.adapter.v1";
  generatedAt: string;
  supportedServiceAdapters: Array<Exclude<BittensorCapabilityManifest["serviceAdapter"], "universal" | "unsupported">>;
  requiredMetadata: {
    version: string;
    netuid: string;
    serviceAdapter: string;
    supportedIntents: string;
    safeModeRequired: string;
    requestHashRequired: string;
    maxResponseBytes: string;
    healthStatus: string;
    privacy: string;
  };
  invocationContract: {
    previewRequired: true;
    exactRequestHashRequired: true;
    userTaskSentOnlyOnInvoke: true;
    missingHashBehavior: "reject";
    mismatchedHashBehavior: "reject";
    defaultRealAdapterState: "disabled";
  };
  forbiddenFields: string[];
  responseLimits: {
    defaultMaxBytes: number;
    hardMaxBytes: number;
  };
  safetyNotes: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterManifestValidation {
  kind: "bittensor_subnet_adapter_manifest_validation";
  checkedAt: string;
  status: "pass" | "warning" | "fail";
  manifest: {
    version: string | null;
    name: string | null;
    netuid: number | null;
    serviceAdapter: BittensorSubnetServiceAdapterKind;
    supportedIntents: BittensorSubnetServiceIntent[];
    safeModeRequired: boolean | null;
    requestHashRequired: boolean | null;
    maxResponseBytes: number | null;
    healthStatus: string | null;
  };
  contract: BittensorSubnetServiceAdapterContract;
  contractValidation: BittensorSubnetServiceAdapterContractValidation;
  serviceCallReady: boolean;
  errors: string[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterManifestExample {
  adapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
  netuid: number;
  title: string;
  description: string;
  manifest: Record<string, unknown>;
  validation: BittensorSubnetAdapterManifestValidation;
}

export interface BittensorSubnetAdapterManifestExampleReport {
  kind: "bittensor_subnet_adapter_manifest_examples";
  generatedAt: string;
  requested: {
    adapter: string | null;
    netuid: number | null;
  };
  examples: BittensorSubnetAdapterManifestExample[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterResultValidation {
  kind: "bittensor_subnet_adapter_result_validation";
  checkedAt: string;
  status: "pass" | "warning" | "fail";
  summary: {
    mode: string | null;
    requestSha256Prefix: string | null;
    responseBytes: number;
    outputPresent: boolean;
    usagePresent: boolean;
    costPresent: boolean;
  };
  errors: string[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterPreflightPacket {
  kind: "bittensor_subnet_adapter_preflight_packet";
  checkedAt: string;
  status: "pass" | "warning" | "fail";
  manifestValidation: BittensorSubnetAdapterManifestValidation;
  resultValidation: BittensorSubnetAdapterResultValidation | null;
  readyForConformance: boolean;
  readyForCanaryEvidence: boolean;
  errors: string[];
  warnings: string[];
  nextActions: string[];
}

export interface BittensorSubnetAdapterPreflightPacketExport {
  kind: "bittensor_subnet_adapter_preflight_packet_export";
  generatedAt: string;
  status: BittensorSubnetAdapterPreflightPacket["status"];
  markdown: string;
  warnings: string[];
}

export interface BittensorSubnetDiscoveryMatch {
  subnet: BittensorSubnetSummary;
  score: number;
  reasons: string[];
}

export interface BittensorSubnetDiscoveryResult {
  goal: string;
  matches: BittensorSubnetDiscoveryMatch[];
  cards: BittensorChatCard[];
  source: string;
  warnings: string[];
}

type CacheEntry<T> = { at: number; data: T };

const cache = new Map<string, CacheEntry<unknown>>();
const watchlist = new Map<string, BittensorWatch>();
const chatContexts = new Map<string, BittensorChatContext>();
const walletSnapshotBaselines = new Map<string, { wallet: BittensorWalletSnapshot; updatedAt: string }>();
const walletTimelineSnapshots = new Map<string, BittensorWalletTimelineSnapshot[]>();
let watchlistLoadedFromDisk = false;
let walletTimelineLoadedFromDisk = false;

const FALLBACK_SUBNETS: BittensorSubnetSummary[] = [
  {
    netuid: 0,
    name: "Root Network",
    symbol: "ROOT",
    category: "Network coordination",
    benefitSummary: "Coordinates network-wide incentives and delegation context across Bittensor.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  },
  {
    netuid: 1,
    name: "Subnet 1",
    symbol: "SN1",
    category: "Intelligence market",
    benefitSummary: "A Bittensor subnet whose current utility should be verified from live metadata before acting.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  },
  {
    netuid: 14,
    name: "TAOHash",
    symbol: "SN14",
    category: "Compute and infrastructure",
    benefitSummary: "A documented subnet example useful for testing metagraph and validator views.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

function bittensorWatchlistPath(): string | null {
  if (readEnv("BITTENSOR_WATCHLIST_DISABLE_PERSISTENCE") === "1") return null;
  return readEnv("BITTENSOR_WATCHLIST_PATH") || join(homedir(), ".openwork", "openwork-server", "bittensor-watchlist.json");
}

function bittensorWalletTimelinePersistenceEnabled(): boolean {
  const enabled = readEnv("BITTENSOR_WALLET_TIMELINE_ENABLE_PERSISTENCE").toLowerCase();
  return enabled === "1" || enabled === "true" || enabled === "yes";
}

function bittensorWalletTimelinePath(): string | null {
  if (readEnv("BITTENSOR_WALLET_TIMELINE_DISABLE_PERSISTENCE") === "1") return null;
  if (!bittensorWalletTimelinePersistenceEnabled()) return null;
  return readEnv("BITTENSOR_WALLET_TIMELINE_PATH") || join(homedir(), ".matterhorn-work", "bittensor-wallet-timeline.json");
}

function bittensorWalletTimelineRetentionLimit(): number {
  const parsed = Number(readEnv("BITTENSOR_WALLET_TIMELINE_RETENTION_LIMIT"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(365, Math.max(2, Math.floor(parsed))) : 24;
}

function normalizePersistedWatch(value: unknown): BittensorWatch | null {
  const record = asRecord(value);
  const id = firstString(record, ["id"]);
  const kind = firstString(record, ["kind"]);
  if (!id || !["subnet", "wallet", "validator", "emissions", "slippage"].includes(kind ?? "")) return null;
  const netuid = firstNumber(record, ["netuid"]);
  const threshold = firstNumber(record, ["threshold"]);
  const ss58Address = firstString(record, ["ss58Address", "ss58_address"]);
  const validatorHotkey = firstString(record, ["validatorHotkey", "validator_hotkey", "hotkey"]);
  return {
    id,
    ownerScope: firstString(record, ["ownerScope", "owner_scope"]) ?? undefined,
    kind: kind as BittensorWatch["kind"],
    label: firstString(record, ["label"]) ?? "Bittensor watch",
    netuid: netuid !== null && Number.isInteger(netuid) ? netuid : null,
    ss58Address: ss58Address && isValidSs58Address(ss58Address) ? ss58Address : null,
    validatorHotkey: validatorHotkey && isValidSs58Address(validatorHotkey) ? validatorHotkey : null,
    threshold,
    reason: firstString(record, ["reason"]) ?? null,
    lastAlertAt: firstString(record, ["lastAlertAt", "last_alert_at"]) ?? null,
    createdAt: firstString(record, ["createdAt", "created_at"]) ?? nowIso(),
  };
}

function loadPersistedWatchlist(): void {
  if (watchlistLoadedFromDisk) return;
  watchlistLoadedFromDisk = true;
  const file = bittensorWatchlistPath();
  if (!file || !existsSync(file)) return;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const rows = Array.isArray(asRecord(parsed).watches) ? asRecord(parsed).watches as unknown[] : arrayFrom(parsed);
    for (const watch of rows) {
      const normalized = normalizePersistedWatch(watch);
      if (normalized) watchlist.set(normalized.id, normalized);
    }
  } catch {
    // Corrupt persistence should not break read-only Bittensor chat flows.
  }
}

function persistWatchlist(): void {
  const file = bittensorWatchlistPath();
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ watches: [...watchlist.values()] }, null, 2)}\n`, "utf8");
  } catch {
    // Persistence is best-effort; watch creation still returns the in-memory entry.
  }
}

function normalizePersistedTimelinePosition(value: unknown): BittensorStakePosition | null {
  const record = asRecord(value);
  const netuid = firstNumber(record, ["netuid"]);
  const subnetName = firstString(record, ["subnetName", "subnet_name"]);
  const validatorHotkey = firstString(record, ["validatorHotkey", "validator_hotkey", "hotkey"]);
  const slippageRisk = firstString(record, ["slippageRisk", "slippage_risk"]);
  if (netuid === null || !Number.isInteger(netuid) || netuid < 0) return null;
  return {
    netuid,
    subnetName: subnetName ?? `Subnet ${netuid}`,
    validatorHotkey: validatorHotkey && isValidSs58Address(validatorHotkey) ? validatorHotkey : null,
    alphaAmount: firstNumber(record, ["alphaAmount", "alpha_amount"]),
    taoValue: firstNumber(record, ["taoValue", "tao_value"]),
    slippageRisk: slippageRisk === "low" || slippageRisk === "medium" || slippageRisk === "high" ? slippageRisk : "unknown",
  };
}

function normalizePersistedTimelineSnapshot(value: unknown): BittensorWalletTimelineSnapshot | null {
  const record = asRecord(value);
  const ss58Address = firstString(record, ["ss58Address", "ss58_address"]);
  if (!ss58Address || !isValidSs58Address(ss58Address)) return null;
  const positions = arrayFrom(record.positions).map(normalizePersistedTimelinePosition).filter((position): position is BittensorStakePosition => Boolean(position));
  const providerStatus = firstString(record, ["providerStatus", "provider_status"]);
  const snapshot: BittensorWalletTimelineSnapshot = {
    kind: "wallet_timeline_snapshot",
    version: "matterhorn.bittensor.wallet_timeline.v1",
    ss58Address,
    capturedAt: firstString(record, ["capturedAt", "captured_at"]) ?? nowIso(),
    walletUpdatedAt: firstString(record, ["walletUpdatedAt", "wallet_updated_at", "updatedAt", "updated_at"]) ?? nowIso(),
    taoBalance: firstNumber(record, ["taoBalance", "tao_balance"]),
    stakeTotalTao: firstNumber(record, ["stakeTotalTao", "stake_total_tao"]),
    estimatedValueTao: firstNumber(record, ["estimatedValueTao", "estimated_value_tao"]),
    positionCount: firstNumber(record, ["positionCount", "position_count"]) ?? positions.length,
    positions,
    providerStatus: providerStatus === "ok" || providerStatus === "provider_unavailable" ? providerStatus : "provider_unavailable",
    source: firstString(record, ["source"]) ?? "unknown",
    block: firstNumber(record, ["block"]),
    freshness: firstString(record, ["freshness"]),
    warnings: arrayFrom(record.warnings).filter((warning): warning is string => typeof warning === "string").slice(0, 8),
    contentSha256: firstString(record, ["contentSha256", "content_sha256"]) ?? "",
  };
  return validateBittensorWalletTimelineSnapshot(snapshot).ok ? snapshot : null;
}

function loadPersistedWalletTimeline(): void {
  if (walletTimelineLoadedFromDisk) return;
  walletTimelineLoadedFromDisk = true;
  const file = bittensorWalletTimelinePath();
  if (!file || !existsSync(file)) return;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const rows = Array.isArray(asRecord(parsed).snapshots) ? asRecord(parsed).snapshots as unknown[] : arrayFrom(parsed);
    for (const row of rows) {
      const snapshot = normalizePersistedTimelineSnapshot(row);
      if (!snapshot) continue;
      const current = walletTimelineSnapshots.get(snapshot.ss58Address) ?? [];
      current.push(snapshot);
      walletTimelineSnapshots.set(snapshot.ss58Address, current.slice(-bittensorWalletTimelineRetentionLimit()));
    }
  } catch {
    // Corrupt or stale timeline persistence must not break watch-only wallet flows.
  }
}

function persistWalletTimeline(): void {
  const file = bittensorWalletTimelinePath();
  if (!file) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    const snapshots = [...walletTimelineSnapshots.values()].flat();
    writeFileSync(file, `${JSON.stringify({ version: "matterhorn.bittensor.wallet_timeline.v1", snapshots }, null, 2)}\n`, "utf8");
  } catch {
    // Timeline persistence is best-effort; wallet reads still keep an in-memory baseline.
  }
}

function timelineSnapshotPayload(snapshot: Omit<BittensorWalletTimelineSnapshot, "contentSha256">): string {
  return stableJson(snapshot);
}

export function validateBittensorWalletTimelineSnapshot(snapshot: BittensorWalletTimelineSnapshot): BittensorWalletTimelineValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (snapshot.kind !== "wallet_timeline_snapshot") errors.push("Wallet timeline snapshot has an unsupported kind.");
  if (snapshot.version !== "matterhorn.bittensor.wallet_timeline.v1") errors.push("Wallet timeline snapshot has an unsupported version.");
  if (!isValidSs58Address(snapshot.ss58Address)) errors.push("Wallet timeline snapshot must use a valid public SS58 address.");
  if (secretFieldPath(snapshot)) errors.push("Wallet timeline snapshot contains a secret-shaped field.");
  if (snapshot.positions.some((position) => position.validatorHotkey && !isValidSs58Address(position.validatorHotkey))) errors.push("Wallet timeline snapshot contains an invalid validator hotkey.");
  if (snapshot.positionCount !== snapshot.positions.length) warnings.push("Wallet timeline snapshot positionCount did not match positions length.");
  const { contentSha256: _contentSha256, ...payload } = snapshot;
  const expectedHash = createHash("sha256").update(timelineSnapshotPayload(payload)).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(snapshot.contentSha256)) errors.push("Wallet timeline snapshot must include a SHA-256 content hash.");
  if (snapshot.contentSha256 && snapshot.contentSha256 !== expectedHash) errors.push("Wallet timeline snapshot content hash did not match its public payload.");
  return { ok: errors.length === 0, errors, warnings };
}

export function buildBittensorWalletTimelineSnapshot(wallet: BittensorWalletSnapshot, capturedAt = nowIso()): BittensorWalletTimelineSnapshot {
  const positions = wallet.stakePositions
    .map((position) => ({ ...position }))
    .sort((a, b) => a.netuid - b.netuid || String(a.validatorHotkey ?? "").localeCompare(String(b.validatorHotkey ?? "")));
  const payload: Omit<BittensorWalletTimelineSnapshot, "contentSha256"> = {
    kind: "wallet_timeline_snapshot",
    version: "matterhorn.bittensor.wallet_timeline.v1",
    ss58Address: wallet.ss58Address,
    capturedAt,
    walletUpdatedAt: wallet.updatedAt,
    taoBalance: wallet.taoBalance,
    stakeTotalTao: walletStakeTotal(wallet),
    estimatedValueTao: wallet.estimatedValueTao,
    positionCount: positions.length,
    positions,
    providerStatus: wallet.providerStatus,
    source: wallet.source ?? "provider",
    block: wallet.block ?? null,
    freshness: wallet.freshness ?? null,
    warnings: wallet.warnings?.slice(0, 8) ?? [],
  };
  return {
    ...payload,
    contentSha256: createHash("sha256").update(timelineSnapshotPayload(payload)).digest("hex"),
  };
}

function walletFromTimelineSnapshot(snapshot: BittensorWalletTimelineSnapshot): BittensorWalletSnapshot {
  return {
    ss58Address: snapshot.ss58Address,
    taoBalance: snapshot.taoBalance,
    stakePositions: snapshot.positions.map((position) => ({ ...position })),
    estimatedValueTao: snapshot.estimatedValueTao,
    providerStatus: snapshot.providerStatus,
    updatedAt: snapshot.walletUpdatedAt,
    source: snapshot.source,
    block: snapshot.block,
    freshness: snapshot.freshness,
    warnings: snapshot.warnings,
  };
}

function rememberBittensorWalletTimelineSnapshot(wallet: BittensorWalletSnapshot): void {
  const file = bittensorWalletTimelinePath();
  if (!file) return;
  loadPersistedWalletTimeline();
  const snapshot = buildBittensorWalletTimelineSnapshot(wallet);
  const validation = validateBittensorWalletTimelineSnapshot(snapshot);
  if (!validation.ok) return;
  const current = walletTimelineSnapshots.get(wallet.ss58Address) ?? [];
  walletTimelineSnapshots.set(wallet.ss58Address, [...current, snapshot].slice(-bittensorWalletTimelineRetentionLimit()));
  persistWalletTimeline();
}

function latestBittensorWalletTimelineBaseline(ss58Address: string): { wallet: BittensorWalletSnapshot; updatedAt: string } | null {
  if (!bittensorWalletTimelinePath()) return null;
  loadPersistedWalletTimeline();
  const snapshot = walletTimelineSnapshots.get(ss58Address)?.at(-1) ?? null;
  return snapshot ? { wallet: walletFromTimelineSnapshot(snapshot), updatedAt: snapshot.capturedAt } : null;
}

function clearBittensorWalletTimeline(ss58Address: string): { cleared: number; previousUpdatedAt: string | null } {
  if (!bittensorWalletTimelinePath()) return { cleared: 0, previousUpdatedAt: null };
  loadPersistedWalletTimeline();
  const snapshots = walletTimelineSnapshots.get(ss58Address) ?? [];
  const previousUpdatedAt = snapshots.at(-1)?.capturedAt ?? null;
  walletTimelineSnapshots.delete(ss58Address);
  persistWalletTimeline();
  return { cleared: snapshots.length, previousUpdatedAt };
}

export function getBittensorWalletTimelineStoreStatus(): BittensorWalletTimelineStoreStatus {
  const file = bittensorWalletTimelinePath();
  if (file) loadPersistedWalletTimeline();
  const snapshots = [...walletTimelineSnapshots.values()].flat();
  return {
    kind: "wallet_timeline_store_status",
    enabled: Boolean(file),
    path: file,
    walletCount: walletTimelineSnapshots.size,
    snapshotCount: snapshots.length,
    retentionLimit: bittensorWalletTimelineRetentionLimit(),
    warnings: file
      ? ["Wallet timeline persistence stores public watch-only wallet snapshots only."]
      : ["Wallet timeline persistence is disabled unless BITTENSOR_WALLET_TIMELINE_ENABLE_PERSISTENCE=1."],
    updatedAt: nowIso(),
  };
}

export function exportBittensorWalletTimeline(input: { ss58Address?: string | null } = {}): BittensorWalletTimelineExport {
  const requested = input.ss58Address && isValidSs58Address(input.ss58Address) ? input.ss58Address : null;
  if (bittensorWalletTimelinePath()) loadPersistedWalletTimeline();
  const snapshots = requested
    ? walletTimelineSnapshots.get(requested) ?? []
    : [...walletTimelineSnapshots.values()].flat();
  const validated = snapshots.filter((snapshot) => validateBittensorWalletTimelineSnapshot(snapshot).ok);
  const status = getBittensorWalletTimelineStoreStatus();
  return {
    kind: "wallet_timeline_export",
    generatedAt: nowIso(),
    ss58Address: requested,
    status,
    snapshots: validated,
    warnings: uniqueWarnings(
      status.warnings,
      requested && !validated.length ? ["No public wallet timeline snapshots found for " + shortSs58(requested) + "."] : [],
      validated.length !== snapshots.length ? ["Some wallet timeline snapshots were omitted because validation failed."] : [],
      ["This export contains public watch-only wallet data only."],
    ),
  };
}

function taoAppClient(): ApiClient {
  const apiKey = readEnv("TAO_APP_API_KEY");
  return new ApiClient({
    baseUrl: TAO_APP_BASE_URL,
    headers: apiKey ? { "X-API-Key": apiKey } : {},
    timeout: 4_000,
  });
}

function sidecarBaseUrl(): string {
  return readEnv("BITTENSOR_SUBTENSOR_SIDECAR_URL").replace(/\/$/, "");
}

function sidecarRequestTimeoutMs(): number {
  const parsed = Number(readEnv("BITTENSOR_SUBTENSOR_SIDECAR_TIMEOUT_MS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(15_000, Math.max(1_000, parsed)) : 2_000;
}

function bittensorNetwork(): BittensorSignerStatus["network"] {
  const configured = readEnv("BITTENSOR_NETWORK");
  return configured === "test" || configured === "local" ? configured : "finney";
}

export function getSubtensorSidecarStatus(): BittensorSubtensorSidecarStatus {
  const configured = Boolean(sidecarBaseUrl());
  return {
    configured,
    network: bittensorNetwork(),
    canRead: configured,
    canPrepare: configured,
    canSubmit: false,
    message: configured
      ? "Subtensor sidecar is configured. Matterhorn can request live chain reads and unsigned payload preparation while keeping signing external; submission remains disabled for this TAO milestone."
      : "Subtensor sidecar is not configured. Matterhorn will use TAO.app analytics and local safe fallbacks.",
  };
}

async function probeSidecarPath(baseUrl: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    return asRecord(await res.json());
  } catch {
    return null;
  }
}

export async function checkSubtensorSidecarHealth(): Promise<BittensorSubtensorSidecarHealth> {
  const baseUrl = sidecarBaseUrl();
  const baseStatus = getSubtensorSidecarStatus();
  const checkedAt = nowIso();
  if (!baseUrl) {
    return {
      ...baseStatus,
      reachable: false,
      status: "unconfigured",
      latencyMs: null,
      checkedAt,
    };
  }

  const started = Date.now();
  const payload = await probeSidecarPath(baseUrl, "/liveness") || await probeSidecarPath(baseUrl, "/health") || await probeSidecarPath(baseUrl, "/status");
  const reachable = Boolean(payload);
  const latencyMs = Date.now() - started;
  return {
    ...baseStatus,
    reachable,
    status: reachable ? "healthy" : "unreachable",
    latencyMs,
    checkedAt,
    canRead: reachable && payload?.["canRead"] !== false,
    canPrepare: reachable && payload?.["canPrepare"] !== false,
    canSubmit: reachable && payload?.["canSubmit"] === true,
    message: reachable
      ? "Subtensor sidecar is configured and reachable. Matterhorn can use it for live chain reads and unsigned payload preparation while keeping signing external."
      : "Subtensor sidecar is configured but not reachable. Matterhorn will fall back to TAO.app analytics and local safe behavior.",
  };
}

class SubtensorSidecarClient {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
    try {
      const { headers: _headers, ...rest } = init ?? {};
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(sidecarRequestTimeoutMs()),
      });
      if (!res.ok) return null;
      return asRecord(await res.json());
    } catch {
      return null;
    }
  }

  async getSubnetMetagraph(netuid: number): Promise<unknown | null> {
    return this.request(`/subnets/${encodeURIComponent(String(netuid))}/metagraph`);
  }

  async listSubnets(): Promise<Record<string, unknown> | null> {
    return this.request("/subnets");
  }

  async getSubnetDynamic(netuid: number): Promise<Record<string, unknown> | null> {
    return this.request(`/subnets/${encodeURIComponent(String(netuid))}/dynamic`);
  }

  async getWallet(ss58Address: string): Promise<Record<string, unknown> | null> {
    return this.request(`/wallet/${encodeURIComponent(ss58Address)}`);
  }

  async quoteAction(input: BittensorActionQuoteInput): Promise<Record<string, unknown> | null> {
    return this.request("/extrinsics/quote", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async prepareExtrinsic(input: BittensorExtrinsicPrepareInput): Promise<Record<string, unknown> | null> {
    return this.request("/extrinsics/prepare", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

function subtensorSidecarClient(): SubtensorSidecarClient | null {
  const baseUrl = sidecarBaseUrl();
  return baseUrl ? new SubtensorSidecarClient(baseUrl) : null;
}

function normalizeServiceAdapter(value: unknown, fallback: BittensorCapabilityManifest["serviceAdapter"]): BittensorCapabilityManifest["serviceAdapter"] {
  return value === "inference" ||
    value === "data_search" ||
    value === "compute" ||
    value === "creative_media" ||
    value === "agent_tooling" ||
    value === "universal" ||
    value === "unsupported"
    ? value
    : fallback;
}

function normalizeRequiredAuth(value: unknown): BittensorCapabilityManifest["requiredAuth"] {
  return value === "none" || value === "api_key" || value === "external_wallet" || value === "unknown"
    ? value
    : "unknown";
}

function normalizeCostModel(value: unknown): BittensorCapabilityManifest["costModel"] {
  return value === "free_read" || value === "tao_fee" || value === "provider_priced" || value === "unknown"
    ? value
    : "unknown";
}

function mockSubnetAdaptersEnabled(): boolean {
  const value = readEnv("BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS")?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function isMockSubnetAdapterEndpoint(endpoint: string): boolean {
  return endpoint.startsWith("mock://");
}

function localSubnetAdaptersEnabled(): boolean {
  const value = readEnv("BITTENSOR_ENABLE_LOCAL_SUBNET_ADAPTERS")?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function realSubnetAdaptersEnabled(): boolean {
  const value = readEnv("BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS")?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function realSubnetAdapterCanaryAcknowledged(): boolean {
  const value = readEnv("BITTENSOR_SUBNET_ADAPTER_CANARY_ACK")?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function configuredSubnetAdapterRuntimeApprovals(): BittensorSubnetAdapterRuntimeApproval[] {
  const raw = readEnv("BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : [];
    return entries.flatMap((entry) => {
      const record = asRecord(entry);
      const netuid = firstNumber(record, ["netuid", "net_uid", "subnet"]);
      const serviceAdapter = normalizeServiceAdapter(record["serviceAdapter"] ?? record["adapter"], "unsupported");
      const requestSha256 = firstString(record, ["requestSha256", "request_sha256", "previewRequestSha256", "preview_request_sha256"]);
      const approvedBy = firstString(record, ["approvedBy", "approved_by", "operator"]) ?? "operator";
      const approvedAt = firstString(record, ["approvedAt", "approved_at"]) ?? nowIso();
      const expiresAt = firstString(record, ["expiresAt", "expires_at"]);
      const reason = firstString(record, ["reason", "note"]);
      if (netuid === null || !Number.isInteger(netuid) || netuid < 0 || !requestSha256 || requestSha256.length !== 64) return [];
      return [{
        netuid,
        serviceAdapter,
        requestSha256,
        approvedBy,
        approvedAt,
        expiresAt,
        reason,
      }];
    });
  } catch {
    return [];
  }
}

export function auditBittensorSubnetAdapterRuntimeApprovals(): BittensorSubnetAdapterRuntimeApprovalAudit {
  const checkedAt = nowIso();
  const raw = readEnv("BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON");
  if (!raw) {
    return {
      kind: "bittensor_subnet_adapter_runtime_approval_audit",
      checkedAt,
      status: "warning",
      configured: false,
      activeCount: 0,
      expiredCount: 0,
      invalidCount: 0,
      entries: [],
      warnings: ["No exact request approval manifest is configured. Real subnet service adapter invocations remain blocked."],
      nextActions: ["Generate a preview request SHA-256 and add an operator-reviewed approval only for that exact canary request."],
    };
  }
  let rawEntries: unknown[];
  try {
    const parsed = JSON.parse(raw);
    rawEntries = Array.isArray(parsed) ? parsed : [];
  } catch {
    rawEntries = [];
  }
  const approvals = configuredSubnetAdapterRuntimeApprovals();
  const now = Date.now();
  const entries = approvals.map((approval) => {
    const expires = approval.expiresAt ? Date.parse(approval.expiresAt) : null;
    const expired = expires !== null && Number.isFinite(expires) && expires < now;
    return {
      netuid: approval.netuid,
      serviceAdapter: approval.serviceAdapter,
      requestSha256Prefix: approval.requestSha256.slice(0, 12),
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
      expiresAt: approval.expiresAt,
      expired,
      reason: approval.reason,
    };
  });
  const expiredCount = entries.filter((entry) => entry.expired).length;
  const activeCount = entries.length - expiredCount;
  const invalidCount = Math.max(0, rawEntries.length - approvals.length);
  return {
    kind: "bittensor_subnet_adapter_runtime_approval_audit",
    checkedAt,
    status: activeCount > 0 && invalidCount === 0 ? "pass" : "warning",
    configured: true,
    activeCount,
    expiredCount,
    invalidCount,
    entries,
    warnings: uniqueWarnings(
      invalidCount ? [`${invalidCount} approval entr${invalidCount === 1 ? "y was" : "ies were"} ignored because required fields were invalid.`] : [],
      expiredCount ? [`${expiredCount} approval entr${expiredCount === 1 ? "y has" : "ies have"} expired.`] : [],
      activeCount ? [] : ["No active exact request approvals are available. Real subnet service adapter invocations remain blocked."],
    ),
    nextActions: activeCount
      ? ["Use approvals only for the exact reviewed canary request SHA-256.", "Remove approvals after canary completion or expiry."]
      : ["Run preview, review evidence, and add one short-lived exact request SHA-256 approval if a real canary is explicitly approved."],
  };
}

export function auditBittensorSubnetAdapterCanaryGate(): BittensorSubnetAdapterCanaryGateAudit {
  const checkedAt = nowIso();
  const approvalAudit = auditBittensorSubnetAdapterRuntimeApprovals();
  const doctor = doctorBittensorSubnetAdapters();
  const realAdaptersEnabled = realSubnetAdaptersEnabled();
  const canaryAcknowledgementEnabled = realSubnetAdapterCanaryAcknowledged();
  const endpointAllowlistCount = subnetAdapterEndpointAllowlist().length;
  const configuredAdapterCount = doctor.entries.length;
  const configuredRealAdapterCount = doctor.entries.filter((entry) => entry.endpoint.mode !== "mock").length;
  const readyRealAdapterCount = doctor.entries.filter((entry) => entry.endpoint.mode !== "mock" && entry.serviceCallReady).length;
  const blockers = uniqueWarnings(
    canaryAcknowledgementEnabled && !realAdaptersEnabled
      ? ["BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1 is set while BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS is off. Remove stale canary acknowledgement unless a reviewed canary is actively running."]
      : [],
    canaryAcknowledgementEnabled && approvalAudit.activeCount === 0
      ? ["BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1 is set but no active exact request approvals are configured."]
      : [],
    canaryAcknowledgementEnabled && readyRealAdapterCount === 0
      ? ["BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1 is set but no configured real adapter passed doctor checks."]
      : [],
    realAdaptersEnabled && configuredRealAdapterCount > 0 && readyRealAdapterCount === 0
      ? ["Real subnet adapters are enabled, but configured real adapters are blocked by doctor checks."]
      : [],
  );
  const warnings = uniqueWarnings(
    realAdaptersEnabled
      ? ["BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS is enabled. Keep this scoped to reviewed adapter canary windows."]
      : [],
    canaryAcknowledgementEnabled && approvalAudit.activeCount > 0
      ? ["Real subnet adapter invocation is armed for active exact request approval(s). Remove BITTENSOR_SUBNET_ADAPTER_CANARY_ACK after the canary."]
      : [],
    approvalAudit.activeCount > 0 && !canaryAcknowledgementEnabled
      ? ["Active exact request approvals exist, but canary acknowledgement is off; real invocation remains blocked until the reviewed canary window starts."]
      : [],
    approvalAudit.warnings,
    doctor.warnings,
  );
  const status: BittensorSubnetAdapterCanaryGateAudit["status"] = blockers.length
    ? "blocked"
    : realAdaptersEnabled && canaryAcknowledgementEnabled && approvalAudit.activeCount > 0 && readyRealAdapterCount > 0
      ? "canary_armed"
      : realAdaptersEnabled && approvalAudit.activeCount > 0 && readyRealAdapterCount > 0
        ? "preview_ready"
        : "safe_idle";
  const nextActions = status === "canary_armed"
    ? [
      "Run only the exact reviewed canary request, capture the result, then unset BITTENSOR_SUBNET_ADAPTER_CANARY_ACK.",
      "Remove or let expire the exact request approval after the canary window closes.",
    ]
    : status === "preview_ready"
      ? [
        "Confirm the preview request hash, provider identity, evidence review, and rollback owner before setting BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1.",
        "Keep general real subnet service execution disabled until the canary report is accepted.",
      ]
      : status === "blocked"
        ? ["Resolve canary blockers before invoking any real subnet service adapter.", "Unset stale canary acknowledgement flags when not actively running a reviewed canary."]
        : ["Keep real adapter execution disabled by default.", "Use mock adapters, marketplace exports, and canary packets before any real subnet execution."];
  return {
    kind: "bittensor_subnet_adapter_canary_gate_audit",
    checkedAt,
    status,
    realAdaptersEnabled,
    canaryAcknowledgementEnabled,
    endpointAllowlistCount,
    configuredAdapterCount,
    configuredRealAdapterCount,
    readyRealAdapterCount,
    activeApprovalCount: approvalAudit.activeCount,
    expiredApprovalCount: approvalAudit.expiredCount,
    invalidApprovalCount: approvalAudit.invalidCount,
    blockers,
    warnings,
    nextActions,
    approvalAudit,
    doctorSummary: {
      status: doctor.status,
      readyCount: doctor.readyCount,
      warningCount: doctor.warningCount,
      blockedCount: doctor.blockedCount,
    },
  };
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function buildBittensorSubnetAdapterRuntimeApprovalTemplate(input: {
  netuid: number;
  serviceAdapter: BittensorCapabilityManifest["serviceAdapter"];
  requestSha256: string;
  approvedBy?: string | null;
  reason?: string | null;
  ttlMinutes?: number | null;
}): BittensorSubnetAdapterRuntimeApprovalTemplate {
  if (!Number.isInteger(input.netuid) || input.netuid < 0) {
    throw new Error("netuid must be a non-negative integer");
  }
  if (!isSha256Hex(input.requestSha256)) {
    throw new Error("requestSha256 must be a 64-character SHA-256 hex string");
  }
  const serviceAdapter = normalizeServiceAdapter(input.serviceAdapter, "unsupported");
  if (serviceAdapter === "universal" || serviceAdapter === "unsupported") {
    throw new Error("serviceAdapter must be a direct subnet adapter kind");
  }
  const ttl = Number.isFinite(input.ttlMinutes ?? null)
    ? Math.min(24 * 60, Math.max(5, Number(input.ttlMinutes)))
    : 60;
  const generatedAt = nowIso();
  const expiresAt = new Date(Date.parse(generatedAt) + ttl * 60_000).toISOString();
  const approval: BittensorSubnetAdapterRuntimeApproval = {
    netuid: input.netuid,
    serviceAdapter,
    requestSha256: input.requestSha256.toLowerCase(),
    approvedBy: input.approvedBy?.trim() || "operator",
    approvedAt: generatedAt,
    expiresAt,
    reason: input.reason?.trim() || "Reviewed canary fixture, evidence bundle, and rollback plan.",
  };
  return {
    kind: "bittensor_subnet_adapter_runtime_approval_template",
    generatedAt,
    approval,
    env: {
      key: "BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON",
      value: JSON.stringify([approval], null, 2),
    },
    warnings: [
      "This template does not invoke a subnet service and does not authorize anything until an operator deliberately configures it.",
      "Use short-lived approvals for reviewed canaries only; remove them after the canary completes.",
      "The request SHA-256 must match the preview card exactly.",
    ],
    nextActions: [
      "Confirm evidence review, provider identity, canary fixture, and rollback owner before using this template.",
      "Set BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1 only for the reviewed canary window.",
      "Set BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1 only while invoking the reviewed canary request.",
      "Audit approvals after the canary and remove stale entries.",
    ],
  };
}

function findSubnetAdapterRuntimeApproval(
  adapter: BittensorConfiguredSubnetAdapter,
  requestSha256: string,
): BittensorSubnetAdapterRuntimeApproval | null {
  const now = Date.now();
  return configuredSubnetAdapterRuntimeApprovals().find((approval) => {
    if (approval.netuid !== adapter.netuid) return false;
    if (approval.serviceAdapter !== adapter.serviceAdapter) return false;
    if (approval.requestSha256 !== requestSha256) return false;
    if (approval.expiresAt) {
      const expires = Date.parse(approval.expiresAt);
      if (Number.isFinite(expires) && expires < now) return false;
    }
    return true;
  }) ?? null;
}

function subnetAdapterEndpointAllowlist(): string[] {
  const raw = readEnv("BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST") || readEnv("BITTENSOR_SUBNET_ADAPTER_ALLOWLIST");
  return raw.split(/[\s,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function endpointHostMatchesAllowlist(host: string, origin: string, allowlist: string[]): boolean {
  const safeHost = host.toLowerCase();
  const safeOrigin = origin.toLowerCase();
  return allowlist.some((entry) => {
    if (entry === safeHost || entry === safeOrigin) return true;
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1);
      return safeHost.endsWith(suffix) && safeHost.length > suffix.length;
    }
    return false;
  });
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("127.");
}

function summarizeSubnetAdapterEndpoint(endpoint: string | null): BittensorSubnetAdapterDoctorEndpoint {
  if (!endpoint) {
    return {
      configured: false,
      mode: "missing",
      origin: null,
      host: null,
      allowed: false,
      reason: "Adapter endpoint is missing.",
    };
  }
  if (isMockSubnetAdapterEndpoint(endpoint)) {
    const mockName = endpoint.replace(/^mock:\/\//, "").split(/[/?#]/)[0] || "unknown";
    const enabled = mockSubnetAdaptersEnabled();
    return {
      configured: true,
      mode: "mock",
      origin: `mock://${mockName}`,
      host: mockName,
      allowed: enabled,
      reason: enabled
        ? "Mock adapter endpoint is enabled for local preview-confirm-invoke testing."
        : "Mock adapter endpoint is configured, but BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS is not enabled.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return {
      configured: true,
      mode: "invalid",
      origin: null,
      host: null,
      allowed: false,
      reason: "Adapter endpoint must be a valid URL.",
    };
  }

  const host = parsed.hostname;
  const origin = parsed.origin;
  if (parsed.protocol === "https:") {
    const allowlist = subnetAdapterEndpointAllowlist();
    const allowed = endpointHostMatchesAllowlist(host, origin, allowlist);
    return {
      configured: true,
      mode: "https",
      origin,
      host,
      allowed,
      reason: allowed
        ? "HTTPS adapter endpoint matches the configured adapter endpoint allowlist."
        : "HTTPS adapter endpoint host is not in BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST.",
    };
  }

  if (parsed.protocol === "http:") {
    const allowed = isLoopbackHost(host) && localSubnetAdaptersEnabled();
    return {
      configured: true,
      mode: "http",
      origin,
      host,
      allowed,
      reason: allowed
        ? "Loopback HTTP adapter endpoint is enabled for local development."
        : "HTTP adapter endpoints are blocked unless they are loopback URLs and BITTENSOR_ENABLE_LOCAL_SUBNET_ADAPTERS is enabled.",
    };
  }

  return {
    configured: true,
    mode: "invalid",
    origin,
    host,
    allowed: false,
    reason: "Adapter endpoint protocol must be mock://, https://, or explicitly enabled loopback http://.",
  };
}

function defaultSubnetAdapterRequestSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      netuid: { type: "number" },
      intent: { enum: ["service_call"] },
      task: { type: "string" },
      ss58Address: { type: ["string", "null"] },
      requestSha256: { type: "string" },
      safeMode: { const: true },
    },
  };
}

function defaultSubnetAdapterResultSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      message: { type: "string" },
      result: { type: "object" },
      warnings: { type: "array", items: { type: "string" } },
      usage: { type: "object" },
      costEstimate: { type: "object" },
    },
  };
}

function adapterSchemaFromConfig(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  const record = asRecord(value);
  return Object.keys(record).length ? record : fallback;
}

function buildSubnetAdapterTemplate(params: {
  adapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
  name: string;
  description: string;
  recommendedFor: string[];
  endpoint: string;
  metadataEndpoint: string;
  allowlist: string;
  requiredAuth: "none" | "api_key";
  costModel: "free_read" | "provider_priced" | "tao_fee";
  authEnv?: string;
  netuid?: number | null;
  safetyNotes: string[];
}): BittensorSubnetAdapterConfigTemplate {
  const config: BittensorSubnetAdapterConfigTemplate["config"] = {
    netuid: params.netuid ?? "<NETUID>",
    name: params.name,
    serviceAdapter: params.adapter,
    endpoint: params.endpoint,
    metadataEndpoint: params.metadataEndpoint,
    requiredAuth: params.requiredAuth,
    costModel: params.costModel,
    ...(params.authEnv ? { authEnv: params.authEnv } : {}),
    timeoutMs: 20_000,
    safetyNotes: params.safetyNotes,
  };
  return {
    kind: "bittensor_subnet_adapter_config_template",
    adapter: params.adapter,
    name: params.name,
    description: params.description,
    recommendedFor: params.recommendedFor,
    config,
    env: {
      adaptersJson: JSON.stringify([config], null, 2),
      endpointAllowlist: params.allowlist,
      ...(params.authEnv ? { credentialEnv: params.authEnv, credentialValue: "<set-outside-matterhorn>" as const } : { credentialValue: null }),
    },
    requestSchema: defaultSubnetAdapterRequestSchema(),
    resultSchema: defaultSubnetAdapterResultSchema(),
    preflightSteps: [
      "Run bittensor_get_subnet_capabilities for the target netuid and confirm the service adapter category is appropriate.",
      "Run bittensor_doctor_subnet_adapters and resolve every blocked entry before previewing user requests.",
      "Run bittensor_preview_subnet_invocation and require the user to confirm the exact request SHA-256 before invocation.",
      "Run bittensor_dry_run_subnet_adapters for mock adapters; non-mock adapters must use preview-confirm-invoke smoke tests with a reviewed endpoint.",
    ],
    safetyNotes: params.safetyNotes,
  };
}

export function getBittensorSubnetAdapterTemplates(input: {
  adapter?: string | null;
  netuid?: number | null;
} = {}): BittensorSubnetAdapterTemplateReport {
  const requestedAdapter = input.adapter ? normalizeServiceAdapter(input.adapter, "unsupported") : null;
  const netuid = input.netuid !== null && input.netuid !== undefined && Number.isInteger(input.netuid) && input.netuid >= 0
    ? input.netuid
    : null;
  const templates = [
    buildSubnetAdapterTemplate({
      adapter: "data_search",
      name: "HTTPS data-search subnet adapter",
      description: "Template for a reviewed HTTPS adapter that accepts a user task and returns bounded search or retrieval results.",
      recommendedFor: ["data search", "retrieval", "research", "knowledge-base lookup", "web or dataset search"],
      endpoint: "https://adapter.example.com/bittensor/data-search/invoke",
      metadataEndpoint: "https://adapter.example.com/.well-known/matterhorn-bittensor-adapter.json",
      allowlist: "adapter.example.com",
      requiredAuth: "api_key",
      costModel: "provider_priced",
      authEnv: "BITTENSOR_DATA_SEARCH_ADAPTER_TOKEN",
      netuid,
      safetyNotes: [
        "Do not put credential values inside BITTENSOR_SUBNET_ADAPTERS_JSON.",
        "Adapter responses must be JSON and stay below BITTENSOR_SUBNET_ADAPTER_MAX_RESPONSE_BYTES.",
        "Matterhorn sends task text, optional public SS58 address, request hash, and safeMode only.",
      ],
    }),
    buildSubnetAdapterTemplate({
      adapter: "inference",
      name: "HTTPS inference subnet adapter",
      description: "Template for a reviewed HTTPS adapter that runs a prompt against an inference subnet service and returns bounded model output.",
      recommendedFor: ["text inference", "LLM response", "classification", "summarization", "reasoning"],
      endpoint: "https://adapter.example.com/bittensor/inference/invoke",
      metadataEndpoint: "https://adapter.example.com/.well-known/matterhorn-bittensor-adapter.json",
      allowlist: "adapter.example.com",
      requiredAuth: "api_key",
      costModel: "provider_priced",
      authEnv: "BITTENSOR_INFERENCE_ADAPTER_TOKEN",
      netuid,
      safetyNotes: [
        "Do not send seed phrases, mnemonics, private keys, wallet exports, or signing payloads to subnet adapters.",
        "Use the preview-confirm-invoke request SHA-256 gate for every service call.",
        "Keep real adapter hosts on BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST and prefer HTTPS.",
      ],
    }),
  ].filter((template) => requestedAdapter === null || template.adapter === requestedAdapter);
  return {
    kind: "bittensor_subnet_adapter_template_report",
    generatedAt: nowIso(),
    templates,
    warnings: templates.length ? [] : ["No adapter template matched the requested adapter filter."],
    nextActions: [
      "Start with a mock adapter until chat preview, confirmation, card rendering, and redaction checks are green.",
      "Copy one template, replace <NETUID>, set the credential env outside Matterhorn, and rerun the adapter doctor.",
      "Do not enable real subnet execution until the endpoint, auth, schema, response size, and redaction gates pass.",
    ],
  };
}

function buildSubnetAdapterCandidateProfile(params: {
  id: string;
  adapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">;
  netuid?: number | null;
  title: string;
  category: string;
  targetUseCases: string[];
  fixtureTask: string;
  operatorQuestions: string[];
  safetyNotes: string[];
}): BittensorSubnetAdapterCandidateProfile {
  const requiredMatterhornGates = [
    "bittensor_get_subnet_adapter_templates returns a sanitized config template with credential placeholders only.",
    "bittensor_doctor_subnet_adapters passes endpoint allowlist, auth readiness, schema safety, and service-call readiness.",
    "bittensor_probe_subnet_adapter_conformance passes metadata version, netuid, adapter kind, safe-mode, request-hash, privacy, schema, and response-bound checks.",
    "bittensor_preview_subnet_invocation returns a request SHA-256 and user confirmation prompt before any invocation.",
    "bittensor_invoke_subnet is called only with the reviewed previewRequestSha256.",
  ];
  return {
    kind: "bittensor_subnet_adapter_candidate_profile",
    id: params.id,
    adapter: params.adapter,
    netuid: params.netuid ?? "<NETUID>",
    title: params.title,
    category: params.category,
    targetUseCases: params.targetUseCases,
    requiredMatterhornGates,
    noExecutionCanary: {
      kind: "matterhorn.bittensor.adapter.no_execution_canary.v1",
      purpose: "Define the fixture and metadata requirements for future reviewed adapter testing without calling a real subnet service.",
      fixtureTask: params.fixtureTask,
      expectedMetadata: {
        version: "matterhorn.bittensor.adapter.v1",
        serviceAdapter: params.adapter,
        safeModeRequired: true,
        requestHashRequired: true,
        privacy: {
          sendsWalletData: false,
          sendsKeyMaterial: false,
        },
      },
      forbiddenFieldClasses: ["signing material", "wallet material", "local key material", "host credentials"],
      passCriteria: [
        "The canary is documented but not executed against a real adapter by this profile.",
        "The metadata conformance probe passes before any fixture task is sent.",
        "The fixture task contains no user data, wallet address, or signing payload.",
        "The adapter result schema can be rendered as a subnet_result card without exposing secret-shaped fields.",
      ],
    },
    operatorQuestions: params.operatorQuestions,
    nextActions: [
      "Map this profile to a target netuid and adapter kind.",
      "Fetch the matching adapter template and configure only placeholders plus external credential env values.",
      "Run doctor and conformance before any preview-confirm-invoke smoke test.",
    ],
    safetyNotes: params.safetyNotes,
  };
}

export function getBittensorSubnetAdapterCandidateProfiles(input: {
  adapter?: string | null;
  netuid?: number | null;
} = {}): BittensorSubnetAdapterCandidateProfileReport {
  const requestedAdapter = input.adapter ? normalizeServiceAdapter(input.adapter, "unsupported") : null;
  const netuid = input.netuid !== null && input.netuid !== undefined && Number.isInteger(input.netuid) && input.netuid >= 0
    ? input.netuid
    : null;
  const profiles = [
    buildSubnetAdapterCandidateProfile({
      id: "candidate-data-search-v1",
      adapter: "data_search",
      netuid,
      title: "Data-search subnet adapter candidate",
      category: "Data and knowledge",
      targetUseCases: ["research", "document retrieval", "dataset search", "knowledge lookup", "web-grounded Bittensor answers"],
      fixtureTask: "Canary fixture: return two public, non-personal search results for the term Bittensor subnet metadata.",
      operatorQuestions: [
        "What data sources does the subnet service query?",
        "Does the provider return source URLs, timestamps, and confidence labels?",
        "What pricing or rate limits apply per query?",
        "Can responses be bounded below Matterhorn's max adapter response size?",
      ],
      safetyNotes: [
        "Use only public, non-personal canary tasks before production review.",
        "Do not send wallet state or signing payloads to search adapters.",
        "Treat retrieved content as untrusted and summarize with source/freshness labels.",
      ],
    }),
    buildSubnetAdapterCandidateProfile({
      id: "candidate-inference-v1",
      adapter: "inference",
      netuid,
      title: "Inference subnet adapter candidate",
      category: "Intelligence market",
      targetUseCases: ["summarization", "classification", "reasoning", "plain-language answers", "model comparison"],
      fixtureTask: "Canary fixture: summarize this public sentence in one short sentence: Bittensor coordinates subnet markets for machine intelligence.",
      operatorQuestions: [
        "Which model or miner route is selected for requests?",
        "How are latency, cost, and output length bounded?",
        "Does the provider return model/source metadata and safety warnings?",
        "How does the adapter handle prompt injection inside user task text?",
      ],
      safetyNotes: [
        "Do not use inference adapters as signers or wallet custodians.",
        "Constrain output length and response size before real preview-confirm-invoke testing.",
        "Treat model output as untrusted until rendered through Matterhorn cards and warnings.",
      ],
    }),
  ].filter((profile) => requestedAdapter === null || profile.adapter === requestedAdapter);
  return {
    kind: "bittensor_subnet_adapter_candidate_profile_report",
    generatedAt: nowIso(),
    profiles,
    warnings: profiles.length ? [] : ["No candidate profile matched the requested adapter filter."],
    nextActions: [
      "Choose a candidate profile before configuring a real adapter endpoint.",
      "Use adapter templates for config placeholders, then doctor and conformance before any invocation smoke test.",
      "Keep real subnet execution disabled until a reviewed profile has passed all gates.",
    ],
  };
}

export async function planBittensorSubnetAdapterOnboarding(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterOnboardingPlan> {
  const requestedAdapter = input.adapter ? normalizeServiceAdapter(input.adapter, "unsupported") : null;
  const netuid = input.netuid !== null && input.netuid !== undefined && Number.isInteger(input.netuid) && input.netuid >= 0
    ? input.netuid
    : null;
  const candidateProfiles = getBittensorSubnetAdapterCandidateProfiles({
    adapter: requestedAdapter,
    netuid,
  });
  const templates = getBittensorSubnetAdapterTemplates({
    adapter: requestedAdapter,
    netuid,
  });
  const doctor = doctorBittensorSubnetAdapters();
  const conformance = await probeBittensorSubnetAdapterConformance({
    netuid,
    limit: input.limit,
  });
  const gates: BittensorSubnetAdapterOnboardingGate[] = [
    {
      id: "candidate_profile",
      label: "Candidate profile",
      status: candidateProfiles.profiles.length ? "pass" : "blocked",
      summary: candidateProfiles.profiles.length
        ? `${candidateProfiles.profiles.length} no-execution candidate profile(s) match this request.`
        : "No candidate profile matches the requested adapter.",
      nextAction: candidateProfiles.profiles.length
        ? "Review target use cases, operator questions, and the no-execution canary contract."
        : "Choose data_search or inference before configuring a real adapter endpoint.",
    },
    {
      id: "config_template",
      label: "Configuration template",
      status: templates.templates.length ? "pass" : "blocked",
      summary: templates.templates.length
        ? `${templates.templates.length} sanitized config template(s) are available.`
        : "No sanitized config template matches this request.",
      nextAction: templates.templates.length
        ? "Copy placeholders only; keep actual credential values outside Matterhorn."
        : "Request a supported adapter kind before setting adapter configuration.",
    },
    {
      id: "adapter_doctor",
      label: "Adapter doctor",
      status: !doctor.rawConfigured
        ? "not_configured"
        : doctor.status === "pass"
          ? "pass"
          : doctor.status === "warning"
            ? "warning"
            : "blocked",
      summary: !doctor.rawConfigured
        ? "No subnet service adapters are configured yet."
        : `${doctor.readyCount} ready, ${doctor.warningCount} warning, ${doctor.blockedCount} blocked adapter entries.`,
      nextAction: !doctor.rawConfigured
        ? "Set BITTENSOR_SUBNET_ADAPTERS_JSON and endpoint allowlist values from a template, then rerun this plan."
        : doctor.status === "pass"
          ? "Keep endpoint and auth values out of user-facing payloads."
          : "Resolve doctor warnings/errors before any preview-confirm-invoke smoke test.",
    },
    {
      id: "metadata_conformance",
      label: "Metadata conformance",
      status: !doctor.rawConfigured
        ? "not_configured"
        : conformance.status === "pass"
          ? "pass"
          : conformance.status === "warning"
            ? "warning"
            : "blocked",
      summary: !doctor.rawConfigured
        ? "Conformance is skipped until an adapter is configured."
        : `${conformance.passed} passed, ${conformance.failed} failed, ${conformance.skipped} skipped conformance case(s).`,
      nextAction: !doctor.rawConfigured
        ? "Configure an adapter metadata endpoint before probing conformance."
        : conformance.status === "pass"
          ? "Use the no-execution canary contract before considering a reviewed service-call smoke test."
          : "Fix metadata version, adapter kind, safe-mode, request-hash, privacy, schema, or response-bound issues.",
    },
    {
      id: "service_execution",
      label: "Service execution",
      status: "not_configured",
      summary: "Real subnet service execution is intentionally out of scope for this onboarding plan.",
      nextAction: "Use preview-confirm-invoke only after candidate, template, doctor, and conformance gates pass.",
    },
  ];
  const warnings = uniqueWarnings(
    candidateProfiles.warnings,
    templates.warnings,
    doctor.warnings,
    doctor.errors,
    conformance.warnings,
  );
  const status: BittensorSubnetAdapterOnboardingPlan["status"] = candidateProfiles.profiles.length === 0 || templates.templates.length === 0
    ? "blocked"
    : !doctor.rawConfigured
      ? "needs_configuration"
      : doctor.status === "fail"
        ? "blocked"
        : conformance.status === "fail"
          ? "needs_conformance"
          : doctor.status === "warning" || conformance.status === "warning"
            ? "needs_conformance"
            : "ready_for_preview_review";
  const nextActions = status === "needs_configuration"
    ? [
      "Choose a candidate profile and copy the matching sanitized config template.",
      "Set adapter endpoint, allowlist, and external credential env values outside Matterhorn.",
      "Rerun onboarding after configuration; do not invoke real services yet.",
    ]
    : status === "needs_conformance"
      ? [
        "Fix metadata conformance warnings before running any preview-confirm-invoke smoke test.",
        "Use the no-execution canary fixture only after metadata checks pass.",
      ]
      : status === "blocked"
        ? [
          "Resolve blocked candidate, template, or doctor gates before proceeding.",
          "Keep real subnet execution disabled until every gate passes.",
        ]
        : [
          "Run a reviewed preview for the no-execution canary fixture and verify the request SHA-256.",
          "Invoke only mock adapters or explicitly reviewed canary endpoints; keep production service execution disabled.",
        ];
  return {
    kind: "bittensor_subnet_adapter_onboarding_plan",
    generatedAt: nowIso(),
    status,
    requested: {
      adapter: requestedAdapter,
      netuid,
    },
    candidateProfiles,
    templates,
    doctor,
    conformance,
    gates,
    warnings,
    nextActions,
  };
}

export async function checkBittensorSubnetAdapterLaunchGate(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterLaunchGateReport> {
  const onboarding = await planBittensorSubnetAdapterOnboarding(input);
  const scopedEntries = onboarding.doctor.entries.filter((entry) => {
    const adapterMatches = onboarding.requested.adapter === null || entry.serviceAdapter === onboarding.requested.adapter;
    const netuidMatches = onboarding.requested.netuid === null || entry.netuid === onboarding.requested.netuid;
    return adapterMatches && netuidMatches;
  });
  const readyEntries = scopedEntries.filter((entry) => entry.serviceCallReady && entry.status === "ready");
  const readyMockCount = readyEntries.filter((entry) => entry.endpoint.mode === "mock").length;
  const readyRealCount = readyEntries.filter((entry) => entry.endpoint.mode !== "mock").length;
  const blockedCount = scopedEntries.filter((entry) => entry.status === "blocked").length;
  const requirements: BittensorSubnetAdapterLaunchGateRequirement[] = [
    {
      id: "onboarding_plan",
      label: "Onboarding plan",
      status: onboarding.status === "ready_for_preview_review" ? "pass" : onboarding.status === "needs_configuration" ? "not_configured" : "blocked",
      detail: `Onboarding status is ${onboarding.status}.`,
      nextAction: onboarding.nextActions[0] ?? "Complete adapter onboarding before launch review.",
    },
    {
      id: "adapter_doctor",
      label: "Adapter doctor",
      status: !onboarding.doctor.rawConfigured
        ? "not_configured"
        : onboarding.doctor.status === "pass"
          ? "pass"
          : "blocked",
      detail: `${onboarding.doctor.readyCount} ready, ${onboarding.doctor.warningCount} warning, ${onboarding.doctor.blockedCount} blocked adapter entries.`,
      nextAction: onboarding.doctor.status === "pass"
        ? "Keep adapter endpoint and auth values out of logs and user-facing payloads."
        : "Fix adapter doctor blockers before preview review.",
    },
    {
      id: "metadata_conformance",
      label: "Metadata conformance",
      status: !onboarding.doctor.rawConfigured
        ? "not_configured"
        : onboarding.conformance.status === "pass"
          ? "pass"
          : "blocked",
      detail: `${onboarding.conformance.passed} passed, ${onboarding.conformance.failed} failed, ${onboarding.conformance.skipped} skipped conformance case(s).`,
      nextAction: onboarding.conformance.status === "pass"
        ? "Proceed only to reviewed preview/canary planning."
        : "Fix metadata conformance before launch review.",
    },
    {
      id: "mock_canary",
      label: "Mock canary",
      status: readyMockCount ? "pass" : "not_configured",
      detail: `${readyMockCount} mock adapter(s) are ready for preview-confirm-invoke testing.`,
      nextAction: readyMockCount
        ? "Run mock dry-run before any real adapter canary review."
        : "Configure a mock adapter first when possible, then rerun the launch gate.",
    },
    {
      id: "real_adapter_review",
      label: "Real adapter review",
      status: readyRealCount ? "manual_review" : "not_configured",
      detail: readyRealCount
        ? `${readyRealCount} real HTTPS adapter(s) are technically ready but still require manual canary review.`
        : "No real HTTPS adapter is ready for manual canary review.",
      nextAction: readyRealCount
        ? "Manually review provider identity, endpoint ownership, privacy policy, canary task, and rollback plan before any real invocation."
        : "Do not configure a real adapter until mock and metadata gates are clean.",
    },
    {
      id: "user_confirmation",
      label: "User confirmation",
      status: "manual_review",
      detail: "Every subnet service call still requires preview text, exact request SHA-256, and explicit user confirmation.",
      nextAction: "Never bypass preview-confirm-invoke, even after this launch gate passes.",
    },
  ];
  const status: BittensorSubnetAdapterLaunchGateReport["status"] = onboarding.status !== "ready_for_preview_review" || blockedCount > 0
    ? "blocked"
    : readyRealCount > 0
      ? "manual_review_required"
      : readyMockCount > 0
        ? "mock_ready"
        : "blocked";
  const warnings = uniqueWarnings(
    onboarding.warnings,
    readyRealCount ? ["Real HTTPS adapters require manual provider and canary review before any invocation."] : [],
    readyMockCount ? [] : ["No mock adapter is ready for dry-run launch rehearsal."],
  );
  const nextActions = status === "blocked"
    ? [
      "Resolve blocked or missing onboarding gates before launch review.",
      "Prefer a mock adapter dry-run before configuring real HTTPS adapters.",
    ]
    : status === "mock_ready"
      ? [
        "Run the mock adapter dry-run harness and inspect preview/hash/redaction results.",
        "Keep real subnet execution disabled until a separate manual canary review passes.",
      ]
      : [
        "Complete manual provider, endpoint, privacy, canary, and rollback review.",
        "Only then run a reviewed real canary preview and require exact request SHA-256 confirmation.",
      ];
  return {
    kind: "bittensor_subnet_adapter_launch_gate",
    checkedAt: nowIso(),
    status,
    requested: onboarding.requested,
    onboarding,
    readyMockCount,
    readyRealCount,
    blockedCount,
    requirements,
    warnings,
    nextActions,
  };
}

export function getBittensorSubnetAdapterCanaryReviewChecklist(input: {
  adapter?: string | null;
  netuid?: number | null;
} = {}): BittensorSubnetAdapterCanaryReviewChecklist {
  const requestedAdapter = input.adapter ? normalizeServiceAdapter(input.adapter, "unsupported") : null;
  const netuid = input.netuid !== null && input.netuid !== undefined && Number.isInteger(input.netuid) && input.netuid >= 0
    ? input.netuid
    : null;
  const candidateReport = getBittensorSubnetAdapterCandidateProfiles({ adapter: requestedAdapter, netuid });
  const candidateProfile = candidateReport.profiles[0] ?? null;
  const reviewItems: BittensorSubnetAdapterCanaryReviewItem[] = [
    {
      id: "provider_identity",
      label: "Provider identity and ownership",
      required: true,
      evidence: "Operator has verified the adapter host, provider identity, endpoint ownership, and contact/rollback owner.",
      blockerIfMissing: true,
    },
    {
      id: "metadata_conformance",
      label: "Metadata conformance",
      required: true,
      evidence: "bittensor_probe_subnet_adapter_conformance passes for version, adapter kind, netuid, safe-mode, request hash, privacy, schema, and response bounds.",
      blockerIfMissing: true,
    },
    {
      id: "fixture_review",
      label: "Canary fixture review",
      required: true,
      evidence: "The canary fixture contains no user data, wallet address, signing payload, host token, or production secret.",
      blockerIfMissing: true,
    },
    {
      id: "preview_hash",
      label: "Preview hash confirmation",
      required: true,
      evidence: "Operator has recorded the preview request SHA-256 and the exact task text before any invocation.",
      blockerIfMissing: true,
    },
    {
      id: "bounded_result",
      label: "Bounded result handling",
      required: true,
      evidence: "Adapter result size, timeout, JSON envelope, warnings, usage, and cost fields fit Matterhorn's result schema.",
      blockerIfMissing: true,
    },
    {
      id: "redaction_check",
      label: "Redaction check",
      required: true,
      evidence: "Canary result does not expose credentials, signing material, local file paths, host tokens, or private user data.",
      blockerIfMissing: true,
    },
    {
      id: "rollback_plan",
      label: "Rollback plan",
      required: true,
      evidence: "Operator can disable the adapter by removing config or allowlist entries without redeploying wallet/signing code.",
      blockerIfMissing: true,
    },
    {
      id: "post_canary_monitoring",
      label: "Post-canary monitoring",
      required: true,
      evidence: "Operator has a watch or alert plan for adapter errors, latency, response-size failures, and unexpected warning spikes.",
      blockerIfMissing: false,
    },
  ];
  return {
    kind: "bittensor_subnet_adapter_canary_review",
    generatedAt: nowIso(),
    requested: {
      adapter: requestedAdapter,
      netuid,
    },
    candidateProfile,
    fixtureTask: candidateProfile?.noExecutionCanary.fixtureTask ?? null,
    reviewItems,
    stopConditions: [
      "Stop if the adapter asks for wallet secrets, signing material, host tokens, key files, or local custody.",
      "Stop if metadata conformance does not pass.",
      "Stop if preview request SHA-256 changes between review and invocation.",
      "Stop if the result schema cannot be rendered without exposing sensitive values.",
      "Stop if rollback cannot disable the adapter quickly.",
    ],
    allowedNextActions: [
      "Run launch gate and confirm it is mock_ready or manual_review_required.",
      "Run only a reviewed canary preview with public fixture text.",
      "Require explicit operator/user confirmation of the exact request SHA-256 before any canary invocation.",
    ],
    warnings: candidateReport.warnings,
  };
}

function buildBittensorSubnetAdapterEvidencePreflight(input: {
  adapter?: string | null;
  netuid?: number | null;
} = {}): BittensorSubnetAdapterPreflightPacket {
  const requestedAdapter = normalizeServiceAdapter(input.adapter, "unsupported");
  const adapter = directSubnetAdapterKind(requestedAdapter) ? requestedAdapter : "data_search";
  const requestedNetuid = Number.isInteger(input.netuid ?? null) && Number(input.netuid) >= 0 ? Number(input.netuid) : null;
  const example = getBittensorSubnetAdapterManifestExamples({
    adapter,
    netuid: requestedNetuid ?? 18,
    limit: 1,
  }).examples[0];
  return buildBittensorSubnetAdapterPreflightPacket({
    manifest: example?.manifest ?? {},
    result: {
      mode: "mock",
      requestSha256: "f".repeat(64),
      output: "Evidence bundle preflight sample output.",
      warnings: [],
    },
  });
}

export async function buildBittensorSubnetAdapterEvidenceBundle(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterEvidenceBundle> {
  const onboarding = await planBittensorSubnetAdapterOnboarding(input);
  const launchGate = await checkBittensorSubnetAdapterLaunchGate(input);
  const preflight = buildBittensorSubnetAdapterEvidencePreflight(input);
  const canaryReview = getBittensorSubnetAdapterCanaryReviewChecklist(input);
  const requiredArtifacts: BittensorSubnetAdapterEvidenceBundle["requiredArtifacts"] = [
    {
      id: "onboarding_plan",
      label: "Onboarding plan with candidate, template, doctor, conformance, gates, warnings, and next actions",
      source: "onboarding",
      requiredBeforeRealCanary: true,
    },
    {
      id: "launch_gate",
      label: "Launch gate status showing blocked, mock-ready, or manual-review-required state",
      source: "launch_gate",
      requiredBeforeRealCanary: true,
    },
    {
      id: "preflight_packet",
      label: "Manifest and sample result preflight packet with readiness for conformance and canary evidence",
      source: "preflight",
      requiredBeforeRealCanary: true,
    },
    ...canaryReview.reviewItems.map((item) => ({
      id: `canary_${item.id}`,
      label: item.label,
      source: "canary_review" as const,
      requiredBeforeRealCanary: item.required,
    })),
    {
      id: "operator_approval",
      label: "Human/operator approval of provider identity, canary fixture, rollback plan, and exact request SHA-256",
      source: "operator",
      requiredBeforeRealCanary: true,
    },
  ];
  return {
    kind: "bittensor_subnet_adapter_evidence_bundle",
    generatedAt: nowIso(),
    requested: onboarding.requested,
    onboarding,
    launchGate,
    preflight,
    canaryReview,
    requiredArtifacts,
    exportWarnings: uniqueWarnings(
      onboarding.warnings,
      launchGate.warnings,
      preflight.warnings,
      preflight.errors,
      canaryReview.warnings,
      [
        "This bundle is evidence for review only; it does not authorize real subnet service execution.",
        "Do not paste credential values, signing material, wallet recovery material, host tokens, or private user data into evidence notes.",
      ],
    ),
    nextActions: [
      "Attach the preflight packet to the evidence bundle before any mock dry-run or real canary review.",
      "Collect evidence for every required artifact before any real HTTPS canary.",
      "Run mock dry-run and metadata conformance before manual real-adapter review.",
      "Require exact preview request SHA-256 confirmation for any future canary invocation.",
    ],
  };
}

function sanitizeEvidenceMarkdownText(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/\b(gh[pousr]|xox[baprs]|sk|pk)_[A-Za-z0-9_=-]{8,}\b/g, "[redacted-token]")
    .replace(/\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSPHRASE|KEYFILE|SURI)[A-Z0-9_]*)=([^\s]+)/gi, "$1=[redacted]")
    .trim();
}

function markdownBullet(value: string | number | boolean | null | undefined): string {
  const sanitized = sanitizeEvidenceMarkdownText(value);
  return sanitized ? `- ${sanitized}` : "- Not available";
}

export function renderBittensorSubnetAdapterEvidenceMarkdown(bundle: BittensorSubnetAdapterEvidenceBundle): string {
  const adapter = bundle.requested.adapter ?? "not specified";
  const netuid = bundle.requested.netuid === null ? "not specified" : String(bundle.requested.netuid);
  const requiredArtifacts = bundle.requiredArtifacts.map((artifact) => {
    const required = artifact.requiredBeforeRealCanary ? "required" : "optional";
    return `- [${required}] ${sanitizeEvidenceMarkdownText(artifact.label)} (${artifact.source})`;
  });
  const reviewItems = bundle.canaryReview.reviewItems.map((item) => {
    const required = item.required ? "required" : "optional";
    const blocker = item.blockerIfMissing ? "blocker if missing" : "not a blocker";
    return `- ${sanitizeEvidenceMarkdownText(item.label)}: ${required}, ${blocker}. Evidence: ${sanitizeEvidenceMarkdownText(item.evidence)}`;
  });

  return [
    "# Bittensor Subnet Adapter Evidence Export",
    "",
    `Generated: ${sanitizeEvidenceMarkdownText(bundle.generatedAt)}`,
    `Adapter: ${sanitizeEvidenceMarkdownText(adapter)}`,
    `Netuid: ${sanitizeEvidenceMarkdownText(netuid)}`,
    "",
    "## Status",
    markdownBullet(`Onboarding: ${bundle.onboarding.status}`),
    markdownBullet(`Launch gate: ${bundle.launchGate.status}`),
    markdownBullet(`Preflight: ${bundle.preflight.status}`),
    markdownBullet(`Preflight ready for conformance: ${bundle.preflight.readyForConformance ? "yes" : "no"}`),
    markdownBullet(`Preflight ready for canary evidence: ${bundle.preflight.readyForCanaryEvidence ? "yes" : "no"}`),
    markdownBullet(`Ready mock adapters: ${bundle.launchGate.readyMockCount}`),
    markdownBullet(`Ready real adapters: ${bundle.launchGate.readyRealCount}`),
    markdownBullet(`Blocked adapters: ${bundle.launchGate.blockedCount}`),
    "",
    "## Required Artifacts",
    ...(requiredArtifacts.length ? requiredArtifacts : ["- No artifacts listed"]),
    "",
    "## Canary Review Checklist",
    ...(reviewItems.length ? reviewItems : ["- No review items listed"]),
    "",
    "## Stop Conditions",
    ...bundle.canaryReview.stopConditions.map(markdownBullet),
    "",
    "## Warnings",
    ...bundle.exportWarnings.map(markdownBullet),
    "",
    "## Next Actions",
    ...bundle.nextActions.map(markdownBullet),
    "",
    "## Safety Boundary",
    "- This export is evidence for review only. It does not authorize real subnet service execution.",
    "- Do not include credential values, recovery phrases, signing material, wallet backup files, host tokens, or private user data in review notes.",
    "- A future real canary still requires a separate explicit preview, exact request SHA-256 confirmation, and operator approval.",
    "",
  ].join("\n");
}

export async function buildBittensorSubnetAdapterEvidenceExport(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterEvidenceExport> {
  const report = await buildBittensorSubnetAdapterEvidenceBundle(input);
  return {
    kind: "bittensor_subnet_adapter_evidence_export",
    generatedAt: nowIso(),
    requested: report.requested,
    summary: {
      onboardingStatus: report.onboarding.status,
      launchGateStatus: report.launchGate.status,
      preflightStatus: report.preflight.status,
      readyForConformance: report.preflight.readyForConformance,
      readyForCanaryEvidence: report.preflight.readyForCanaryEvidence,
      requiredArtifactCount: report.requiredArtifacts.length,
      warningCount: report.exportWarnings.length,
      nextActionCount: report.nextActions.length,
    },
    markdown: renderBittensorSubnetAdapterEvidenceMarkdown(report),
    warnings: report.exportWarnings,
  };
}

export async function reviewBittensorSubnetAdapterEvidence(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterEvidenceReviewDecision> {
  const bundle = await buildBittensorSubnetAdapterEvidenceBundle(input);
  const blockedReasons = [
    ...(!bundle.preflight.readyForConformance
      ? ["Preflight: manifest validation is not ready for endpoint conformance."]
      : []),
    ...(!bundle.preflight.readyForCanaryEvidence
      ? ["Preflight: validated adapter result evidence is incomplete."]
      : []),
    ...bundle.launchGate.requirements
      .filter((requirement) => requirement.status === "blocked" || requirement.status === "not_configured")
      .map((requirement) => `${requirement.label}: ${requirement.detail}`),
    ...bundle.onboarding.gates
      .filter((gate) => gate.status === "blocked" || gate.status === "not_configured")
      .map((gate) => `${gate.label}: ${gate.summary}`),
  ];
  const status: BittensorSubnetAdapterEvidenceReviewDecision["status"] =
    bundle.launchGate.status === "mock_ready"
      ? "mock_dry_run_ready"
      : bundle.launchGate.status === "manual_review_required"
        ? "manual_real_canary_review_required"
        : "blocked";
  const missingRequiredArtifactCount = status === "blocked"
    ? bundle.requiredArtifacts.filter((artifact) => artifact.requiredBeforeRealCanary).length
    : 0;
  const nextPrompt = status === "mock_dry_run_ready"
    ? `Run the Bittensor mock adapter dry-run harness${bundle.requested.netuid === null ? "" : ` for subnet ${bundle.requested.netuid}`} and summarize failures.`
    : status === "manual_real_canary_review_required"
      ? `Prepare a manual real-adapter canary review packet${bundle.requested.netuid === null ? "" : ` for subnet ${bundle.requested.netuid}`} without invoking the subnet.`
      : `Help me unblock the Bittensor adapter evidence review${bundle.requested.netuid === null ? "" : ` for subnet ${bundle.requested.netuid}`}.`;
  const summary = status === "mock_dry_run_ready"
    ? "Mock adapter evidence is ready for the dry-run harness. Real subnet execution remains disabled."
    : status === "manual_real_canary_review_required"
      ? "A real adapter needs manual review before any canary. This decision does not authorize invocation."
      : "Adapter evidence is blocked or incomplete. Resolve the listed reasons before any canary.";

  return {
    kind: "bittensor_subnet_adapter_evidence_review",
    generatedAt: nowIso(),
    requested: bundle.requested,
    status,
    summary,
    requiredArtifactCount: bundle.requiredArtifacts.length,
    missingRequiredArtifactCount,
    launchGateStatus: bundle.launchGate.status,
    onboardingStatus: bundle.onboarding.status,
    allowedNextActions: status === "mock_dry_run_ready"
      ? ["Run mock dry-run only.", "Keep real adapters disabled.", "Export evidence markdown for human review."]
      : status === "manual_real_canary_review_required"
        ? ["Export evidence markdown.", "Confirm provider identity and rollback owner.", "Do not invoke until exact preview request SHA-256 is separately confirmed."]
        : ["Resolve blocked launch-gate and onboarding reasons.", "Run doctor, conformance, and evidence export again.", "Do not invoke any subnet adapter."],
    blockedReasons: blockedReasons.length ? uniqueWarnings(blockedReasons) : [],
    warnings: uniqueWarnings(
      bundle.exportWarnings,
      status === "manual_real_canary_review_required"
        ? ["Manual review is not execution approval; real canaries require a separate confirmed preview."]
        : [],
    ),
    nextPrompt,
  };
}

export async function buildBittensorSubnetAdapterCanaryOperatorPacket(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
  requestSha256?: string | null;
  approvedBy?: string | null;
  reason?: string | null;
  ttlMinutes?: number | null;
} = {}): Promise<BittensorSubnetAdapterCanaryOperatorPacket> {
  const [evidenceExport, evidenceReview] = await Promise.all([
    buildBittensorSubnetAdapterEvidenceExport(input),
    reviewBittensorSubnetAdapterEvidence(input),
  ]);
  const requestedAdapter = input.adapter ?? evidenceReview.requested.adapter;
  const serviceAdapter = normalizeServiceAdapter(requestedAdapter, "unsupported");
  const requestSha256 = (input.requestSha256 ?? "").trim();
  const hashIsValid = isSha256Hex(requestSha256);
  const providerRegistry = summarizeBittensorSubnetAdapterProviderRegistry({ adapter: serviceAdapter, netuid: evidenceReview.requested.netuid });
  const warnings = uniqueWarnings(
    evidenceExport.warnings,
    evidenceReview.warnings,
    providerRegistry.warnings,
    evidenceReview.status === "blocked" ? ["Evidence review is blocked. Resolve blockers before generating an approval template."] : [],
    evidenceReview.status === "mock_dry_run_ready" ? ["Mock dry-run is ready, but this is not enough to approve a real subnet adapter canary."] : [],
    requestSha256 && !hashIsValid ? ["The preview request SHA-256 is malformed; approval templates require a 64-character SHA-256 hex string."] : [],
    serviceAdapter === "universal" || serviceAdapter === "unsupported" ? ["A direct subnet service adapter kind is required before a real canary approval can be generated."] : [],
  );
  const canBuildApproval =
    evidenceReview.status === "manual_real_canary_review_required" &&
    evidenceReview.requested.netuid !== null &&
    hashIsValid &&
    serviceAdapter !== "universal" &&
    serviceAdapter !== "unsupported";
  const approvalTemplate = canBuildApproval
    ? buildBittensorSubnetAdapterRuntimeApprovalTemplate({
      netuid: evidenceReview.requested.netuid as number,
      serviceAdapter,
      requestSha256,
      approvedBy: input.approvedBy,
      reason: input.reason,
      ttlMinutes: input.ttlMinutes,
    })
    : null;
  const status: BittensorSubnetAdapterCanaryOperatorPacket["status"] = approvalTemplate
    ? "approval_template_ready"
    : evidenceReview.status === "blocked" || evidenceReview.status === "mock_dry_run_ready"
      ? "blocked"
      : "needs_preview_hash";
  return {
    kind: "bittensor_subnet_adapter_canary_operator_packet",
    generatedAt: nowIso(),
    requested: evidenceReview.requested,
    status,
    previewRequestSha256Prefix: hashIsValid ? requestSha256.slice(0, 12).toLowerCase() : null,
    evidenceExport,
    evidenceReview,
    approvalTemplate,
    providerRegistry,
    warnings,
    nextActions: status === "approval_template_ready"
      ? [
        "Copy the approval template only into the reviewed canary environment.",
        "Set BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1 only for the reviewed canary window.",
        "Run approval audit after the canary and remove stale approvals.",
      ]
      : status === "needs_preview_hash"
        ? [
          "Run a preview for the exact canary fixture and paste the 64-character request SHA-256.",
          "Do not invoke any real subnet adapter until the packet includes an approval template and the operator confirms it.",
        ]
        : [
          "Resolve blocked evidence review items before requesting a real adapter approval template.",
          "Continue with mock dry-runs, conformance, and evidence review; do not invoke real subnet services.",
        ],
  };
}

export function renderBittensorSubnetAdapterCanaryPacketMarkdown(packet: BittensorSubnetAdapterCanaryOperatorPacket): string {
  const approval = packet.approvalTemplate;
  return [
    "# Bittensor Subnet Adapter Canary Packet",
    "",
    `Generated: ${sanitizeEvidenceMarkdownText(packet.generatedAt)}`,
    `Adapter: ${sanitizeEvidenceMarkdownText(packet.requested.adapter ?? "not specified")}`,
    `Netuid: ${sanitizeEvidenceMarkdownText(packet.requested.netuid ?? "not specified")}`,
    `Packet status: ${sanitizeEvidenceMarkdownText(packet.status)}`,
    `Evidence review: ${sanitizeEvidenceMarkdownText(packet.evidenceReview.status)}`,
    `Launch gate: ${sanitizeEvidenceMarkdownText(packet.evidenceReview.launchGateStatus)}`,
    `Preview request SHA-256 prefix: ${sanitizeEvidenceMarkdownText(packet.previewRequestSha256Prefix ?? "not included")}`,
    "",
    "## Provider Registry",
    markdownBullet("Registry status: " + packet.providerRegistry.status),
    markdownBullet("Matching reviewed providers: " + packet.providerRegistry.matchingReadyProviderCount),
    markdownBullet("Visible provider ids: " + (packet.providerRegistry.matchingProviderIds.length ? packet.providerRegistry.matchingProviderIds.join(", ") : "none")),
    "",
    "## Approval Template",
    approval
      ? `- Available for operator copy in Matterhorn UI/MCP card only. Env key: ${approval.env.key}. Full env value intentionally omitted from this markdown export.`
      : "- Not included. Evidence is blocked, only mock-ready, missing a valid preview hash, or missing a direct adapter kind.",
    "",
    "## Evidence Export Summary",
    markdownBullet(`Onboarding: ${packet.evidenceExport.summary.onboardingStatus}`),
    markdownBullet(`Launch gate: ${packet.evidenceExport.summary.launchGateStatus}`),
    markdownBullet(`Required artifacts: ${packet.evidenceExport.summary.requiredArtifactCount}`),
    markdownBullet(`Warnings: ${packet.evidenceExport.summary.warningCount}`),
    "",
    "## Blocked Reasons",
    ...(packet.evidenceReview.blockedReasons.length ? packet.evidenceReview.blockedReasons.map(markdownBullet) : ["- None"]),
    "",
    "## Warnings",
    ...(packet.warnings.length ? packet.warnings.map(markdownBullet) : ["- None"]),
    "",
    "## Next Actions",
    ...(packet.nextActions.length ? packet.nextActions.map(markdownBullet) : ["- None"]),
    "",
    "## Safety Boundary",
    "- This export is for review and handoff only. It does not invoke a subnet service.",
    "- Full approval env values are intentionally omitted from this markdown export.",
    "- Never include seed phrases, mnemonics, private keys, wallet exports, host tokens, or adapter credential values in review notes.",
    "",
  ].join("\n");
}

export async function buildBittensorSubnetAdapterCanaryPacketExport(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
  requestSha256?: string | null;
  approvedBy?: string | null;
  reason?: string | null;
  ttlMinutes?: number | null;
} = {}): Promise<BittensorSubnetAdapterCanaryPacketExport> {
  const packet = await buildBittensorSubnetAdapterCanaryOperatorPacket(input);
  return {
    kind: "bittensor_subnet_adapter_canary_packet_export",
    generatedAt: nowIso(),
    requested: packet.requested,
    status: packet.status,
    markdown: renderBittensorSubnetAdapterCanaryPacketMarkdown(packet),
    warnings: uniqueWarnings(packet.warnings, ["Full approval env values are intentionally omitted from this export."]),
  };
}

function normalizedCanaryOutcomeMode(value: string | null): BittensorSubnetAdapterCanaryOutcomeReport["mode"] {
  if (value === "mock" || value === "http" || value === "https") return value;
  return "unknown";
}

function requestHashPrefix(value: string | null): string | null {
  return value && isSha256Hex(value) ? value.slice(0, 12).toLowerCase() : null;
}

function requestHashFromResult(value: unknown): string | null {
  const record = asRecord(value);
  return firstString(record, ["requestSha256", "request_sha256", "previewRequestSha256", "preview_request_sha256"]);
}

function renderBittensorSubnetAdapterCanaryOutcomeMarkdown(report: Omit<BittensorSubnetAdapterCanaryOutcomeReport, "markdown">): string {
  return [
    "# Bittensor Adapter Canary Outcome Report",
    "",
    `Generated: ${sanitizeEvidenceMarkdownText(report.generatedAt)}`,
    `Adapter: ${sanitizeEvidenceMarkdownText(report.requested.adapter ?? "not specified")}`,
    `Netuid: ${sanitizeEvidenceMarkdownText(report.requested.netuid ?? "not specified")}`,
    `Status: ${sanitizeEvidenceMarkdownText(report.status)}`,
    `Mode: ${sanitizeEvidenceMarkdownText(report.mode)}`,
    `Supported: ${report.supported ? "yes" : "no"}`,
    "",
    "## Request Hash",
    markdownBullet("Expected prefix: " + (report.requestHash.expectedPrefix ? `${report.requestHash.expectedPrefix}...` : "missing")),
    markdownBullet("Actual prefix: " + (report.requestHash.actualPrefix ? `${report.requestHash.actualPrefix}...` : "missing")),
    markdownBullet("Match: " + (report.requestHash.matches ? "yes" : "no")),
    markdownBullet("Full hash redacted: yes"),
    "",
    "## Validation",
    markdownBullet("Result validation: " + report.resultValidation.status),
    markdownBullet("Canary gate: " + report.canaryGate.status),
    markdownBullet("Matching reviewed providers: " + report.providerRegistry.matchingReadyProviderCount),
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map(markdownBullet) : ["- None"]),
    "",
    "## Next Actions",
    ...(report.nextActions.length ? report.nextActions.map(markdownBullet) : ["- None"]),
    "",
    "## Safety Boundary",
    "- This report is a sanitized outcome artifact. It does not authorize future subnet service execution.",
    "- Full request hashes, endpoint URLs, credentials, task text, wallet secrets, and approval env values are intentionally omitted.",
    "- Archive the raw canary material only in the reviewed operator environment.",
    "",
  ].join("\n");
}

export function buildBittensorSubnetAdapterCanaryOutcomeReport(input: {
  invocation?: BittensorSubnetInvocation | null;
  result?: unknown;
  expectedRequestSha256?: string | null;
  adapter?: string | null;
  netuid?: number | null;
} = {}): BittensorSubnetAdapterCanaryOutcomeReport {
  const adapterResult = input.result ?? (input.invocation ? adapterRunResultFromInvocation(input.invocation) : null);
  const resultRecord = asRecord(adapterResult);
  const actualRequestSha256 = requestHashFromResult(adapterResult);
  const expectedRequestSha256 = input.expectedRequestSha256 && isSha256Hex(input.expectedRequestSha256)
    ? input.expectedRequestSha256.toLowerCase()
    : null;
  const actualHashValid = Boolean(actualRequestSha256 && isSha256Hex(actualRequestSha256));
  const expectedHashValid = Boolean(expectedRequestSha256);
  const requestHashMatches = Boolean(expectedHashValid && actualHashValid && expectedRequestSha256 === actualRequestSha256?.toLowerCase());
  const adapter = normalizeServiceAdapter(
    input.adapter ?? input.invocation?.adapter ?? firstString(resultRecord, ["adapterKind", "adapter", "serviceAdapter"]),
    "unsupported",
  );
  const netuid = input.netuid ?? input.invocation?.netuid ?? firstNumber(resultRecord, ["netuid"]);
  const validation = validateBittensorSubnetAdapterResult(adapterResult);
  const canaryGate = auditBittensorSubnetAdapterCanaryGate();
  const providerRegistry = summarizeBittensorSubnetAdapterProviderRegistry({ adapter, netuid });
  const supported = Boolean(input.invocation?.supported ?? (Object.keys(resultRecord).length > 0 && resultRecord["ok"] !== false));
  const mode = normalizedCanaryOutcomeMode(firstString(resultRecord, ["mode", "adapterMode", "adapter_mode"]));
  const hasResult = Object.keys(resultRecord).length > 0;
  const hashMismatch = Boolean(expectedHashValid && actualHashValid && !requestHashMatches);
  const status: BittensorSubnetAdapterCanaryOutcomeReport["status"] = !hasResult
    ? "blocked"
    : validation.status === "fail" || hashMismatch || !supported
      ? "fail"
      : validation.status === "warning" || !expectedHashValid || !actualHashValid || canaryGate.status !== "canary_armed"
        ? "warning"
        : "pass";
  const warnings = uniqueWarnings(
    validation.warnings,
    validation.errors,
    canaryGate.warnings,
    canaryGate.blockers,
    providerRegistry.warnings,
    !hasResult ? ["No adapter result was supplied; run a preview-confirm-invoke loop before archiving a canary outcome."] : [],
    !expectedHashValid ? ["Expected reviewed request SHA-256 was missing or malformed; the report cannot prove request continuity."] : [],
    !actualHashValid ? ["Adapter result did not include a valid requestSha256 value."] : [],
    hashMismatch ? ["Canary outcome request SHA-256 does not match the reviewed preview request SHA-256."] : [],
    !supported ? ["Adapter invocation did not report a supported successful result."] : [],
    status === "warning" && canaryGate.status !== "canary_armed" ? ["Canary gate is not armed; treat this as mock or rehearsal evidence only."] : [],
  );
  const nextActions = status === "pass"
    ? [
      "Archive this sanitized report with the operator canary notes.",
      "Remove short-lived approvals after the canary window closes.",
      "Review provider and rollback evidence before promoting the adapter beyond canary.",
    ]
    : status === "warning"
      ? [
        "Keep this as rehearsal evidence until the canary gate and provider evidence are complete.",
        "Confirm the exact preview request SHA-256 and adapter result envelope before any real canary.",
      ]
      : status === "fail"
        ? [
          "Do not promote this adapter outcome.",
          "Fix request hash, result validation, or invocation failures and rerun the preview-confirm-invoke loop.",
        ]
        : [
          "Run a mock or reviewed canary invocation first.",
          "Attach the adapter result and expected preview request SHA-256 to build an outcome report.",
        ];
  const base = {
    kind: "bittensor_subnet_adapter_canary_outcome_report" as const,
    generatedAt: nowIso(),
    requested: { adapter, netuid },
    status,
    mode,
    supported,
    requestHash: {
      expectedPrefix: requestHashPrefix(expectedRequestSha256),
      actualPrefix: requestHashPrefix(actualRequestSha256),
      matches: requestHashMatches,
      expectedPresent: expectedHashValid,
      actualPresent: actualHashValid,
    },
    resultValidation: validation,
    canaryGate,
    providerRegistry,
    summary: {
      validationStatus: validation.status,
      canaryGateStatus: canaryGate.status,
      matchingReviewedProviderCount: providerRegistry.matchingReadyProviderCount,
      warningCount: warnings.length,
      fullHashRedacted: true as const,
    },
    warnings,
    nextActions,
  };
  return {
    ...base,
    markdown: renderBittensorSubnetAdapterCanaryOutcomeMarkdown(base),
  };
}

export function getBittensorSubnetAdapterSpec(): BittensorSubnetAdapterSpec {
  return {
    kind: "bittensor_subnet_adapter_spec",
    version: "matterhorn.bittensor.adapter.v1",
    generatedAt: nowIso(),
    supportedServiceAdapters: ["data_search", "inference", "compute", "creative_media", "agent_tooling"],
    requiredMetadata: {
      version: "Must equal matterhorn.bittensor.adapter.v1.",
      netuid: "Bittensor subnet id served by this adapter.",
      serviceAdapter: "One of data_search, inference, compute, creative_media, or agent_tooling.",
      supportedIntents: "Must include service_call before Matterhorn can preview direct service use.",
      safeModeRequired: "Must be true for Matterhorn-managed adapter calls.",
      requestHashRequired: "Must be true; invocation requires the exact preview request SHA-256.",
      maxResponseBytes: "Maximum response size the adapter agrees to return.",
      healthStatus: "ok, degraded, or unavailable.",
      privacy: "Must explicitly state sendsWalletData=false and sendsKeyMaterial=false.",
    },
    invocationContract: {
      previewRequired: true,
      exactRequestHashRequired: true,
      userTaskSentOnlyOnInvoke: true,
      missingHashBehavior: "reject",
      mismatchedHashBehavior: "reject",
      defaultRealAdapterState: "disabled",
    },
    forbiddenFields: [
      "seed",
      "seedPhrase",
      "mnemonic",
      "privateKey",
      "keyfile",
      "walletExport",
      "suri",
      "password",
      "hostToken",
      "credentialValue",
    ],
    responseLimits: {
      defaultMaxBytes: subnetAdapterMaxResponseBytes(),
      hardMaxBytes: 2_000_000,
    },
    safetyNotes: [
      "Matterhorn never sends seed phrases, mnemonics, private keys, wallet exports, host tokens, or adapter credential values to subnet adapters.",
      "Metadata conformance sends no user task text and no wallet data.",
      "Real adapters remain disabled unless explicitly enabled and exact request approvals are configured for reviewed canaries.",
      "Adapters should return bounded, renderable, non-secret outputs with usage and cost metadata when available.",
    ],
    nextActions: [
      "Implement the metadata document before configuring a provider endpoint.",
      "Run adapter doctor and metadata conformance before any preview.",
      "Use mock dry-runs before manual real-adapter canary review.",
      "Use canary packets and short-lived exact request approvals for reviewed real canaries only.",
    ],
  };
}

function booleanField(record: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === "true";
  }
  return null;
}

function stringArrayField(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  }
  return [];
}

function normalizeSubnetServiceIntentList(value: string[]): BittensorSubnetServiceIntent[] {
  const allowed: BittensorSubnetServiceIntent[] = ["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"];
  return value.filter((item): item is BittensorSubnetServiceIntent => allowed.includes(item as BittensorSubnetServiceIntent));
}

function directSubnetAdapterKind(adapter: BittensorSubnetServiceAdapterKind): adapter is Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported"> {
  return adapter === "data_search" || adapter === "inference" || adapter === "compute" || adapter === "creative_media" || adapter === "agent_tooling";
}

export function validateBittensorSubnetAdapterManifest(manifestInput: unknown): BittensorSubnetAdapterManifestValidation {
  const checkedAt = nowIso();
  const record = asRecord(manifestInput);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Object.keys(record).length) errors.push("Adapter manifest must be a JSON object.");

  const version = firstString(record, ["version"]);
  const name = firstString(record, ["name"]);
  const netuid = firstNumber(record, ["netuid", "net_uid", "subnet"]);
  const serviceAdapter = normalizeServiceAdapter(record["serviceAdapter"] ?? record["adapter"], "unsupported");
  const rawIntents = stringArrayField(record, ["supportedIntents", "supported_intents", "intents"]);
  const supportedIntents = normalizeSubnetServiceIntentList(rawIntents);
  const safeModeRequired = booleanField(record, ["safeModeRequired", "safe_mode_required"]);
  const requestHashRequired = booleanField(record, ["requestHashRequired", "request_hash_required"]);
  const maxResponseBytes = firstNumber(record, ["maxResponseBytes", "max_response_bytes"]);
  const healthStatus = firstString(record, ["healthStatus", "health_status"]);
  const requiredAuth = normalizeRequiredAuth(record["requiredAuth"] ?? record["required_auth"]);
  const costModel = normalizeCostModel(record["costModel"] ?? record["cost_model"]);
  const endpointConfigured = booleanField(record, ["endpointConfigured", "endpoint_configured"]) ?? false;
  const timeoutMs = firstNumber(record, ["timeoutMs", "timeout_ms"]);
  const privacy = asRecord(record["privacy"]);
  const safetyNotes = stringArrayField(record, ["safetyNotes", "safety_notes"]);
  const requestSchema = asRecord(record["requestSchema"] ?? record["request_schema"]);
  const resultSchema = asRecord(record["resultSchema"] ?? record["result_schema"]);

  if (version !== "matterhorn.bittensor.adapter.v1") errors.push("version must equal matterhorn.bittensor.adapter.v1.");
  if (netuid === null || !Number.isInteger(netuid) || netuid < 0) errors.push("netuid must be a non-negative integer.");
  if (!directSubnetAdapterKind(serviceAdapter)) errors.push("serviceAdapter must be one of data_search, inference, compute, creative_media, or agent_tooling.");
  if (!rawIntents.length) errors.push("supportedIntents must be a non-empty array.");
  if (rawIntents.length !== supportedIntents.length) errors.push("supportedIntents contains unsupported intent values.");
  if (!supportedIntents.includes("service_call")) errors.push("supportedIntents must include service_call for direct subnet service use.");
  if (safeModeRequired !== true) errors.push("safeModeRequired must be true.");
  if (requestHashRequired !== true) errors.push("requestHashRequired must be true.");
  if (maxResponseBytes === null || !Number.isInteger(maxResponseBytes) || maxResponseBytes < 1) {
    errors.push("maxResponseBytes must be a positive integer.");
  } else if (maxResponseBytes > getBittensorSubnetAdapterSpec().responseLimits.hardMaxBytes) {
    errors.push(`maxResponseBytes must not exceed ${getBittensorSubnetAdapterSpec().responseLimits.hardMaxBytes}.`);
  } else if (maxResponseBytes > getBittensorSubnetAdapterSpec().responseLimits.defaultMaxBytes) {
    warnings.push("maxResponseBytes is above Matterhorn's default response limit; operator review should confirm UI rendering and storage impact.");
  }
  if (healthStatus !== "ok" && healthStatus !== "degraded" && healthStatus !== "unavailable") {
    errors.push("healthStatus must be ok, degraded, or unavailable.");
  } else if (healthStatus !== "ok") {
    warnings.push(`Adapter healthStatus is ${healthStatus}; do not use it for real canaries until health is ok.`);
  }
  if (privacy["sendsWalletData"] !== false) errors.push("privacy.sendsWalletData must be false.");
  if (privacy["sendsKeyMaterial"] !== false) errors.push("privacy.sendsKeyMaterial must be false.");
  if (secretFieldPath(record)) errors.push(`Adapter manifest contains a secret-shaped field at ${secretFieldPath(record)}.`);
  if (!safetyNotes.length) warnings.push("Adapter manifest should include safetyNotes for operator review.");
  if (!Object.keys(requestSchema).length) warnings.push("Adapter manifest should include a requestSchema.");
  if (!Object.keys(resultSchema).length) warnings.push("Adapter manifest should include a resultSchema.");

  const contract: BittensorSubnetServiceAdapterContract = {
    version: (version === "matterhorn.bittensor.adapter.v1" ? version : "matterhorn.bittensor.adapter.v1"),
    netuid: netuid ?? -1,
    adapter: serviceAdapter,
    capabilityLevel: endpointConfigured && directSubnetAdapterKind(serviceAdapter) ? "adapter_ready" : "adapter_required",
    supportedIntents,
    endpointConfigured,
    requiredAuth,
    costModel,
    timeoutMs,
    requestSchema,
    resultSchema,
    privacy: {
      sendsTaskText: privacy["sendsTaskText"] === true,
      sendsSs58Address: privacy["sendsSs58Address"] === true,
      sendsWalletData: privacy["sendsWalletData"] as false,
      sendsKeyMaterial: privacy["sendsKeyMaterial"] as false,
    },
    safetyNotes,
    unsupportedBehavior: {
      status: endpointConfigured ? "explain_and_monitor_only" : "adapter_missing",
      message: endpointConfigured
        ? "Adapter manifest is ready for preview, conformance, and manual canary gates."
        : "Adapter manifest is valid for planning, but no endpoint is configured yet.",
      fallbackIntents: ["explain", "metagraph", "stake_guidance", "wallet_guidance"],
    },
  };
  const contractValidation = validateBittensorSubnetServiceAdapterContract(contract);
  const allErrors = uniqueWarnings(errors, contractValidation.errors);
  const allWarnings = uniqueWarnings(warnings, contractValidation.warnings);
  const serviceCallReady = contractServiceCallReady(contract, contractValidation) && allErrors.length === 0;
  const status: BittensorSubnetAdapterManifestValidation["status"] = allErrors.length ? "fail" : allWarnings.length ? "warning" : "pass";

  return {
    kind: "bittensor_subnet_adapter_manifest_validation",
    checkedAt,
    status,
    manifest: {
      version,
      name,
      netuid,
      serviceAdapter,
      supportedIntents,
      safeModeRequired,
      requestHashRequired,
      maxResponseBytes,
      healthStatus,
    },
    contract,
    contractValidation,
    serviceCallReady,
    errors: allErrors,
    warnings: allWarnings,
    nextActions: serviceCallReady
      ? [
        "Run metadata conformance against the configured endpoint without sending task text or wallet data.",
        "Run mock dry-run and canary packet review before any real adapter canary.",
      ]
      : [
        "Fix manifest errors before configuring or invoking any subnet adapter.",
        "Keep unsupported behavior active until the manifest, conformance, dry-run, and canary gates pass.",
      ],
  };
}

function buildSubnetAdapterManifestExample(
  adapter: Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">,
  netuid: number,
): BittensorSubnetAdapterManifestExample {
  const baseManifest = {
    version: "matterhorn.bittensor.adapter.v1",
    netuid,
    serviceAdapter: adapter,
    supportedIntents: ["explain", "metagraph", "service_call"],
    safeModeRequired: true,
    requestHashRequired: true,
    healthStatus: "ok",
    requiredAuth: "api_key",
    costModel: "provider_priced",
    endpointConfigured: true,
    privacy: {
      sendsTaskText: true,
      sendsSs58Address: false,
      sendsWalletData: false,
      sendsKeyMaterial: false,
    },
    safetyNotes: [
      "Adapter accepts visible user task text only after preview hash confirmation.",
      "Adapter does not accept wallet data, signing material, host tokens, or credential values.",
      "Adapter responses must be bounded, renderable, and safe to show in a chat card.",
    ],
  };
  const categoryManifest: Record<Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">, {
    title: string;
    description: string;
    manifest: Record<string, unknown>;
  }> = {
    data_search: {
      title: "Data search adapter manifest",
      description: "Use for subnet services that search, retrieve, rank, summarize, or cite data sources.",
      manifest: {
        ...baseManifest,
        name: "Example data search adapter",
        maxResponseBytes: 64_000,
        requestSchema: {
          type: "object",
          required: ["task", "previewRequestSha256"],
          properties: {
            task: { type: "string", maxLength: 4000 },
            previewRequestSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            limit: { type: "integer", minimum: 1, maximum: 10 },
          },
          additionalProperties: false,
        },
        resultSchema: {
          type: "object",
          required: ["summary", "results", "warnings"],
          properties: {
            summary: { type: "string", maxLength: 2000 },
            results: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  url: { type: "string" },
                  snippet: { type: "string" },
                  score: { type: "number" },
                },
              },
            },
            warnings: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    inference: {
      title: "Inference adapter manifest",
      description: "Use for subnet services that run text, image, or multimodal inference behind Matterhorn's preview-confirm-invoke gate.",
      manifest: {
        ...baseManifest,
        name: "Example inference adapter",
        maxResponseBytes: 128_000,
        requestSchema: {
          type: "object",
          required: ["task", "previewRequestSha256"],
          properties: {
            task: { type: "string", maxLength: 4000 },
            previewRequestSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
            modality: { type: "string", enum: ["text", "image", "multimodal"] },
            maxTokens: { type: "integer", minimum: 1, maximum: 4096 },
          },
          additionalProperties: false,
        },
        resultSchema: {
          type: "object",
          required: ["output", "warnings"],
          properties: {
            output: { type: "string" },
            model: { type: "string" },
            usage: {
              type: "object",
              properties: {
                inputTokens: { type: "number" },
                outputTokens: { type: "number" },
              },
            },
            warnings: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    compute: {
      title: "Compute adapter manifest",
      description: "Use for bounded compute jobs that return status, logs, and artifacts through Matterhorn's safe result envelope.",
      manifest: {
        ...baseManifest,
        name: "Example compute adapter",
        maxResponseBytes: 128_000,
        requestSchema: { type: "object", required: ["task", "previewRequestSha256"], properties: { task: { type: "string" }, previewRequestSha256: { type: "string" } } },
        resultSchema: { type: "object", required: ["status", "warnings"], properties: { status: { type: "string" }, logs: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } } } },
      },
    },
    creative_media: {
      title: "Creative media adapter manifest",
      description: "Use for bounded media generation or transformation services that return safe asset references and warnings.",
      manifest: {
        ...baseManifest,
        name: "Example creative media adapter",
        maxResponseBytes: 128_000,
        requestSchema: { type: "object", required: ["task", "previewRequestSha256"], properties: { task: { type: "string" }, previewRequestSha256: { type: "string" }, outputType: { type: "string" } } },
        resultSchema: { type: "object", required: ["summary", "assets", "warnings"], properties: { summary: { type: "string" }, assets: { type: "array", items: { type: "object" } }, warnings: { type: "array", items: { type: "string" } } } },
      },
    },
    agent_tooling: {
      title: "Agent tooling adapter manifest",
      description: "Use for subnet services that expose bounded tool execution or agent-assist results back to Matterhorn.",
      manifest: {
        ...baseManifest,
        name: "Example agent tooling adapter",
        maxResponseBytes: 64_000,
        requestSchema: { type: "object", required: ["task", "previewRequestSha256"], properties: { task: { type: "string" }, previewRequestSha256: { type: "string" }, toolName: { type: "string" } } },
        resultSchema: { type: "object", required: ["summary", "actions", "warnings"], properties: { summary: { type: "string" }, actions: { type: "array", items: { type: "object" } }, warnings: { type: "array", items: { type: "string" } } } },
      },
    },
  };
  const entry = categoryManifest[adapter];
  return {
    adapter,
    netuid,
    title: entry.title,
    description: entry.description,
    manifest: entry.manifest,
    validation: validateBittensorSubnetAdapterManifest(entry.manifest),
  };
}

export function getBittensorSubnetAdapterManifestExamples(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): BittensorSubnetAdapterManifestExampleReport {
  const adapters: Array<Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">> = ["data_search", "inference", "compute", "creative_media", "agent_tooling"];
  const requestedAdapter = typeof input.adapter === "string" ? input.adapter : null;
  const adapterFilter = directSubnetAdapterKind(normalizeServiceAdapter(requestedAdapter, "unsupported"))
    ? normalizeServiceAdapter(requestedAdapter, "unsupported") as Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">
    : null;
  const requestedNetuid = Number.isInteger(input.netuid ?? null) && Number(input.netuid) >= 0 ? Number(input.netuid) : null;
  const limit = Number.isInteger(input.limit ?? null) && Number(input.limit) > 0 ? Math.min(10, Number(input.limit)) : adapters.length;
  const examples = (adapterFilter ? [adapterFilter] : adapters)
    .slice(0, limit)
    .map((adapter, index) => buildSubnetAdapterManifestExample(adapter, requestedNetuid ?? (adapter === "data_search" ? 18 : adapter === "inference" ? 4 : 77 + index)));
  return {
    kind: "bittensor_subnet_adapter_manifest_examples",
    generatedAt: nowIso(),
    requested: {
      adapter: requestedAdapter,
      netuid: requestedNetuid,
    },
    examples,
    warnings: examples.some((example) => example.validation.status === "fail")
      ? ["One or more generated examples failed validation; do not use failed examples."]
      : [],
    nextActions: [
      "Copy an example manifest and replace name, netuid, schemas, auth, and cost values for the real adapter.",
      "Run bittensor_validate_subnet_adapter_manifest after each edit.",
      "Only then configure endpoints and run metadata conformance.",
    ],
  };
}

function secretValuePath(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = secretValuePath(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nested = secretValuePath(child, [...path, key]);
      if (nested) return nested;
    }
    return null;
  }
  if (typeof value !== "string") return null;
  if (/(seed phrase|mnemonic|private key|wallet export|-----BEGIN|Bearer\s+[A-Za-z0-9._-]{8,})/i.test(value)) {
    return path.join(".") || "$";
  }
  return null;
}

export function validateBittensorSubnetAdapterResult(resultInput: unknown, options: {
  maxResponseBytes?: number | null;
} = {}): BittensorSubnetAdapterResultValidation {
  const checkedAt = nowIso();
  const errors: string[] = [];
  const warnings: string[] = [];
  const record = asRecord(resultInput);
  if (!Object.keys(record).length) errors.push("Adapter result must be a JSON object.");
  const serialized = JSON.stringify(resultInput ?? null);
  const responseBytes = new TextEncoder().encode(serialized).byteLength;
  const limit = Number.isInteger(options.maxResponseBytes ?? null) && Number(options.maxResponseBytes) > 0
    ? Math.min(Number(options.maxResponseBytes), getBittensorSubnetAdapterSpec().responseLimits.hardMaxBytes)
    : getBittensorSubnetAdapterSpec().responseLimits.defaultMaxBytes;
  if (responseBytes > limit) errors.push(`Adapter result is ${responseBytes} bytes, above the ${limit} byte response limit.`);
  const forbiddenField = secretFieldPath(record);
  if (forbiddenField) errors.push(`Adapter result contains a secret-shaped field at ${forbiddenField}.`);
  const forbiddenValue = secretValuePath(record);
  if (forbiddenValue) errors.push(`Adapter result contains a secret-shaped value at ${forbiddenValue}.`);
  const requestSha256 = firstString(record, ["requestSha256", "request_sha256", "previewRequestSha256", "preview_request_sha256"]);
  if (!requestSha256) {
    warnings.push("Adapter result should include the reviewed preview request SHA-256 for auditability.");
  } else if (!isSha256Hex(requestSha256)) {
    errors.push("Adapter result requestSha256 must be a 64-character SHA-256 hex string.");
  }
  const mode = firstString(record, ["mode", "adapterMode", "adapter_mode"]);
  if (mode && mode !== "mock" && mode !== "http" && mode !== "https") {
    warnings.push(`Adapter result mode '${mode}' is not one of mock, http, or https.`);
  }
  const outputPresent = Boolean(record["output"] ?? record["result"] ?? record["summary"] ?? record["message"]);
  if (!outputPresent) warnings.push("Adapter result should include output, result, summary, or message for chat rendering.");
  const warningsValue = record["warnings"];
  if (warningsValue !== undefined && !Array.isArray(warningsValue)) errors.push("Adapter result warnings must be an array when present.");
  if (warningsValue === undefined) warnings.push("Adapter result should include a warnings array, even when empty.");
  const usagePresent = Boolean(record["usage"]);
  const costPresent = Boolean(record["costEstimate"] ?? record["cost_estimate"] ?? record["cost"]);
  const status: BittensorSubnetAdapterResultValidation["status"] = errors.length ? "fail" : warnings.length ? "warning" : "pass";

  return {
    kind: "bittensor_subnet_adapter_result_validation",
    checkedAt,
    status,
    summary: {
      mode,
      requestSha256Prefix: requestSha256 && isSha256Hex(requestSha256) ? requestSha256.slice(0, 12) : null,
      responseBytes,
      outputPresent,
      usagePresent,
      costPresent,
    },
    errors,
    warnings,
    nextActions: status === "fail"
      ? ["Fix result envelope errors before using this adapter output in chat or canary evidence."]
      : ["Attach this validation to the canary evidence bundle before any real adapter review.", "Keep response limits and redaction checks enabled for live invocations."],
  };
}

export function buildBittensorSubnetAdapterPreflightPacket(input: {
  manifest: unknown;
  result?: unknown;
  maxResponseBytes?: number | null;
}): BittensorSubnetAdapterPreflightPacket {
  const checkedAt = nowIso();
  const manifestValidation = validateBittensorSubnetAdapterManifest(input.manifest);
  const hasResult = input.result !== undefined && input.result !== null;
  const resultValidation = hasResult
    ? validateBittensorSubnetAdapterResult(input.result, { maxResponseBytes: input.maxResponseBytes })
    : null;
  const errors = uniqueWarnings(
    manifestValidation.status === "fail" ? manifestValidation.errors : [],
    resultValidation?.status === "fail" ? resultValidation.errors : [],
  );
  const warnings = uniqueWarnings(
    manifestValidation.warnings,
    resultValidation?.warnings ?? [],
    resultValidation ? [] : ["No adapter result sample was supplied; canary evidence is incomplete."],
  );
  const readyForConformance = manifestValidation.status !== "fail";
  const readyForCanaryEvidence = readyForConformance && Boolean(resultValidation) && resultValidation?.status !== "fail";
  const status: BittensorSubnetAdapterPreflightPacket["status"] = errors.length
    ? "fail"
    : warnings.length
      ? "warning"
      : "pass";
  return {
    kind: "bittensor_subnet_adapter_preflight_packet",
    checkedAt,
    status,
    manifestValidation,
    resultValidation,
    readyForConformance,
    readyForCanaryEvidence,
    errors,
    warnings,
    nextActions: errors.length
      ? ["Fix manifest/result validation errors before endpoint conformance or canary evidence review."]
      : readyForCanaryEvidence
        ? ["Run endpoint metadata conformance, then attach this preflight packet to the canary evidence bundle."]
        : ["Add a validated adapter result sample before canary evidence review.", "Run endpoint metadata conformance only after manifest validation remains non-failing."],
  };
}

function renderBittensorSubnetAdapterPreflightPacketMarkdown(packet: BittensorSubnetAdapterPreflightPacket): string {
  return [
    "# Bittensor Adapter Preflight Packet",
    "",
    `- Checked: ${packet.checkedAt}`,
    `- Status: ${packet.status}`,
    `- Ready for conformance: ${packet.readyForConformance ? "yes" : "no"}`,
    `- Ready for canary evidence: ${packet.readyForCanaryEvidence ? "yes" : "no"}`,
    "",
    "## Manifest Validation",
    `- Status: ${packet.manifestValidation.status}`,
    `- Adapter: ${packet.manifestValidation.manifest.serviceAdapter}`,
    `- Netuid: ${packet.manifestValidation.manifest.netuid ?? "missing"}`,
    `- Service call ready: ${packet.manifestValidation.serviceCallReady ? "yes" : "no"}`,
    `- Health: ${packet.manifestValidation.manifest.healthStatus ?? "missing"}`,
    "",
    "## Result Validation",
    packet.resultValidation
      ? [
        `- Status: ${packet.resultValidation.status}`,
        `- Mode: ${packet.resultValidation.summary.mode ?? "unknown"}`,
        `- Request SHA-256 prefix: ${packet.resultValidation.summary.requestSha256Prefix ?? "missing"}`,
        `- Response bytes: ${packet.resultValidation.summary.responseBytes}`,
        `- Output present: ${packet.resultValidation.summary.outputPresent ? "yes" : "no"}`,
      ].join("\n")
      : "- Not supplied.",
    "",
    "## Errors",
    ...(packet.errors.length ? packet.errors.map(markdownBullet) : ["- None"]),
    "",
    "## Warnings",
    ...(packet.warnings.length ? packet.warnings.map(markdownBullet) : ["- None"]),
    "",
    "## Next Actions",
    ...(packet.nextActions.length ? packet.nextActions.map(markdownBullet) : ["- None"]),
    "",
    "## Safety Boundary",
    "- This export is for review and handoff only. It does not invoke a subnet service.",
    "- Raw manifest and result payloads are intentionally omitted from this markdown export.",
    "- Never include seed phrases, mnemonics, private keys, wallet exports, host tokens, or adapter credential values in review notes.",
    "",
  ].join("\n");
}

export function buildBittensorSubnetAdapterPreflightPacketExport(input: {
  manifest: unknown;
  result?: unknown;
  maxResponseBytes?: number | null;
}): BittensorSubnetAdapterPreflightPacketExport {
  const packet = buildBittensorSubnetAdapterPreflightPacket(input);
  return {
    kind: "bittensor_subnet_adapter_preflight_packet_export",
    generatedAt: nowIso(),
    status: packet.status,
    markdown: renderBittensorSubnetAdapterPreflightPacketMarkdown(packet),
    warnings: uniqueWarnings(packet.warnings, ["Raw manifest and result payloads are intentionally omitted from this export."]),
  };
}

function isUnsafeAuthEnvName(value: string): boolean {
  return /(seed|mnemonic|private|suri|keyfile|passphrase)/i.test(value);
}

function validateSubnetAdapterAuth(
  requiredAuth: BittensorCapabilityManifest["requiredAuth"],
  authEnv: string | null,
): { auth: BittensorSubnetAdapterDoctorAuth; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const envConfigured = Boolean(authEnv);
  const credentialPresent = authEnv ? Boolean(readEnv(authEnv)) : null;
  if (authEnv && isUnsafeAuthEnvName(authEnv)) {
    errors.push("Adapter auth env name appears to reference signing or key-material fields.");
  }
  if (requiredAuth === "api_key" && !authEnv) {
    errors.push("Adapter requires API key auth but no auth env is configured.");
  }
  if (requiredAuth === "api_key" && authEnv && !credentialPresent) {
    errors.push("Adapter requires API key auth but the configured credential value is not present.");
  }
  if (requiredAuth === "none" && authEnv) {
    warnings.push("Adapter declares no auth requirement but still configures an auth env.");
  }
  if (requiredAuth === "external_wallet") {
    errors.push("Subnet service adapters cannot require wallet signing material; use the external signer flow for Bittensor extrinsics.");
  }
  return {
    auth: {
      required: requiredAuth,
      envConfigured,
      credentialPresent,
      message: requiredAuth === "api_key"
        ? envConfigured
          ? credentialPresent
            ? "Required adapter credential is present."
            : "Required adapter credential is not present."
          : "Required adapter credential env is not configured."
        : requiredAuth === "none"
          ? "Adapter does not require credentials."
          : "Adapter auth requires additional review.",
    },
    errors,
    warnings,
  };
}

function subnetAdapterRuntimeGateBlockers(adapter: BittensorConfiguredSubnetAdapter, requestSha256?: string | null): string[] {
  const endpoint = summarizeSubnetAdapterEndpoint(adapter.endpoint);
  const auth = validateSubnetAdapterAuth(adapter.requiredAuth, adapter.authEnv ?? null);
  const realAdapterBlocked = endpoint.mode !== "mock" && !realSubnetAdaptersEnabled()
    ? "Real subnet service adapters are disabled until BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=1 after evidence review and operator approval."
    : null;
  const canaryAcknowledgementBlocked = endpoint.mode !== "mock" && requestSha256 && !realSubnetAdapterCanaryAcknowledged()
    ? "Real subnet service adapter invocation requires BITTENSOR_SUBNET_ADAPTER_CANARY_ACK=1 for the reviewed canary window."
    : null;
  const approvalBlocked = endpoint.mode !== "mock" && requestSha256 && !findSubnetAdapterRuntimeApproval(adapter, requestSha256)
    ? "Real subnet service adapter invocation requires BITTENSOR_SUBNET_ADAPTER_APPROVALS_JSON to include the exact reviewed request SHA-256."
    : null;
  return [
    endpoint.allowed ? null : endpoint.reason,
    realAdapterBlocked,
    canaryAcknowledgementBlocked,
    approvalBlocked,
    ...auth.errors,
  ].filter((item): item is string => Boolean(item));
}

function parseSubnetAdapterConfigEntries(raw: string): unknown[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return Object.entries(asRecord(parsed)).map(([netuid, value]) => ({ ...asRecord(value), netuid: Number(netuid) }));
  } catch {
    return null;
  }
}

export function doctorBittensorSubnetAdapters(): BittensorSubnetAdapterDoctorReport {
  const checkedAt = nowIso();
  const raw = readEnv("BITTENSOR_SUBNET_ADAPTERS_JSON");
  if (!raw) {
    return {
      kind: "bittensor_subnet_adapter_doctor",
      status: "warning",
      checkedAt,
      rawConfigured: false,
      rawEntryCount: 0,
      readyCount: 0,
      warningCount: 0,
      blockedCount: 0,
      entries: [],
      errors: [],
      warnings: ["No subnet service adapters are configured. Universal explain, compare, monitor, wallet, and staking-preview flows still work."],
      nextActions: [
        "Configure BITTENSOR_SUBNET_ADAPTERS_JSON only for adapters you want Matterhorn to preview and invoke.",
        "Use mock://data-search or mock://inference with BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS=1 before adding real subnet execution.",
      ],
    };
  }

  const rawEntries = parseSubnetAdapterConfigEntries(raw);
  if (!rawEntries) {
    return {
      kind: "bittensor_subnet_adapter_doctor",
      status: "fail",
      checkedAt,
      rawConfigured: true,
      rawEntryCount: 0,
      readyCount: 0,
      warningCount: 0,
      blockedCount: 0,
      entries: [],
      errors: ["BITTENSOR_SUBNET_ADAPTERS_JSON must be valid JSON."],
      warnings: [],
      nextActions: ["Fix BITTENSOR_SUBNET_ADAPTERS_JSON syntax, then rerun the adapter doctor."],
    };
  }

  const duplicateNetuids = new Set<number>();
  const seenNetuids = new Set<number>();
  for (const entry of rawEntries) {
    const netuid = firstNumber(asRecord(entry), ["netuid", "net_uid", "subnet"]);
    if (netuid !== null && Number.isInteger(netuid)) {
      if (seenNetuids.has(netuid)) duplicateNetuids.add(netuid);
      seenNetuids.add(netuid);
    }
  }

  const entries = rawEntries.map((entry, index): BittensorSubnetAdapterDoctorEntry => {
    const record = asRecord(entry);
    const errors: string[] = [];
    const warnings: string[] = [];
    const netuid = firstNumber(record, ["netuid", "net_uid", "subnet"]);
    const endpoint = firstString(record, ["endpoint", "url", "baseUrl", "base_url"]);
    const adapterRaw = record["serviceAdapter"] ?? record["adapter"];
    const requiredAuthRaw = record["requiredAuth"] ?? record["auth"];
    const costModelRaw = record["costModel"] ?? record["cost"];
    const serviceAdapter = normalizeServiceAdapter(adapterRaw, "unsupported");
    const requiredAuth = normalizeRequiredAuth(requiredAuthRaw);
    const costModel = normalizeCostModel(costModelRaw);
    const timeoutRaw = firstNumber(record, ["timeoutMs", "timeout_ms"]);
    const timeoutMs = timeoutRaw === null ? 20_000 : Math.min(60_000, Math.max(1_000, timeoutRaw));
    const authEnv = firstString(record, ["authEnv", "auth_env", "apiKeyEnv", "api_key_env"]);
    const safetyNotes = arrayFrom(record["safetyNotes"] ?? record["safety_notes"])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    const endpointSummary = summarizeSubnetAdapterEndpoint(endpoint);
    const authValidation = validateSubnetAdapterAuth(requiredAuth, authEnv);
    const requestSchema = adapterSchemaFromConfig(record["requestSchema"] ?? record["request_schema"], defaultSubnetAdapterRequestSchema());
    const resultSchema = adapterSchemaFromConfig(record["resultSchema"] ?? record["result_schema"], defaultSubnetAdapterResultSchema());

    if (netuid === null || !Number.isInteger(netuid) || netuid < 0) errors.push("Adapter netuid must be a non-negative integer.");
    if (typeof adapterRaw !== "string" || serviceAdapter === "unsupported") errors.push("Adapter serviceAdapter must be one of inference, data_search, compute, creative_media, or agent_tooling.");
    if (typeof requiredAuthRaw !== "string" || requiredAuth === "unknown") warnings.push("Adapter requiredAuth is unknown; set none or api_key for service adapters.");
    if (typeof costModelRaw !== "string" || costModel === "unknown") warnings.push("Adapter costModel is unknown; set free_read, provider_priced, or tao_fee.");
    if (timeoutRaw !== null && (!Number.isFinite(timeoutRaw) || timeoutRaw <= 0)) warnings.push("Adapter timeoutMs should be a positive number.");
    if (duplicateNetuids.has(netuid ?? -1)) warnings.push("Multiple adapters are configured for the same netuid; runtime will use the first matching entry.");
    if (!endpointSummary.allowed) errors.push(endpointSummary.reason);
    errors.push(...authValidation.errors);
    warnings.push(...authValidation.warnings);
    if (!safetyNotes.length) warnings.push("Adapter should include safetyNotes for operator review.");

    const adapterStatus: BittensorCapabilityManifest["adapterStatus"] = {
      configured: Boolean(endpointSummary.configured && serviceAdapter !== "unsupported"),
      adapter: serviceAdapter,
      message: endpointSummary.allowed ? "Adapter endpoint passed doctor allowlist checks." : endpointSummary.reason,
      requiredAuth,
      costModel,
    };
    const configuredAdapter: BittensorConfiguredSubnetAdapter | null = netuid !== null && endpoint
      ? {
        netuid,
        name: firstString(record, ["name", "label"]) ?? `Subnet ${netuid} adapter`,
        serviceAdapter,
        endpoint,
        metadataEndpoint: firstString(record, ["metadataEndpoint", "metadata_endpoint", "manifestUrl", "manifest_url", "healthEndpoint", "health_endpoint"]),
        requiredAuth,
        costModel,
        timeoutMs,
        authEnv,
        safetyNotes,
      }
      : null;
    const contract = buildBittensorSubnetServiceAdapterContract({
      netuid: netuid ?? 0,
      adapter: serviceAdapter,
      capabilityLevel: adapterStatus.configured && endpointSummary.allowed ? "adapter_ready" : "adapter_required",
      adapterStatus,
      configuredAdapter,
      requestSchema,
      resultSchema,
      safetyNotes: safetyNotes.length ? safetyNotes : ["Adapter is under Matterhorn doctor review."],
    });
    const contractValidation = validateBittensorSubnetServiceAdapterContract(contract);
    const serviceCallReady = contractServiceCallReady(contract, contractValidation)
      && endpointSummary.allowed
      && errors.length === 0;
    const allWarnings = uniqueWarnings(warnings, contractValidation.warnings);
    const allErrors = uniqueWarnings(errors, contractValidation.errors);
    const status: BittensorSubnetAdapterDoctorEntryStatus = allErrors.length || !serviceCallReady
      ? "blocked"
      : allWarnings.length
        ? "warning"
        : "ready";
    return {
      index,
      status,
      netuid: netuid !== null && Number.isInteger(netuid) && netuid >= 0 ? netuid : null,
      name: firstString(record, ["name", "label"]) ?? (netuid === null ? `Adapter ${index + 1}` : `Subnet ${netuid} adapter`),
      serviceAdapter,
      requiredAuth,
      costModel,
      timeoutMs,
      endpoint: endpointSummary,
      auth: authValidation.auth,
      contractValidation,
      serviceCallReady,
      errors: allErrors,
      warnings: allWarnings,
      safetyNotes,
    };
  });

  const readyCount = entries.filter((entry) => entry.status === "ready").length;
  const warningCount = entries.filter((entry) => entry.status === "warning").length;
  const blockedCount = entries.filter((entry) => entry.status === "blocked").length;
  const errors = entries.flatMap((entry) => entry.errors.map((error) => `Adapter ${entry.index + 1}: ${error}`));
  const warnings = entries.flatMap((entry) => entry.warnings.map((warning) => `Adapter ${entry.index + 1}: ${warning}`));
  return {
    kind: "bittensor_subnet_adapter_doctor",
    status: blockedCount ? "fail" : warningCount ? "warning" : "pass",
    checkedAt,
    rawConfigured: true,
    rawEntryCount: rawEntries.length,
    readyCount,
    warningCount,
    blockedCount,
    entries,
    errors,
    warnings,
    nextActions: blockedCount
      ? [
        "Fix blocked adapter entries before treating direct subnet execution as ready.",
        "For real HTTPS adapters, add the adapter host or origin to BITTENSOR_SUBNET_ADAPTER_ENDPOINT_ALLOWLIST.",
        "Keep mock adapters behind BITTENSOR_ENABLE_MOCK_SUBNET_ADAPTERS=1 and real execution behind explicit review gates.",
      ]
      : [
        "Run preview, confirmation-hash, and invocation smoke tests for each ready adapter.",
        "Keep adapter endpoints and auth values out of logs and user-facing payloads.",
      ],
  };
}

function dryRunRedactionPassed(value: unknown): boolean {
  return !/(seed phrase|mnemonic|privateKey|wallet export|ADAPTER_TOKEN|adapter-token|authEnv|apiKeyEnv)/i.test(JSON.stringify(value));
}

export async function runBittensorSubnetAdapterDryRun(input: {
  netuid?: number | null;
  task?: string | null;
  ss58Address?: string | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterDryRunReport> {
  const checkedAt = nowIso();
  const doctor = doctorBittensorSubnetAdapters();
  const limit = Math.max(1, Math.min(20, Math.floor(Number(input.limit ?? 10) || 10)));
  const task = input.task?.trim() || "Matterhorn adapter dry-run fixture task.";
  const doctorEntries = doctor.entries.filter((entry) => input.netuid === null || input.netuid === undefined || entry.netuid === input.netuid);
  const cases: BittensorSubnetAdapterDryRunCase[] = [];

  for (const entry of doctorEntries.slice(0, limit)) {
    if (!entry.serviceCallReady) {
      cases.push({
        name: entry.name,
        netuid: entry.netuid ?? -1,
        adapter: entry.serviceAdapter,
        mode: entry.endpoint.mode,
        status: "skipped",
        requestSha256: null,
        previewSupported: false,
        missingHashRejected: false,
        mismatchedHashRejected: false,
        invocationSupported: false,
        redactionPassed: true,
        errors: [],
        warnings: uniqueWarnings(entry.warnings, entry.errors, ["Adapter is not service-call ready, so dry-run invocation was skipped."]),
      });
      continue;
    }
    if (entry.netuid === null) {
      cases.push({
        name: entry.name,
        netuid: -1,
        adapter: entry.serviceAdapter,
        mode: entry.endpoint.mode,
        status: "skipped",
        requestSha256: null,
        previewSupported: false,
        missingHashRejected: false,
        mismatchedHashRejected: false,
        invocationSupported: false,
        redactionPassed: true,
        errors: ["Adapter netuid is not valid."],
        warnings: ["Adapter is not eligible for dry-run invocation."],
      });
      continue;
    }
    if (entry.endpoint.mode !== "mock") {
      cases.push({
        name: entry.name,
        netuid: entry.netuid,
        adapter: entry.serviceAdapter,
        mode: entry.endpoint.mode,
        status: "skipped",
        requestSha256: null,
        previewSupported: false,
        missingHashRejected: false,
        mismatchedHashRejected: false,
        invocationSupported: false,
        redactionPassed: true,
        errors: [],
        warnings: ["Dry-run harness does not invoke non-mock adapters yet; use the doctor and preview route for real adapter readiness."],
      });
      continue;
    }

    const preview = await previewBittensorSubnetInvocation(entry.netuid, {
      intent: "service_call",
      task,
      ss58Address: input.ss58Address ?? null,
    });
    const missingHash = await invokeBittensorSubnet(entry.netuid, {
      intent: "service_call",
      task,
      ss58Address: input.ss58Address ?? null,
    });
    const mismatchedHash = await invokeBittensorSubnet(entry.netuid, {
      intent: "service_call",
      task: `${task} Changed after review.`,
      ss58Address: input.ss58Address ?? null,
      reviewedRequestSha256: preview.requestSha256,
    });
    const invocation = await invokeBittensorSubnet(entry.netuid, {
      intent: "service_call",
      task,
      ss58Address: input.ss58Address ?? null,
      reviewedRequestSha256: preview.requestSha256,
    });
    const previewSupported = preview.supported === true;
    const missingHashRejected = missingHash.supported === false && /reviewed request SHA-256/i.test(missingHash.message);
    const mismatchedHashRejected = mismatchedHash.supported === false && /reviewed request SHA-256/i.test(mismatchedHash.message);
    const invocationSupported = invocation.supported === true;
    const redactionPassed = dryRunRedactionPassed({ preview, missingHash, mismatchedHash, invocation });
    const errors = [
      previewSupported ? null : "Preview did not report adapter support.",
      missingHashRejected ? null : "Missing reviewed hash was not rejected.",
      mismatchedHashRejected ? null : "Mismatched reviewed hash was not rejected.",
      invocationSupported ? null : "Confirmed mock invocation did not succeed.",
      redactionPassed ? null : "Dry-run payload exposed a secret-shaped field.",
    ].filter((item): item is string => Boolean(item));
    cases.push({
      name: entry.name,
      netuid: entry.netuid,
      adapter: entry.serviceAdapter,
      mode: entry.endpoint.mode,
      status: errors.length ? "fail" : "pass",
      requestSha256: preview.requestSha256,
      previewSupported,
      missingHashRejected,
      mismatchedHashRejected,
      invocationSupported,
      redactionPassed,
      errors,
      warnings: uniqueWarnings(preview.warnings, invocation.warnings),
    });
  }

  const passed = cases.filter((item) => item.status === "pass").length;
  const failed = cases.filter((item) => item.status === "fail").length;
  const skipped = cases.filter((item) => item.status === "skipped").length;
  const warnings = [
    ...doctor.warnings,
    ...(cases.length ? [] : ["No configured subnet adapters matched the dry-run filters."]),
    ...(skipped ? [`${skipped} adapter dry-run case(s) were skipped.`] : []),
  ];
  return {
    kind: "bittensor_subnet_adapter_dry_run",
    status: failed ? "fail" : passed ? skipped ? "warning" : "pass" : "warning",
    checkedAt,
    total: cases.length,
    passed,
    failed,
    skipped,
    cases,
    warnings,
    nextActions: failed
      ? ["Fix failed dry-run cases before enabling real adapter execution."]
      : passed
        ? ["Use the same preview-confirm-invoke assertions for the first real adapter integration PR."]
        : ["Configure an enabled mock subnet adapter, then rerun the dry-run harness."],
	  };
	}

function renderBittensorSubnetAdapterDryRunMarkdown(report: BittensorSubnetAdapterDryRunReport): string {
  const cases = report.cases.map((runCase, index) => [
    `### Case ${index + 1}: ${sanitizeEvidenceMarkdownText(runCase.name)}`,
    "",
    markdownBullet(`Status: ${runCase.status}`),
    markdownBullet(`Netuid: ${runCase.netuid}`),
    markdownBullet(`Adapter: ${runCase.adapter}`),
    markdownBullet(`Mode: ${runCase.mode}`),
    markdownBullet(`Request SHA-256 prefix: ${runCase.requestSha256 ? runCase.requestSha256.slice(0, 12) : "not available"}`),
    markdownBullet(`Preview supported: ${runCase.previewSupported ? "yes" : "no"}`),
    markdownBullet(`Missing hash rejected: ${runCase.missingHashRejected ? "yes" : "no"}`),
    markdownBullet(`Mismatched hash rejected: ${runCase.mismatchedHashRejected ? "yes" : "no"}`),
    markdownBullet(`Confirmed invocation supported: ${runCase.invocationSupported ? "yes" : "no"}`),
    markdownBullet(`Redaction passed: ${runCase.redactionPassed ? "yes" : "no"}`),
    "",
    "Errors:",
    ...(runCase.errors.length ? runCase.errors.map(markdownBullet) : ["- None"]),
    "",
    "Warnings:",
    ...(runCase.warnings.length ? runCase.warnings.map(markdownBullet) : ["- None"]),
    "",
  ].join("\n"));
  return [
    "# Bittensor Mock Adapter Dry-Run Export",
    "",
    `Generated: ${sanitizeEvidenceMarkdownText(nowIso())}`,
    `Checked: ${sanitizeEvidenceMarkdownText(report.checkedAt)}`,
    `Status: ${sanitizeEvidenceMarkdownText(report.status)}`,
    "",
    "## Summary",
    markdownBullet(`Total cases: ${report.total}`),
    markdownBullet(`Passed: ${report.passed}`),
    markdownBullet(`Failed: ${report.failed}`),
    markdownBullet(`Skipped: ${report.skipped}`),
    "",
    "## Cases",
    ...(cases.length ? cases : ["- No dry-run cases were produced."]),
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map(markdownBullet) : ["- None"]),
    "",
    "## Next Actions",
    ...(report.nextActions.length ? report.nextActions.map(markdownBullet) : ["- None"]),
    "",
    "## Safety Boundary",
    "- This export covers mock adapter dry-runs only. It does not authorize real subnet service execution.",
    "- Request hashes are shown as short prefixes only; exact hashes must be reviewed in the live operator context.",
    "- Do not include credential values, recovery phrases, signing material, wallet backup files, host tokens, or private user data in review notes.",
    "",
  ].join("\n");
}

export async function buildBittensorSubnetAdapterDryRunExport(input: {
  netuid?: number | null;
  task?: string | null;
  ss58Address?: string | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterDryRunExport> {
  const report = await runBittensorSubnetAdapterDryRun(input);
  return {
    kind: "bittensor_subnet_adapter_dry_run_export",
    generatedAt: nowIso(),
    status: report.status,
    summary: {
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      skipped: report.skipped,
      warningCount: report.warnings.length + report.cases.reduce((count, runCase) => count + runCase.warnings.length, 0),
    },
    markdown: renderBittensorSubnetAdapterDryRunMarkdown(report),
    warnings: uniqueWarnings(
      report.warnings,
      ["Dry-run exports are mock-adapter evidence only and do not authorize real subnet service execution."],
    ),
  };
}

function subnetAdapterMetadataEndpoint(adapter: BittensorConfiguredSubnetAdapter): string | null {
  if (adapter.metadataEndpoint) return adapter.metadataEndpoint;
  if (isMockSubnetAdapterEndpoint(adapter.endpoint)) return `${adapter.endpoint.replace(/\/$/, "")}/metadata`;
  try {
    const parsed = new URL(adapter.endpoint);
    return `${parsed.origin}/.well-known/matterhorn-bittensor-adapter.json`;
  } catch {
    return null;
  }
}

function mockSubnetAdapterMetadata(adapter: BittensorConfiguredSubnetAdapter): Record<string, unknown> {
  return {
    version: "matterhorn.bittensor.adapter.v1",
    netuid: adapter.netuid,
    serviceAdapter: adapter.serviceAdapter,
    supportedIntents: ["service_call"],
    safeModeRequired: true,
    requestHashRequired: true,
    maxResponseBytes: subnetAdapterMaxResponseBytes(),
    privacy: {
      sendsTaskText: true,
      sendsSs58Address: true,
      sendsWalletData: false,
      sendsKeyMaterial: false,
    },
    requestSchema: defaultSubnetAdapterRequestSchema(),
    resultSchema: defaultSubnetAdapterResultSchema(),
    health: { status: "ok" },
  };
}

function conformanceCheck(
  id: string,
  label: string,
  status: BittensorSubnetAdapterConformanceCheck["status"],
  summary: string,
): BittensorSubnetAdapterConformanceCheck {
  return { id, label, status, summary };
}

function summarizeAdapterConformanceMetadata(metadata: Record<string, unknown>): NonNullable<BittensorSubnetAdapterConformanceCase["metadata"]> {
  const supportedIntents = arrayFrom(metadata["supportedIntents"] ?? metadata["supported_intents"])
    .filter((item): item is string => typeof item === "string");
  const privacy = asRecord(metadata["privacy"]);
  const health = asRecord(metadata["health"]);
  return {
    version: firstString(metadata, ["version"]),
    netuid: firstNumber(metadata, ["netuid", "net_uid", "subnet"]),
    serviceAdapter: normalizeServiceAdapter(metadata["serviceAdapter"] ?? metadata["service_adapter"] ?? metadata["adapter"], "unsupported"),
    supportedIntents,
    safeModeRequired: typeof metadata["safeModeRequired"] === "boolean"
      ? metadata["safeModeRequired"]
      : typeof metadata["safe_mode_required"] === "boolean"
        ? metadata["safe_mode_required"] as boolean
        : null,
    requestHashRequired: typeof metadata["requestHashRequired"] === "boolean"
      ? metadata["requestHashRequired"]
      : typeof metadata["request_hash_required"] === "boolean"
        ? metadata["request_hash_required"] as boolean
        : null,
    maxResponseBytes: firstNumber(metadata, ["maxResponseBytes", "max_response_bytes"]),
    healthStatus: firstString(health, ["status"]) ?? firstString(privacy, ["healthStatus", "health_status"]),
  };
}

function buildAdapterConformanceChecks(
  adapter: BittensorConfiguredSubnetAdapter,
  metadata: Record<string, unknown>,
  endpoint: BittensorSubnetAdapterDoctorEndpoint,
): BittensorSubnetAdapterConformanceCheck[] {
  const summary = summarizeAdapterConformanceMetadata(metadata);
  const privacy = asRecord(metadata["privacy"]);
  const schemaSecretPath = secretFieldPath({
    requestSchema: metadata["requestSchema"] ?? metadata["request_schema"],
    resultSchema: metadata["resultSchema"] ?? metadata["result_schema"],
  });
  const maxResponseLimit = subnetAdapterMaxResponseBytes();
  return [
    conformanceCheck(
      "metadata_endpoint",
      "Metadata endpoint",
      endpoint.allowed ? "pass" : "fail",
      endpoint.allowed ? "Metadata endpoint is allowed by adapter endpoint policy." : endpoint.reason,
    ),
    conformanceCheck(
      "no_user_task",
      "No user task sent",
      "pass",
      "Conformance probe sends no user task text, SS58 address, wallet data, signing payload, or request body.",
    ),
    conformanceCheck(
      "version",
      "Metadata version",
      summary?.version === "matterhorn.bittensor.adapter.v1" ? "pass" : "fail",
      summary?.version === "matterhorn.bittensor.adapter.v1" ? "Adapter declares the Matterhorn adapter contract version." : "Adapter metadata must declare version matterhorn.bittensor.adapter.v1.",
    ),
    conformanceCheck(
      "netuid",
      "Netuid",
      summary?.netuid === adapter.netuid ? "pass" : "fail",
      summary?.netuid === adapter.netuid ? "Adapter metadata netuid matches configured netuid." : "Adapter metadata netuid does not match configured netuid.",
    ),
    conformanceCheck(
      "service_adapter",
      "Service adapter",
      summary?.serviceAdapter === adapter.serviceAdapter ? "pass" : "fail",
      summary?.serviceAdapter === adapter.serviceAdapter ? "Adapter metadata service adapter matches configuration." : "Adapter metadata service adapter does not match configuration.",
    ),
    conformanceCheck(
      "service_call",
      "Service call intent",
      summary?.supportedIntents.includes("service_call") ? "pass" : "fail",
      summary?.supportedIntents.includes("service_call") ? "Adapter declares service_call support." : "Adapter metadata must declare service_call support.",
    ),
    conformanceCheck(
      "safe_mode",
      "Safe mode",
      summary?.safeModeRequired === true ? "pass" : "fail",
      summary?.safeModeRequired === true ? "Adapter requires safeMode on service requests." : "Adapter metadata must declare safeModeRequired: true.",
    ),
    conformanceCheck(
      "request_hash",
      "Request hash",
      summary?.requestHashRequired === true ? "pass" : "fail",
      summary?.requestHashRequired === true ? "Adapter requires reviewed request SHA-256 confirmation." : "Adapter metadata must declare requestHashRequired: true.",
    ),
    conformanceCheck(
      "privacy",
      "Privacy contract",
      privacy["sendsKeyMaterial"] === false && privacy["sendsWalletData"] === false ? "pass" : "fail",
      privacy["sendsKeyMaterial"] === false && privacy["sendsWalletData"] === false ? "Adapter metadata forbids key material and wallet data." : "Adapter privacy metadata must explicitly forbid key material and wallet data.",
    ),
    conformanceCheck(
      "schema_redaction",
      "Schema redaction",
      schemaSecretPath ? "fail" : "pass",
      schemaSecretPath ? `Adapter schemas contain a secret-shaped field at ${schemaSecretPath}.` : "Adapter schemas do not expose secret-shaped fields.",
    ),
    conformanceCheck(
      "response_bound",
      "Response bound",
      summary?.maxResponseBytes !== null && summary.maxResponseBytes <= maxResponseLimit ? "pass" : "warning",
      summary?.maxResponseBytes !== null && summary.maxResponseBytes <= maxResponseLimit
        ? "Adapter metadata declares a bounded response size compatible with Matterhorn."
        : "Adapter metadata should declare maxResponseBytes at or below Matterhorn's configured response limit.",
    ),
  ];
}

async function fetchAdapterConformanceMetadata(
  adapter: BittensorConfiguredSubnetAdapter,
): Promise<{ endpoint: BittensorSubnetAdapterDoctorEndpoint; metadata: Record<string, unknown> | null; errors: string[]; warnings: string[] }> {
  const metadataUrl = subnetAdapterMetadataEndpoint(adapter);
  const endpoint = summarizeSubnetAdapterEndpoint(metadataUrl);
  if (!metadataUrl) return { endpoint, metadata: null, errors: ["Adapter metadata endpoint is unavailable."], warnings: [] };
  if (!endpoint.allowed) return { endpoint, metadata: null, errors: [endpoint.reason], warnings: [] };
  if (endpoint.mode === "mock") return { endpoint, metadata: mockSubnetAdapterMetadata(adapter), errors: [], warnings: ["Mock adapter metadata only; no real adapter health endpoint was called."] };
  try {
    const res = await fetch(metadataUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(Math.min(5_000, adapter.timeoutMs)),
    });
    if (!res.ok) return { endpoint, metadata: null, errors: [`Adapter metadata endpoint returned HTTP ${res.status}.`], warnings: [] };
    const text = await res.text();
    const limit = Math.min(64_000, subnetAdapterMaxResponseBytes());
    if (text.length > limit) return { endpoint, metadata: null, errors: ["Adapter metadata response exceeded the conformance size limit."], warnings: [] };
    try {
      return { endpoint, metadata: asRecord(JSON.parse(text)), errors: [], warnings: [] };
    } catch {
      return { endpoint, metadata: null, errors: ["Adapter metadata endpoint returned invalid JSON."], warnings: [] };
    }
  } catch (err) {
    return { endpoint, metadata: null, errors: [err instanceof Error ? err.message : "Adapter metadata probe failed."], warnings: [] };
  }
}

export async function probeBittensorSubnetAdapterConformance(input: {
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterConformanceReport> {
  const checkedAt = nowIso();
  const doctor = doctorBittensorSubnetAdapters();
  const limit = Math.max(1, Math.min(20, Math.floor(Number(input.limit ?? 10) || 10)));
  const adapters = configuredSubnetAdapters();
  const entries = doctor.entries.filter((entry) => input.netuid === null || input.netuid === undefined || entry.netuid === input.netuid).slice(0, limit);
  const cases: BittensorSubnetAdapterConformanceCase[] = [];

  for (const entry of entries) {
    const adapter = entry.netuid === null ? null : adapters.find((candidate) => candidate.netuid === entry.netuid);
    if (!adapter || !entry.serviceCallReady) {
      cases.push({
        name: entry.name,
        netuid: entry.netuid ?? -1,
        adapter: entry.serviceAdapter,
        mode: entry.endpoint.mode,
        status: "skipped",
        metadataEndpoint: entry.endpoint,
        metadata: null,
        checks: [],
        errors: entry.errors,
        warnings: uniqueWarnings(entry.warnings, ["Adapter is not service-call ready, so conformance metadata was not probed."]),
      });
      continue;
    }
    const fetched = await fetchAdapterConformanceMetadata(adapter);
    const checks = fetched.metadata ? buildAdapterConformanceChecks(adapter, fetched.metadata, fetched.endpoint) : [
      conformanceCheck("metadata_reachable", "Metadata reachable", "fail", fetched.errors[0] ?? "Adapter metadata endpoint was not reachable."),
      conformanceCheck("no_user_task", "No user task sent", "pass", "Conformance probe sends no user task text, SS58 address, wallet data, signing payload, or request body."),
    ];
    const failed = checks.some((check) => check.status === "fail");
    const warning = checks.some((check) => check.status === "warning");
    cases.push({
      name: adapter.name,
      netuid: adapter.netuid,
      adapter: adapter.serviceAdapter,
      mode: fetched.endpoint.mode,
      status: failed ? "fail" : warning ? "warning" : "pass",
      metadataEndpoint: fetched.endpoint,
      metadata: fetched.metadata ? summarizeAdapterConformanceMetadata(fetched.metadata) : null,
      checks,
      errors: fetched.errors,
      warnings: fetched.warnings,
    });
  }

  const passed = cases.filter((item) => item.status === "pass").length;
  const failed = cases.filter((item) => item.status === "fail").length;
  const skipped = cases.filter((item) => item.status === "skipped").length;
  return {
    kind: "bittensor_subnet_adapter_conformance",
    status: failed ? "fail" : passed ? skipped ? "warning" : "pass" : "warning",
    checkedAt,
    total: cases.length,
    passed,
    failed,
    skipped,
    cases,
    warnings: uniqueWarnings(
      doctor.warnings,
      cases.length ? [] : ["No configured subnet adapters matched the conformance filters."],
      skipped ? [`${skipped} adapter conformance case(s) were skipped.`] : [],
    ),
    nextActions: failed
      ? ["Fix failed conformance checks before enabling real adapter invocation."]
      : passed
        ? ["Run preview-confirm-invoke smoke tests against a reviewed adapter before enabling production usage."]
        : ["Configure an adapter and metadata endpoint, then rerun the conformance probe."],
  };
}

function renderBittensorSubnetAdapterConformanceMarkdown(report: BittensorSubnetAdapterConformanceReport): string {
  const cases = report.cases.map((conformanceCase, index) => {
    const checks = conformanceCase.checks.map((check) => (
      `- ${sanitizeEvidenceMarkdownText(check.label)}: ${sanitizeEvidenceMarkdownText(check.status)}. ${sanitizeEvidenceMarkdownText(check.summary)}`
    ));
    return [
      `### Case ${index + 1}: ${sanitizeEvidenceMarkdownText(conformanceCase.name)}`,
      "",
      markdownBullet(`Status: ${conformanceCase.status}`),
      markdownBullet(`Netuid: ${conformanceCase.netuid}`),
      markdownBullet(`Adapter: ${conformanceCase.adapter}`),
      markdownBullet(`Mode: ${conformanceCase.mode}`),
      markdownBullet(`Metadata version: ${conformanceCase.metadata?.version ?? "not available"}`),
      markdownBullet(`Metadata safe mode required: ${conformanceCase.metadata?.safeModeRequired === null || conformanceCase.metadata?.safeModeRequired === undefined ? "not available" : conformanceCase.metadata.safeModeRequired ? "yes" : "no"}`),
      markdownBullet(`Metadata request hash required: ${conformanceCase.metadata?.requestHashRequired === null || conformanceCase.metadata?.requestHashRequired === undefined ? "not available" : conformanceCase.metadata.requestHashRequired ? "yes" : "no"}`),
      markdownBullet(`Metadata max response bytes: ${conformanceCase.metadata?.maxResponseBytes ?? "not available"}`),
      "",
      "Checks:",
      ...(checks.length ? checks : ["- No checks were produced."]),
      "",
      "Errors:",
      ...(conformanceCase.errors.length ? conformanceCase.errors.map(markdownBullet) : ["- None"]),
      "",
      "Warnings:",
      ...(conformanceCase.warnings.length ? conformanceCase.warnings.map(markdownBullet) : ["- None"]),
      "",
    ].join("\n");
  });
  return [
    "# Bittensor Adapter Conformance Export",
    "",
    `Generated: ${sanitizeEvidenceMarkdownText(nowIso())}`,
    `Checked: ${sanitizeEvidenceMarkdownText(report.checkedAt)}`,
    `Status: ${sanitizeEvidenceMarkdownText(report.status)}`,
    "",
    "## Summary",
    markdownBullet(`Total cases: ${report.total}`),
    markdownBullet(`Passed: ${report.passed}`),
    markdownBullet(`Failed: ${report.failed}`),
    markdownBullet(`Skipped: ${report.skipped}`),
    "",
    "## Cases",
    ...(cases.length ? cases : ["- No conformance cases were produced."]),
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map(markdownBullet) : ["- None"]),
    "",
    "## Next Actions",
    ...(report.nextActions.length ? report.nextActions.map(markdownBullet) : ["- None"]),
    "",
    "## Safety Boundary",
    "- This export covers metadata conformance only. It sends no user task text, wallet data, signing payloads, or request body.",
    "- Raw metadata payloads and endpoint URLs are intentionally omitted from the markdown export.",
    "- Passing conformance does not authorize real subnet service execution; preview, reviewed request SHA-256 confirmation, and operator approval remain required.",
    "",
  ].join("\n");
}

export async function buildBittensorSubnetAdapterConformanceExport(input: {
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterConformanceExport> {
  const report = await probeBittensorSubnetAdapterConformance(input);
  return {
    kind: "bittensor_subnet_adapter_conformance_export",
    generatedAt: nowIso(),
    status: report.status,
    summary: {
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      skipped: report.skipped,
      warningCount: report.warnings.length + report.cases.reduce((count, conformanceCase) => count + conformanceCase.warnings.length, 0),
    },
    markdown: renderBittensorSubnetAdapterConformanceMarkdown(report),
    warnings: uniqueWarnings(
      report.warnings,
      ["Conformance exports are metadata evidence only and do not authorize real subnet service execution."],
    ),
  };
}

function renderBittensorSubnetAdapterOperatorHandoffMarkdown(handoff: Omit<BittensorSubnetAdapterOperatorHandoff, "markdown">): string {
  const adapter = handoff.requested.adapter ?? "not specified";
  const netuid = handoff.requested.netuid === null ? "not specified" : String(handoff.requested.netuid);
  return [
    "# Bittensor Adapter Operator Handoff",
    "",
    `Generated: ${sanitizeEvidenceMarkdownText(handoff.generatedAt)}`,
    `Adapter: ${sanitizeEvidenceMarkdownText(adapter)}`,
    `Netuid: ${sanitizeEvidenceMarkdownText(netuid)}`,
    `Status: ${sanitizeEvidenceMarkdownText(handoff.status)}`,
    "",
    "## Gate Summary",
    markdownBullet(`Evidence review: ${handoff.evidenceReview.status}`),
    markdownBullet(`Evidence export warnings: ${handoff.evidenceExport.summary.warningCount}`),
    markdownBullet(`Conformance: ${handoff.conformanceExport.status}`),
    markdownBullet(`Conformance passed: ${handoff.conformanceExport.summary.passed}/${handoff.conformanceExport.summary.total}`),
    markdownBullet(`Dry-run: ${handoff.dryRunExport.status}`),
    markdownBullet(`Dry-run passed: ${handoff.dryRunExport.summary.passed}/${handoff.dryRunExport.summary.total}`),
    markdownBullet("Provider registry: " + handoff.providerRegistry.status),
    markdownBullet("Matching reviewed providers: " + handoff.providerRegistry.matchingReadyProviderCount),
    "",
    "## Blockers",
    ...(handoff.evidenceReview.blockedReasons.length ? handoff.evidenceReview.blockedReasons.map(markdownBullet) : ["- None from evidence review"]),
    "",
    "## Warnings",
    ...(handoff.warnings.length ? handoff.warnings.map(markdownBullet) : ["- None"]),
    "",
    "## Next Actions",
    ...(handoff.nextActions.length ? handoff.nextActions.map(markdownBullet) : ["- None"]),
    "",
    "## Subreports",
    "- Export individual evidence, conformance, and dry-run markdown when the reviewer needs full detail.",
    "- This handoff intentionally summarizes subreports instead of embedding raw metadata, task text, adapter output, endpoint URLs, credentials, or full request hashes.",
    "",
    "## Safety Boundary",
    "- This handoff is an operator review artifact. It does not authorize real subnet service execution.",
    "- Real adapter invocation still requires a separate preview, exact request SHA-256 confirmation, short-lived approval, and explicit operator/user confirmation.",
    "- Never include seed phrases, mnemonics, private keys, wallet exports, host tokens, or adapter credential values in review notes.",
    "",
  ].join("\n");
}

export async function buildBittensorSubnetAdapterOperatorHandoff(input: {
  adapter?: string | null;
  netuid?: number | null;
  task?: string | null;
  ss58Address?: string | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterOperatorHandoff> {
  const [evidenceReview, evidenceExport, conformanceExport, dryRunExport] = await Promise.all([
    reviewBittensorSubnetAdapterEvidence(input),
    buildBittensorSubnetAdapterEvidenceExport(input),
    buildBittensorSubnetAdapterConformanceExport(input),
    buildBittensorSubnetAdapterDryRunExport(input),
  ]);
  const blocked =
    evidenceReview.status === "blocked" ||
    conformanceExport.status === "fail" ||
    dryRunExport.status === "fail";
  const status: BittensorSubnetAdapterOperatorHandoff["status"] = blocked
    ? "blocked"
    : evidenceReview.status === "manual_real_canary_review_required"
      ? "manual_review_required"
      : "mock_rehearsal_ready";
  const nextActions = status === "blocked"
    ? [
      "Resolve evidence, conformance, or dry-run blockers before any adapter launch work continues.",
      "Export individual evidence/conformance/dry-run reports for detailed reviewer notes.",
      "Do not invoke real subnet services.",
    ]
    : status === "mock_rehearsal_ready"
      ? [
        "Run or archive the mock dry-run evidence before any real adapter canary review.",
        "Keep real subnet adapters disabled until manual provider/canary/rollback review passes.",
      ]
      : [
        "Export individual evidence/conformance/dry-run reports for human review.",
        "Prepare a real-adapter canary packet only after exact preview request SHA-256 confirmation.",
      ];
  const providerRegistry = summarizeBittensorSubnetAdapterProviderRegistry({ adapter: evidenceReview.requested.adapter, netuid: evidenceReview.requested.netuid });
  const warnings = uniqueWarnings(
    evidenceReview.warnings,
    evidenceExport.warnings,
    conformanceExport.warnings,
    dryRunExport.warnings,
    providerRegistry.warnings,
    ["This handoff is evidence only and does not authorize real subnet service execution."],
  );
  const base = {
    kind: "bittensor_subnet_adapter_operator_handoff" as const,
    generatedAt: nowIso(),
    requested: evidenceReview.requested,
    status,
    evidenceReview,
    evidenceExport,
    conformanceExport,
    dryRunExport,
    providerRegistry,
    warnings,
    nextActions,
  };
  return {
    ...base,
    markdown: renderBittensorSubnetAdapterOperatorHandoffMarkdown(base),
  };
}

function configuredSubnetAdapters(): BittensorConfiguredSubnetAdapter[] {
  const raw = readEnv("BITTENSOR_SUBNET_ADAPTERS_JSON");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed
      : Object.entries(asRecord(parsed)).map(([netuid, value]) => ({ ...asRecord(value), netuid: Number(netuid) }));
    return entries.flatMap((entry) => {
      const record = asRecord(entry);
      const netuid = firstNumber(record, ["netuid", "net_uid", "subnet"]);
      const endpoint = firstString(record, ["endpoint", "url", "baseUrl", "base_url"]);
      if (netuid === null || !Number.isInteger(netuid) || netuid < 0 || !endpoint) return [];
      if (isMockSubnetAdapterEndpoint(endpoint) && !mockSubnetAdaptersEnabled()) return [];
      const timeoutMs = firstNumber(record, ["timeoutMs", "timeout_ms"]) ?? 20_000;
      return [{
        netuid,
        name: firstString(record, ["name", "label"]) ?? `Subnet ${netuid} adapter`,
        serviceAdapter: normalizeServiceAdapter(record["serviceAdapter"] ?? record["adapter"], "unsupported"),
        endpoint,
        metadataEndpoint: firstString(record, ["metadataEndpoint", "metadata_endpoint", "manifestUrl", "manifest_url", "healthEndpoint", "health_endpoint"]),
        requiredAuth: normalizeRequiredAuth(record["requiredAuth"] ?? record["auth"]),
        costModel: normalizeCostModel(record["costModel"] ?? record["cost"]),
        timeoutMs: Math.min(60_000, Math.max(1_000, timeoutMs)),
        authEnv: firstString(record, ["authEnv", "auth_env", "apiKeyEnv", "api_key_env"]),
        safetyNotes: arrayFrom(record["safetyNotes"] ?? record["safety_notes"])
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0),
      }];
    });
  } catch {
    return [];
  }
}

export function getConfiguredSubnetAdapter(netuid: number): BittensorConfiguredSubnetAdapter | null {
  return configuredSubnetAdapters().find((adapter) => adapter.netuid === netuid) ?? null;
}

function invokeMockSubnetAdapter(
  adapter: BittensorConfiguredSubnetAdapter,
  input: BittensorSubnetInvokeInput,
  requestSha256: string,
): BittensorSubnetAdapterRunResult {
  const task = input.task?.trim() || "No task text provided.";
  if (adapter.endpoint === "mock://data-search" && adapter.serviceAdapter === "data_search") {
    return {
      ok: true,
      mode: "mock",
      adapterKind: "data_search",
      netuid: adapter.netuid,
      requestSha256,
      message: "Mock data-search adapter returned deterministic fixture results.",
      output: {
        query: task,
        results: [{
          title: "Mock Bittensor data-search result",
          summary: `Deterministic mock result for: ${task}`,
          source: "matterhorn-mock-subnet-adapter",
          confidence: "fixture",
        }],
      },
      warnings: [
        "Mock adapter result only; no real Bittensor subnet service was called.",
        "Use this path to test preview, confirmation, result rendering, and safety behavior before adding real adapters.",
      ],
      usage: {
        units: 1,
        label: "mock_request",
      },
      costEstimate: {
        amount: 0,
        currency: "TAO",
        model: adapter.costModel,
      },
    };
  }
  if (adapter.endpoint === "mock://inference" && adapter.serviceAdapter === "inference") {
    return {
      ok: true,
      mode: "mock",
      adapterKind: "inference",
      netuid: adapter.netuid,
      requestSha256,
      message: "Mock inference adapter returned a deterministic fixture response.",
      output: {
        prompt: task,
        completion: `Mock inference response for: ${task}`,
        model: "matterhorn-mock-inference-v0",
        confidence: "fixture",
      },
      warnings: [
        "Mock inference result only; no real Bittensor subnet service was called.",
        "Use this path to test prompt handling, confirmation, result rendering, and safety behavior before adding real inference adapters.",
      ],
      usage: {
        units: Math.max(1, Math.ceil(task.length / 12)),
        label: "mock_tokens",
      },
      costEstimate: {
        amount: 0,
        currency: "TAO",
        model: adapter.costModel,
      },
    };
  }
  if (isMockSubnetAdapterEndpoint(adapter.endpoint)) {
    return {
      ok: false,
      mode: "mock",
      adapterKind: adapter.serviceAdapter,
      netuid: adapter.netuid,
      requestSha256,
      message: "Unsupported mock subnet service adapter endpoint.",
      output: null,
      warnings: ["No real Bittensor subnet service was called."],
      usage: null,
      costEstimate: null,
    };
  }
  return {
    ok: false,
    mode: "mock",
    adapterKind: adapter.serviceAdapter,
    netuid: adapter.netuid,
    requestSha256,
    message: "Unsupported mock subnet service adapter endpoint.",
    output: null,
    warnings: ["No real Bittensor subnet service was called."],
    usage: null,
    costEstimate: null,
  };
}

function normalizeAdapterUsage(value: unknown): BittensorSubnetAdapterRunResult["usage"] {
  const record = asRecord(value);
  const units = firstNumber(record, ["units", "count", "requests"]);
  const label = firstString(record, ["label", "unit", "type"]);
  return units === null && label === null ? null : { units, label };
}

function normalizeAdapterCostEstimate(value: unknown, fallbackModel: BittensorCapabilityManifest["costModel"]): BittensorSubnetAdapterRunResult["costEstimate"] {
  const record = asRecord(value);
  const amount = firstNumber(record, ["amount", "cost", "estimatedAmount", "estimated_amount"]);
  const currency = firstString(record, ["currency", "denom", "unit"]);
  const model = normalizeCostModel(record["model"] ?? record["costModel"] ?? record["cost_model"] ?? fallbackModel);
  return amount === null && currency === null && model === fallbackModel ? null : { amount, currency, model };
}

function subnetAdapterMaxResponseBytes(): number {
  const configured = Number(readEnv("BITTENSOR_SUBNET_ADAPTER_MAX_RESPONSE_BYTES"));
  return Number.isFinite(configured) && configured > 0 ? Math.min(2_000_000, Math.max(8_192, configured)) : 256_000;
}

async function runHttpSubnetAdapter(
  adapter: BittensorConfiguredSubnetAdapter,
  input: BittensorSubnetInvokeInput,
  requestSha256: string,
): Promise<BittensorSubnetAdapterRunResult> {
  const runtimeBlockers = subnetAdapterRuntimeGateBlockers(adapter, requestSha256);
  if (runtimeBlockers.length) {
    return {
      ok: false,
      mode: "http",
      adapterKind: adapter.serviceAdapter,
      netuid: adapter.netuid,
      requestSha256,
      message: "Adapter runtime readiness gate blocked invocation.",
      output: null,
      warnings: runtimeBlockers,
      usage: null,
      costEstimate: null,
    };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adapter.authEnv) {
    const token = readEnv(adapter.authEnv);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  try {
    const res = await fetch(adapter.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        netuid: adapter.netuid,
        intent: input.intent ?? "service_call",
        task: input.task ?? "",
        ss58Address: input.ss58Address ?? null,
        requestSha256,
        safeMode: true,
      }),
      signal: AbortSignal.timeout(adapter.timeoutMs),
    });
    if (!res.ok) return {
      ok: false,
      mode: "http",
      adapterKind: adapter.serviceAdapter,
      netuid: adapter.netuid,
      requestSha256,
      status: res.status,
      message: `Adapter returned HTTP ${res.status}.`,
      output: null,
      warnings: [`Adapter returned HTTP ${res.status}.`],
      usage: null,
      costEstimate: null,
    };
    const text = await res.text();
    if (text.length > subnetAdapterMaxResponseBytes()) {
      return {
        ok: false,
        mode: "http",
        adapterKind: adapter.serviceAdapter,
        netuid: adapter.netuid,
        requestSha256,
        status: res.status,
        message: "Adapter response exceeded the configured size limit.",
        output: null,
        warnings: ["Adapter response exceeded the configured size limit."],
        usage: null,
        costEstimate: null,
      };
    }
    let data: Record<string, unknown>;
    try {
      data = asRecord(JSON.parse(text));
    } catch {
      return {
        ok: false,
        mode: "http",
        adapterKind: adapter.serviceAdapter,
        netuid: adapter.netuid,
        requestSha256,
        status: res.status,
        message: "Adapter returned invalid JSON.",
        output: null,
        warnings: ["Adapter returned invalid JSON."],
        usage: null,
        costEstimate: null,
      };
    }
    return {
      ok: data["ok"] !== false,
      mode: "http",
      adapterKind: adapter.serviceAdapter,
      netuid: adapter.netuid,
      requestSha256,
      message: firstString(data, ["message", "summary"]) ?? "HTTP subnet service adapter returned a response.",
      output: data,
      warnings: arrayFrom(data["warnings"]).filter((item): item is string => typeof item === "string"),
      usage: normalizeAdapterUsage(data["usage"]),
      costEstimate: normalizeAdapterCostEstimate(data["costEstimate"] ?? data["cost_estimate"], adapter.costModel),
    };
  } catch (err) {
    return {
      ok: false,
      mode: "http",
      adapterKind: adapter.serviceAdapter,
      netuid: adapter.netuid,
      requestSha256,
      message: err instanceof Error ? err.message : "Adapter invocation failed.",
      output: null,
      warnings: [err instanceof Error ? err.message : "Adapter invocation failed."],
      usage: null,
      costEstimate: null,
    };
  }
}

async function runBittensorSubnetAdapter(
  adapter: BittensorConfiguredSubnetAdapter,
  input: BittensorSubnetInvokeInput,
  requestSha256: string,
): Promise<BittensorSubnetAdapterRunResult> {
  if (isMockSubnetAdapterEndpoint(adapter.endpoint)) {
    return invokeMockSubnetAdapter(adapter, input, requestSha256);
  }
  return runHttpSubnetAdapter(adapter, input, requestSha256);
}

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await fetcher();
  cache.set(key, { at: Date.now(), data });
  return data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["data", "items", "results", "subnets", "rows"]) {
    const field = record[key];
    if (Array.isArray(field)) return field;
  }
  return [];
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function inferCategory(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (/(image|video|media|render|vision)/.test(text)) return "Creative AI";
  if (/(compute|gpu|hash|inference|hosting|cloud)/.test(text)) return "Compute and infrastructure";
  if (/(data|crawl|search|index|knowledge|retrieval)/.test(text)) return "Data and knowledge";
  if (/(agent|tool|automation|workflow)/.test(text)) return "Agent tools";
  if (/(finance|trading|market|prediction|risk)/.test(text)) return "Financial intelligence";
  if (/(health|biology|science|research)/.test(text)) return "Science and research";
  return "Intelligence market";
}

function benefitFor(category: string, description: string): string {
  if (description) return description;
  const benefits: Record<string, string> = {
    "Creative AI": "Can help users generate, evaluate, or route creative AI work.",
    "Compute and infrastructure": "Can help users access decentralized compute, model serving, or infrastructure capacity.",
    "Data and knowledge": "Can help users retrieve, index, or reason over specialized data sources.",
    "Agent tools": "Can provide agent-facing capabilities that Matterhorn workflows may call or evaluate.",
    "Financial intelligence": "Can support market analysis, risk review, or crypto-native research workflows.",
    "Science and research": "Can support domain-specific research and analysis tasks.",
    "Network coordination": "Helps users understand Bittensor-wide incentive and delegation context.",
  };
  return benefits[category] ?? "A Bittensor subnet. Verify live metadata before relying on its current utility.";
}

function normalizeSubnet(value: unknown, sourceOverride?: string): BittensorSubnetSummary | null {
  const record = asRecord(value);
  const netuid = firstNumber(record, ["netuid", "net_uid", "uid", "subnet_id", "id"]);
  if (netuid === null) return null;

  const name =
    firstString(record, ["subnet_name", "name", "display_name", "identity_name"]) ??
    `Subnet ${netuid}`;
  const symbol =
    firstString(record, ["symbol", "subnet_symbol", "ticker"]) ??
    (netuid === 0 ? "ROOT" : `SN${netuid}`);
  const description =
    firstString(record, ["description", "subtitle", "summary", "emission_summary", "subnet_description"]) ?? "";
  const category = inferCategory(name, description);
  const updatedAt =
    firstString(record, ["updatedAt", "updated_at", "timestamp", "created_at", "fetchedAt", "fetched_at"]) ??
    nowIso();
  const source = sourceOverride ?? firstString(record, ["source", "provider", "dataSource", "data_source"]) ?? "tao.app";

  return {
    netuid,
    name,
    symbol,
    category,
    benefitSummary: benefitFor(category, description),
    ownerColdkey: firstString(record, ["owner_coldkey", "ownerColdkey", "coldkey"]),
    ownerHotkey: firstString(record, ["owner_hotkey", "ownerHotkey", "hotkey"]),
    priceTao: firstNumber(record, ["priceTao", "price_tao", "price", "moving_price", "alpha_price", "subnet_price"]),
    emission: firstNumber(record, ["emission", "subnet_emission", "alpha_out_emission", "tao_in_emission"]),
    tempo: firstNumber(record, ["tempo"]),
    updatedAt,
    source,
    block: firstNumber(record, ["block", "blockNumber", "block_number"]),
    freshness: firstString(record, ["freshness", "dataFreshness", "data_freshness"]),
  };
}

function fallbackSubnet(netuid: number): BittensorSubnetSummary {
  return FALLBACK_SUBNETS.find((subnet) => subnet.netuid === netuid) ?? {
    netuid,
    name: `Subnet ${netuid}`,
    symbol: `SN${netuid}`,
    category: "Intelligence market",
    benefitSummary: "Live metadata was unavailable. Verify this subnet before making decisions.",
    ownerColdkey: null,
    ownerHotkey: null,
    priceTao: null,
    emission: null,
    tempo: null,
    updatedAt: new Date(0).toISOString(),
    source: "curated-fallback",
  };
}

function subnetDetailFromSummary(summary: BittensorSubnetSummary): BittensorSubnetDetail {
  return {
    ...summary,
    metagraphSummary: {
      neurons: null,
      totalStake: null,
      block: summary.block ?? null,
    },
    topValidators: [],
    knownUseCases: knownUseCasesFor(summary.category),
    risks: risksFor(summary),
    links: [
      { label: "TAO.app", url: `https://www.tao.app/subnets/${summary.netuid}` },
      { label: "Bittensor docs", url: "https://docs.learnbittensor.org/subnets/working-with-subnets" },
    ],
  };
}

function knownUseCasesFor(category: string): string[] {
  const common = ["Ask Matterhorn to explain the subnet in plain English", "Compare live metrics with similar subnets"];
  const byCategory: Record<string, string[]> = {
    "Creative AI": ["Route creative generation or evaluation tasks", "Monitor media-oriented subnet performance"],
    "Compute and infrastructure": ["Evaluate decentralized compute capacity", "Track validator and miner activity"],
    "Data and knowledge": ["Find specialized datasets or retrieval providers", "Compare data freshness and coverage"],
    "Agent tools": ["Discover subnet capabilities that can extend agent workflows", "Assess whether a subnet exposes useful APIs"],
    "Financial intelligence": ["Research market-related signals", "Review risk before staking exposure"],
    "Science and research": ["Explore domain-specific research support", "Track research-oriented subnet maturity"],
    "Network coordination": ["Understand network-level incentives", "Review delegation context"],
  };
  return [...(byCategory[category] ?? []), ...common];
}

function risksFor(summary: BittensorSubnetSummary): string[] {
  const risks = [
    "Subnet utility and participants can change quickly; verify live metadata.",
    "Staking and unstaking are subnet-local and can involve alpha-token slippage.",
    "Matterhorn v1 cannot sign or broadcast Bittensor transactions.",
  ];
  if (summary.source === "curated-fallback") {
    risks.unshift("Live provider data is unavailable; this summary may be incomplete.");
  }
  if (summary.priceTao === null) risks.push("Live alpha price was unavailable.");
  return risks;
}

function extractMetagraphSummary(raw: unknown): BittensorSubnetDetail["metagraphSummary"] {
  const record = asRecord(raw);
  const nested = asRecord(record.data ?? record.metagraph ?? record.info ?? raw);
  return {
    neurons: firstNumber(nested, ["n", "neurons", "num_uids", "active_neurons"]),
    totalStake: firstNumber(nested, ["total_stake", "totalStake", "stake"]),
    block: firstNumber(nested, ["block", "block_number", "blockNumber"]),
  };
}

function extractTopValidators(raw: unknown): BittensorSubnetDetail["topValidators"] {
  const record = asRecord(raw);
  const rows = arrayFrom(record.neurons ?? record.validators ?? record.data ?? raw);
  return rows
    .map((row) => {
      const r = asRecord(row);
      return {
        uid: firstNumber(r, ["uid", "id"]),
        hotkey: firstString(r, ["hotkey", "hotkey_ss58", "hotkeyAddress"]),
        coldkey: firstString(r, ["coldkey", "coldkey_ss58", "coldkeyAddress"]),
        stake: firstNumber(r, ["stake", "total_stake", "tao_stake", "alpha_stake"]),
        trust: firstNumber(r, ["trust", "validator_trust", "rank"]),
        dividends: firstNumber(r, ["dividends", "dividend"]),
      };
    })
    .sort((a, b) => (b.stake ?? 0) - (a.stake ?? 0))
    .slice(0, 8);
}

export function isValidSs58Address(address: string): boolean {
  const trimmed = address.trim();
  return trimmed.length >= 32 && trimmed.length <= 64 && BASE58_RE.test(trimmed);
}

export function parseAmountTao(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildBittensorQuote(input: BittensorActionQuoteInput, subnet?: BittensorSubnetSummary): BittensorActionQuote {
  const amountTao = parseAmountTao(input.amountTao);
  const netuid = typeof input.netuid === "number" && Number.isFinite(input.netuid) ? input.netuid : null;
  const warnings: string[] = [
    "Quote only. Matterhorn v1 cannot sign or broadcast Bittensor transactions.",
    "Use an external Bittensor-compatible wallet to review and sign.",
  ];

  if (input.action === "stake" || input.action === "unstake") {
    if (netuid === null) warnings.push("Subnet netuid is required before staking or unstaking.");
    if (!amountTao) warnings.push("Enter a positive TAO amount before acting.");
    warnings.push("Subnet staking uses alpha tokens and may have slippage.");
  }
  if (input.action === "transfer") {
    if (!amountTao) warnings.push("Enter a positive TAO amount before transferring.");
    if (input.recipient && !isValidSs58Address(input.recipient)) warnings.push("Recipient does not look like a valid SS58 address.");
  }
  if (input.validatorHotkey && !isValidSs58Address(input.validatorHotkey)) {
    warnings.push("Validator hotkey does not look like a valid SS58 address.");
  }

  const price = subnet?.priceTao && subnet.priceTao > 0 ? subnet.priceTao : null;
  const expectedAlpha = amountTao && price ? amountTao / price : null;
  const slippageBps = amountTao && amountTao > 10 ? 150 : amountTao && amountTao > 1 ? 75 : amountTao ? 25 : null;

  if (!price && (input.action === "stake" || input.action === "unstake")) {
    warnings.push("Live subnet price was unavailable, so expected alpha is unknown.");
  }

  return {
    action: input.action,
    netuid,
    amountTao,
    priceTao: price,
    idealAlpha: expectedAlpha,
    expectedAlpha,
    feeTao: input.action === "compare" ? null : 0.0001,
    slippageBps,
    rateTolerance: null,
    source: subnet?.source ?? "matterhorn-local-quote",
    block: subnet?.block ?? null,
    freshness: subnet?.freshness ?? null,
    warnings,
    requiresExternalSignature: true,
  };
}

function extractNetuids(text: string): number[] {
  const ids = new Set<number>();
  for (const match of text.matchAll(/\b(?:netuid|subnet|sn)\s*#?\s*(\d{1,3})\b/gi)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 0) ids.add(value);
  }
  for (const match of text.matchAll(/\bSN(\d{1,3})\b/g)) {
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 0) ids.add(value);
  }
  return [...ids].slice(0, 8);
}

function extractSs58Candidates(text: string): string[] {
  const candidates = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,64}\b/g) ?? [];
  return candidates.filter((candidate, index, all) => isValidSs58Address(candidate) && all.indexOf(candidate) === index);
}

function extractSs58(text: string): string | null {
  return extractSs58Candidates(text)[0] ?? null;
}

function classifyBittensorIntent(text: string): { intent: BittensorChatIntent; confidence: number } {
  const lower = text.toLowerCase();
  if (/(watch|alert|monitor|notify|track)/.test(lower)) return { intent: "monitor", confidence: 0.86 };
  if (/(i'?m new|explain|what is|teach me|learn|beginner)/.test(lower)) return { intent: "learn", confidence: 0.86 };
  if (/(stake|staking|unstake|delegate|delegat|transfer|move stake|hotkey|coldkey|validator|slippage|alpha)/.test(lower)) return { intent: "stake_plan", confidence: 0.9 };
  if (/(wallet|balance|position|portfolio|my tao|show me my tao|allocation)/.test(lower)) return { intent: "wallet", confidence: 0.88 };
  if (/\b(use|run|call|invoke)\b|ask subnet|submit.*to subnet|send.*to subnet/.test(lower)) return { intent: "subnet_use", confidence: 0.78 };
  if (/(find|which|compare|best|recommend|discover|image|video|data|compute|agent|tool|subnet)/.test(lower)) return { intent: "discover", confidence: 0.82 };
  return { intent: "learn", confidence: /bittensor|tao|subnet/.test(lower) ? 0.8 : 0.55 };
}

function toolsForIntent(intent: BittensorChatIntent): string[] {
  const common = ["bittensor_chat", "bittensor_plan_from_chat"];
  switch (intent) {
    case "learn":
      return [...common, "bittensor_list_subnets", "bittensor_explain_subnet"];
    case "discover":
      return [...common, "bittensor_find_subnets_for_goal", "bittensor_compare_subnets"];
    case "wallet":
      return [...common, "bittensor_get_wallet_positions"];
    case "stake_plan":
      return [...common, "bittensor_prepare_extrinsic", "bittensor_prepare_action"];
    case "subnet_use":
      return [...common, "bittensor_get_subnet_capabilities", "bittensor_invoke_subnet"];
    case "monitor":
      return [...common, "bittensor_create_watch"];
  }
}

function cardsForIntent(intent: BittensorChatIntent): BittensorPlan["responseCards"] {
  switch (intent) {
    case "learn":
      return ["subnet_result"];
    case "discover":
      return ["subnet_comparison"];
    case "wallet":
      return ["wallet_snapshot"];
    case "stake_plan":
      return ["staking_quote", "signed_action_review"];
    case "subnet_use":
      return ["subnet_result"];
    case "monitor":
      return ["watchlist"];
  }
}

function stepsForIntent(intent: BittensorChatIntent): string[] {
  switch (intent) {
    case "learn":
      return ["Explain the concept in beginner language", "Map jargon to coldkey, hotkey, subnet, validator, alpha, and TAO", "Offer one safe next action"];
    case "discover":
      return ["Translate the user goal into subnet categories", "Find matching subnets", "Compare utility, freshness, emissions, and risks"];
    case "wallet":
      return ["Validate the SS58 public address", "Read wallet allocation and stake positions", "Summarize exposure and provider freshness"];
    case "stake_plan":
      return ["Identify action, netuid, hotkey or recipient, and amount", "Build a non-custodial extrinsic preview", "Show fee, slippage, warnings, and external signing requirement"];
    case "subnet_use":
      return ["Check subnet capability manifest", "Call a supported adapter if one exists", "Otherwise explain what Matterhorn can do today and what adapter is missing"];
    case "monitor":
      return ["Create a watchlist entry", "Track subnet, wallet, validator, emission, or slippage state", "Report future changes in plain language"];
  }
}

export function planBittensorChat(input: { message: string; ss58Address?: string | null }): BittensorPlan {
  const message = String(input.message ?? "").trim();
  const { intent, confidence } = classifyBittensorIntent(message);
  const netuids = extractNetuids(message);
  const ss58Address = input.ss58Address && isValidSs58Address(input.ss58Address)
    ? input.ss58Address
    : extractSs58(message);
  const needsWallet = intent === "wallet" && !ss58Address;
  const needsStakeDetails = intent === "stake_plan" && !netuids.length && !/(transfer)/i.test(message);

  return {
    intent,
    confidence,
    summary: `Matterhorn will handle this as a Bittensor ${intent.replace("_", " ")} workflow.`,
    userGoal: message,
    netuids,
    ss58Address,
    steps: stepsForIntent(intent),
    suggestedToolNames: toolsForIntent(intent),
    safetyNotes: [
      "Matterhorn never asks for seed phrases, private keys, or mnemonics.",
      "Bittensor signed actions require an external signer.",
      "Subnet staking is Dynamic TAO exposure; alpha price and slippage can change the final TAO outcome.",
    ],
    responseCards: cardsForIntent(intent),
    requiresClarification: needsWallet || needsStakeDetails,
    clarificationQuestion: needsWallet
      ? "Which SS58 coldkey public address should I inspect?"
      : needsStakeDetails
        ? "Which subnet netuid should this staking plan use?"
        : null,
  };
}

function uniqueWarnings(...groups: Array<Array<string | null | undefined> | undefined>): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const group of groups) {
    for (const item of group ?? []) {
      const warning = typeof item === "string" ? item.trim() : "";
      if (!warning || seen.has(warning)) continue;
      seen.add(warning);
      warnings.push(warning);
    }
  }
  return warnings;
}

function resolveExecutionSs58(input: BittensorChatExecutionInput, plan: BittensorPlan): string | null {
  if (input.ss58Address && isValidSs58Address(input.ss58Address)) return input.ss58Address;
  if (input.coldkey && isValidSs58Address(input.coldkey)) return input.coldkey;
  if (plan.ss58Address && isValidSs58Address(plan.ss58Address)) return plan.ss58Address;
  return extractSs58(input.message);
}

function resolveExecutionNetuid(input: BittensorChatExecutionInput, plan: BittensorPlan): number | null {
  if (typeof input.netuid === "number" && Number.isInteger(input.netuid) && input.netuid >= 0) return input.netuid;
  return plan.netuids[0] ?? null;
}

function resolveExecutionLimit(input: BittensorChatExecutionInput, fallback: number): number {
  const parsed = Number(input.limit);
  return Number.isFinite(parsed) ? Math.min(12, Math.max(1, Math.floor(parsed))) : fallback;
}

function resolveExecutionStrategy(input: BittensorChatExecutionInput): BittensorValidatorComparison["strategy"] {
  return input.strategy === "yield" || input.strategy === "safety" || input.strategy === "balanced"
    ? input.strategy
    : "balanced";
}

function resolveExecutionHotkey(input: BittensorChatExecutionInput): string | null {
  return input.validatorHotkey && isValidSs58Address(input.validatorHotkey) ? input.validatorHotkey : null;
}

function resolveValidatorHotkeyFromInput(input: BittensorChatExecutionInput, _plan?: BittensorPlan): string | null {
  const explicit = resolveExecutionHotkey(input);
  if (explicit) return explicit;
  const occupied = new Set([
    input.ss58Address,
    input.coldkey,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  return extractSs58Candidates(input.message).find((candidate) => !occupied.has(candidate)) ?? null;
}

function resolveExecutionDestination(input: BittensorChatExecutionInput, plan: BittensorPlan): string | null {
  const explicit = input.destination ?? input.recipient ?? null;
  if (explicit && isValidSs58Address(explicit)) return explicit;
  const occupied = new Set([
    input.ss58Address,
    input.coldkey,
    input.validatorHotkey,
    plan.ss58Address,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  return extractSs58Candidates(input.message).find((candidate) => !occupied.has(candidate)) ?? null;
}

function extractExecutionAction(message: string): BittensorExtrinsicAction {
  const lower = message.toLowerCase();
  if (/\bmove\s+stake\b/.test(lower)) return "move_stake";
  if (/\bunstake|undelegate\b/.test(lower)) return "unstake";
  if (/\btransfer|send\s+\d|send\s+tao\b/.test(lower)) return "transfer";
  if (/\bset\s+child|child\s+hotkey\b/.test(lower)) return "set_child_hotkey";
  if (/\bregister\b/.test(lower)) return "register";
  if (/\bserve\b/.test(lower)) return "serve";
  return "stake";
}

function extractExecutionAmountTao(input: BittensorChatExecutionInput): string | null {
  const explicit = parseAmountTao(input.amountTao);
  if (explicit !== null) return String(explicit);
  const message = input.message;
  const taoMatch = message.match(/\b(\d+(?:\.\d+)?)\s*TAO\b/i);
  if (taoMatch && parseAmountTao(taoMatch[1]) !== null) return taoMatch[1];
  const actionMatch = message.match(/\b(?:stake|staking|unstake|transfer)\s+(\d+(?:\.\d+)?)\b/i);
  if (actionMatch && parseAmountTao(actionMatch[1]) !== null) return actionMatch[1];
  return null;
}

function isWalletQuestion(message: string, plan: BittensorPlan): boolean {
  return plan.intent === "wallet" || /\b(show|check|read|what'?s|where).*?\b(my\s+)?TAO\b/i.test(message);
}

function isStakePositionQuestion(message: string): boolean {
  return /\b(where|how|what).*?\bstaked\b/i.test(message) ||
    /\b(stake positions|where am i staked|where i am staked|validator exposure|allocation)\b/i.test(message);
}

function isImageDiscoveryQuestion(message: string, plan: BittensorPlan): boolean {
  return plan.intent === "discover" && /(image|media|creative|art|render|vision|design|generate)/i.test(message);
}

function isValidatorComparisonQuestion(message: string): boolean {
  return /\b(compare|rank|find|show|which|best)\b.*\bvalidators?\b/i.test(message) ||
    /\bvalidators?\b.*\b(compare|rank|selection|shortlist)\b/i.test(message);
}

function isValidatorDeepDiveQuestion(message: string): boolean {
  return /\b(deep\s*dive|inspect|analy[sz]e|review|is .*safe|risk|health|score)\b.*\bvalidator\b/i.test(message) ||
    /\bvalidator\b.*\b(deep\s*dive|inspect|analy[sz]e|review|safe|risk|health|score)\b/i.test(message) ||
    /\bcompare validator\b/i.test(message);
}

function isAdvancedStakingPlanQuestion(message: string): boolean {
  return /\b(staking plan|allocation plan|allocate|distribute|portfolio plan|build .*plan|what-if|what if)\b/i.test(message) &&
    /\b(tao|stake|staking|subnet|validator|bittensor)\b/i.test(message);
}

function isStakePreviewQuestion(message: string, plan: BittensorPlan): boolean {
  return plan.intent === "stake_plan" || /\b(stake|staking|unstake|move stake|transfer|send\s+\d|send\s+tao|set child|register|serve)\b/i.test(message);
}

function isBittensorIntelligenceQuestion(message: string): boolean {
  return /\b(analy[sz]e|analysis|intelligence|risk|health|quality|score|diagnose|weak spots?|exposure|portfolio)\b/i.test(message);
}

function isBittensorDecisionQuestion(message: string): boolean {
  return /\b(what should i do|what do i do|next steps?|recommend(?:ation|ed)?|decide|decision|strategy|prioriti[sz]e|action plan|copilot|guide me|should i)\b/i.test(message) &&
    /\b(bittensor|tao|subnet|netuid|validator|stake|staking|wallet|coldkey|hotkey|alpha|dtao)\b/i.test(message);
}

function isBittensorWatchPolicyQuestion(message: string): boolean {
  return /\b(watch policy|watch preset|monitoring policy|alert policy|guardrails?|guard rails|risk policy|keep an eye|watch my|monitor my|set up alerts?|create alerts?)\b/i.test(message) &&
    /\b(bittensor|tao|subnet|netuid|validator|stake|staking|wallet|coldkey|hotkey|alpha|dtao|exposure)\b/i.test(message);
}

function isBittensorReadinessQuestion(message: string): boolean {
  return /\b(readiness|ready|health check|operator report|live qa|qa gate|is .*live|sidecar status|fallback status|provider status)\b/i.test(message) &&
    /\b(bittensor|tao|subtensor|finney|subnet|validator|wallet|sidecar)\b/i.test(message);
}

function isSubnetAdapterOperatorHandoffQuestion(message: string): boolean {
  return /\b(adapter|subnet service|service adapter)\b/i.test(message) &&
    /\b(operator handoff|handoff packet|review packet|launch packet|go\/no-go|go no go|gate summary|evidence packet)\b/i.test(message);
}

function isSubnetAdapterCanaryGateQuestion(message: string): boolean {
  return /\b(adapter|subnet service|service adapter|real adapter|canary)\b/i.test(message) &&
    /\b(canary gate|canary status|gate audit|runtime gate|acknowledgement|acknowledgment|armed|approval status|safe to invoke)\b/i.test(message);
}

function isSubnetAdapterCanaryOutcomeQuestion(message: string): boolean {
  return /\b(adapter|subnet service|service adapter|real adapter|canary)\b/i.test(message) &&
    /\b(outcome report|outcome artifact|post[-\s]?canary|canary outcome|canary report|archive outcome|result report)\b/i.test(message);
}

function isSubnetAdapterProviderRegistryQuestion(message: string): boolean {
  return /\b(adapter|subnet service|service adapter|provider|registry|partner|vendor)\b/i.test(message) &&
    /\b(provider registry|provider review|provider template|provider status|provider evidence|registry template|partner registry|vendor registry)\b/i.test(message);
}

function isSubnetAdapterMarketplaceQuestion(message: string): boolean {
  return /\b(adapter|subnet service|service adapter|direct service|call directly|invoke|marketplace)\b/i.test(message) &&
    /\b(marketplace|status|available|ready|configured|supported|which|list|show|can matterhorn|can you call|can it call|call directly)\b/i.test(message) &&
    /\b(bittensor|tao|subnet|netuid|adapter|service)\b/i.test(message);
}

function isSubnetAdapterMarketplaceExportQuestion(message: string): boolean {
  return !/\b(roadmap|prioriti[sz]e|what .*build next|next adapter|adapter work|next direct service)\b/i.test(message) &&
    /\b(adapter|subnet service|service adapter|marketplace)\b/i.test(message) &&
    /\b(export|markdown|copy[-\s]?paste|handoff doc|handoff markdown|report)\b/i.test(message) &&
    /\b(bittensor|tao|subnet|netuid|adapter|service)\b/i.test(message);
}

function isSubnetAdapterRoadmapQuestion(message: string): boolean {
  return /\b(adapter|subnet service|service adapter|direct service)\b/i.test(message) &&
    /\b(roadmap|prioriti[sz]e|what .*build next|next adapter|adapter work|next direct service|which .*adapter .*next)\b/i.test(message) &&
    /\b(bittensor|tao|subnet|netuid|adapter|service)\b/i.test(message);
}

function isSubnetAdapterRoadmapExportQuestion(message: string): boolean {
  return /\b(adapter|subnet service|service adapter|direct service|roadmap)\b/i.test(message) &&
    /\b(export|markdown|copy[-\s]?paste|handoff doc|handoff markdown|report)\b/i.test(message) &&
    /\b(roadmap|prioriti[sz]e|what .*build next|next adapter|adapter work|next direct service)\b/i.test(message) &&
    /\b(bittensor|tao|subnet|netuid|adapter|service)\b/i.test(message);
}

function extractSubnetAdapterKindFromMessage(message: string): Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported"> | null {
  if (/\b(data[_\s-]?search|search|retrieval|data)\b/i.test(message)) return "data_search";
  if (/\b(inference|model|llm)\b/i.test(message)) return "inference";
  if (/\b(compute|gpu)\b/i.test(message)) return "compute";
  if (/\b(creative|media|image|video)\b/i.test(message)) return "creative_media";
  if (/\b(agent|tooling|automation)\b/i.test(message)) return "agent_tooling";
  return null;
}

function decisionPromptNeedsWallet(message: string): boolean {
  return /\b(my|wallet|portfolio|balance|coldkey|exposure|staked|where am i|my tao|positions?)\b/i.test(message);
}

function isWalletIntelligenceQuestion(message: string, plan: BittensorPlan): boolean {
  if (isWalletChangeQuestion(message, plan)) return true;
  if (isWalletBaselineClearQuestion(message, plan)) return true;
  if (!isBittensorIntelligenceQuestion(message)) return false;
  return plan.intent === "wallet" || /\b(wallet|portfolio|my tao|balance|coldkey|stake exposure|exposure)\b/i.test(message);
}

function isWalletChangeQuestion(message: string, plan: BittensorPlan): boolean {
  return (
    /\b(what changed|changed since|changes since|diff|difference|compare.*last|since last time|new exposure|removed exposure)\b/i.test(message) &&
    (plan.intent === "wallet" || /\b(wallet|portfolio|my tao|balance|coldkey|stake|exposure|positions?)\b/i.test(message))
  );
}

function isWalletBaselineClearQuestion(message: string, plan: BittensorPlan): boolean {
  return (
    /\b(clear|forget|reset|delete|remove)\b/i.test(message) &&
    /\b(baseline|snapshot|history|last read|last time|wallet context)\b/i.test(message) &&
    (plan.intent === "wallet" || /\b(bittensor|tao|wallet|portfolio|coldkey|ss58|stake|exposure)\b/i.test(message))
  );
}

function isSubnetIntelligenceQuestion(message: string): boolean {
  if (!isBittensorIntelligenceQuestion(message)) return false;
  return /\b(subnet|netuid|sn\d+|validator|metagraph|emission|price|slippage|adapter)\b/i.test(message);
}

function buildBittensorLearningCard(message: string): BittensorChatCard {
  const lower = message.toLowerCase();
  const glossary = [
    { label: "TAO", value: "The base token of Bittensor, used for network incentives and staking exposure." },
    { label: "Subnet", value: "A specialized market inside Bittensor where miners and validators compete around a particular capability." },
    { label: "Coldkey", value: "The public wallet identity that owns TAO and controls staking. Matterhorn only needs the public SS58 address for reads." },
    { label: "Hotkey", value: "The operational identity used by validators and miners on subnets." },
    { label: "Validator", value: "A participant that scores miners and receives stake delegation/exposure." },
    { label: "Miner", value: "A participant that provides the subnet's service or work output." },
    { label: "Alpha", value: "Subnet-local exposure created by Dynamic TAO staking; alpha price and slippage can change." },
    { label: "Metagraph", value: "The public state of a subnet, including participants and metrics." },
    { label: "Dynamic TAO", value: "The staking model where subnet alpha prices and slippage affect staking and unstaking outcomes." },
  ];
  const matched = glossary.filter((item) => lower.includes(item.label.toLowerCase()) || lower.includes(item.label.toLowerCase().replace("dynamic tao", "dtao")));
  const items = (matched.length ? matched : glossary.slice(0, 5)).map((item) => cardItem(item.label, item.value));
  return {
    kind: "subnet_result",
    title: "Bittensor explainer",
    subtitle: matched.length ? "Focused glossary" : "Beginner overview",
    summary: "Bittensor is a network of specialized subnets. Matterhorn can explain, discover, monitor, compare validators, read public wallet exposure, and prepare unsigned previews without handling secrets.",
    tone: "default",
    items,
    warnings: [
      "Matterhorn never asks for seed phrases, private keys, or mnemonics.",
      "Using a subnet service is different from staking TAO into a subnet.",
    ],
    data: { topic: message, terms: items.map((item) => item.label) },
  };
}

function inferWatchKind(message: string, input: BittensorChatExecutionInput): BittensorWatch["kind"] {
  const lower = message.toLowerCase();
  if (/\bwallet|balance|portfolio|coldkey|my tao\b/.test(lower)) return "wallet";
  if (/\bvalidator|hotkey\b/.test(lower) || input.validatorHotkey) return "validator";
  if (/\bemission|emissions\b/.test(lower)) return "emissions";
  if (/\bslippage|price|alpha\b/.test(lower)) return "slippage";
  return "subnet";
}

function labelForWatch(message: string, kind: BittensorWatch["kind"], netuid: number | null, ss58Address: string | null): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length > 8 && trimmed.length <= 80) return trimmed;
  if (netuid !== null) return `Bittensor ${kind} watch for subnet ${netuid}`;
  if (ss58Address) return `Bittensor ${kind} watch for ${shortSs58(ss58Address)}`;
  return `Bittensor ${kind} watch`;
}

function isWatchCheckQuestion(message: string): boolean {
  return /\b(check|evaluate|run|show|list|status|review)\b.*\b(watches|watchlist|alerts?|monitors?)\b/i.test(message) ||
    /\bwhat changed\b/i.test(message);
}

function isRiskiestWatchQuestion(message: string): boolean {
  return /\b(watch|monitor|alert|track|notify)\b.*\b(riskiest|riskier|largest|top|important|critical)\b/i.test(message) ||
    /\bcreate watches\b.*\b(positions|exposure|wallet|risk)\b/i.test(message);
}

function watchFromSuggestion(suggestion: BittensorWatchSuggestion): BittensorWatch {
  return createBittensorWatch({
    kind: suggestion.kind,
    label: suggestion.label,
    netuid: suggestion.netuid,
    ss58Address: suggestion.ss58Address,
    validatorHotkey: suggestion.validatorHotkey ?? null,
    threshold: suggestion.threshold,
    reason: suggestion.reason,
  });
}

function uniqueWatchSuggestions(suggestions: BittensorWatchSuggestion[]): BittensorWatchSuggestion[] {
  const seen = new Set<string>();
  const unique: BittensorWatchSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = [
      suggestion.kind,
      suggestion.netuid ?? "any",
      suggestion.ss58Address ?? "none",
      suggestion.validatorHotkey ?? "none",
      suggestion.threshold ?? "none",
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(suggestion);
  }
  return unique;
}

function createBittensorChatContextId(): string {
  return `bt-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContextId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^bt-chat-[a-z0-9-]{6,96}$/i.test(trimmed) ? trimmed : null;
}

function normalizeContextNetuid(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null;
}

function normalizeContextAmount(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = parseAmountTao(value);
  return parsed === null ? null : String(value).trim();
}

function normalizeContextSs58(value: unknown): string | null {
  return typeof value === "string" && isValidSs58Address(value.trim()) ? value.trim() : null;
}

function normalizeContextWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
    : [];
}

function sanitizeBittensorChatContext(value: unknown): BittensorChatContext | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = normalizeContextId(record.id) ?? createBittensorChatContextId();
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim()
    ? record.updatedAt
    : nowIso();
  const lastIntent = typeof record.lastIntent === "string" && ["learn", "discover", "wallet", "stake_plan", "subnet_use", "monitor"].includes(record.lastIntent)
    ? record.lastIntent as BittensorChatIntent
    : null;
  const lastExecution = typeof record.lastExecution === "string" && ["answered", "clarification_required", "unsigned_preview", "unsupported"].includes(record.lastExecution)
    ? record.lastExecution as BittensorChatExecutionStatus
    : null;
  return {
    id,
    ss58Address: normalizeContextSs58(record.ss58Address),
    netuid: normalizeContextNetuid(record.netuid),
    amountTao: normalizeContextAmount(record.amountTao),
    validatorHotkey: normalizeContextSs58(record.validatorHotkey),
    coldkey: normalizeContextSs58(record.coldkey),
    recipient: normalizeContextSs58(record.recipient),
    destination: normalizeContextSs58(record.destination),
    lastIntent,
    lastExecution,
    updatedAt,
    warnings: normalizeContextWarnings(record.warnings),
  };
}

function mergeBittensorChatContexts(
  stored: BittensorChatContext | null,
  inline: BittensorChatContext | null,
): BittensorChatContext | null {
  if (!stored && !inline) return null;
  const base = stored ?? inline!;
  return {
    ...base,
    ...(inline ?? {}),
    id: stored?.id ?? inline?.id ?? createBittensorChatContextId(),
    ss58Address: inline?.ss58Address ?? stored?.ss58Address ?? null,
    netuid: inline?.netuid ?? stored?.netuid ?? null,
    amountTao: inline?.amountTao ?? stored?.amountTao ?? null,
    validatorHotkey: inline?.validatorHotkey ?? stored?.validatorHotkey ?? null,
    coldkey: inline?.coldkey ?? stored?.coldkey ?? null,
    recipient: inline?.recipient ?? stored?.recipient ?? null,
    destination: inline?.destination ?? stored?.destination ?? inline?.recipient ?? stored?.recipient ?? null,
    warnings: uniqueWarnings(stored?.warnings, inline?.warnings),
  };
}

export function getBittensorChatContext(contextId: string): BittensorChatContext | null {
  const normalized = normalizeContextId(contextId);
  return normalized ? chatContexts.get(normalized) ?? null : null;
}

function resolveBittensorChatContext(input: BittensorChatExecutionInput): BittensorChatContext | null {
  const storedId = normalizeContextId(input.contextId);
  const stored = storedId ? chatContexts.get(storedId) ?? null : null;
  const inline = sanitizeBittensorChatContext(input.context);
  return mergeBittensorChatContexts(stored, inline);
}

function hydrateBittensorChatInput(input: BittensorChatExecutionInput, context: BittensorChatContext | null): BittensorChatExecutionInput {
  if (!context) return input;
  return {
    ...input,
    ss58Address: input.ss58Address ?? context.ss58Address,
    netuid: input.netuid ?? context.netuid,
    amountTao: input.amountTao ?? context.amountTao,
    validatorHotkey: input.validatorHotkey ?? context.validatorHotkey,
    coldkey: input.coldkey ?? context.coldkey,
    recipient: input.recipient ?? context.recipient,
    destination: input.destination ?? context.destination ?? context.recipient,
  };
}

function buildBittensorChatContext(
  input: BittensorChatExecutionInput,
  result: BittensorChatExecutionResult,
  previous: BittensorChatContext | null,
): BittensorChatContext {
  const planNetuid = result.plan.netuids.find((netuid) => Number.isInteger(netuid) && netuid >= 0) ?? null;
  const context: BittensorChatContext = {
    id: previous?.id ?? normalizeContextId(input.contextId) ?? normalizeContextId(input.context?.id) ?? createBittensorChatContextId(),
    ss58Address: normalizeContextSs58(input.ss58Address) ?? previous?.ss58Address ?? normalizeContextSs58(result.plan.ss58Address),
    netuid: normalizeContextNetuid(input.netuid) ?? previous?.netuid ?? planNetuid,
    amountTao: normalizeContextAmount(input.amountTao) ?? extractExecutionAmountTao(input) ?? previous?.amountTao ?? null,
    validatorHotkey: normalizeContextSs58(input.validatorHotkey) ?? previous?.validatorHotkey ?? null,
    coldkey: normalizeContextSs58(input.coldkey) ?? previous?.coldkey ?? normalizeContextSs58(input.ss58Address),
    recipient: normalizeContextSs58(input.recipient) ?? previous?.recipient ?? null,
    destination: normalizeContextSs58(input.destination) ?? normalizeContextSs58(input.recipient) ?? previous?.destination ?? previous?.recipient ?? null,
    lastIntent: result.plan.intent,
    lastExecution: result.execution,
    updatedAt: nowIso(),
    warnings: uniqueWarnings(previous?.warnings, result.warnings).slice(0, 8),
  };
  chatContexts.set(context.id, context);
  while (chatContexts.size > 128) {
    const firstKey = chatContexts.keys().next().value;
    if (!firstKey) break;
    chatContexts.delete(firstKey);
  }
  return context;
}

function buildStakePositionsCard(wallet: BittensorWalletSnapshot): BittensorChatCard {
  const positions = [...wallet.stakePositions].sort((a, b) => (b.taoValue ?? 0) - (a.taoValue ?? 0));
  const total = positions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
  const highestRisk = positions.find((position) => position.slippageRisk === "high")
    ?? positions.find((position) => position.slippageRisk === "medium")
    ?? positions[0]
    ?? null;
  return {
    kind: "wallet_snapshot",
    title: "Stake positions",
    subtitle: shortSs58(wallet.ss58Address),
    summary: positions.length
      ? `Top stake positions sorted by TAO value. Total sampled stake value: ${formatMetric(total)} TAO.`
      : "No subnet stake positions were returned by the current wallet provider.",
    tone: wallet.providerStatus === "ok" && positions.length ? "default" : "warning",
    items: [
      cardItem("Positions", positions.length),
      cardItem("Total staked value", `${formatMetric(total)} TAO`),
      cardItem("Highest slippage risk", highestRisk ? `${highestRisk.subnetName}: ${highestRisk.slippageRisk}` : "Unavailable", highestRisk?.slippageRisk === "high" ? "warning" : "muted"),
      cardItem("Source", wallet.source ?? "provider", wallet.source?.includes("fallback") ? "warning" : "muted"),
      cardItem("Block", wallet.block ?? "Unavailable", wallet.block === null || wallet.block === undefined ? "muted" : "default"),
      cardItem("Freshness", wallet.freshness ?? "Unavailable", wallet.freshness ? "default" : "muted"),
    ],
    warnings: wallet.providerStatus === "ok" ? wallet.warnings ?? [] : [wallet.message ?? "Wallet provider data is unavailable."],
    data: { wallet, positions: positions.slice(0, 8) },
  };
}

function cloneWalletSnapshot(wallet: BittensorWalletSnapshot): BittensorWalletSnapshot {
  return JSON.parse(JSON.stringify(wallet)) as BittensorWalletSnapshot;
}

function walletStakeTotal(wallet: BittensorWalletSnapshot): number | null {
  const values = wallet.stakePositions
    .map((position) => position.taoValue)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function numericDelta(current: number | null | undefined, previous: number | null | undefined): number | null {
  return typeof current === "number" && Number.isFinite(current) && typeof previous === "number" && Number.isFinite(previous)
    ? current - previous
    : null;
}

function walletPositionKey(position: BittensorStakePosition): string {
  return [position.netuid, position.validatorHotkey ?? "no-validator"].join(":");
}

function rememberBittensorWalletSnapshot(wallet: BittensorWalletSnapshot): void {
  walletSnapshotBaselines.set(wallet.ss58Address, { wallet: cloneWalletSnapshot(wallet), updatedAt: nowIso() });
  while (walletSnapshotBaselines.size > 128) {
    const firstKey = walletSnapshotBaselines.keys().next().value;
    if (!firstKey) break;
    walletSnapshotBaselines.delete(firstKey);
  }
  rememberBittensorWalletTimelineSnapshot(wallet);
}

export function clearBittensorWalletSnapshotBaseline(ss58Address: string): BittensorWalletBaselineClearReport {
  const baseline = walletSnapshotBaselines.get(ss58Address) ?? null;
  const timeline = clearBittensorWalletTimeline(ss58Address);
  const cleared = walletSnapshotBaselines.delete(ss58Address) || timeline.cleared > 0;
  const previousUpdatedAt = baseline?.updatedAt ?? timeline.previousUpdatedAt ?? null;
  return {
    kind: "wallet_baseline_clear",
    ss58Address,
    cleared,
    previousUpdatedAt,
    persistentSnapshotsCleared: timeline.cleared,
    updatedAt: nowIso(),
    summary: cleared
      ? `Cleared the public wallet baseline for ${shortSs58(ss58Address)}.`
      : `No public wallet baseline was stored for ${shortSs58(ss58Address)}.`,
    warnings: [
      "Only public watch-only wallet baseline data is cleared; Matterhorn never stores seed phrases, private keys, mnemonics, wallet exports, signatures, or custody material.",
      "Future wallet-change comparisons will create a fresh baseline from the next public wallet read.",
    ],
  };
}

function buildBittensorWalletChangeReport(current: BittensorWalletSnapshot): BittensorWalletChangeReport {
  const baseline = walletSnapshotBaselines.get(current.ss58Address) ?? latestBittensorWalletTimelineBaseline(current.ss58Address);
  const currentUpdatedAt = nowIso();
  const previous = baseline?.wallet ?? null;
  const previousStakeTotal = previous ? walletStakeTotal(previous) : null;
  const currentStakeTotal = walletStakeTotal(current);
  const previousNetuids = new Set(previous?.stakePositions.map((position) => position.netuid) ?? []);
  const currentNetuids = new Set(current.stakePositions.map((position) => position.netuid));
  const previousValidators = new Set(previous?.stakePositions.map((position) => position.validatorHotkey).filter((value): value is string => Boolean(value)) ?? []);
  const currentValidators = new Set(current.stakePositions.map((position) => position.validatorHotkey).filter((value): value is string => Boolean(value)));
  const previousPositions = new Map((previous?.stakePositions ?? []).map((position) => [walletPositionKey(position), position]));
  const currentPositions = new Map(current.stakePositions.map((position) => [walletPositionKey(position), position]));
  const changedPositions = [...new Set([...previousPositions.keys(), ...currentPositions.keys()])]
    .map((key) => {
      const oldPosition = previousPositions.get(key) ?? null;
      const newPosition = currentPositions.get(key) ?? null;
      const deltaTao = numericDelta(newPosition?.taoValue, oldPosition?.taoValue);
      return {
        netuid: newPosition?.netuid ?? oldPosition?.netuid ?? 0,
        subnetName: newPosition?.subnetName ?? oldPosition?.subnetName ?? `Subnet ${newPosition?.netuid ?? oldPosition?.netuid ?? 0}`,
        validatorHotkey: newPosition?.validatorHotkey ?? oldPosition?.validatorHotkey ?? null,
        previousTaoValue: oldPosition?.taoValue ?? null,
        currentTaoValue: newPosition?.taoValue ?? null,
        deltaTao,
      };
    })
    .filter((position) =>
      position.previousTaoValue !== position.currentTaoValue &&
      (position.deltaTao === null || Math.abs(position.deltaTao) > 0.000001)
    )
    .slice(0, 8);
  const previousRiskCount = previous?.stakePositions.filter((position) => position.slippageRisk === "high" || position.slippageRisk === "medium").length ?? 0;
  const currentRiskCount = current.stakePositions.filter((position) => position.slippageRisk === "high" || position.slippageRisk === "medium").length;
  const riskChanges = previous
    ? [
      ...(currentRiskCount > previousRiskCount ? [`Risk-position count increased from ${previousRiskCount} to ${currentRiskCount}.`] : []),
      ...(currentRiskCount < previousRiskCount ? [`Risk-position count decreased from ${previousRiskCount} to ${currentRiskCount}.`] : []),
      ...(current.providerStatus !== previous.providerStatus ? [`Provider status changed from ${previous.providerStatus} to ${current.providerStatus}.`] : []),
    ]
    : [];
  const addedNetuids = [...currentNetuids].filter((netuid) => !previousNetuids.has(netuid)).sort((a, b) => a - b);
  const removedNetuids = [...previousNetuids].filter((netuid) => !currentNetuids.has(netuid)).sort((a, b) => a - b);
  const addedValidators = [...currentValidators].filter((hotkey) => !previousValidators.has(hotkey)).sort();
  const removedValidators = [...previousValidators].filter((hotkey) => !currentValidators.has(hotkey)).sort();
  const changeCount = changedPositions.length + addedNetuids.length + removedNetuids.length + addedValidators.length + removedValidators.length + riskChanges.length;
  const warnings = uniqueWarnings(
    previous ? [] : ["No prior public wallet baseline was available. Matterhorn created one from this read."],
    current.providerStatus === "ok" ? [] : [current.message ?? "Wallet provider data is unavailable."],
    current.warnings ?? [],
    ["This comparison uses public watch-only wallet data and is not financial advice."],
  );
  const report: BittensorWalletChangeReport = {
    kind: "wallet_change",
    ss58Address: current.ss58Address,
    baselineAvailable: Boolean(previous),
    previousUpdatedAt: baseline?.updatedAt ?? null,
    currentUpdatedAt,
    freeTaoDelta: numericDelta(current.taoBalance, previous?.taoBalance),
    stakeTotalDelta: numericDelta(currentStakeTotal, previousStakeTotal),
    estimatedValueDelta: numericDelta(current.estimatedValueTao, previous?.estimatedValueTao),
    positionCountDelta: current.stakePositions.length - (previous?.stakePositions.length ?? 0),
    addedNetuids,
    removedNetuids,
    addedValidators,
    removedValidators,
    changedPositions,
    riskChanges,
    summary: previous
      ? changeCount
        ? `Detected ${changeCount} public wallet exposure change${changeCount === 1 ? "" : "s"} since the last baseline.`
        : "No material public wallet exposure changes were detected since the last baseline."
      : "Created a first public wallet baseline; ask again after another read to compare changes.",
    warnings,
    source: current.source ?? "provider",
    block: current.block ?? null,
    freshness: current.freshness ?? null,
    updatedAt: currentUpdatedAt,
  };
  rememberBittensorWalletSnapshot(current);
  return report;
}

function formatSignedDelta(value: number | null, suffix = ""): string {
  if (value === null) return "Unavailable";
  if (Math.abs(value) <= 0.000001) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${formatMetric(value)}${suffix}`;
}

function buildBittensorWalletChangeCard(report: BittensorWalletChangeReport): BittensorChatCard {
  const topChange = report.changedPositions[0] ?? null;
  return {
    kind: "intelligence_report",
    title: "Bittensor wallet changes",
    subtitle: shortSs58(report.ss58Address),
    summary: report.summary,
    tone: report.baselineAvailable && (report.changedPositions.length || report.riskChanges.length || report.removedValidators.length || report.removedNetuids.length) ? "warning" : "default",
    items: [
      cardItem("Baseline", report.baselineAvailable ? "Available" : "Created now", report.baselineAvailable ? "default" : "warning"),
      cardItem("Free TAO delta", formatSignedDelta(report.freeTaoDelta, " TAO")),
      cardItem("Staked TAO delta", formatSignedDelta(report.stakeTotalDelta, " TAO")),
      cardItem("Estimated value delta", formatSignedDelta(report.estimatedValueDelta, " TAO")),
      cardItem("Position count delta", formatSignedDelta(report.positionCountDelta)),
      cardItem("Added subnets", report.addedNetuids.length ? report.addedNetuids.join(", ") : "None"),
      cardItem("Removed subnets", report.removedNetuids.length ? report.removedNetuids.join(", ") : "None", report.removedNetuids.length ? "warning" : "muted"),
      cardItem("Validator changes", report.addedValidators.length + report.removedValidators.length),
      cardItem("Top position change", topChange ? `${topChange.subnetName}: ${formatSignedDelta(topChange.deltaTao, " TAO")}` : "None"),
      cardItem("Freshness", report.freshness ?? "Unavailable", report.freshness ? "default" : "muted"),
      cardItem("Source", report.source, report.source.includes("fallback") ? "warning" : "muted"),
    ],
    actions: [
      {
        label: "Analyze wallet",
        kind: "send_to_chat",
        payload: { prompt: `Analyze my Bittensor wallet. SS58 address: ${report.ss58Address}` },
      },
      {
        label: "Create watches",
        kind: "send_to_chat",
        payload: { prompt: `Create watches for my riskiest Bittensor positions. SS58 address: ${report.ss58Address}` },
      },
    ],
    warnings: report.warnings,
    data: { report },
  };
}

function buildBittensorWalletBaselineClearCard(report: BittensorWalletBaselineClearReport): BittensorChatCard {
  return {
    kind: "intelligence_report",
    title: "Bittensor wallet baseline cleared",
    subtitle: shortSs58(report.ss58Address),
    summary: report.summary,
    tone: report.cleared ? "default" : "warning",
    items: [
      cardItem("Baseline removed", report.cleared ? "Yes" : "No stored baseline", report.cleared ? "default" : "warning"),
      cardItem("Previous baseline", report.previousUpdatedAt ?? "None", report.previousUpdatedAt ? "default" : "muted"),
      cardItem("Persisted snapshots cleared", report.persistentSnapshotsCleared),
      cardItem("Updated", report.updatedAt, "muted"),
      cardItem("Data class", "Public watch-only wallet snapshot"),
      cardItem("Next comparison", "Creates a fresh baseline on the next wallet read"),
    ],
    actions: [
      {
        label: "Show my TAO",
        kind: "send_to_chat",
        payload: { prompt: `Show my TAO. SS58 address: ${report.ss58Address}` },
      },
    ],
    warnings: report.warnings,
    data: { report },
  };
}

function findForbiddenBittensorChatCredentialInput(value: unknown, rootPath: string[] = []): string | null {
  const MAX_NODES = 100_000;
  const MAX_DEPTH = 256;
  const stack: Array<{ value: unknown; path: string[]; depth: number }> = [{ value, path: rootPath, depth: 0 }];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (++visited > MAX_NODES) return [...node.path, "<oversized>"].join(".");
    if (node.depth > MAX_DEPTH) return [...node.path, "<too-deep>"].join(".");
    const current = node.value;
    if (typeof current === "string") {
      const sample = current.length > 4096 ? current.slice(0, 4096) : current;
      if (FORBIDDEN_CHAT_CREDENTIAL_VALUE_RE.test(sample) || FORBIDDEN_CHAT_CREDENTIAL_COMMAND_RE.test(sample)) {
        return node.path.length ? node.path.join(".") : "input";
      }
      continue;
    }
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        stack.push({ value: current[index], path: [...node.path, String(index)], depth: node.depth + 1 });
      }
      continue;
    }
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (FORBIDDEN_CHAT_CREDENTIAL_KEY_RE.test(key)) return [...node.path, key].join(".");
      stack.push({ value: child, path: [...node.path, key], depth: node.depth + 1 });
    }
  }
  return null;
}

function clarificationResult(
  plan: BittensorPlan,
  question: string,
  cards: BittensorChatCard[] = buildBittensorPlanCards({ ...plan, requiresClarification: true, clarificationQuestion: question }),
  warnings: string[] = [],
  data: Record<string, unknown> = {},
): BittensorChatExecutionResult {
  return {
    plan: { ...plan, requiresClarification: true, clarificationQuestion: question },
    responseText: question,
    cards,
    data,
    warnings: uniqueWarnings(plan.safetyNotes, warnings),
    requiresClarification: true,
    clarificationQuestion: question,
    execution: "clarification_required",
  };
}

export async function executeBittensorChatWorkflow(input: BittensorChatExecutionInput): Promise<BittensorChatExecutionResult> {
  const previousContext = resolveBittensorChatContext(input);
  const hydratedInput = hydrateBittensorChatInput(input, previousContext);
  const result = await executeBittensorChatWorkflowCore(hydratedInput);
  const guidedResult = withBittensorCustomerGuidance(result);
  const context = buildBittensorChatContext(hydratedInput, guidedResult, previousContext);
  return { ...guidedResult, context };
}

async function executeBittensorChatWorkflowCore(input: BittensorChatExecutionInput): Promise<BittensorChatExecutionResult> {
  const message = String(input.message ?? "").trim();
  const plan = planBittensorChat({ message, ss58Address: input.ss58Address ?? input.coldkey ?? null });
  const answeredPlan = { ...plan, requiresClarification: false, clarificationQuestion: null };
  const warnings = [...plan.safetyNotes];
  const forbidden = findForbiddenBittensorChatCredentialInput(input);
  if (forbidden) {
    const rejectedPlan: BittensorPlan = {
      ...answeredPlan,
      summary: "Matterhorn rejected credential-shaped Bittensor chat input before execution.",
      userGoal: "Credential-shaped input rejected before execution.",
      netuids: [],
      ss58Address: null,
      responseCards: ["subnet_result"],
    };
    return {
      plan: rejectedPlan,
      responseText:
        "For safety, remove seed phrases, mnemonics, private keys, wallet exports, signatures, signed payloads, or adapter credentials. Matterhorn only accepts public Bittensor addresses and action parameters for read-only analysis and unsigned previews.",
      cards: [{
        kind: "subnet_result",
        title: "Bittensor secret rejected",
        summary: "Matterhorn rejected credential-shaped chat input before running any Bittensor read or preview workflow.",
        tone: "warning",
        items: [
          cardItem("Rejected field", forbidden, "warning"),
          cardItem("Allowed input", "Public SS58 addresses, netuids, validator hotkeys, amounts, and watch parameters"),
          cardItem("Matterhorn will not", "Ask for seeds/private keys, custody wallets, sign, broadcast, or store wallet exports.", "warning"),
        ],
        warnings: ["Rejected credential-shaped field: " + forbidden],
      }],
      data: {},
      warnings: uniqueWarnings(warnings, ["Rejected credential-shaped field: " + forbidden]),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "unsupported",
    };
  }

  if (!message) {
    return clarificationResult(plan, "What would you like to do with Bittensor?");
  }

  if (isBittensorReadinessQuestion(message)) {
    const report = await auditBittensorReadiness();
    const operatorReport = buildBittensorReadinessOperatorReport(report);
    return {
      plan: { ...answeredPlan, intent: "monitor", responseCards: ["readiness_report"] },
      responseText: operatorReport.operatorSummary,
      cards: [buildBittensorReadinessOperatorCard(operatorReport)],
      data: { readiness: report, operatorReport },
      warnings: uniqueWarnings(warnings, operatorReport.warnings, operatorReport.blockers),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterCanaryOutcomeQuestion(message)) {
    const report = buildBittensorSubnetAdapterCanaryOutcomeReport({
      adapter: extractSubnetAdapterKindFromMessage(message),
      netuid: resolveExecutionNetuid(input, plan),
    });
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_canary_outcome_report"] },
      responseText: `Built a ${report.status} Bittensor adapter canary outcome report. This is a sanitized review artifact; it does not invoke or authorize any subnet service.`,
      cards: [buildBittensorAdapterCanaryOutcomeReportCard(report)],
      data: { canaryOutcome: report },
      warnings: uniqueWarnings(warnings, report.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterCanaryGateQuestion(message)) {
    const canaryGate = auditBittensorSubnetAdapterCanaryGate();
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_canary_gate"] },
      responseText: `Bittensor real-adapter canary gate is ${canaryGate.status.replace(/_/g, " ")}. This is a read-only audit; it does not invoke or authorize any subnet service.`,
      cards: [buildBittensorAdapterCanaryGateCard(canaryGate)],
      data: { canaryGate },
      warnings: uniqueWarnings(warnings, canaryGate.warnings, canaryGate.blockers),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterProviderRegistryQuestion(message)) {
    const providerRegistry = getBittensorSubnetAdapterProviderRegistry();
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_provider_registry"] },
      responseText: `Bittensor adapter provider registry is ${providerRegistry.status.replace(/_/g, " ")} with ${providerRegistry.readyForCanaryCount} reviewed canary-ready provider(s). This is read-only evidence and does not configure or invoke a subnet service.`,
      cards: [buildBittensorAdapterProviderRegistryCard(providerRegistry)],
      data: { providerRegistry },
      warnings: uniqueWarnings(warnings, providerRegistry.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterMarketplaceExportQuestion(message)) {
    const marketplaceExport = await exportBittensorSubnetAdapterMarketplace({
      adapter: extractSubnetAdapterKindFromMessage(message),
      netuid: resolveExecutionNetuid(input, plan),
      limit: resolveExecutionLimit(input, 12),
    });
    const marketplace = await listBittensorSubnetAdapterMarketplace({
      adapter: extractSubnetAdapterKindFromMessage(message),
      netuid: resolveExecutionNetuid(input, plan),
      limit: resolveExecutionLimit(input, 12),
    });
    const card = buildBittensorAdapterMarketplaceCard(marketplace);
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_marketplace"] },
      responseText: `Built a redacted Bittensor adapter marketplace markdown export with ${marketplaceExport.summary.total} entr${marketplaceExport.summary.total === 1 ? "y" : "ies"}. This is evidence only; it does not invoke or authorize real subnet service execution.`,
      cards: [{
        ...card,
        actions: [
          ...(card.actions ?? []),
          {
            label: "Copy markdown",
            kind: "copy_payload",
            payload: { markdown: marketplaceExport.markdown },
          },
        ],
      }],
      data: { marketplaceExport, marketplace },
      warnings: uniqueWarnings(warnings, marketplaceExport.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterRoadmapExportQuestion(message)) {
    const roadmapExport = await exportBittensorSubnetAdapterRoadmap({
      goal: message,
      limit: resolveExecutionLimit(input, 5),
    });
    const roadmap = await planBittensorSubnetAdapterRoadmap({
      goal: message,
      limit: resolveExecutionLimit(input, 5),
    });
    const card = buildBittensorAdapterRoadmapCard(roadmap);
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_roadmap"] },
      responseText: `Built a redacted Bittensor adapter roadmap markdown export with ${roadmapExport.summary.recommendationCount} recommendation${roadmapExport.summary.recommendationCount === 1 ? "" : "s"}. This is planning evidence only; it does not configure, invoke, approve, sign, or broadcast anything.`,
      cards: [{
        ...card,
        actions: [
          ...(card.actions ?? []),
          {
            label: "Copy markdown",
            kind: "copy_payload",
            payload: { markdown: roadmapExport.markdown },
          },
        ],
      }],
      data: { roadmapExport, roadmap },
      warnings: uniqueWarnings(warnings, roadmapExport.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterRoadmapQuestion(message)) {
    const roadmap = await planBittensorSubnetAdapterRoadmap({
      goal: message,
      limit: resolveExecutionLimit(input, 5),
    });
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_roadmap"] },
      responseText: `Built a Bittensor adapter roadmap with ${roadmap.recommendations.length} recommendation${roadmap.recommendations.length === 1 ? "" : "s"}. This is planning evidence only; it does not configure, invoke, approve, sign, or broadcast anything.`,
      cards: [buildBittensorAdapterRoadmapCard(roadmap)],
      data: { roadmap },
      warnings: uniqueWarnings(warnings, roadmap.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterMarketplaceQuestion(message)) {
    const marketplace = await listBittensorSubnetAdapterMarketplace({
      adapter: extractSubnetAdapterKindFromMessage(message),
      netuid: resolveExecutionNetuid(input, plan),
      limit: resolveExecutionLimit(input, 12),
    });
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_marketplace"] },
      responseText: `Found ${marketplace.total} Bittensor subnet adapter marketplace entr${marketplace.total === 1 ? "y" : "ies"}. This is evidence only; it does not invoke or authorize real subnet service execution.`,
      cards: [buildBittensorAdapterMarketplaceCard(marketplace)],
      data: { marketplace },
      warnings: uniqueWarnings(warnings, marketplace.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetAdapterOperatorHandoffQuestion(message)) {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I use for this Bittensor adapter operator handoff?");
    }
    const adapter = extractSubnetAdapterKindFromMessage(message);
    const handoff = await buildBittensorSubnetAdapterOperatorHandoff({
      adapter,
      netuid,
      task: message,
      ss58Address: resolveExecutionSs58(input, plan),
      limit: resolveExecutionLimit(input, 5),
    });
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["adapter_operator_handoff"] },
      responseText: `Built a ${handoff.status.replace(/_/g, " ")} Bittensor adapter handoff for subnet ${netuid}. This is evidence only; it does not authorize real subnet service execution.`,
      cards: [buildBittensorAdapterOperatorHandoffCard(handoff)],
      data: { handoff },
      warnings: uniqueWarnings(warnings, handoff.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isBittensorWatchPolicyQuestion(message)) {
    const ss58Address = resolveExecutionSs58(input, plan);
    const netuid = resolveExecutionNetuid(input, plan);
    const validatorHotkey = resolveValidatorHotkeyFromInput(input, plan);
    if (decisionPromptNeedsWallet(message) && !ss58Address && netuid === null && !validatorHotkey) {
      return clarificationResult(plan, "I can build Bittensor wallet guardrails, but I need your SS58 coldkey public address for watch-only wallet context.");
    }
    if (/\bvalidator\b/i.test(message) && !validatorHotkey && netuid === null) {
      return clarificationResult(plan, "Which validator hotkey or subnet netuid should this Bittensor watch policy focus on?");
    }
    const policy = await buildBittensorWatchPolicyPreset({
      message,
      ss58Address,
      netuid,
      validatorHotkey,
      strategy: resolveExecutionStrategy(input),
      limit: resolveExecutionLimit(input, 4),
    });
    return {
      plan: { ...answeredPlan, intent: "monitor", responseCards: ["intelligence_report"] },
      responseText: `${policy.summary} The first safe step is to review the policy rules, then create the recommended public-data watches if they match your intent.`,
      cards: [buildBittensorWatchPolicyPresetCard(policy)],
      data: { watchPolicy: policy },
      warnings: uniqueWarnings(warnings, policy.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isBittensorDecisionQuestion(message)) {
    const ss58Address = resolveExecutionSs58(input, plan);
    const netuid = resolveExecutionNetuid(input, plan);
    if (decisionPromptNeedsWallet(message) && !ss58Address && netuid === null) {
      return clarificationResult(plan, "I can build a personalized Bittensor decision brief, but I need your SS58 coldkey public address for watch-only wallet context.");
    }
    const brief = await buildBittensorDecisionBrief({
      message,
      ss58Address,
      netuid,
      amountTao: extractExecutionAmountTao(input),
      strategy: resolveExecutionStrategy(input),
      limit: resolveExecutionLimit(input, 5),
    });
    return {
      plan: { ...answeredPlan, intent: brief.focus === "wallet" ? "wallet" : brief.focus === "subnet" ? "discover" : plan.intent, responseCards: ["intelligence_report"] },
      responseText: `${brief.summary} The first safe step is: ${brief.options[0]?.summary ?? "gather live read context before acting"}.`,
      cards: [buildBittensorDecisionBriefCard(brief)],
      data: { decision: brief },
      warnings: uniqueWarnings(warnings, brief.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (plan.intent === "learn") {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid !== null) {
      const invocation = await invokeBittensorSubnet(netuid, { intent: "explain", task: message, ss58Address: resolveExecutionSs58(input, plan) });
      return {
        plan: { ...answeredPlan, intent: "learn", responseCards: ["subnet_result"] },
        responseText: invocation.message,
        cards: [buildBittensorInvocationCard(invocation)],
        data: { invocation },
        warnings: uniqueWarnings(warnings, invocation.warnings),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "answered",
      };
    }
    const card = buildBittensorLearningCard(message);
    return {
      plan: { ...answeredPlan, intent: "learn", responseCards: ["subnet_result"] },
      responseText: "Bittensor is a network of specialized AI and compute markets called subnets. Matterhorn can help you understand the terms, discover useful subnets, read public wallet exposure, monitor changes, and prepare unsigned staking previews without handling secrets.",
      cards: [card],
      data: { topic: message },
      warnings: uniqueWarnings(warnings, card.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isValidatorDeepDiveQuestion(message)) {
    const netuid = resolveExecutionNetuid(input, plan);
    const validatorHotkey = resolveValidatorHotkeyFromInput(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I use for this validator deep dive?");
    }
    if (!validatorHotkey) {
      return clarificationResult(plan, "Which validator hotkey should I analyze?");
    }
    const report = await analyzeBittensorValidatorIntelligence({
      netuid,
      validatorHotkey,
      strategy: resolveExecutionStrategy(input),
    });
    return {
      plan: { ...answeredPlan, intent: "stake_plan", responseCards: ["intelligence_report"] },
      responseText: report.foundInSample
        ? `Analyzed validator ${shortSs58(validatorHotkey)} on subnet ${netuid}. Score ${report.score}/100 is based on visible public metagraph samples, not financial advice.`
        : `I could not find validator ${shortSs58(validatorHotkey)} in the visible sample for subnet ${netuid}. I can still create a watch and compare peers.`,
      cards: [buildBittensorValidatorIntelligenceCard(report)],
      data: { intelligence: report },
      warnings: uniqueWarnings(warnings, report.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isSubnetIntelligenceQuestion(message)) {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I analyze?");
    }
    const report = await analyzeBittensorSubnetIntelligence(netuid);
    return {
      plan: { ...answeredPlan, intent: "discover", responseCards: ["intelligence_report"] },
      responseText: `Analyzed subnet ${report.netuid} (${report.name}) from public Bittensor data. Score ${report.score}/100 reflects provider quality, market context, metagraph visibility, validator concentration, and adapter readiness; it is not financial advice.`,
      cards: [buildBittensorSubnetIntelligenceCard(report)],
      data: { intelligence: report },
      warnings: uniqueWarnings(warnings, report.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isWalletIntelligenceQuestion(message, plan)) {
    const ss58Address = resolveExecutionSs58(input, plan);
    if (!ss58Address) {
      return clarificationResult(plan, "I can analyze your Bittensor exposure, but I need your SS58 coldkey public address.");
    }
    if (isWalletBaselineClearQuestion(message, plan)) {
      const baselineClear = clearBittensorWalletSnapshotBaseline(ss58Address);
      return {
        plan: { ...answeredPlan, intent: "wallet", responseCards: ["intelligence_report"] },
        responseText: `${baselineClear.summary} Future wallet-change questions will start from the next public wallet read for ${shortSs58(ss58Address)}.`,
        cards: [buildBittensorWalletBaselineClearCard(baselineClear)],
        data: { walletBaseline: baselineClear },
        warnings: uniqueWarnings(warnings, baselineClear.warnings),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "answered",
      };
    }
    if (isWalletChangeQuestion(message, plan)) {
      const wallet = await bittensorProvider.getWallet(ss58Address);
      const report = buildBittensorWalletChangeReport(wallet);
      return {
        plan: { ...answeredPlan, intent: "wallet", responseCards: ["intelligence_report"] },
        responseText: `${report.summary} This is a watch-only comparison of public wallet data for ${shortSs58(ss58Address)}; it does not sign, move, stake, or broadcast anything.`,
        cards: [buildBittensorWalletChangeCard(report)],
        data: { walletChange: report },
        warnings: uniqueWarnings(warnings, report.warnings),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "answered",
      };
    }
    const report = await analyzeBittensorWalletIntelligence(ss58Address);
    return {
      plan: { ...answeredPlan, intent: "wallet", responseCards: ["intelligence_report"] },
      responseText: `Analyzed watch-only TAO exposure for ${shortSs58(ss58Address)} across ${report.subnetCount} subnet(s) and ${report.validatorCount} validator hotkey(s). This is public wallet intelligence, not financial advice.`,
      cards: [buildBittensorWalletIntelligenceCard(report)],
      data: { intelligence: report },
      warnings: uniqueWarnings(warnings, report.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isStakePositionQuestion(message) || isWalletQuestion(message, plan)) {
    const ss58Address = resolveExecutionSs58(input, plan);
    if (!ss58Address) {
      return clarificationResult(plan, "I can show your TAO and stake exposure, but I need your SS58 coldkey public address.");
    }
    const wallet = await bittensorProvider.getWallet(ss58Address);
    rememberBittensorWalletSnapshot(wallet);
    const cards = [buildBittensorWalletCard(wallet)];
    if (isStakePositionQuestion(message) || wallet.stakePositions.length) cards.push(buildStakePositionsCard(wallet));
    const stakeTotal = wallet.stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
    return {
      plan: { ...answeredPlan, intent: "wallet", responseCards: ["wallet_snapshot"] },
      responseText: wallet.providerStatus === "ok"
        ? `Loaded watch-only TAO wallet context for ${shortSs58(ss58Address)}: ${formatMetric(wallet.taoBalance)} free TAO, ${formatMetric(stakeTotal)} TAO staked across ${wallet.stakePositions.length} position(s).`
        : wallet.message ?? `I could not load wallet data for ${shortSs58(ss58Address)} from the current provider.`,
      cards,
      data: { wallet },
      warnings: uniqueWarnings(warnings, wallet.warnings, wallet.providerStatus === "ok" ? [] : [wallet.message]),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (plan.intent === "monitor") {
    if (isWatchCheckQuestion(message)) {
      const evaluations = await evaluateBittensorWatches();
      const warningCount = evaluations.filter((evaluation) => evaluation.status !== "ok").length;
      return {
        plan: { ...answeredPlan, intent: "monitor", responseCards: ["watchlist"] },
        responseText: evaluations.length
          ? `Checked ${evaluations.length} Bittensor watch(es); ${warningCount} need attention.`
          : "No Bittensor watches are configured yet.",
        cards: buildBittensorWatchEvaluationCards(evaluations),
        data: { evaluations },
        warnings: uniqueWarnings(warnings, warningCount ? ["At least one watch needs attention; use the card action to investigate."] : []),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "answered",
      };
    }
    if (isRiskiestWatchQuestion(message)) {
      const ss58Address = resolveExecutionSs58(input, plan);
      if (!ss58Address) {
        return clarificationResult(plan, "Which SS58 coldkey public address should I use to create watches for your riskiest Bittensor positions?");
      }
      const report = await analyzeBittensorWalletIntelligence(ss58Address);
      const suggestions = uniqueWatchSuggestions(report.watchSuggestions).slice(0, resolveExecutionLimit(input, 4));
      const watches = suggestions.map(watchFromSuggestion);
      return {
        plan: { ...answeredPlan, intent: "monitor", responseCards: ["watchlist", "intelligence_report"] },
        responseText: watches.length
          ? `Created ${watches.length} Bittensor watch(es) from the riskiest visible wallet exposure for ${shortSs58(ss58Address)}.`
          : `I analyzed ${shortSs58(ss58Address)}, but there were no watch suggestions in the current provider data.`,
        cards: [...buildBittensorWatchCards(watches), buildBittensorWalletIntelligenceCard(report)],
        data: { watches, intelligence: report },
        warnings: uniqueWarnings(warnings, report.warnings, ["Watches use public/provider data and may be delayed if live providers are unavailable."]),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "answered",
      };
    }
    const kind = inferWatchKind(message, input);
    const netuid = resolveExecutionNetuid(input, plan);
    const validatorHotkey = resolveValidatorHotkeyFromInput(input, plan);
    const ss58Address = kind === "wallet"
      ? resolveExecutionSs58(input, plan)
      : input.ss58Address && isValidSs58Address(input.ss58Address)
        ? input.ss58Address
        : input.coldkey && isValidSs58Address(input.coldkey)
          ? input.coldkey
          : null;
    if ((kind === "subnet" || kind === "emissions" || kind === "slippage") && netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I monitor?");
    }
    if (kind === "wallet" && !ss58Address) {
      return clarificationResult(plan, kind === "wallet"
        ? "Which SS58 coldkey public address should I monitor?"
        : "Which validator hotkey should I monitor?");
    }
    if (kind === "validator" && !validatorHotkey) {
      return clarificationResult(plan, "Which validator hotkey should I monitor?");
    }
    const watch = createBittensorWatch({
      kind,
      netuid,
      ss58Address,
      validatorHotkey,
      label: labelForWatch(message, kind, netuid, validatorHotkey ?? ss58Address),
      threshold: null,
      reason: "Created from Bittensor chat monitoring request.",
    });
    return {
      plan: { ...answeredPlan, intent: "monitor", responseCards: ["watchlist"] },
      responseText: netuid !== null
        ? `Created a ${kind} watch for subnet ${netuid}.`
        : `Created a ${kind} watch for ${validatorHotkey ?? ss58Address ? shortSs58(validatorHotkey ?? ss58Address ?? "") : "the requested Bittensor address"}.`,
      cards: buildBittensorWatchCards([watch]),
      data: { watch },
      warnings: uniqueWarnings(warnings, ["Watches use public/provider data and may be delayed if live providers are unavailable."]),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isImageDiscoveryQuestion(message, plan) || (plan.intent === "discover" && !isValidatorComparisonQuestion(message))) {
    const goal = isImageDiscoveryQuestion(message, plan) ? "image generation" : message;
    const discovery = await findBittensorSubnetsForGoal({ goal, limit: resolveExecutionLimit(input, isImageDiscoveryQuestion(message, plan) ? 5 : 8) });
    const sourceWarnings = discovery.matches.some((match) => isReferenceBittensorData(match.subnet.source))
      ? ["Reference metadata is shown because live Bittensor metrics are unavailable. Refresh before acting."]
      : [];
    return {
      plan: { ...answeredPlan, intent: "discover", responseCards: ["subnet_comparison"] },
      responseText: discovery.matches.length
        ? sourceWarnings.length
          ? `Live Bittensor metrics are unavailable right now. I found ${discovery.matches.length} reference subnet match(es) for ${goal}.`
          : `I found ${discovery.matches.length} Bittensor subnet candidate(s) for ${goal}. Treat this as discovery context, not financial advice.`
        : `I could not find a strong Bittensor subnet match for ${goal} from the current provider data.`,
      cards: discovery.cards,
      data: { discovery },
      warnings: uniqueWarnings(warnings, sourceWarnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isValidatorComparisonQuestion(message)) {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I use to compare validators?");
    }
    const comparison = await compareBittensorValidators({
      netuid,
      strategy: resolveExecutionStrategy(input),
      limit: resolveExecutionLimit(input, 6),
    });
    const fallbackWarnings = isReferenceBittensorData(comparison.source)
      ? ["Live Bittensor metrics are unavailable; this validator comparison is reference-only and incomplete."]
      : [];
    return {
      plan: { ...answeredPlan, responseCards: ["validator_selection"] },
      responseText: `Compared validator candidates for subnet ${netuid} using a ${comparison.strategy} strategy. This is an informational shortlist, not a staking recommendation.`,
      cards: buildBittensorValidatorComparisonCards(comparison),
      data: { comparison },
      warnings: uniqueWarnings(warnings, comparison.warnings, fallbackWarnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "answered",
    };
  }

  if (isAdvancedStakingPlanQuestion(message)) {
    const amountTao = extractExecutionAmountTao(input);
    if (!amountTao) {
      return clarificationResult(plan, "How much TAO should I use for this staking allocation plan?");
    }
    const stakingPlan = await buildBittensorStakingPlan({
      message,
      amountTao,
      coldkey: input.coldkey ?? input.ss58Address ?? plan.ss58Address,
      strategy: resolveExecutionStrategy(input),
      limit: resolveExecutionLimit(input, 3),
    });
    return {
      plan: { ...answeredPlan, intent: "stake_plan", responseCards: ["intelligence_report", "signed_action_review"] },
      responseText: `Drafted a ${stakingPlan.strategy} Bittensor staking plan for ${formatMetric(stakingPlan.totalAmountTao)} TAO across ${stakingPlan.steps.length} subnet candidate(s). All previews are unsigned and require external signing.`,
      cards: [
        buildBittensorStakingPlanCard(stakingPlan),
        ...stakingPlan.unsignedPreviews.slice(0, 2).map(buildBittensorExtrinsicPreviewCard),
      ],
      data: { stakingPlan },
      warnings: uniqueWarnings(warnings, stakingPlan.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "unsigned_preview",
    };
  }

  if (isStakePreviewQuestion(message, plan)) {
    const action = extractExecutionAction(message);
    const amountTao = extractExecutionAmountTao(input);
    const netuid = resolveExecutionNetuid(input, plan);
    const hotkey = resolveExecutionHotkey(input);
    const destination = resolveExecutionDestination(input, plan);
    if (action === "move_stake") {
      return clarificationResult(plan, "Move-stake previews need both origin and destination subnet context. Which origin netuid, destination netuid, and validator hotkey should I use?");
    }
    if (action === "set_child_hotkey" || action === "register" || action === "serve") {
      return {
        plan: { ...answeredPlan, intent: "stake_plan", responseCards: ["signed_action_review"] },
        responseText: `${titleCase(action)} is not enabled in the general chat executor yet. I can explain the action and risks, but I will not build a payload until it is explicitly enabled.`,
        cards: buildBittensorPlanCards(plan),
        data: { action },
        warnings: uniqueWarnings(warnings, [`${titleCase(action)} requires explicit product enablement and external signing review.`]),
        requiresClarification: false,
        clarificationQuestion: null,
        execution: "unsupported",
      };
    }
    if (!amountTao) {
      return clarificationResult(plan, `How much TAO should I use for this ${action.replace("_", " ")} preview?`);
    }
    if (action !== "transfer" && netuid === null) {
      return clarificationResult(plan, `Which subnet netuid should this ${action.replace("_", " ")} preview use?`);
    }
    if ((action === "stake" || action === "unstake") && !hotkey) {
      const comparison = await compareBittensorValidators({
        netuid: netuid ?? 0,
        strategy: resolveExecutionStrategy(input),
        limit: resolveExecutionLimit(input, 6),
      });
      return clarificationResult(
        plan,
        `Which validator hotkey should I use for the unsigned ${action} preview?`,
        buildBittensorValidatorComparisonCards(comparison),
        comparison.warnings,
        { comparison, amountTao, netuid, action },
      );
    }
    if (action === "transfer" && !destination) {
      return clarificationResult(plan, "Which SS58 recipient address should I use for the unsigned TAO transfer preview?");
    }

    const coldkey = input.coldkey && isValidSs58Address(input.coldkey)
      ? input.coldkey
      : input.ss58Address && isValidSs58Address(input.ss58Address)
        ? input.ss58Address
        : plan.ss58Address;
    const preview = await prepareBittensorExtrinsic({
      action,
      netuid,
      amountTao,
      coldkey,
      hotkey,
      destination,
      rateTolerance: input.rateTolerance ?? null,
    });
    const signingSafety = buildBittensorSigningSafetyChecklist(preview);
    return {
      plan: { ...answeredPlan, intent: "stake_plan", responseCards: ["signed_action_review"] },
      responseText: `${preview.consequenceSummary} This is unsigned and requires external signing before anything can move.`,
      cards: [buildBittensorExtrinsicPreviewCard(preview), buildBittensorSigningSafetyChecklistCard(signingSafety)],
      data: { preview, signingSafety },
      warnings: uniqueWarnings(warnings, preview.warnings, signingSafety.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: "unsigned_preview",
    };
  }

  if (plan.intent === "subnet_use") {
    const netuid = resolveExecutionNetuid(input, plan);
    if (netuid === null) {
      return clarificationResult(plan, "Which subnet netuid should I inspect or use?");
    }
    const preview = await previewBittensorSubnetInvocation(netuid, {
      intent: "service_call",
      task: message,
      ss58Address: resolveExecutionSs58(input, plan),
    });
    return {
      plan: { ...answeredPlan, intent: "subnet_use", responseCards: ["subnet_result"] },
      responseText: preview.supported
        ? `Prepared a Bittensor service review for subnet ${preview.netuid}. Review the card, then confirm the exact request SHA-256 before Matterhorn calls the configured adapter.`
        : `${preview.consequenceSummary} I can still explain, compare, monitor, and help with staking guidance for subnet ${preview.netuid}.`,
      cards: [buildBittensorInvocationPreviewCard(preview)],
      data: {
        preview,
        nextStep: preview.supported
          ? {
            type: "confirm_subnet_invocation",
            prompt: preview.confirmationPrompt,
            invokeArgs: {
              netuid: preview.netuid,
              intent: preview.intent,
              task: preview.request.task,
              ss58Address: preview.request.ss58Address,
              previewRequestSha256: preview.requestSha256,
            },
          }
          : {
            type: "unsupported_adapter",
            fallbackIntents: preview.adapterContract.unsupportedBehavior.fallbackIntents,
          },
      },
      warnings: uniqueWarnings(warnings, preview.warnings),
      requiresClarification: false,
      clarificationQuestion: null,
      execution: preview.supported ? "unsigned_preview" : "unsupported",
    };
  }

  return {
    plan: plan.requiresClarification ? plan : answeredPlan,
    responseText: plan.summary,
    cards: buildBittensorPlanCards(plan),
    data: { plan },
    warnings: uniqueWarnings(warnings),
    requiresClarification: plan.requiresClarification,
    clarificationQuestion: plan.clarificationQuestion,
    execution: plan.requiresClarification ? "clarification_required" : "answered",
  };
}

function adapterForCategory(category: string): BittensorCapabilityManifest["serviceAdapter"] {
  if (category === "Creative AI") return "creative_media";
  if (category === "Compute and infrastructure") return "compute";
  if (category === "Data and knowledge") return "data_search";
  if (category === "Agent tools") return "agent_tooling";
  if (category === "Intelligence market") return "inference";
  return "universal";
}

function capabilityLevelFor(
  adapter: BittensorCapabilityManifest["serviceAdapter"],
  configuredAdapter: BittensorConfiguredSubnetAdapter | null,
): BittensorCapabilityManifest["capabilityLevel"] {
  if (configuredAdapter?.serviceAdapter !== "unsupported" && configuredAdapter && adapter !== "unsupported") return "adapter_ready";
  if (adapter === "unsupported") return "unsupported";
  if (adapter === "universal") return "universal_read";
  return "adapter_required";
}

function benefitsForCapability(subnet: BittensorSubnetSummary, adapter: BittensorCapabilityManifest["serviceAdapter"]): string[] {
  const categoryBenefits: Record<string, string[]> = {
    "Creative AI": [
      "Find subnets that may help generate, transform, or evaluate images and media.",
      "Compare price, emissions, and adapter readiness before trying a creative workflow.",
    ],
    "Compute and infrastructure": [
      "Inspect compute-oriented subnet health, validator context, and staking exposure.",
      "Monitor emissions or slippage before allocating TAO into compute markets.",
    ],
    "Data and knowledge": [
      "Discover data, search, retrieval, or knowledge subnets for research-heavy tasks.",
      "Track subnet freshness and service-readiness before depending on a data source.",
    ],
    "Agent tools": [
      "Identify subnets that may extend agent workflows, automation, or tool execution.",
      "Separate staking into a subnet from actually invoking its service adapter.",
    ],
    "Intelligence market": [
      "Explore inference or model-market subnets in beginner language.",
      "Compare visible validator context before preparing any staking preview.",
    ],
  };
  return [
    subnet.benefitSummary,
    ...(categoryBenefits[subnet.category] ?? [
      "Explain what this subnet appears to do and how it may fit a user goal.",
      "Read public network, wallet, stake, and monitoring context where provider data exists.",
    ]),
    adapter === "universal"
      ? "Matterhorn can explain, compare, monitor, and guide staking for this subnet now."
      : "Direct service execution depends on a configured subnet adapter.",
  ].filter(Boolean).slice(0, 4);
}

function examplePromptsForCapability(subnet: BittensorSubnetSummary): string[] {
  return [
    `Explain subnet ${subnet.netuid} in beginner language.`,
    `Is subnet ${subnet.netuid} useful for my current task?`,
    `Compare validators on subnet ${subnet.netuid}.`,
    `Monitor subnet ${subnet.netuid} emissions.`,
    `Prepare staking 1 TAO on subnet ${subnet.netuid} after I choose a validator hotkey.`,
  ];
}

function adapterStatusForCapability(
  adapter: BittensorCapabilityManifest["serviceAdapter"],
  configuredAdapter: BittensorConfiguredSubnetAdapter | null,
): BittensorCapabilityManifest["adapterStatus"] {
  if (configuredAdapter?.serviceAdapter !== "unsupported" && configuredAdapter && adapter !== "unsupported") {
    return {
      configured: true,
      adapter,
      message: `Direct service adapter configured: ${configuredAdapter.name}.`,
      requiredAuth: configuredAdapter.requiredAuth,
      costModel: configuredAdapter.costModel,
    };
  }
  if (adapter === "universal") {
    return {
      configured: false,
      adapter,
      message: "Universal read, explanation, comparison, monitoring, and unsigned preview workflows are available.",
      requiredAuth: "none",
      costModel: "free_read",
    };
  }
  return {
    configured: false,
    adapter,
    message: `No ${adapter.replace(/_/g, " ")} service adapter is configured yet; Matterhorn can still explain, compare, monitor, and prepare safe previews.`,
    requiredAuth: "unknown",
    costModel: "unknown",
  };
}

function adapterContractPrivacy(adapter: BittensorSubnetServiceAdapterKind, configured: boolean): BittensorSubnetServiceAdapterContract["privacy"] {
  return {
    sendsTaskText: configured && adapter !== "universal" && adapter !== "unsupported",
    sendsSs58Address: configured && adapter !== "universal" && adapter !== "unsupported",
    sendsWalletData: false,
    sendsKeyMaterial: false,
  };
}

export function validateBittensorSubnetServiceAdapterContract(
  contract: BittensorSubnetServiceAdapterContract,
): BittensorSubnetServiceAdapterContractValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (contract.version !== "matterhorn.bittensor.adapter.v1") errors.push("Unsupported adapter contract version.");
  if (!Number.isInteger(contract.netuid) || contract.netuid < 0) errors.push("Adapter contract netuid must be a non-negative integer.");
  if (!contract.supportedIntents.length) errors.push("Adapter contract must declare at least one supported intent.");
  if (contract.privacy.sendsKeyMaterial !== false) errors.push("Adapter contract must explicitly forbid sending secrets.");
  if (contract.privacy.sendsWalletData !== false) errors.push("Adapter contract must explicitly forbid sending wallet data.");
  if (secretFieldPath(contract.requestSchema)) errors.push("Request schema contains a secret-shaped field.");
  if (secretFieldPath(contract.resultSchema)) errors.push("Result schema contains a secret-shaped field.");
  if (contract.adapter !== "universal" && contract.adapter !== "unsupported" && !contract.endpointConfigured) {
    warnings.push("Direct service adapter is not configured; service calls must return unsupported behavior.");
  }
  if (contract.endpointConfigured && !contract.supportedIntents.includes("service_call")) {
    warnings.push("Configured adapter does not declare service_call support.");
  }
  if (!contract.safetyNotes.length) warnings.push("Adapter contract should include safety notes.");
  return { ok: errors.length === 0, errors, warnings };
}

function summarizeSubnetServiceAdapterContract(contract: BittensorSubnetServiceAdapterContract): BittensorSubnetServiceAdapterContractRuntimeSummary {
  return {
    version: contract.version,
    supportedIntents: contract.supportedIntents,
    endpointConfigured: contract.endpointConfigured,
    requiredAuth: contract.requiredAuth,
    costModel: contract.costModel,
    privacy: contract.privacy,
    unsupportedBehavior: contract.unsupportedBehavior,
  };
}

function evaluateSubnetServiceAdapterGate(
  capability: BittensorCapabilityManifest,
  configuredAdapter: BittensorConfiguredSubnetAdapter | null,
  intent: BittensorSubnetInvocation["intent"],
  requestSha256?: string | null,
): {
  adapterContract: BittensorSubnetServiceAdapterContractRuntimeSummary;
  contractValidation: BittensorSubnetServiceAdapterContractValidation;
  supported: boolean;
  blockers: string[];
} {
  const contractValidation = validateBittensorSubnetServiceAdapterContract(capability.adapterContract);
  const blockers: string[] = [];
  const supportsIntent = capability.adapterContract.supportedIntents.includes(intent);

  if (intent !== "service_call") blockers.push("Direct subnet service adapters only run for explicit service_call intents.");
  if (!configuredAdapter || !capability.adapterStatus.configured) blockers.push("No configured subnet service adapter endpoint is available.");
  if (capability.serviceAdapter === "unsupported") blockers.push("This subnet category does not have a direct service adapter contract yet.");
  if (!capability.adapterContract.endpointConfigured) blockers.push("Adapter contract declares endpointConfigured=false.");
  if (!supportsIntent) blockers.push(`Adapter contract does not declare ${intent} support.`);
  if (!contractValidation.ok) blockers.push(...contractValidation.errors);
  if (configuredAdapter) blockers.push(...subnetAdapterRuntimeGateBlockers(configuredAdapter, requestSha256));

  return {
    adapterContract: summarizeSubnetServiceAdapterContract(capability.adapterContract),
    contractValidation,
    supported: blockers.length === 0,
    blockers,
  };
}

export function buildBittensorSubnetServiceAdapterContract(input: {
  netuid: number;
  adapter: BittensorSubnetServiceAdapterKind;
  capabilityLevel: BittensorCapabilityManifest["capabilityLevel"];
  adapterStatus: BittensorCapabilityManifest["adapterStatus"];
  configuredAdapter: BittensorConfiguredSubnetAdapter | null;
  requestSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  safetyNotes: string[];
}): BittensorSubnetServiceAdapterContract {
  const configured = Boolean(input.configuredAdapter && input.adapterStatus.configured && input.adapter !== "unsupported");
  const fallbackIntents: BittensorSubnetServiceIntent[] = ["explain", "metagraph", "stake_guidance", "wallet_guidance"];
  return {
    version: "matterhorn.bittensor.adapter.v1",
    netuid: input.netuid,
    adapter: input.adapter,
    capabilityLevel: input.capabilityLevel,
    supportedIntents: configured ? [...fallbackIntents, "service_call"] : fallbackIntents,
    endpointConfigured: configured,
    requiredAuth: input.adapterStatus.requiredAuth,
    costModel: input.adapterStatus.costModel,
    timeoutMs: configured ? input.configuredAdapter?.timeoutMs ?? null : null,
    requestSchema: input.requestSchema,
    resultSchema: input.resultSchema,
    privacy: adapterContractPrivacy(input.adapter, configured),
    safetyNotes: input.safetyNotes,
    unsupportedBehavior: {
      status: input.adapter === "unsupported" ? "unsupported" : configured ? "explain_and_monitor_only" : "adapter_missing",
      message: configured
        ? "Adapter contract is ready for explicit preview and invocation gates."
        : "Matterhorn can explain, compare, monitor, and prepare safe previews, but direct subnet service execution requires a configured adapter.",
      fallbackIntents,
    },
  };
}

function contractServiceCallReady(contract: BittensorSubnetServiceAdapterContract, validation: BittensorSubnetServiceAdapterContractValidation): boolean {
  return Boolean(
    validation.ok
      && contract.endpointConfigured
      && contract.supportedIntents.includes("service_call")
      && contract.adapter !== "universal"
      && contract.adapter !== "unsupported",
  );
}

export function runBittensorSubnetServiceAdapterContractTests(
  cases: BittensorSubnetServiceAdapterContractTestCase[],
): BittensorSubnetServiceAdapterContractTestReport {
  const results = cases.map((testCase): BittensorSubnetServiceAdapterContractTestResult => {
    const validation = validateBittensorSubnetServiceAdapterContract(testCase.contract);
    const serviceCallReady = contractServiceCallReady(testCase.contract, validation);
    const expectedOk = testCase.expectedOk ?? true;
    const expectedServiceCallReady = testCase.expectedServiceCallReady ?? (
      expectedOk
      && testCase.contract.endpointConfigured
      && testCase.contract.supportedIntents.includes("service_call")
      && testCase.contract.adapter !== "universal"
      && testCase.contract.adapter !== "unsupported"
    );
    const unsupportedStatus = testCase.contract.unsupportedBehavior.status;
    const statusMatches = testCase.expectedUnsupportedStatus === undefined || testCase.expectedUnsupportedStatus === unsupportedStatus;
    const passed = validation.ok === expectedOk && serviceCallReady === expectedServiceCallReady && statusMatches;
    const expectationWarnings = [
      validation.ok === expectedOk ? null : `Expected validation ok=${expectedOk}, received ok=${validation.ok}.`,
      serviceCallReady === expectedServiceCallReady ? null : `Expected serviceCallReady=${expectedServiceCallReady}, received ${serviceCallReady}.`,
      statusMatches ? null : `Expected unsupported status ${testCase.expectedUnsupportedStatus}, received ${unsupportedStatus}.`,
    ].filter((item): item is string => Boolean(item));
    return {
      name: testCase.name,
      passed,
      expectedOk,
      actualOk: validation.ok,
      expectedServiceCallReady,
      serviceCallReady,
      endpointConfigured: testCase.contract.endpointConfigured,
      supportedIntents: testCase.contract.supportedIntents,
      unsupportedStatus,
      errors: validation.errors,
      warnings: uniqueWarnings(validation.warnings, expectationWarnings),
    };
  });
  const failed = results.filter((result) => !result.passed);
  return {
    kind: "subnet_adapter_contract_test_report",
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    warnings: failed.length ? failed.map((result) => `Adapter contract test failed: ${result.name}.`) : [],
    updatedAt: nowIso(),
  };
}

export function buildBittensorSubnetServiceAdapterContractTestFixtures(): BittensorSubnetServiceAdapterContractTestCase[] {
  const requestSchema = {
    type: "object",
    properties: {
      intent: { enum: ["service_call"] },
      task: { type: "string" },
      ss58Address: { type: "string" },
    },
  };
  const resultSchema = {
    type: "object",
    properties: {
      message: { type: "string" },
      result: { type: "object" },
      warnings: { type: "array", items: { type: "string" } },
    },
  };
  const configuredAdapter: BittensorConfiguredSubnetAdapter = {
    netuid: 14,
    name: "Fixture compute adapter",
    serviceAdapter: "compute",
    endpoint: "http://127.0.0.1:4040/invoke",
    requiredAuth: "api_key",
    costModel: "provider_priced",
    timeoutMs: 15_000,
    authEnv: "BITTENSOR_FIXTURE_ADAPTER_TOKEN",
    safetyNotes: ["Fixture adapter only accepts visible task text and public routing context."],
  };
  const configuredStatus: BittensorCapabilityManifest["adapterStatus"] = {
    configured: true,
    adapter: "compute",
    message: "Direct service adapter configured: Fixture compute adapter.",
    requiredAuth: "api_key",
    costModel: "provider_priced",
  };
  const missingStatus: BittensorCapabilityManifest["adapterStatus"] = {
    configured: false,
    adapter: "compute",
    message: "No compute service adapter is configured yet.",
    requiredAuth: "unknown",
    costModel: "unknown",
  };

  return [{
    name: "configured safe service adapter",
    expectedOk: true,
    expectedServiceCallReady: true,
    expectedUnsupportedStatus: "explain_and_monitor_only",
    contract: buildBittensorSubnetServiceAdapterContract({
      netuid: 14,
      adapter: "compute",
      capabilityLevel: "adapter_ready",
      adapterStatus: configuredStatus,
      configuredAdapter,
      requestSchema,
      resultSchema,
      safetyNotes: ["Safe fixture contract."],
    }),
  }, {
    name: "missing adapter falls back to explain and monitor",
    expectedOk: true,
    expectedServiceCallReady: false,
    expectedUnsupportedStatus: "adapter_missing",
    contract: buildBittensorSubnetServiceAdapterContract({
      netuid: 14,
      adapter: "compute",
      capabilityLevel: "adapter_required",
      adapterStatus: missingStatus,
      configuredAdapter: null,
      requestSchema,
      resultSchema,
      safetyNotes: ["Missing adapter fixture contract."],
    }),
  }, {
    name: "unsafe schema is rejected",
    expectedOk: false,
    expectedServiceCallReady: false,
    expectedUnsupportedStatus: "adapter_missing",
    contract: buildBittensorSubnetServiceAdapterContract({
      netuid: 14,
      adapter: "compute",
      capabilityLevel: "adapter_required",
      adapterStatus: missingStatus,
      configuredAdapter: null,
      requestSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
          privateKey: { type: "string" },
        },
      },
      resultSchema,
      safetyNotes: ["Unsafe fixture should fail validation."],
    }),
  }];
}

export function capabilityFromSubnet(subnet: BittensorSubnetSummary): BittensorCapabilityManifest {
  const configuredAdapter = getConfiguredSubnetAdapter(subnet.netuid);
  const adapter = configuredAdapter?.serviceAdapter === "unsupported"
    ? adapterForCategory(subnet.category)
    : configuredAdapter?.serviceAdapter ?? adapterForCategory(subnet.category);
  const adapterStatus = adapterStatusForCapability(adapter, configuredAdapter);
  const requestSchema = {
    type: "object",
    properties: {
      intent: { enum: ["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"] },
      task: { type: "string" },
      ss58Address: { type: "string" },
    },
  };
  const resultSchema = {
    type: "object",
    properties: {
      message: { type: "string" },
      result: { type: "object" },
      warnings: { type: "array", items: { type: "string" } },
    },
  };
  const safetyNotes = [
    "Universal support covers explanation, metagraph, staking guidance, wallet context, and monitoring.",
    adapterStatus.message,
    ...(configuredAdapter?.safetyNotes ?? []),
    "Signed Bittensor actions require an external signer.",
  ];
  const capabilityLevel = capabilityLevelFor(adapter, configuredAdapter);
  const adapterContract = buildBittensorSubnetServiceAdapterContract({
    netuid: subnet.netuid,
    adapter,
    capabilityLevel,
    adapterStatus,
    configuredAdapter,
    requestSchema,
    resultSchema,
    safetyNotes,
  });
  return {
    netuid: subnet.netuid,
    name: subnet.name,
    category: subnet.category,
    utilitySummary: subnet.benefitSummary,
    capabilityLevel,
    userBenefits: benefitsForCapability(subnet, adapter),
    examplePrompts: examplePromptsForCapability(subnet),
    supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "monitor", "subnet_use"],
    serviceAdapter: adapter,
    requiredAuth: adapterStatus.requiredAuth,
    costModel: adapterStatus.costModel,
    requestSchema,
    resultSchema,
    adapterContract,
    dataFreshness: {
      source: subnet.source,
      block: subnet.block ?? null,
      freshness: subnet.freshness ?? null,
      updatedAt: subnet.updatedAt,
      liveReadReady: subnet.source !== "curated-fallback",
    },
    adapterStatus,
    safetyNotes,
  };
}

function goalCategoryHints(goal: string): Array<{ category: string; reason: string }> {
  const lower = goal.toLowerCase();
  const hints: Array<{ category: string; reason: string }> = [];
  if (/(image|video|media|creative|art|render|vision|design|generate)/.test(lower)) {
    hints.push({ category: "Creative AI", reason: "The goal looks like a creative or media task." });
  }
  if (/(compute|gpu|hash|infrastructure|hosting|serve|serving|cloud)/.test(lower)) {
    hints.push({ category: "Compute and infrastructure", reason: "The goal needs compute, hosting, or infrastructure." });
  }
  if (/(search|data|dataset|crawl|index|retrieval|knowledge|document|web)/.test(lower)) {
    hints.push({ category: "Data and knowledge", reason: "The goal needs data, search, or retrieval." });
  }
  if (/(agent|tool|automation|workflow|mcp|assistant)/.test(lower)) {
    hints.push({ category: "Agent tools", reason: "The goal mentions agent tooling or workflow automation." });
  }
  if (/(inference|model|chat|text|prompt|llm|language)/.test(lower)) {
    hints.push({ category: "Intelligence market", reason: "The goal looks like a model or inference task." });
  }
  if (/(market|finance|trading|risk|price|prediction)/.test(lower)) {
    hints.push({ category: "Financial intelligence", reason: "The goal looks like market or financial intelligence." });
  }
  if (/(science|research|biology|health|paper|lab)/.test(lower)) {
    hints.push({ category: "Science and research", reason: "The goal looks like a research task." });
  }
  return hints;
}

function tokenizeGoal(goal: string): string[] {
  return goal
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !["the", "and", "for", "with", "use", "using", "subnet", "bittensor"].includes(token))
    .slice(0, 16);
}

export function scoreBittensorSubnetForGoal(subnet: BittensorSubnetSummary, goal: string): BittensorSubnetDiscoveryMatch {
  const lowerGoal = goal.toLowerCase();
  const searchable = `${subnet.netuid} ${subnet.name} ${subnet.symbol} ${subnet.category} ${subnet.benefitSummary}`.toLowerCase();
  const hints = goalCategoryHints(goal);
  const tokens = tokenizeGoal(goal);
  const reasons: string[] = [];
  let score = 0;

  for (const hint of hints) {
    if (subnet.category === hint.category) {
      score += 10;
      reasons.push(hint.reason);
    }
  }

  for (const token of tokens) {
    if (searchable.includes(token)) {
      score += 2;
      reasons.push(`Matched "${token}" in subnet metadata.`);
    }
  }

  if (lowerGoal.includes(String(subnet.netuid)) || lowerGoal.includes(`sn${subnet.netuid}`)) {
    score += 8;
    reasons.push("The prompt names this netuid directly.");
  }
  if (subnet.emission !== null && subnet.emission > 0) score += 1;
  if (subnet.source !== "curated-fallback") score += 1;
  if (!reasons.length) reasons.push("Included because no closer metadata match was available.");

  return { subnet, score, reasons: [...new Set(reasons)].slice(0, 4) };
}

export async function findBittensorSubnetsForGoal(input: { goal: string; limit?: number | null }): Promise<BittensorSubnetDiscoveryResult> {
  const goal = input.goal.trim() || "Find useful Bittensor subnets";
  const limit = Math.min(12, Math.max(1, Number(input.limit ?? 8) || 8));
  const subnets = await bittensorProvider.listSubnets();
  const scored = subnets
    .map((subnet) => scoreBittensorSubnetForGoal(subnet, goal))
    .sort((a, b) => b.score - a.score || a.subnet.netuid - b.subnet.netuid);
  const confident = scored.filter((match) => match.score > 0);
  const matches = (confident.length ? confident : scored).slice(0, limit);
  const cards = buildBittensorSubnetCards(matches.map((match) => match.subnet)).map((card, index) => {
    const match = matches[index];
    const referenceOnly = isReferenceBittensorData(match?.subnet.source);
    return {
      ...card,
      summary: match
        ? referenceOnly
          ? `${card.summary ?? ""} Possible fit: ${match.reasons[0]}`.trim()
          : `${card.summary ?? ""} Match reason: ${match.reasons[0]}`.trim()
        : card.summary,
      data: { ...(card.data ?? {}), match },
    };
  });
  const sources = [...new Set(matches.map((match) => match.subnet.source))];
  const source = sources.length === 1 ? sources[0] ?? "unknown" : sources.length > 1 ? "mixed" : "unknown";
  const warnings = matches.some((match) => isReferenceBittensorData(match.subnet.source))
    ? ["Reference metadata is shown because live Bittensor metrics are unavailable. Refresh before acting."]
    : [];
  return { goal, matches, cards, source, warnings };
}

export async function listBittensorCapabilities(): Promise<BittensorCapabilityManifest[]> {
  const subnets = await bittensorProvider.listSubnets();
  return subnets.map(capabilityFromSubnet);
}

export async function getBittensorCapability(netuid: number): Promise<BittensorCapabilityManifest> {
  const detail = await bittensorProvider.getSubnet(netuid);
  return capabilityFromSubnet(detail);
}

function statusForAdapterMarketplaceEntry(
  capability: BittensorCapabilityManifest,
  doctorEntry: BittensorSubnetAdapterDoctorEntry | null,
): BittensorSubnetAdapterMarketplaceEntryStatus {
  if (capability.capabilityLevel === "unsupported" || capability.serviceAdapter === "unsupported") return "unsupported";
  if (capability.capabilityLevel === "universal_read" || capability.serviceAdapter === "universal") return "universal_only";
  if (doctorEntry?.serviceCallReady && doctorEntry.endpoint.mode === "mock") return "mock_ready";
  if (doctorEntry?.serviceCallReady) return "manual_review_required";
  if (doctorEntry && doctorEntry.status === "blocked") return "blocked";
  if (doctorEntry?.endpoint.configured) return "blocked";
  return "needs_adapter";
}

function nextActionsForAdapterMarketplaceEntry(
  entryStatus: BittensorSubnetAdapterMarketplaceEntryStatus,
  capability: BittensorCapabilityManifest,
): string[] {
  if (entryStatus === "mock_ready") {
    return [
      `Run a dry-run export for subnet ${capability.netuid} before any real service configuration.`,
      `Build an operator handoff packet for subnet ${capability.netuid}.`,
      "Keep real subnet execution disabled until manual canary review passes.",
    ];
  }
  if (entryStatus === "manual_review_required") {
    return [
      `Review conformance, evidence, dry-run, and canary packets for subnet ${capability.netuid}.`,
      "Require exact request-hash approval before any real adapter invocation.",
      "Confirm rollback, rate limits, auth scope, and provider terms before enabling a real adapter.",
    ];
  }
  if (entryStatus === "blocked") {
    return [
      `Fix the blocked adapter configuration for subnet ${capability.netuid}.`,
      "Run adapter doctor and conformance again before dry-run or handoff.",
    ];
  }
  if (entryStatus === "needs_adapter") {
    return [
      `Use Matterhorn's universal explain, monitor, metagraph, and staking guidance for subnet ${capability.netuid}.`,
      `Create a sanitized ${capability.serviceAdapter.replace(/_/g, " ")} adapter template before any direct service work.`,
    ];
  }
  if (entryStatus === "universal_only") {
    return [
      `Use universal Bittensor chat workflows for subnet ${capability.netuid}.`,
      "Direct subnet service execution is not needed for this universal capability.",
    ];
  }
  return [
    `Do not attempt direct service execution for subnet ${capability.netuid}.`,
    "Explain, compare, and monitor only.",
  ];
}

export async function listBittensorSubnetAdapterMarketplace(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterMarketplace> {
  const requestedAdapter = input.adapter ? normalizeServiceAdapter(input.adapter, "unsupported") : null;
  const requestedNetuid = Number.isInteger(input.netuid) && (input.netuid as number) >= 0 ? input.netuid as number : null;
  const limit = Math.min(100, Math.max(1, Number(input.limit ?? 50) || 50));
  const capabilities = await listBittensorCapabilities();
  const doctor = doctorBittensorSubnetAdapters();
  const doctorByNetuid = new Map<number, BittensorSubnetAdapterDoctorEntry>();
  for (const entry of doctor.entries) {
    if (Number.isInteger(entry.netuid)) doctorByNetuid.set(entry.netuid as number, entry);
  }

  const entries = capabilities
    .filter((capability) => requestedNetuid === null || capability.netuid === requestedNetuid)
    .filter((capability) => requestedAdapter === null || capability.serviceAdapter === requestedAdapter)
    .map((capability): BittensorSubnetAdapterMarketplaceEntry => {
      const doctorEntry = doctorByNetuid.get(capability.netuid) ?? null;
      const status = statusForAdapterMarketplaceEntry(capability, doctorEntry);
      return {
        netuid: capability.netuid,
        name: capability.name,
        category: capability.category,
        utilitySummary: capability.utilitySummary,
        serviceAdapter: capability.serviceAdapter,
        capabilityLevel: capability.capabilityLevel,
        status,
        configured: Boolean(doctorEntry?.endpoint.configured ?? capability.adapterStatus.configured),
        serviceCallReady: Boolean(doctorEntry?.serviceCallReady),
        endpointMode: doctorEntry?.endpoint.mode ?? "none",
        requiredAuth: capability.requiredAuth,
        costModel: capability.costModel,
        source: capability.dataFreshness.source,
        freshness: capability.dataFreshness.freshness,
        block: capability.dataFreshness.block,
        adapterMessage: doctorEntry
          ? `${doctorEntry.endpoint.reason} ${doctorEntry.auth.message}`.trim()
          : capability.adapterStatus.message,
        nextActions: nextActionsForAdapterMarketplaceEntry(status, capability),
        warnings: [...(doctorEntry?.warnings ?? []), ...capability.safetyNotes.filter((note) => /secret|sign|external|adapter/i.test(note)).slice(0, 3)],
        examplePrompts: capability.examplePrompts.slice(0, 3),
      };
    })
    .sort((a, b) => {
      const rank: Record<BittensorSubnetAdapterMarketplaceEntryStatus, number> = {
        blocked: 0,
        mock_ready: 1,
        manual_review_required: 2,
        needs_adapter: 3,
        universal_only: 4,
        unsupported: 5,
      };
      return rank[a.status] - rank[b.status] || a.netuid - b.netuid;
    })
    .slice(0, limit);

  const summary = {
    universalOnly: entries.filter((entry) => entry.status === "universal_only").length,
    needsAdapter: entries.filter((entry) => entry.status === "needs_adapter").length,
    mockReady: entries.filter((entry) => entry.status === "mock_ready").length,
    manualReviewRequired: entries.filter((entry) => entry.status === "manual_review_required").length,
    blocked: entries.filter((entry) => entry.status === "blocked").length,
    unsupported: entries.filter((entry) => entry.status === "unsupported").length,
  };
  const status: BittensorSubnetAdapterMarketplace["status"] = summary.blocked > 0
    ? "fail"
    : summary.mockReady + summary.manualReviewRequired > 0
      ? "pass"
      : "warning";
  const warnings = [
    ...(doctor.warnings ?? []),
    ...(summary.blocked ? ["Some configured subnet service adapters are blocked and must not be invoked."] : []),
    ...(summary.mockReady + summary.manualReviewRequired ? [] : ["No configured subnet service adapter is ready for mock rehearsal or manual review."]),
    "Marketplace status is read-only evidence; it does not authorize real subnet service execution.",
  ];
  const nextActions = [
    ...(summary.blocked ? ["Fix blocked adapter doctor entries first."] : []),
    ...(summary.mockReady ? ["Run dry-run export and operator handoff for mock-ready adapters."] : []),
    ...(summary.manualReviewRequired ? ["Run manual canary review before enabling any real adapter invocation."] : []),
    ...(summary.needsAdapter ? ["Use adapter templates and candidate profiles to onboard the next direct subnet service safely."] : []),
  ];
  return {
    kind: "bittensor_subnet_adapter_marketplace",
    generatedAt: nowIso(),
    status,
    total: entries.length,
    summary,
    entries,
    warnings,
    nextActions,
  };
}

export async function exportBittensorSubnetAdapterMarketplace(input: {
  adapter?: string | null;
  netuid?: number | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterMarketplaceExport> {
  const marketplace = await listBittensorSubnetAdapterMarketplace(input);
  const lines = [
    "# Bittensor Subnet Adapter Marketplace Export",
    "",
    `Generated: ${marketplace.generatedAt}`,
    `Status: ${marketplace.status}`,
    `Total shown: ${marketplace.total}`,
    "",
    "## Summary",
    "",
    `- Universal-only: ${marketplace.summary.universalOnly}`,
    `- Needs adapter: ${marketplace.summary.needsAdapter}`,
    `- Mock-ready: ${marketplace.summary.mockReady}`,
    `- Manual review required: ${marketplace.summary.manualReviewRequired}`,
    `- Blocked: ${marketplace.summary.blocked}`,
    `- Unsupported: ${marketplace.summary.unsupported}`,
    "",
    "## Entries",
    "",
    ...marketplace.entries.flatMap((entry) => [
      `### ${entry.name} (netuid ${entry.netuid})`,
      "",
      `- Status: ${entry.status}`,
      `- Adapter: ${entry.serviceAdapter}`,
      `- Category: ${entry.category}`,
      `- Capability: ${entry.capabilityLevel}`,
      `- Endpoint mode: ${entry.endpointMode}`,
      `- Service call ready: ${entry.serviceCallReady ? "yes" : "no"}`,
      `- Required auth: ${entry.requiredAuth}`,
      `- Cost model: ${entry.costModel}`,
      `- Source: ${entry.source}`,
      `- Freshness: ${entry.freshness ?? "unknown"}`,
      `- Next action: ${entry.nextActions[0] ?? "Review in Matterhorn."}`,
      "",
    ]),
    "## Safety",
    "",
    "- This export is evidence only and does not authorize or invoke subnet services.",
    "- It intentionally omits endpoint URLs, credential values, auth environment names, raw task text, wallet data, signing payloads, and full request hashes.",
    "- Real subnet service invocation still requires preview, exact request SHA-256 confirmation, short-lived approval, and explicit operator/user confirmation.",
    "",
    "## Next Actions",
    "",
    ...(marketplace.nextActions.length ? marketplace.nextActions.map((action) => `- ${action}`) : ["- Use universal explain, compare, monitor, and staking guidance until an adapter is ready."]),
  ];
  return {
    kind: "bittensor_subnet_adapter_marketplace_export",
    generatedAt: nowIso(),
    status: marketplace.status,
    summary: {
      ...marketplace.summary,
      total: marketplace.total,
      warningCount: marketplace.warnings.length,
    },
    markdown: lines.join("\n"),
    warnings: marketplace.warnings,
  };
}

function adapterRoadmapOrder(goal: string | null): Array<Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">> {
  const base: Array<Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">> = ["data_search", "inference", "compute", "creative_media", "agent_tooling"];
  if (!goal) return base;
  const preferred = extractSubnetAdapterKindFromMessage(goal);
  return preferred ? [preferred, ...base.filter((adapter) => adapter !== preferred)] : base;
}

export async function planBittensorSubnetAdapterRoadmap(input: {
  goal?: string | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterRoadmap> {
  const goal = typeof input.goal === "string" && input.goal.trim() ? input.goal.trim() : null;
  const limit = Math.min(5, Math.max(1, Number(input.limit ?? 5) || 5));
  const marketplace = await listBittensorSubnetAdapterMarketplace({ limit: 100 });
  const recommendations = adapterRoadmapOrder(goal).map((serviceAdapter): BittensorSubnetAdapterRoadmapRecommendation => {
    const entries = marketplace.entries.filter((entry) => entry.serviceAdapter === serviceAdapter);
    const statusCounts = {
      universal_only: entries.filter((entry) => entry.status === "universal_only").length,
      needs_adapter: entries.filter((entry) => entry.status === "needs_adapter").length,
      mock_ready: entries.filter((entry) => entry.status === "mock_ready").length,
      manual_review_required: entries.filter((entry) => entry.status === "manual_review_required").length,
      blocked: entries.filter((entry) => entry.status === "blocked").length,
      unsupported: entries.filter((entry) => entry.status === "unsupported").length,
    };
    const candidateNetuids = entries
      .filter((entry) => entry.status === "needs_adapter" || entry.status === "blocked" || entry.status === "mock_ready" || entry.status === "manual_review_required")
      .map((entry) => entry.netuid)
      .slice(0, 5);
    const priority: BittensorSubnetAdapterRoadmapRecommendation["priority"] = statusCounts.blocked || statusCounts.needs_adapter
      ? "high"
      : statusCounts.mock_ready || statusCounts.manual_review_required
        ? "medium"
        : "low";
    const nextPrompt = statusCounts.blocked
      ? `Help me fix blocked ${serviceAdapter.replace(/_/g, " ")} Bittensor adapter entries.`
      : statusCounts.mock_ready
        ? `Build a ${serviceAdapter.replace(/_/g, " ")} adapter operator handoff packet for the mock-ready subnet.`
        : statusCounts.manual_review_required
          ? `Prepare a manual canary review for the ${serviceAdapter.replace(/_/g, " ")} Bittensor adapter without invoking it.`
          : `Help me configure a ${serviceAdapter.replace(/_/g, " ")} Bittensor adapter without enabling real execution.`;
    const rationale = statusCounts.blocked
      ? `${statusCounts.blocked} configured ${serviceAdapter.replace(/_/g, " ")} adapter entr${statusCounts.blocked === 1 ? "y is" : "ies are"} blocked.`
      : statusCounts.needs_adapter
        ? `${statusCounts.needs_adapter} subnet${statusCounts.needs_adapter === 1 ? "" : "s"} would benefit from a ${serviceAdapter.replace(/_/g, " ")} adapter.`
        : statusCounts.mock_ready
          ? `${statusCounts.mock_ready} ${serviceAdapter.replace(/_/g, " ")} adapter entr${statusCounts.mock_ready === 1 ? "y is" : "ies are"} mock-ready and should move through evidence handoff.`
          : statusCounts.manual_review_required
            ? `${statusCounts.manual_review_required} ${serviceAdapter.replace(/_/g, " ")} adapter entr${statusCounts.manual_review_required === 1 ? "y needs" : "ies need"} manual canary review.`
            : `No immediate ${serviceAdapter.replace(/_/g, " ")} adapter work is visible in the current marketplace slice.`;
    return {
      serviceAdapter,
      priority,
      candidateNetuids,
      statusCounts,
      rationale,
      nextPrompt,
      warnings: [
        "Roadmap is planning evidence only and does not configure, invoke, or approve subnet services.",
        ...(entries.some((entry) => entry.status === "blocked") ? ["Blocked adapter entries must be fixed before dry-run, handoff, or canary review."] : []),
      ],
    };
  }).filter((recommendation) => recommendation.priority !== "low" || recommendation.candidateNetuids.length > 0).slice(0, limit);
  const nextActions = recommendations.length
    ? recommendations.map((recommendation) => recommendation.nextPrompt)
    : ["Use adapter marketplace and templates to identify the next direct subnet service candidate."];
  return {
    kind: "bittensor_subnet_adapter_roadmap",
    generatedAt: nowIso(),
    goal,
    status: recommendations.length ? "pass" : "warning",
    marketplaceSummary: { ...marketplace.summary, total: marketplace.total },
    recommendations,
    warnings: uniqueWarnings(
      marketplace.warnings,
      ["Roadmap is evidence only; it does not authorize real subnet service execution."],
    ),
    nextActions,
  };
}

export async function exportBittensorSubnetAdapterRoadmap(input: {
  goal?: string | null;
  query?: string | null;
  limit?: number | null;
} = {}): Promise<BittensorSubnetAdapterRoadmapExport> {
  const roadmap = await planBittensorSubnetAdapterRoadmap({
    goal: input.goal ?? input.query,
    limit: input.limit,
  });
  const highPriority = roadmap.recommendations.filter((recommendation) => recommendation.priority === "high").length;
  const mediumPriority = roadmap.recommendations.filter((recommendation) => recommendation.priority === "medium").length;
  const lowPriority = roadmap.recommendations.filter((recommendation) => recommendation.priority === "low").length;
  const lines = [
    "# Bittensor Subnet Adapter Roadmap Export",
    "",
    `Generated: ${roadmap.generatedAt}`,
    `Status: ${roadmap.status}`,
    `Goal: ${roadmap.goal ?? "general adapter readiness"}`,
    "",
    "## Summary",
    "",
    `- Recommendations: ${roadmap.recommendations.length}`,
    `- High priority: ${highPriority}`,
    `- Medium priority: ${mediumPriority}`,
    `- Low priority: ${lowPriority}`,
    `- Marketplace total: ${roadmap.marketplaceSummary.total}`,
    "",
    "## Recommendations",
    "",
    ...(roadmap.recommendations.length ? roadmap.recommendations.flatMap((recommendation, index) => [
      `### ${index + 1}. ${recommendation.serviceAdapter.replace(/_/g, " ")} (${recommendation.priority})`,
      "",
      `- Candidate netuids: ${recommendation.candidateNetuids.length ? recommendation.candidateNetuids.join(", ") : "none in current slice"}`,
      `- Status counts: needs_adapter=${recommendation.statusCounts.needs_adapter}, mock_ready=${recommendation.statusCounts.mock_ready}, manual_review_required=${recommendation.statusCounts.manual_review_required}, blocked=${recommendation.statusCounts.blocked}`,
      `- Rationale: ${recommendation.rationale}`,
      `- Safe next prompt: ${recommendation.nextPrompt}`,
      "",
    ]) : ["- No prioritized adapter work is visible in the current marketplace slice."]),
    "## Safety",
    "",
    "- This export is planning evidence only and does not configure, approve, invoke, or authorize subnet services.",
    "- It intentionally omits endpoint URLs, credential values, auth environment names, raw task text, wallet data, signing payloads, and full request hashes.",
    "- Real subnet service invocation still requires preview, exact request SHA-256 confirmation, short-lived approval, explicit operator/user confirmation, and real-adapter launch gates.",
    "",
    "## Next Actions",
    "",
    ...(roadmap.nextActions.length ? roadmap.nextActions.map((action) => `- ${action}`) : ["- Review the adapter marketplace and templates before choosing the next adapter."]),
  ];
  return {
    kind: "bittensor_subnet_adapter_roadmap_export",
    generatedAt: nowIso(),
    status: roadmap.status,
    goal: roadmap.goal,
    summary: {
      recommendationCount: roadmap.recommendations.length,
      highPriority,
      mediumPriority,
      lowPriority,
      warningCount: roadmap.warnings.length,
    },
    markdown: lines.join("\n"),
    warnings: roadmap.warnings,
  };
}

export function getBittensorSignerStatus(address?: string | null): BittensorSignerStatus {
  const sidecar = readEnv("BITTENSOR_SUBTENSOR_SIDECAR_URL");
  if (sidecar) {
    return {
      mode: "sidecar",
      available: true,
      canSign: false,
      canSubmit: false,
      network: bittensorNetwork(),
      address: address && isValidSs58Address(address) ? address : null,
      message: "Subtensor sidecar is configured for live reads and unsigned payload preparation. Submission stays disabled until signed-payload verification is tested.",
    };
  }
  return {
    mode: "desktop_handoff",
    available: true,
    canSign: false,
    canSubmit: false,
    network: bittensorNetwork(),
    address: address && isValidSs58Address(address) ? address : null,
    message: "Matterhorn can prepare the action and hand it to an external Bittensor-compatible signer. It cannot sign or broadcast by itself.",
  };
}

function extrinsicQuoteAction(action: BittensorExtrinsicAction): BittensorActionQuoteInput["action"] {
  if (action === "stake") return "stake";
  if (action === "unstake") return "unstake";
  if (action === "transfer") return "transfer";
  return "compare";
}

function consequenceForPreview(input: BittensorExtrinsicPrepareInput, quote: BittensorActionQuote): string {
  const amount = quote.amountTao === null ? "the requested TAO amount" : `${quote.amountTao} TAO`;
  switch (input.action) {
    case "stake":
      return `If signed, this will stake ${amount} into subnet ${quote.netuid ?? input.netuid ?? "unknown"} and convert exposure into subnet alpha.`;
    case "unstake":
      return `If signed, this will unstake ${amount} from subnet ${quote.netuid ?? input.netuid ?? "unknown"} and convert alpha exposure back toward TAO.`;
    case "move_stake":
      return `If signed, this will move ${amount} of stake between subnets for the same coldkey/hotkey relationship.`;
    case "transfer":
      return `If signed, this will transfer ${amount} to ${input.destination ?? "the requested recipient"}.`;
    case "set_child_hotkey":
      return "If signed, this will change child/hotkey settings for the selected coldkey. Review this carefully in your external signer.";
    case "register":
      return "If signed, this will attempt a Bittensor registration action that may burn or lock TAO.";
    case "serve":
      return "If signed, this will publish serving metadata for a neuron on the selected subnet.";
  }
}

export async function prepareBittensorExtrinsic(input: BittensorExtrinsicPrepareInput): Promise<BittensorExtrinsicPreview> {
  const action = input.action;
  const quote = await bittensorProvider.quoteAction({
    action: extrinsicQuoteAction(action),
    netuid: input.netuid ?? input.originNetuid ?? null,
    amountTao: input.amountTao,
    validatorHotkey: input.hotkey ?? null,
    recipient: input.destination ?? null,
  });
  const coldkey = input.coldkey && isValidSs58Address(input.coldkey) ? input.coldkey : null;
  const hotkey = input.hotkey && isValidSs58Address(input.hotkey) ? input.hotkey : null;
  const destination = input.destination && isValidSs58Address(input.destination) ? input.destination : input.destination ?? null;
  const signer = getBittensorSignerStatus(coldkey);
  const warnings = [
    ...quote.warnings,
    "Unsigned preview only. Review the payload in an external Bittensor-compatible signer.",
  ];
  if (input.coldkey && !coldkey) warnings.push("Coldkey does not look like a valid SS58 address.");
  if (input.hotkey && !hotkey) warnings.push("Hotkey does not look like a valid SS58 address.");
  if (action === "transfer" && input.destination && !isValidSs58Address(input.destination)) {
    warnings.push("Destination does not look like a valid SS58 address.");
  }
  const sidecar = subtensorSidecarClient();
  const sidecarPreview = sidecar ? await sidecar.prepareExtrinsic(input) : null;
  const sidecarPayload = sidecarPreview
    ? asRecord(sidecarPreview["unsignedPayload"] ?? sidecarPreview["payload"] ?? sidecarPreview["call"] ?? sidecarPreview["extrinsic"])
    : {};
  const sidecarWarnings = sidecarPreview
    ? arrayFrom(sidecarPreview["warnings"]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (sidecarPreview) warnings.push("Unsigned payload enriched by configured Subtensor sidecar.", ...sidecarWarnings);

  return {
    action,
    network: signer.network,
    netuid: quote.netuid ?? input.netuid ?? input.originNetuid ?? null,
    amountTao: quote.amountTao,
    coldkey,
    hotkey,
    destination,
    feeTao: firstNumber(sidecarPreview ?? {}, ["feeTao", "fee_tao", "partialFeeTao", "partial_fee_tao"]) ?? quote.feeTao,
    slippageBps: firstNumber(sidecarPreview ?? {}, ["slippageBps", "slippage_bps", "priceImpactBps", "price_impact_bps"]) ?? quote.slippageBps,
    expectedAlpha: firstNumber(sidecarPreview ?? {}, ["expectedAlpha", "expected_alpha", "alphaOut", "alpha_out"]) ?? quote.expectedAlpha,
    unsignedPayload: Object.keys(sidecarPayload).length ? sidecarPayload : {
      chain: "bittensor",
      network: signer.network,
      action,
      netuid: quote.netuid ?? input.netuid ?? null,
      originNetuid: input.originNetuid ?? null,
      destinationNetuid: input.destinationNetuid ?? null,
      amountTao: quote.amountTao,
      coldkey,
      hotkey,
      destination,
      rateTolerance: input.rateTolerance ?? 0.005,
      safeMode: true,
    },
    signer,
    warnings,
    consequenceSummary: consequenceForPreview(input, quote),
    requiresExternalSignature: true,
  };
}

const HANDOFF_FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri)/i;

function findForbiddenHandoffKey(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenHandoffKey(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (HANDOFF_FORBIDDEN_KEY_RE.test(key)) {
      return [...path, key].join(".");
    }
    const nested = findForbiddenHandoffKey(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function createBittensorSigningHandoff(preview: BittensorExtrinsicPreview): BittensorSigningHandoff {
  if (!preview.requiresExternalSignature) {
    throw new Error("Bittensor handoff requires an external-signature preview.");
  }
  const payload = asRecord(preview.unsignedPayload);
  if (!Object.keys(payload).length) {
    throw new Error("Unsigned payload is required before creating a Bittensor signing handoff.");
  }
  const forbiddenKey = findForbiddenHandoffKey(payload);
  if (forbiddenKey) {
    throw new Error(`Unsigned payload contains a disallowed signing-material field: ${forbiddenKey}`);
  }
  const payloadJson = stableJson(payload);
  const payloadSha256 = createHash("sha256").update(payloadJson).digest("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const netuidPart = preview.netuid === null ? "network" : `subnet-${preview.netuid}`;
  const suggestedFilename = `bittensor-${preview.action}-${netuidPart}-${payloadSha256.slice(0, 10)}.json`;
  return {
    id: `bt-handoff-${payloadSha256.slice(0, 16)}`,
    action: preview.action,
    network: preview.network,
    netuid: preview.netuid,
    payload,
    payloadJson,
    payloadSha256,
    suggestedFilename,
    signerMode: preview.signer.mode,
    createdAt,
    expiresAt,
    instructions: [
      "Review the action, network, netuid, amount, destination, fee, and slippage in Matterhorn.",
      "Open the payload in a Bittensor-compatible external signer or CLI flow.",
      "Confirm the signer shows the same payload SHA-256 before signing.",
      "Return only the signed payload or signature to Matterhorn for optional sidecar submission.",
    ],
    warnings: [
      ...preview.warnings,
      "Matterhorn cannot sign this payload. The external signer is the final authority.",
      "If the signer displays different action details, cancel and rebuild the preview.",
    ],
    consequenceSummary: preview.consequenceSummary,
  };
}

export function createBittensorSigningReceipt(input: {
  preview: BittensorExtrinsicPreview;
  handoff?: BittensorSigningHandoff | null;
  result?: BittensorSignedResult | null;
  signature?: string | null;
  signatureSha256?: string | null;
  signerAddress?: string | null;
}): BittensorSigningReceipt {
  const payloadJson = input.handoff?.payloadJson ?? stableJson(asRecord(input.preview.unsignedPayload));
  const payloadSha256 = input.handoff?.payloadSha256 ?? createHash("sha256").update(payloadJson).digest("hex");
  const signature = input.signature?.trim() || null;
  const providedSignatureSha256 = typeof input.signatureSha256 === "string" && /^[a-f0-9]{64}$/i.test(input.signatureSha256.trim())
    ? input.signatureSha256.trim().toLowerCase()
    : null;
  const signatureSha256 = providedSignatureSha256 ?? (signature ? createHash("sha256").update(signature).digest("hex") : null);
  const signerAddress = input.signerAddress && isValidSs58Address(input.signerAddress) ? input.signerAddress : null;
  const status: BittensorSigningReceiptStatus = input.result?.status ?? (signatureSha256 ? "signed_payload_received" : "awaiting_signature");
  const createdAt = input.handoff?.createdAt ?? nowIso();
  const updatedAt = nowIso();
  const txHash = input.result?.txHash ?? null;
  const blockHash = input.result?.blockHash ?? null;
  const explorerUrl = input.result?.explorerUrl ?? null;
  const message = input.result?.message ?? (
    status === "signed_payload_received"
      ? "External signature was received by Matterhorn. Broadcast still requires a configured and verified Subtensor sidecar."
      : "External signature is still required before this Bittensor action can be submitted."
  );
  const nextActions =
    status === "submitted" ? [
      txHash ? `Open the submitted extrinsic ${txHash} in an explorer.` : "Check the submitted extrinsic in the configured Bittensor explorer.",
      "Refresh the watch-only wallet after finality to compare the before and after state.",
    ] :
    status === "sidecar_unavailable" ? [
      "Keep this receipt with the payload hash and external signature hash.",
      "Configure a verified Subtensor sidecar or submit the signed payload through the external wallet/CLI flow.",
      "Refresh the unsigned preview if the payload expires or market/slippage context changes.",
    ] :
    status === "rejected" || status === "invalid_signature" ? [
      "Do not retry the stale signed payload without understanding the rejection.",
      "Rebuild a fresh unsigned preview and compare the payload hash before signing again.",
    ] :
    status === "signed_payload_received" ? [
      "Submit only through a configured Subtensor sidecar or complete broadcast in the external signer.",
      "Keep the receipt hash pair for post-action audit.",
    ] : [
      "Sign externally only after matching the payload SHA-256 in the external signer.",
      "Return only the signed payload or signature, never seed phrases or private keys.",
    ];

  return {
    id: `bt-receipt-${payloadSha256.slice(0, 12)}-${updatedAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
    handoffId: input.handoff?.id ?? null,
    action: input.preview.action,
    network: input.preview.network,
    netuid: input.preview.netuid,
    payloadSha256,
    signatureSha256,
    signerMode: input.preview.signer.mode,
    signerAddress,
    status,
    txHash,
    blockHash,
    explorerUrl,
    message,
    consequenceSummary: input.preview.consequenceSummary,
    warnings: uniqueWarnings(
      input.handoff?.warnings,
      input.preview.warnings,
      input.result && input.result.status !== "submitted" ? [input.result.message] : [],
      input.signerAddress && !signerAddress ? ["Signer address did not look like a valid SS58 public address and was not recorded."] : [],
      ["Receipt stores hashes and public routing metadata only. It does not store signing material."],
    ),
    nextActions,
    createdAt,
    updatedAt,
  };
}

function signingCheck(label: string, status: BittensorSigningSafetyCheck["status"], summary: string): BittensorSigningSafetyCheck {
  return { label, status, summary };
}

function signingChecklistStatus(checks: BittensorSigningSafetyCheck[]): BittensorSigningSafetyChecklist["status"] {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "pass";
}

export function buildBittensorSigningSafetyChecklist(preview: BittensorExtrinsicPreview): BittensorSigningSafetyChecklist {
  const forbiddenPayloadPath = secretFieldPath(preview.unsignedPayload);
  const needsSubnet = preview.action !== "transfer";
  const needsHotkey = preview.action === "stake" || preview.action === "unstake";
  const needsDestination = preview.action === "transfer";
  const checks: BittensorSigningSafetyCheck[] = [
    signingCheck(
      "External signature",
      preview.requiresExternalSignature && preview.signer.canSign === false ? "pass" : "fail",
      preview.requiresExternalSignature
        ? "Matterhorn will not sign this payload; the user must sign externally."
        : "Preview did not require external signing.",
    ),
    signingCheck(
      "No key material",
      forbiddenPayloadPath ? "fail" : "pass",
      forbiddenPayloadPath
        ? `Unsigned payload contains a forbidden signing-material field at ${forbiddenPayloadPath}.`
        : "Unsigned payload contains only public routing/action fields.",
    ),
    signingCheck(
      "Subnet context",
      needsSubnet && preview.netuid === null ? "warning" : "pass",
      needsSubnet
        ? preview.netuid === null ? "Subnet netuid is missing; rebuild the preview before signing." : `Subnet ${preview.netuid} is explicit.`
        : "Transfer previews do not require a subnet netuid.",
    ),
    signingCheck(
      "Validator or destination",
      needsHotkey && !preview.hotkey ? "warning" : needsDestination && !preview.destination ? "warning" : "pass",
      needsHotkey
        ? preview.hotkey ? `Validator hotkey ${shortSs58(preview.hotkey)} is explicit.` : "Validator hotkey is missing; do not sign until it is explicit."
        : needsDestination
          ? preview.destination ? `Destination ${shortSs58(preview.destination)} is explicit.` : "Destination is missing; do not sign until it is explicit."
          : "This action does not require validator or destination context.",
    ),
    signingCheck(
      "Amount",
      preview.amountTao && preview.amountTao > 0 ? "pass" : "warning",
      preview.amountTao && preview.amountTao > 0 ? `${formatMetric(preview.amountTao)} TAO is explicit.` : "Amount is unavailable; rebuild the preview before signing.",
    ),
    signingCheck(
      "Fee and slippage visibility",
      preview.feeTao === null && preview.slippageBps === null ? "warning" : "pass",
      preview.feeTao === null && preview.slippageBps === null
        ? "Fee and slippage are unavailable; refresh with a live provider before signing."
        : "Fee or slippage context is present; still refresh immediately before external signing.",
    ),
  ];
  const status = signingChecklistStatus(checks);
  return {
    kind: "signing_safety_checklist",
    status,
    previewAction: preview.action,
    network: preview.network,
    checks,
    warnings: uniqueWarnings(
      preview.warnings,
      checks.filter((check) => check.status !== "pass").map((check) => `${check.label}: ${check.summary}`),
      ["Final signing must happen in an external Bittensor-compatible signer."],
    ),
    nextActions: status === "fail"
      ? ["Do not sign. Rebuild the preview after removing blocker fields."]
      : [
        "Compare the action, amount, subnet, validator/destination, and payload hash in the external signer.",
        "Refresh the quote if fee, Dynamic TAO price, slippage, or provider freshness is stale.",
        "Sign externally only after the signer shows the same consequence you expect.",
      ],
    consequenceSummary: preview.consequenceSummary,
  };
}

export async function submitSignedBittensorExtrinsic(input: BittensorSignedSubmitInput): Promise<BittensorSignedResult> {
  if (!input.signature || input.signature.trim().length < 16) {
    return {
      status: "invalid_signature",
      txHash: null,
      blockHash: null,
      message: "A valid external signature is required before submission.",
      explorerUrl: null,
    };
  }

  const sidecar = readEnv("BITTENSOR_SUBTENSOR_SIDECAR_URL");
  if (!sidecar) {
    return {
      status: "sidecar_unavailable",
      txHash: null,
      blockHash: null,
      message: "Signed payload accepted by Matterhorn, but no Subtensor sidecar is configured to broadcast it.",
      explorerUrl: null,
    };
  }

  try {
    const res = await fetch(`${sidecar.replace(/\/$/, "")}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = asRecord(await res.json());
    const txHash = firstString(data, ["txHash", "hash", "extrinsicHash"]);
    const blockHash = firstString(data, ["blockHash", "block"]);
    return {
      status: "submitted",
      txHash,
      blockHash,
      message: "Signed Bittensor extrinsic submitted through the configured sidecar.",
      explorerUrl: txHash ? `https://taostats.io/extrinsic/${txHash}` : null,
    };
  } catch (err) {
    return {
      status: "rejected",
      txHash: null,
      blockHash: null,
      message: err instanceof Error ? err.message : "Subtensor sidecar rejected the signed payload.",
      explorerUrl: null,
    };
  }
}

function buildSubnetInvocationReviewRequest(
  netuid: number,
  input: BittensorSubnetInvokeInput,
  intent: BittensorSubnetInvocation["intent"],
): {
  request: BittensorSubnetInvocationPreview["request"];
  requestJson: string;
  requestSha256: string;
} {
  const ss58Address = input.ss58Address && isValidSs58Address(input.ss58Address) ? input.ss58Address : null;
  const request = {
    netuid,
    intent,
    task: input.task?.trim() || null,
    ss58Address,
  };
  const requestJson = stableJson(request);
  const requestSha256 = createHash("sha256").update(requestJson).digest("hex");
  return { request, requestJson, requestSha256 };
}

export async function previewBittensorSubnetInvocation(netuid: number, input: BittensorSubnetInvokeInput): Promise<BittensorSubnetInvocationPreview> {
  const [detail, capability] = await Promise.all([
    bittensorProvider.getSubnet(netuid),
    getBittensorCapability(netuid),
  ]);
  const configuredAdapter = getConfiguredSubnetAdapter(netuid);
  const intent = input.intent ?? "service_call";
  const adapterGate = evaluateSubnetServiceAdapterGate(capability, configuredAdapter, intent);
  const supported = adapterGate.supported;
  const { request, requestJson, requestSha256 } = buildSubnetInvocationReviewRequest(netuid, input, intent);
  return {
    netuid,
    subnetName: detail.name,
    intent,
    adapter: capability.serviceAdapter,
    supported,
    configured: capability.adapterStatus.configured,
    requiredAuth: capability.requiredAuth,
    costModel: capability.costModel,
    request,
    requestJson,
    requestSha256,
    confirmationPrompt: `Confirm Bittensor subnet ${netuid} service call with request SHA-256 ${requestSha256}.`,
    requestSchema: capability.requestSchema,
    resultSchema: capability.resultSchema,
    adapterContract: adapterGate.adapterContract,
    contractValidation: adapterGate.contractValidation,
    safetyNotes: capability.safetyNotes,
    warnings: uniqueWarnings(
      capability.safetyNotes,
      supported ? [
        "Review this adapter request before invoking the subnet service.",
        "Direct service invocation may send the task text and public routing context to the configured adapter.",
        ...adapterGate.contractValidation.warnings,
      ] : [
        `No configured ${capability.serviceAdapter.replace(/_/g, " ")} service adapter is ready for this subnet.`,
        "Matterhorn can still explain, compare, monitor, and prepare staking guidance for this subnet.",
        ...adapterGate.blockers,
        ...adapterGate.contractValidation.warnings,
      ],
      input.ss58Address && !request.ss58Address ? ["Provided wallet address was not valid SS58 and will not be sent to the adapter."] : [],
    ),
    consequenceSummary: supported
      ? `If confirmed, Matterhorn will call the configured ${configuredAdapter?.name ?? capability.serviceAdapter} adapter for ${detail.name} with the visible task and public context.`
      : `${capability.adapterContract.unsupportedBehavior.message} Matterhorn will not invoke ${detail.name}'s direct service until the adapter contract passes the service-call gate.`,
    requiresConfirmation: true,
  };
}

export async function invokeBittensorSubnet(netuid: number, input: BittensorSubnetInvokeInput): Promise<BittensorSubnetInvocation> {
  const [detail, capability] = await Promise.all([
    bittensorProvider.getSubnet(netuid),
    getBittensorCapability(netuid),
  ]);
  const intent = input.intent ?? "explain";
  const warnings = capability.safetyNotes;

  if (intent === "metagraph") {
    return {
      netuid,
      intent,
      adapter: "universal",
      supported: true,
      result: { metagraphSummary: detail.metagraphSummary, topValidators: detail.topValidators },
      message: `Metagraph context for ${detail.name}.`,
      warnings,
    };
  }
  if (intent === "stake_guidance") {
    return {
      netuid,
      intent,
      adapter: "universal",
      supported: true,
      result: { subnet: detail, risks: detail.risks, priceTao: detail.priceTao },
      message: `Stake planning guidance for ${detail.name}. Signed staking still requires an external signer.`,
      warnings,
    };
  }
  if (intent === "wallet_guidance") {
    const wallet = input.ss58Address && isValidSs58Address(input.ss58Address)
      ? await bittensorProvider.getWallet(input.ss58Address)
      : null;
    return {
      netuid,
      intent,
      adapter: "universal",
      supported: Boolean(wallet),
      result: { wallet, subnet: detail },
      message: wallet ? `Wallet exposure context for ${detail.name}.` : "Provide a valid SS58 coldkey public address for wallet guidance.",
      warnings,
    };
  }
  if (intent === "service_call") {
    const configuredAdapter = getConfiguredSubnetAdapter(netuid);
    const reviewRequest = buildSubnetInvocationReviewRequest(netuid, input, intent);
    const reviewedRequestMatches = Boolean(input.reviewedRequestSha256 && input.reviewedRequestSha256 === reviewRequest.requestSha256);
    const adapterGate = evaluateSubnetServiceAdapterGate(
      capability,
      configuredAdapter,
      intent,
      reviewedRequestMatches ? reviewRequest.requestSha256 : null,
    );
    if (adapterGate.supported && configuredAdapter) {
      if (!reviewedRequestMatches) {
        return {
          netuid,
          intent,
          adapter: configuredAdapter.serviceAdapter,
          supported: false,
          result: {
            capability,
            requestedTask: input.task ?? null,
            expectedRequestSha256: reviewRequest.requestSha256,
            receivedRequestSha256: input.reviewedRequestSha256 ?? null,
            adapterContract: adapterGate.adapterContract,
            contractValidation: adapterGate.contractValidation,
          },
          message: "Matterhorn will not invoke this subnet service until the reviewed request SHA-256 from the preview card is provided and matches the current request.",
          warnings: uniqueWarnings(
            warnings,
            configuredAdapter.safetyNotes,
            ["Reviewed request SHA-256 is missing or does not match the current subnet service request."],
          ),
          adapterContract: adapterGate.adapterContract,
          contractValidation: adapterGate.contractValidation,
        };
      }

      const adapterResult = await runBittensorSubnetAdapter(configuredAdapter, input, reviewRequest.requestSha256);
      const ok = adapterResult?.["ok"] !== false;
      return {
        netuid,
        intent,
        adapter: configuredAdapter.serviceAdapter,
        supported: Boolean(ok && adapterResult),
        result: {
          capability,
          requestedTask: input.task ?? null,
          requestSha256: reviewRequest.requestSha256,
          adapter: {
            name: configuredAdapter.name,
            requiredAuth: configuredAdapter.requiredAuth,
            costModel: configuredAdapter.costModel,
          },
          output: adapterResult,
        },
        message: ok && adapterResult
          ? `Matterhorn invoked the configured ${configuredAdapter.name} adapter for ${detail.name}.`
          : `The configured ${configuredAdapter.name} adapter for ${detail.name} did not complete successfully.`,
        warnings: uniqueWarnings(warnings, configuredAdapter.safetyNotes, adapterResult?.warnings),
        adapterContract: adapterGate.adapterContract,
        contractValidation: adapterGate.contractValidation,
      };
    }
    return {
      netuid,
      intent,
      adapter: capability.serviceAdapter,
      supported: false,
      result: {
        capability,
        requestedTask: input.task ?? null,
        adapterContract: adapterGate.adapterContract,
        contractValidation: adapterGate.contractValidation,
        blockers: adapterGate.blockers,
      },
      message: `Matterhorn can explain and monitor ${detail.name}, but it will not invoke a direct subnet service until the adapter contract passes the service-call gate.`,
      warnings: uniqueWarnings(warnings, adapterGate.blockers, adapterGate.contractValidation.warnings),
      adapterContract: adapterGate.adapterContract,
      contractValidation: adapterGate.contractValidation,
    };
  }

  return {
    netuid,
    intent: "explain",
    adapter: "universal",
    supported: true,
    result: { subnet: detail, capability },
    message: `${detail.name}: ${detail.benefitSummary}`,
    warnings,
  };
}

function normalizeForScore(value: number | null, max: number): number {
  if (value === null || !Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function validatorStrategyWeights(strategy: BittensorValidatorComparison["strategy"]): { stake: number; trust: number; dividends: number } {
  if (strategy === "yield") return { stake: 0.25, trust: 0.25, dividends: 0.5 };
  if (strategy === "safety") return { stake: 0.45, trust: 0.4, dividends: 0.15 };
  return { stake: 0.35, trust: 0.35, dividends: 0.3 };
}

function normalizeValidatorStrategy(value: unknown): BittensorValidatorComparison["strategy"] {
  return value === "yield" || value === "safety" || value === "balanced" ? value : "balanced";
}

export async function compareBittensorValidators(input: BittensorValidatorCompareInput): Promise<BittensorValidatorComparison> {
  const netuid = Number.isInteger(input.netuid) && input.netuid >= 0 ? input.netuid : 0;
  const detail = await bittensorProvider.getSubnet(netuid);
  const strategy = normalizeValidatorStrategy(input.strategy);
  const requestedHotkeys = new Set((input.hotkeys ?? []).filter((item): item is string => typeof item === "string" && isValidSs58Address(item)));
  const limit = Math.min(12, Math.max(1, Number(input.limit ?? 6) || 6));
  const validators = requestedHotkeys.size
    ? detail.topValidators.filter((validator) => Boolean(validator.hotkey && requestedHotkeys.has(validator.hotkey)))
    : detail.topValidators;
  const maxStake = Math.max(0, ...validators.map((validator) => validator.stake ?? 0));
  const maxTrust = Math.max(0, ...validators.map((validator) => validator.trust ?? 0));
  const maxDividends = Math.max(0, ...validators.map((validator) => validator.dividends ?? 0));
  const weights = validatorStrategyWeights(strategy);

  const candidates = validators
    .map((validator): BittensorValidatorCandidate => {
      const stakeScore = normalizeForScore(validator.stake, maxStake);
      const trustScore = maxTrust > 1
        ? normalizeForScore(validator.trust, maxTrust)
        : Math.max(0, Math.min(1, validator.trust ?? 0));
      const dividendScore = maxDividends > 1
        ? normalizeForScore(validator.dividends, maxDividends)
        : Math.max(0, Math.min(1, validator.dividends ?? 0));
      const score = Math.round(100 * (
        stakeScore * weights.stake +
        trustScore * weights.trust +
        dividendScore * weights.dividends
      ));
      const reasons = [
        validator.stake !== null ? `Stake sample: ${formatMetric(validator.stake)}.` : "Stake sample unavailable.",
        validator.trust !== null ? `Trust sample: ${formatMetric(validator.trust, "", 4)}.` : "Trust sample unavailable.",
        validator.dividends !== null ? `Dividend sample: ${formatMetric(validator.dividends, "", 4)}.` : "Dividend sample unavailable.",
      ];
      const warnings = [
        "Validator comparison is informational, not financial advice.",
        "Verify validator identity, commission/fees where applicable, and recent behavior in an external explorer before staking.",
      ];
      if (!validator.hotkey) warnings.push("Validator hotkey is unavailable in this metagraph sample.");
      if (detail.source === "curated-fallback") warnings.push("Live Bittensor data is unavailable; this comparison uses reference metadata and is incomplete.");

      return {
        netuid,
        subnetName: detail.name,
        uid: validator.uid,
        hotkey: validator.hotkey,
        coldkey: validator.coldkey,
        stake: validator.stake,
        trust: validator.trust,
        dividends: validator.dividends,
        score,
        reasons,
        warnings,
        source: detail.source,
      };
    })
    .sort((a, b) => b.score - a.score || (b.stake ?? 0) - (a.stake ?? 0))
    .slice(0, limit);

  const warnings = [
    "This is a deterministic inspection shortlist, not a recommendation to stake.",
    "Matterhorn uses public metagraph/provider data only and never handles Bittensor seed phrases or private keys.",
  ];
  if (!detail.topValidators.length) warnings.push("No validator sample was available for this subnet.");
  if (requestedHotkeys.size && !candidates.length) warnings.push("None of the requested validator hotkeys appeared in the available top-validator sample.");
  if (detail.source === "curated-fallback") warnings.push("Live Bittensor data is unavailable; connect a live Bittensor data source for stronger results.");

  return {
    netuid,
    subnetName: detail.name,
    strategy,
    candidates,
    warnings,
    source: detail.source,
    updatedAt: nowIso(),
  };
}

export async function analyzeBittensorValidatorIntelligence(input: {
  netuid: number;
  validatorHotkey: string;
  strategy?: BittensorValidatorComparison["strategy"] | null;
}): Promise<BittensorValidatorIntelligenceReport> {
  const netuid = Number.isInteger(input.netuid) && input.netuid >= 0 ? input.netuid : 0;
  const strategy = normalizeValidatorStrategy(input.strategy);
  const validatorHotkey = input.validatorHotkey.trim();
  const comparison = await compareBittensorValidators({
    netuid,
    hotkeys: isValidSs58Address(validatorHotkey) ? [validatorHotkey] : [],
    strategy,
    limit: 1,
  });
  const subnet = await bittensorProvider.getSubnet(netuid);
  const directMatch = subnet.topValidators.find((validator) => validator.hotkey === validatorHotkey || validator.coldkey === validatorHotkey) ?? null;
  const candidate = comparison.candidates[0] ?? (directMatch ? {
    netuid,
    subnetName: subnet.name,
    uid: directMatch.uid,
    hotkey: directMatch.hotkey,
    coldkey: directMatch.coldkey,
    stake: directMatch.stake,
    trust: directMatch.trust,
    dividends: directMatch.dividends,
    score: 50,
    reasons: ["Validator appeared in the visible metagraph sample."],
    warnings: ["Validator comparison is informational, not financial advice."],
    source: subnet.source,
  } satisfies BittensorValidatorCandidate : null);
  const foundInSample = Boolean(candidate);
  const score = candidate?.score ?? 0;
  const risk: BittensorRiskLevel = !foundInSample
    ? "high"
    : score >= 75
      ? "low"
      : score >= 45
        ? "medium"
        : "high";
  const warnings = uniqueWarnings(
    comparison.warnings,
    candidate?.warnings ?? [],
    !isValidSs58Address(validatorHotkey) ? ["Validator hotkey does not look like a valid SS58 address."] : [],
    !foundInSample ? ["Validator was not found in the current top-validator sample; verify externally before staking."] : [],
    subnet.source === "curated-fallback" ? ["Live Bittensor data is unavailable; this validator report uses reference metadata and is incomplete."] : [],
    ["This is public validator intelligence, not a staking recommendation."],
  );
  const signals: BittensorIntelligenceSignal[] = [
    {
      label: "Sample visibility",
      value: foundInSample ? "Found" : "Not found",
      tone: foundInSample ? "good" : "danger",
      explanation: "Whether this hotkey appears in the current visible validator sample for the subnet.",
    },
    {
      label: "Score",
      value: foundInSample ? `${score}/100` : "Unavailable",
      tone: riskTone(risk),
      explanation: "Deterministic score based on visible stake, trust, and dividends under the selected strategy.",
    },
    {
      label: "Stake",
      value: candidate?.stake === null || candidate?.stake === undefined ? "Unavailable" : `${formatMetric(candidate.stake)} TAO`,
      tone: candidate?.stake ? "default" : "muted",
      explanation: "Visible validator stake from the current provider sample.",
    },
    {
      label: "Provider",
      value: bittensorSourceLabel(comparison.source),
      tone: isReferenceBittensorData(comparison.source) ? "warning" : "default",
      explanation: "Source of subnet and metagraph-like validator data.",
    },
  ];
  const watchSuggestions = [
    watchSuggestion({
      kind: "validator",
      label: `Validator ${shortSs58(validatorHotkey)} on subnet ${netuid}`,
      netuid,
      validatorHotkey,
      threshold: candidate?.stake ?? null,
      reason: foundInSample
        ? "Track whether this validator remains visible and how its public stake sample changes."
        : "Track whether this validator appears in a future provider sample.",
    }),
  ];
  const copilotActions = [
    copilotAction(
      "Create validator watch",
      `Monitor validator ${validatorHotkey} on subnet ${netuid}.`,
      "A watch will check whether the validator remains visible in public samples.",
      risk,
    ),
    copilotAction(
      "Compare peers",
      `Compare validators on subnet ${netuid} with a ${strategy} strategy.`,
      "Peer comparison provides context before any staking preview.",
      "low",
    ),
    copilotAction(
      "Prepare preview later",
      `Prepare staking 1 TAO on subnet ${netuid} to validator ${validatorHotkey}.`,
      "Unsigned previews require an explicit amount and external signing.",
      "medium",
    ),
  ];

  return {
    kind: "validator",
    netuid,
    subnetName: subnet.name,
    validatorHotkey,
    coldkey: candidate?.coldkey ?? null,
    uid: candidate?.uid ?? null,
    score,
    stake: candidate?.stake ?? null,
    trust: candidate?.trust ?? null,
    dividends: candidate?.dividends ?? null,
    source: comparison.source,
    foundInSample,
    risk,
    signals,
    warnings,
    nextQuestions: [
      `Monitor validator ${validatorHotkey} on subnet ${netuid}.`,
      `Compare validators on subnet ${netuid}.`,
      `Prepare staking 1 TAO on subnet ${netuid} to validator ${validatorHotkey}.`,
    ],
    copilotActions,
    watchSuggestions,
    updatedAt: nowIso(),
  };
}

function extractStakingPlanGoal(message: string): string {
  const withoutAmount = message
    .replace(/\b\d+(?:\.\d+)?\s*TAO\b/gi, "")
    .replace(/\b(build|create|make|give me|i have|allocate|distribute|staking plan|allocation plan|plan|stake|staking|tao|bittensor)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutAmount || "balanced Bittensor subnet exposure";
}

export async function buildBittensorStakingPlan(input: {
  message: string;
  amountTao: string | null;
  coldkey?: string | null;
  strategy?: BittensorValidatorComparison["strategy"] | null;
  limit?: number | null;
}): Promise<BittensorStakingPlan> {
  const totalAmountTao = parseAmountTao(input.amountTao) ?? 1;
  const strategy = normalizeValidatorStrategy(input.strategy);
  const goal = extractStakingPlanGoal(input.message);
  const discovery = await findBittensorSubnetsForGoal({ goal, limit: Math.min(4, Math.max(2, Number(input.limit ?? 3) || 3)) });
  const selected = discovery.matches.slice(0, Math.min(4, Math.max(1, discovery.matches.length)));
  const perStepAmount = selected.length ? Number((totalAmountTao / selected.length).toFixed(6)) : totalAmountTao;
  const steps: BittensorStakingPlanStep[] = [];
  const unsignedPreviews: BittensorExtrinsicPreview[] = [];
  const warnings: string[] = [
    "This is an allocation plan and unsigned preview set, not financial advice.",
    "No staking can happen until the user reviews and signs externally.",
  ];

  for (const match of selected) {
    const comparison = await compareBittensorValidators({ netuid: match.subnet.netuid, strategy, limit: 1 });
    const validator = comparison.candidates[0] ?? null;
    const preview = await prepareBittensorExtrinsic({
      action: "stake",
      netuid: match.subnet.netuid,
      amountTao: String(perStepAmount),
      coldkey: input.coldkey ?? null,
      hotkey: validator?.hotkey ?? null,
      rateTolerance: strategy === "safety" ? 0.0025 : 0.005,
    });
    unsignedPreviews.push(preview);
    steps.push({
      netuid: match.subnet.netuid,
      subnetName: match.subnet.name,
      validatorHotkey: validator?.hotkey ?? null,
      amountTao: perStepAmount,
      strategy,
      expectedAlpha: preview.expectedAlpha,
      slippageBps: preview.slippageBps,
      source: comparison.source,
      warnings: uniqueWarnings(comparison.warnings, preview.warnings),
      rationale: `${match.reasons[0] ?? "Selected from goal-based subnet discovery."} Validator candidate uses the ${strategy} scoring strategy.`,
    });
  }

  if (!selected.length) warnings.push("No subnet candidates were available from the current provider data.");
  if (!input.coldkey) warnings.push("No coldkey public address was supplied, so previews cannot be tied to a signer address yet.");
  if (steps.some((step) => !step.validatorHotkey)) warnings.push("At least one subnet lacks a visible validator hotkey; choose a validator before signing.");

  const watchSuggestions = steps.flatMap((step) => [
    watchSuggestion({
      kind: "subnet",
      label: `Planned subnet ${step.netuid}`,
      netuid: step.netuid,
      threshold: step.amountTao,
      reason: "Track a subnet included in the current staking plan.",
    }),
    ...(step.validatorHotkey ? [
      watchSuggestion({
        kind: "validator" as const,
        label: `Planned validator ${shortSs58(step.validatorHotkey)}`,
        netuid: step.netuid,
        validatorHotkey: step.validatorHotkey,
        reason: "Track validator visibility before turning this plan into a signed action.",
      }),
    ] : []),
  ]);
  const copilotActions = [
    copilotAction(
      "Create plan watches",
      "Create watches for this Bittensor staking plan.",
      "Watches keep the plan current before any external signing.",
      "low",
    ),
    copilotAction(
      "Review signer handoff",
      "Create signing handoff for the first unsigned Bittensor preview.",
      "Handoff converts one preview into canonical JSON for external signing.",
      "medium",
    ),
  ];

  return {
    kind: "staking_plan",
    goal,
    totalAmountTao,
    strategy,
    steps,
    unsignedPreviews,
    assumptions: [
      `Split ${formatMetric(totalAmountTao)} TAO evenly across ${Math.max(1, steps.length)} candidate subnet(s).`,
      `Use ${strategy} validator scoring for first-pass validator candidates.`,
      "Refresh quotes immediately before signing because Dynamic TAO price and slippage can move.",
    ],
    warnings: uniqueWarnings(warnings, ...steps.map((step) => step.warnings)),
    nextQuestions: [
      "Create watches for this Bittensor staking plan.",
      "Compare validators for the largest planned subnet.",
      "Create signing handoff for the first unsigned Bittensor preview.",
    ],
    copilotActions,
    watchSuggestions,
    updatedAt: nowIso(),
  };
}

function riskSeverity(risk: BittensorRiskLevel): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  if (risk === "low") return 1;
  return 0;
}

function highestRisk(...risks: BittensorRiskLevel[]): BittensorRiskLevel {
  return risks.reduce((highest, risk) => riskSeverity(risk) > riskSeverity(highest) ? risk : highest, "unknown" as BittensorRiskLevel);
}

function decisionOption(input: {
  label: string;
  summary: string;
  prompt: string;
  priority: BittensorDecisionOption["priority"];
  riskLevel: BittensorRiskLevel;
  rationale: string;
  requiresExternalSignature?: boolean;
}): BittensorDecisionOption {
  return {
    label: input.label,
    summary: input.summary,
    prompt: input.prompt,
    priority: input.priority,
    riskLevel: input.riskLevel,
    rationale: input.rationale,
    requiresExternalSignature: Boolean(input.requiresExternalSignature),
  };
}

export async function buildBittensorDecisionBrief(input: {
  message: string;
  ss58Address?: string | null;
  netuid?: number | null;
  amountTao?: string | null;
  strategy?: BittensorValidatorComparison["strategy"] | null;
  limit?: number | null;
}): Promise<BittensorDecisionBrief> {
  const strategy = normalizeValidatorStrategy(input.strategy);
  const limit = Math.min(6, Math.max(3, Number(input.limit ?? 5) || 5));
  const ss58Address = input.ss58Address && isValidSs58Address(input.ss58Address) ? input.ss58Address : null;
  const netuid = Number.isInteger(input.netuid) && input.netuid !== null && input.netuid !== undefined && input.netuid >= 0 ? input.netuid : null;
  const commonWarnings = [
    "This is a Bittensor decision brief based on public/provider data, not financial advice.",
    "Matterhorn does not ask for seed phrases, private keys, mnemonics, or key exports.",
    "Any transaction-like next step must be reviewed and signed externally.",
  ];

  if (ss58Address) {
    const wallet = await analyzeBittensorWalletIntelligence(ss58Address);
    const topPosition = wallet.largestPositions[0] ?? null;
    const topValidator = wallet.validatorExposure[0] ?? null;
    const risk = highestRisk(wallet.concentrationRisk, wallet.slippageRisk, wallet.staleDataRisk);
    const score = Math.max(0, Math.min(100, 100 - riskSeverity(risk) * 18 - Math.max(0, wallet.watchSuggestions.length - 2) * 3));
    const options = [
      decisionOption({
        label: "Create risk watches",
        summary: "Track the positions and validators most likely to need review.",
        prompt: `Create watches for my riskiest Bittensor positions. SS58 address: ${ss58Address}`,
        priority: "now",
        riskLevel: "low",
        rationale: "Watches keep the wallet context fresh without signing or custody.",
      }),
      ...(topPosition ? [
        decisionOption({
          label: "Inspect largest subnet",
          summary: `Review subnet ${topPosition.netuid} before changing exposure.`,
          prompt: `Analyze Bittensor subnet ${topPosition.netuid} for my current stake exposure.`,
          priority: risk === "high" ? "now" : "next",
          riskLevel: wallet.concentrationRisk,
          rationale: "Largest-position concentration is the first thing to understand before preparing actions.",
        }),
      ] : []),
      ...(topValidator ? [
        decisionOption({
          label: "Deep dive top validator",
          summary: `Review validator ${shortSs58(topValidator.validatorHotkey)} across ${topValidator.subnetCount} subnet(s).`,
          prompt: `Deep dive validator ${topValidator.validatorHotkey} on subnet ${topValidator.netuids[0] ?? topPosition?.netuid ?? 0}.`,
          priority: "next",
          riskLevel: topValidator.risk,
          rationale: "Validator exposure can dominate wallet risk even when subnet exposure looks diversified.",
        }),
      ] : []),
      decisionOption({
        label: "Draft a safe staking plan",
        summary: "Prepare an unsigned plan only after current exposure is understood.",
        prompt: `Build a safety-first Bittensor staking plan for ${input.amountTao ?? "1"} TAO. Coldkey: ${ss58Address}`,
        priority: wallet.freeTao && wallet.freeTao > 0 ? "later" : "later",
        riskLevel: "medium",
        rationale: "A staking plan is useful, but no funds move until the user signs externally.",
        requiresExternalSignature: true,
      }),
    ];
    return {
      kind: "decision_brief",
      focus: "wallet",
      title: "Bittensor wallet decision brief",
      summary: `Prioritized next steps for ${shortSs58(ss58Address)} using watch-only wallet intelligence across ${wallet.subnetCount} subnet(s).`,
      score,
      risk,
      source: wallet.source,
      warnings: uniqueWarnings(commonWarnings, wallet.warnings),
      assumptions: [
        "Public SS58 wallet reads are enough for exposure analysis.",
        "Watches should be created before preparing or signing any transaction-like action.",
        "Quotes and validator samples should be refreshed immediately before external signing.",
      ],
      signals: wallet.signals,
      options,
      watchSuggestions: wallet.watchSuggestions,
      updatedAt: nowIso(),
      related: { wallet },
    };
  }

  if (netuid !== null) {
    const subnet = await analyzeBittensorSubnetIntelligence(netuid);
    const validators = await compareBittensorValidators({ netuid, strategy, limit: Math.min(4, limit) });
    const risk = highestRisk(subnet.metagraph.concentrationRisk, subnet.metagraph.dataQuality);
    const score = Math.round((subnet.score + (validators.candidates[0]?.score ?? 50)) / 2);
    const topValidator = validators.candidates[0] ?? null;
    const options = [
      decisionOption({
        label: "Create subnet watches",
        summary: "Track emissions, slippage, and subnet state before acting.",
        prompt: `Create watches for Bittensor subnet ${netuid}.`,
        priority: "now",
        riskLevel: "low",
        rationale: "Subnet watches preserve context and catch stale data before a staking preview.",
      }),
      decisionOption({
        label: "Compare validators",
        summary: `Rank validator candidates on subnet ${netuid} with a ${strategy} strategy.`,
        prompt: `Compare validators on subnet ${netuid} with a ${strategy} strategy.`,
        priority: "now",
        riskLevel: subnet.metagraph.dataQuality,
        rationale: "Validator context is required before any staking preview should be trusted.",
      }),
      ...(topValidator?.hotkey ? [
        decisionOption({
          label: "Prepare unsigned preview",
          summary: `Prepare, but do not sign, a small preview for ${shortSs58(topValidator.hotkey)}.`,
          prompt: `Prepare staking ${input.amountTao ?? "1"} TAO on subnet ${netuid} to validator ${topValidator.hotkey}.`,
          priority: "later",
          riskLevel: "medium",
          rationale: "Unsigned preview shows fees/slippage/consequences while keeping signing external.",
          requiresExternalSignature: true,
        }),
      ] : []),
    ];
    return {
      kind: "decision_brief",
      focus: "subnet",
      title: "Bittensor subnet decision brief",
      summary: `Prioritized next steps for subnet ${netuid} (${subnet.name}) using public subnet and validator intelligence.`,
      score,
      risk,
      source: subnet.market.source,
      warnings: uniqueWarnings(commonWarnings, subnet.warnings, validators.warnings),
      assumptions: [
        `Use ${strategy} validator scoring until the user chooses another strategy.`,
        "Provider samples may omit validators; verify externally before signing.",
        "Service execution is separate from staking and still depends on subnet adapter availability.",
      ],
      signals: subnet.signals,
      options,
      watchSuggestions: subnet.watchSuggestions,
      updatedAt: nowIso(),
      related: { subnet, validators },
    };
  }

  const goal = extractStakingPlanGoal(input.message) || "Bittensor work";
  const discovery = await findBittensorSubnetsForGoal({ goal, limit });
  const first = discovery.matches[0] ?? null;
  const options = [
    decisionOption({
      label: "Pick a subnet lane",
      summary: first ? `Start by inspecting ${first.subnet.name} (subnet ${first.subnet.netuid}).` : "Start with subnet discovery before staking or service use.",
      prompt: first
        ? `Analyze Bittensor subnet ${first.subnet.netuid} and explain whether it fits this goal: ${goal}.`
        : `Find Bittensor subnets useful for: ${goal}.`,
      priority: "now",
      riskLevel: first?.subnet.source === "curated-fallback" ? "medium" : "low",
      rationale: "Choosing a capability lane first prevents mixing up staking exposure with using a subnet service.",
    }),
    decisionOption({
      label: "Add wallet context",
      summary: "Use a public SS58 coldkey address to get personalized exposure.",
      prompt: "Analyze my Bittensor wallet. SS58 address: ",
      priority: "next",
      riskLevel: "low",
      rationale: "A public address enables watch-only balance/stake analysis without custody.",
    }),
    decisionOption({
      label: "Run readiness check",
      summary: "Check sidecar, provider, signer, and safety readiness before advanced actions.",
      prompt: "Run a Bittensor readiness check.",
      priority: "next",
      riskLevel: "low",
      rationale: "Readiness distinguishes live data from reference metadata before users trust the workflow.",
    }),
  ];
  return {
    kind: "decision_brief",
    focus: "general",
    title: "Bittensor decision brief",
    summary: `Prioritized a safe path for "${goal}" from discovery toward watch-only context and unsigned previews.`,
    score: first ? Math.max(45, Math.min(85, first.score)) : 40,
    risk: first?.subnet.source === "curated-fallback" ? "medium" : "low",
    source: discovery.source,
    warnings: uniqueWarnings(commonWarnings, discovery.warnings),
    assumptions: [
      "Start with discovery when no wallet address or subnet is supplied.",
      "Wallet personalization requires only a public SS58 address.",
      "Direct subnet service use still depends on adapter availability.",
    ],
    signals: discovery.matches.slice(0, 3).map((match) => ({
      label: `Subnet ${match.subnet.netuid}`,
      value: `${match.subnet.name}: ${match.score}/100`,
      tone: match.subnet.source === "curated-fallback" ? "warning" : "default",
      explanation: match.reasons[0] ?? "Goal-based subnet match.",
    })),
    options,
    watchSuggestions: first ? [
      watchSuggestion({
        kind: "subnet",
        label: `Watch ${first.subnet.name}`,
        netuid: first.subnet.netuid,
        reason: "Track the first subnet candidate while evaluating fit.",
      }),
    ] : [],
    updatedAt: nowIso(),
    related: { discovery },
  };
}

function watchPolicyActionPrompt(suggestion: BittensorWatchSuggestion): string {
  if (suggestion.kind === "wallet" && suggestion.ss58Address) return `Analyze Bittensor wallet. SS58 address: ${suggestion.ss58Address}`;
  if (suggestion.kind === "validator" && suggestion.validatorHotkey) return `Deep dive validator ${suggestion.validatorHotkey} on subnet ${suggestion.netuid ?? 0}.`;
  if (suggestion.kind === "slippage" && suggestion.netuid !== null) return `Prepare a fresh unsigned Bittensor staking preview for subnet ${suggestion.netuid}.`;
  if ((suggestion.kind === "subnet" || suggestion.kind === "emissions") && suggestion.netuid !== null) return `Analyze Bittensor subnet ${suggestion.netuid}.`;
  return "Check my Bittensor alerts.";
}

function watchPolicyTrigger(suggestion: BittensorWatchSuggestion): string {
  if (suggestion.kind === "wallet") return "Wallet exposure, freshness, or concentration changes.";
  if (suggestion.kind === "validator") return "Validator visibility, stake sample, or peer context changes.";
  if (suggestion.kind === "emissions") return "Subnet emission context changes.";
  if (suggestion.kind === "slippage") return "Dynamic TAO quote or slippage context changes.";
  return "Subnet public-data context changes.";
}

function watchPolicyRuleFromSuggestion(suggestion: BittensorWatchSuggestion, riskLevel: BittensorRiskLevel): BittensorWatchPolicyRule {
  return {
    label: suggestion.label,
    kind: suggestion.kind,
    trigger: watchPolicyTrigger(suggestion),
    threshold: suggestion.threshold,
    reason: suggestion.reason,
    actionPrompt: watchPolicyActionPrompt(suggestion),
    riskLevel,
    watch: {
      kind: suggestion.kind,
      label: suggestion.label,
      netuid: suggestion.netuid,
      ss58Address: suggestion.ss58Address,
      validatorHotkey: suggestion.validatorHotkey ?? null,
      threshold: suggestion.threshold,
      reason: suggestion.reason,
    },
  };
}

export async function buildBittensorWatchPolicyPreset(input: {
  message: string;
  ss58Address?: string | null;
  netuid?: number | null;
  validatorHotkey?: string | null;
  strategy?: BittensorValidatorComparison["strategy"] | null;
  limit?: number | null;
}): Promise<BittensorWatchPolicyPreset> {
  const ss58Address = input.ss58Address && isValidSs58Address(input.ss58Address) ? input.ss58Address : null;
  const validatorHotkey = input.validatorHotkey && isValidSs58Address(input.validatorHotkey) ? input.validatorHotkey : null;
  const netuid = Number.isInteger(input.netuid) && input.netuid !== null && input.netuid !== undefined && input.netuid >= 0 ? input.netuid : null;
  const limit = Math.min(6, Math.max(2, Number(input.limit ?? 4) || 4));
  const commonWarnings = [
    "Watch policies use public/provider data and may lag live chain state.",
    "A policy does not sign, stake, unstake, transfer, or broadcast anything.",
    "Matterhorn never needs seed phrases, private keys, mnemonics, or key exports for watch policies.",
  ];

  if (ss58Address) {
    const wallet = await analyzeBittensorWalletIntelligence(ss58Address);
    const rules = uniqueWatchSuggestions(wallet.watchSuggestions)
      .slice(0, limit)
      .map((suggestion) => watchPolicyRuleFromSuggestion(suggestion, highestRisk(wallet.concentrationRisk, wallet.slippageRisk, wallet.staleDataRisk)));
    const fallbackRule = watchPolicyRuleFromSuggestion(watchSuggestion({
      kind: "wallet",
      label: `Wallet ${shortSs58(ss58Address)}`,
      ss58Address,
      reason: "Keep a baseline watch on wallet exposure and provider freshness.",
    }), wallet.staleDataRisk);
    const finalRules = rules.length ? rules : [fallbackRule];
    return {
      kind: "watch_policy",
      scope: "wallet",
      label: `Wallet guardrails for ${shortSs58(ss58Address)}`,
      summary: `Monitor wallet concentration, slippage, validator exposure, and freshness for ${shortSs58(ss58Address)}.`,
      priority: wallet.concentrationRisk === "high" || wallet.slippageRisk === "high" ? "now" : "next",
      source: wallet.source,
      rules: finalRules,
      copilotActions: [
        copilotAction("Create recommended watches", `Create watches for my riskiest Bittensor positions. SS58 address: ${ss58Address}`, "Turns this policy into concrete watch entries using public wallet data.", "low"),
        copilotAction("Check alerts", "Check my Bittensor alerts.", "Evaluates configured watches and shows actionable follow-up prompts.", "low"),
        copilotAction("Build decision brief", `What should I do next with my TAO? SS58 address: ${ss58Address}`, "Re-runs the broader wallet decision copilot after watches are in place.", "low"),
      ],
      warnings: uniqueWarnings(commonWarnings, wallet.warnings),
      updatedAt: nowIso(),
      related: { wallet },
    };
  }

  if (validatorHotkey && netuid !== null) {
    const validator = await analyzeBittensorValidatorIntelligence({ netuid, validatorHotkey, strategy: input.strategy });
    const rules = uniqueWatchSuggestions(validator.watchSuggestions)
      .slice(0, limit)
      .map((suggestion) => watchPolicyRuleFromSuggestion(suggestion, validator.risk));
    return {
      kind: "watch_policy",
      scope: "validator",
      label: `Validator guardrails for ${shortSs58(validatorHotkey)}`,
      summary: `Monitor validator visibility, score context, and peer comparison readiness on subnet ${netuid}.`,
      priority: validator.risk === "high" ? "now" : "next",
      source: validator.source,
      rules,
      copilotActions: [
        copilotAction("Create validator watch", `Monitor validator ${validatorHotkey} on subnet ${netuid}.`, "Creates a concrete watch for this validator hotkey.", "low"),
        copilotAction("Compare peers", `Compare validators on subnet ${netuid} with a ${normalizeValidatorStrategy(input.strategy)} strategy.`, "Peer comparison keeps validator context honest before any preview.", "low"),
      ],
      warnings: uniqueWarnings(commonWarnings, validator.warnings),
      updatedAt: nowIso(),
      related: { validator },
    };
  }

  if (netuid !== null) {
    const subnet = await analyzeBittensorSubnetIntelligence(netuid);
    const rules = uniqueWatchSuggestions(subnet.watchSuggestions)
      .slice(0, limit)
      .map((suggestion) => watchPolicyRuleFromSuggestion(suggestion, highestRisk(subnet.metagraph.concentrationRisk, subnet.metagraph.dataQuality)));
    return {
      kind: "watch_policy",
      scope: "subnet",
      label: `Subnet ${netuid} guardrails`,
      summary: `Monitor subnet ${netuid} market context, emissions, concentration, and adapter readiness before acting.`,
      priority: subnet.metagraph.concentrationRisk === "high" || subnet.metagraph.dataQuality === "high" ? "now" : "next",
      source: subnet.market.source,
      rules,
      copilotActions: [
        copilotAction("Create subnet watches", `Create watches for Bittensor subnet ${netuid}.`, "Creates concrete watches for subnet state and market context.", "low"),
        copilotAction("Compare validators", `Compare validators on subnet ${netuid}.`, "Validator comparison is the next safe step before a staking preview.", "low"),
      ],
      warnings: uniqueWarnings(commonWarnings, subnet.warnings),
      updatedAt: nowIso(),
      related: { subnet },
    };
  }

  const goal = extractStakingPlanGoal(input.message) || "Bittensor monitoring";
  const discovery = await findBittensorSubnetsForGoal({ goal, limit });
  const rules = discovery.matches.slice(0, limit).map((match) => watchPolicyRuleFromSuggestion(watchSuggestion({
    kind: "subnet",
    label: `Watch ${match.subnet.name}`,
    netuid: match.subnet.netuid,
    reason: match.reasons[0] ?? "Track this subnet while evaluating fit.",
  }), match.subnet.source === "curated-fallback" ? "medium" : "low"));
  return {
    kind: "watch_policy",
    scope: "general",
    label: "Bittensor discovery guardrails",
    summary: `Start with watchable subnet candidates for "${goal}" before wallet-specific or transaction-like actions.`,
    priority: "next",
    source: discovery.source,
    rules,
    copilotActions: [
      copilotAction("Add wallet context", "Analyze my Bittensor wallet. SS58 address: ", "A public SS58 address enables personalized watch policies without custody.", "low"),
      copilotAction("Find more subnets", `Find Bittensor subnets useful for: ${goal}.`, "Discovery expands the policy before selecting validators or previews.", "low"),
    ],
    warnings: uniqueWarnings(commonWarnings, discovery.warnings),
    updatedAt: nowIso(),
    related: { discovery },
  };
}

function riskFromShare(share: number | null): BittensorRiskLevel {
  if (share === null || !Number.isFinite(share)) return "unknown";
  if (share >= 0.5) return "high";
  if (share >= 0.33) return "medium";
  return "low";
}

function riskFromSlippagePositions(positions: BittensorStakePosition[]): BittensorRiskLevel {
  if (!positions.length) return "unknown";
  if (positions.some((position) => position.slippageRisk === "high")) return "high";
  if (positions.some((position) => position.slippageRisk === "medium")) return "medium";
  if (positions.some((position) => position.slippageRisk === "low")) return "low";
  return "unknown";
}

function riskTone(risk: BittensorRiskLevel): BittensorIntelligenceSignal["tone"] {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  if (risk === "low") return "good";
  return "muted";
}

function copilotAction(label: string, prompt: string, reason: string, riskLevel: BittensorRiskLevel): BittensorCopilotAction {
  return { label, prompt, reason, riskLevel };
}

function watchSuggestion(input: {
  kind: BittensorWatch["kind"];
  label: string;
  netuid?: number | null;
  ss58Address?: string | null;
  validatorHotkey?: string | null;
  threshold?: number | null;
  reason: string;
}): BittensorWatchSuggestion {
  return {
    kind: input.kind,
    label: input.label,
    netuid: input.netuid ?? null,
    ss58Address: input.ss58Address ?? null,
    validatorHotkey: input.validatorHotkey ?? null,
    threshold: input.threshold ?? null,
    reason: input.reason,
  };
}

function reportRating(score: number): BittensorSubnetIntelligenceReport["rating"] {
  if (score >= 75) return "strong_public_context";
  if (score >= 50) return "usable_with_caveats";
  return "limited_provider_context";
}

function subnetDataQualityRisk(detail: BittensorSubnetDetail): BittensorRiskLevel {
  if (detail.source === "curated-fallback") return "high";
  if (!detail.topValidators.length || detail.metagraphSummary.neurons === null) return "medium";
  if (!detail.freshness && detail.block === null && detail.block === undefined) return "medium";
  return "low";
}

function subnetIntelligenceScore(input: {
  detail: BittensorSubnetDetail;
  concentrationRisk: BittensorRiskLevel;
  dataQualityRisk: BittensorRiskLevel;
  capability: BittensorCapabilityManifest;
}): number {
  const { detail, concentrationRisk, dataQualityRisk, capability } = input;
  let score = 45;
  if (detail.source !== "curated-fallback") score += 12;
  if (detail.block !== null && detail.block !== undefined) score += 8;
  if (detail.freshness) score += 6;
  if (detail.priceTao !== null) score += 5;
  if (detail.emission !== null) score += 4;
  if (detail.metagraphSummary.neurons !== null) score += 6;
  if (detail.topValidators.length) score += 6;
  if (capability.capabilityLevel === "adapter_ready") score += 5;
  if (capability.capabilityLevel === "adapter_required") score += 2;
  if (concentrationRisk === "high") score -= 14;
  if (concentrationRisk === "medium") score -= 7;
  if (dataQualityRisk === "high") score -= 20;
  if (dataQualityRisk === "medium") score -= 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function analyzeBittensorSubnetIntelligence(netuid: number): Promise<BittensorSubnetIntelligenceReport> {
  let detail = subnetDetailFromSummary(fallbackSubnet(netuid));
  let detailReadWarning: string | null = null;
  try {
    detail = await bittensorProvider.getSubnet(netuid);
  } catch (err) {
    detailReadWarning = err instanceof Error ? err.message : "Live subnet detail read failed.";
  }
  const capability = capabilityFromSubnet(detail);
  const totalStake = detail.metagraphSummary.totalStake;
  const topStake = Math.max(0, ...detail.topValidators.map((validator) => validator.stake ?? 0));
  const topValidatorStakeShare = totalStake && totalStake > 0 && topStake > 0 ? topStake / totalStake : null;
  const concentrationRisk = riskFromShare(topValidatorStakeShare);
  const dataQualityRisk = subnetDataQualityRisk(detail);
  const score = subnetIntelligenceScore({ detail, concentrationRisk, dataQualityRisk, capability });
  const mechanismAvailable = false;
  const warnings = uniqueWarnings(
    detailReadWarning ? [`Live subnet detail read failed: ${detailReadWarning}. Showing reference subnet metadata instead.`] : [],
    detail.source === "curated-fallback" ? ["Live Bittensor data is unavailable; this report uses reference metadata."] : [],
    !detail.topValidators.length ? ["No validator sample was available for this subnet."] : [],
    detail.priceTao === null ? ["Dynamic TAO price was unavailable from the current provider."] : [],
    concentrationRisk === "high" ? ["The visible validator sample appears highly concentrated."] : [],
    concentrationRisk === "medium" ? ["The visible validator sample shows moderate concentration."] : [],
    !mechanismAvailable ? ["Mechanism-specific metagraph fields are not exposed by the current provider contract yet."] : [],
    ["This is public-data intelligence, not financial advice."],
  );
  const signals: BittensorIntelligenceSignal[] = [
    {
      label: "Provider quality",
      value: dataQualityRisk === "low" ? "Live-shaped" : dataQualityRisk === "medium" ? "Partial" : "Reference only",
      tone: riskTone(dataQualityRisk),
      explanation: "Scores whether the current provider returned live/fresh subnet and metagraph context.",
    },
    {
      label: "Validator concentration",
      value: topValidatorStakeShare === null ? "Unknown" : `${Math.round(topValidatorStakeShare * 100)}% top visible stake`,
      tone: riskTone(concentrationRisk),
      explanation: "Uses the largest visible validator stake share from the current metagraph sample.",
    },
    {
      label: "Adapter readiness",
      value: titleCase(capability.capabilityLevel.replace(/_/g, " ")),
      tone: capability.capabilityLevel === "adapter_ready" ? "good" : capability.capabilityLevel === "adapter_required" ? "warning" : "default",
      explanation: capability.adapterStatus.message,
    },
    {
      label: "Market context",
      value: detail.priceTao === null ? "Price unavailable" : `${formatMetric(detail.priceTao)} TAO price`,
      tone: detail.priceTao === null ? "muted" : "default",
      explanation: "Uses Dynamic TAO-style pricing fields when the provider exposes them.",
    },
  ];
  const copilotActions = [
    copilotAction(
      "Compare validators",
      `Compare validators on subnet ${detail.netuid} with a balanced strategy.`,
      "Validator comparison is the safest next step before any staking preview.",
      concentrationRisk,
    ),
    copilotAction(
      "Monitor subnet",
      `Monitor subnet ${detail.netuid} emissions and slippage.`,
      "A watch lets Matterhorn track public subnet changes without custody or signing.",
      dataQualityRisk === "high" ? "medium" : "low",
    ),
    copilotAction(
      "Prepare preview later",
      `Prepare staking 1 TAO on subnet ${detail.netuid} after I choose a validator hotkey.`,
      "Matterhorn should not guess validator hotkeys; previews stay unsigned and external-signer-only.",
      "medium",
    ),
  ];
  const watchSuggestions = [
    watchSuggestion({
      kind: "subnet",
      label: `Subnet ${detail.netuid} health`,
      netuid: detail.netuid,
      reason: "Track provider freshness, metagraph availability, and subnet-level market context.",
    }),
    watchSuggestion({
      kind: "emissions",
      label: `Subnet ${detail.netuid} emissions`,
      netuid: detail.netuid,
      threshold: detail.emission,
      reason: "Watch emission changes before interpreting validator or staking context.",
    }),
    watchSuggestion({
      kind: "slippage",
      label: `Subnet ${detail.netuid} Dynamic TAO slippage`,
      netuid: detail.netuid,
      reason: "Dynamic TAO price and liquidity can change staking preview outcomes.",
    }),
  ];

  return {
    kind: "subnet",
    netuid: detail.netuid,
    name: detail.name,
    category: detail.category,
    score,
    rating: reportRating(score),
    mechanismSummary: {
      available: mechanismAvailable,
      count: mechanismAvailable ? 1 : null,
      note: mechanismAvailable
        ? "Mechanism data is available from the provider."
        : "Current provider data is a subnet-level summary. Mechanism-specific metagraph support is a follow-up contract.",
    },
    market: {
      priceTao: detail.priceTao,
      emission: detail.emission,
      tempo: detail.tempo,
      source: detail.source,
      block: detail.block ?? detail.metagraphSummary.block ?? null,
      freshness: detail.freshness ?? null,
    },
    metagraph: {
      neurons: detail.metagraphSummary.neurons,
      totalStake,
      validatorsSampled: detail.topValidators.length,
      topValidatorStakeShare,
      concentrationRisk,
      dataQuality: dataQualityRisk,
    },
    capability: {
      capabilityLevel: capability.capabilityLevel,
      serviceAdapter: capability.serviceAdapter,
      adapterStatus: capability.adapterStatus,
      userBenefits: capability.userBenefits,
    },
    signals,
    warnings,
    nextQuestions: [
      `Compare validators on subnet ${detail.netuid}.`,
      `Monitor subnet ${detail.netuid} emissions and slippage.`,
      `Prepare staking 1 TAO on subnet ${detail.netuid} after I choose a validator hotkey.`,
    ],
    copilotActions,
    watchSuggestions,
    updatedAt: nowIso(),
  };
}

export async function analyzeBittensorWalletIntelligence(ss58Address: string): Promise<BittensorWalletIntelligenceReport> {
  const wallet = await bittensorProvider.getWallet(ss58Address);
  rememberBittensorWalletSnapshot(wallet);
  const positions = wallet.stakePositions;
  const stakeValues = positions.map((position) => position.taoValue).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const stakeTotalTao = stakeValues.length ? stakeValues.reduce((sum, value) => sum + value, 0) : null;
  const largestPosition = stakeValues.length ? Math.max(...stakeValues) : null;
  const largestPositionShare = stakeTotalTao && largestPosition !== null && stakeTotalTao > 0 ? largestPosition / stakeTotalTao : null;
  const subnetCount = new Set(positions.map((position) => position.netuid)).size;
  const validatorCount = new Set(positions.map((position) => position.validatorHotkey).filter(Boolean)).size;
  const concentrationRisk = riskFromShare(largestPositionShare);
  const slippageRisk = riskFromSlippagePositions(positions);
  const staleDataRisk: BittensorRiskLevel = wallet.providerStatus !== "ok"
    ? "high"
    : !wallet.freshness && wallet.block === null
      ? "medium"
      : "low";
  const largestPositions = [...positions]
    .sort((a, b) => (b.taoValue ?? 0) - (a.taoValue ?? 0))
    .slice(0, 5);
  const validatorExposureMap = new Map<string, { taoValue: number; netuids: Set<number> }>();
  for (const position of positions) {
    if (!position.validatorHotkey) continue;
    const existing = validatorExposureMap.get(position.validatorHotkey) ?? { taoValue: 0, netuids: new Set<number>() };
    existing.taoValue += position.taoValue ?? 0;
    existing.netuids.add(position.netuid);
    validatorExposureMap.set(position.validatorHotkey, existing);
  }
  const validatorExposure = [...validatorExposureMap.entries()]
    .map(([validatorHotkey, exposure]) => {
      const share = stakeTotalTao && stakeTotalTao > 0 ? exposure.taoValue / stakeTotalTao : null;
      const netuids = [...exposure.netuids].sort((a, b) => a - b);
      return {
        validatorHotkey,
        taoValue: stakeValues.length ? exposure.taoValue : null,
        subnetCount: netuids.length,
        netuids,
        share,
        risk: riskFromShare(share),
        prompt: `Compare validator ${validatorHotkey} on subnet ${netuids[0] ?? 0}.`,
      };
    })
    .sort((a, b) => (b.taoValue ?? 0) - (a.taoValue ?? 0))
    .slice(0, 5);
  const warnings = uniqueWarnings(
    wallet.providerStatus === "ok" ? [] : [wallet.message ?? "Wallet provider data is unavailable."],
    concentrationRisk === "high" ? ["Wallet stake appears concentrated in one visible position."] : [],
    concentrationRisk === "medium" ? ["Wallet stake has moderate visible concentration."] : [],
    slippageRisk === "high" ? ["At least one visible position has high slippage risk."] : [],
    slippageRisk === "medium" ? ["At least one visible position has medium slippage risk."] : [],
    staleDataRisk !== "low" ? ["Wallet data freshness is limited from the current provider."] : [],
    ["This is watch-only public wallet intelligence, not financial advice."],
    wallet.warnings ?? [],
  );
  const signals: BittensorIntelligenceSignal[] = [
    {
      label: "Stake concentration",
      value: largestPositionShare === null ? "Unknown" : `${Math.round(largestPositionShare * 100)}% largest position`,
      tone: riskTone(concentrationRisk),
      explanation: "Largest visible stake position as a share of visible staked TAO value.",
    },
    {
      label: "Subnet spread",
      value: `${subnetCount} subnet${subnetCount === 1 ? "" : "s"}`,
      tone: subnetCount > 1 ? "good" : subnetCount === 1 ? "warning" : "muted",
      explanation: "Counts distinct subnets returned by the watch-only wallet provider.",
    },
    {
      label: "Validator spread",
      value: `${validatorCount} validator hotkey${validatorCount === 1 ? "" : "s"}`,
      tone: validatorCount > 1 ? "good" : validatorCount === 1 ? "warning" : "muted",
      explanation: "Counts distinct validator hotkeys returned by the watch-only wallet provider.",
    },
    {
      label: "Data freshness",
      value: wallet.freshness ?? "Unavailable",
      tone: riskTone(staleDataRisk),
      explanation: "Uses provider freshness and block labels where available.",
    },
  ];
  const topPosition = largestPositions[0] ?? null;
  const topValidator = validatorExposure[0] ?? null;
  const copilotActions = [
    copilotAction(
      "Show stake positions",
      "Where am I staked?",
      "Start by inspecting the visible positions that drive this wallet report.",
      staleDataRisk,
    ),
    ...(topPosition ? [
      copilotAction(
        "Compare largest subnet",
        `Compare validators on subnet ${topPosition.netuid} with a balanced strategy.`,
        "The largest visible subnet exposure is the best first place to inspect validator options.",
        concentrationRisk,
      ),
    ] : []),
    ...(topValidator ? [
      copilotAction(
        "Inspect top validator",
        `Compare validator ${topValidator.validatorHotkey} on subnet ${topValidator.netuids[0] ?? topPosition?.netuid ?? 0}.`,
        "This validator has the largest visible share of the wallet's staked TAO exposure.",
        topValidator.risk,
      ),
    ] : []),
    copilotAction(
      "Create watches",
      "Create watches for my riskiest Bittensor positions.",
      "Watches preserve context and track public changes without signing or custody.",
      concentrationRisk === "unknown" ? staleDataRisk : concentrationRisk,
    ),
  ];
  const watchSuggestions = [
    watchSuggestion({
      kind: "wallet",
      label: `Wallet ${shortSs58(wallet.ss58Address)} exposure`,
      ss58Address: wallet.ss58Address,
      threshold: wallet.estimatedValueTao,
      reason: "Track wallet-level public balance and stake-position availability.",
    }),
    ...(topPosition ? [
      watchSuggestion({
        kind: topPosition.slippageRisk === "high" || topPosition.slippageRisk === "medium" ? "slippage" as const : "subnet" as const,
        label: `Subnet ${topPosition.netuid} largest position`,
        netuid: topPosition.netuid,
        ss58Address: wallet.ss58Address,
        threshold: topPosition.taoValue,
        reason: "Largest visible position by TAO value.",
      }),
    ] : []),
    ...(topValidator ? [
      watchSuggestion({
        kind: "validator",
        label: `Validator ${shortSs58(topValidator.validatorHotkey)} exposure`,
        netuid: topValidator.netuids[0] ?? null,
        ss58Address: wallet.ss58Address,
        validatorHotkey: topValidator.validatorHotkey,
        threshold: topValidator.share,
        reason: "Largest visible validator hotkey exposure.",
      }),
    ] : []),
  ];

  return {
    kind: "wallet",
    ss58Address: wallet.ss58Address,
    freeTao: wallet.taoBalance,
    stakeTotalTao,
    estimatedValueTao: wallet.estimatedValueTao,
    subnetCount,
    validatorCount,
    largestPositionShare,
    concentrationRisk,
    slippageRisk,
    staleDataRisk,
    largestPositions,
    validatorExposure,
    signals,
    warnings,
    nextQuestions: [
      "Where am I staked?",
      "Create watches for my riskiest Bittensor positions.",
      "Compare validators for my largest subnet exposure.",
    ],
    copilotActions,
    watchSuggestions,
    source: wallet.source ?? "provider",
    block: wallet.block ?? null,
    freshness: wallet.freshness ?? null,
    updatedAt: nowIso(),
  };
}

export function listBittensorWatches(ownerScope?: string): BittensorWatch[] {
  loadPersistedWatchlist();
  return [...watchlist.values()]
    .filter((watch) => ownerScope ? watch.ownerScope === ownerScope : !watch.ownerScope)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function clearBittensorWatches(): number {
  loadPersistedWatchlist();
  const cleared = watchlist.size;
  watchlist.clear();
  persistWatchlist();
  return cleared;
}

export function createBittensorWatch(
  input: Partial<BittensorWatch>,
  ownerScope?: string,
): BittensorWatch {
  loadPersistedWatchlist();
  const id = `bt-watch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const watch: BittensorWatch = {
    id,
    ...(ownerScope ? { ownerScope } : {}),
    kind: input.kind ?? "subnet",
    label: input.label?.trim() || "Bittensor watch",
    netuid: typeof input.netuid === "number" && Number.isInteger(input.netuid) ? input.netuid : null,
    ss58Address: input.ss58Address && isValidSs58Address(input.ss58Address) ? input.ss58Address : null,
    validatorHotkey: input.validatorHotkey && isValidSs58Address(input.validatorHotkey) ? input.validatorHotkey : null,
    threshold: typeof input.threshold === "number" && Number.isFinite(input.threshold) ? input.threshold : null,
    reason: input.reason?.trim() || null,
    lastAlertAt: input.lastAlertAt ?? null,
    createdAt: nowIso(),
  };
  watchlist.set(id, watch);
  persistWatchlist();
  return watch;
}

function compareThreshold(observedValue: number | null, threshold: number | null, mode: "min" | "max"): BittensorWatchEvaluation["status"] {
  if (observedValue === null) return "unavailable";
  if (threshold === null) return "ok";
  return mode === "min"
    ? observedValue >= threshold ? "ok" : "warning"
    : observedValue <= threshold ? "ok" : "warning";
}

function actionPromptForWatch(watch: BittensorWatch): string | null {
  if (watch.kind === "wallet" && watch.ss58Address) return `Analyze my TAO portfolio risk for ${watch.ss58Address}.`;
  if (watch.kind === "validator" && watch.validatorHotkey && watch.netuid !== null) {
    return `Deep dive validator ${watch.validatorHotkey} on subnet ${watch.netuid}.`;
  }
  if ((watch.kind === "subnet" || watch.kind === "emissions" || watch.kind === "slippage") && watch.netuid !== null) {
    return `Analyze risk on subnet ${watch.netuid}.`;
  }
  return null;
}

function alertKeyForWatch(watch: BittensorWatch): string {
  return [
    watch.kind,
    watch.netuid ?? "any-subnet",
    watch.ss58Address ? shortSs58(watch.ss58Address) : "no-wallet",
    watch.validatorHotkey ? shortSs58(watch.validatorHotkey) : "no-validator",
  ].join(":");
}

function notificationIntentForWatch(watch: BittensorWatch, status: BittensorWatchEvaluation["status"]): NonNullable<BittensorWatchEvaluation["notificationIntent"]> {
  if (status === "ok") return "none";
  if (watch.kind === "wallet") return "review_wallet";
  if (watch.kind === "validator") return "review_validator";
  if (watch.kind === "emissions") return "review_emissions";
  if (watch.kind === "slippage") return "review_slippage";
  return "review_subnet";
}

function watchEvaluationCopilotActions(evaluation: BittensorWatchEvaluation, alertLevel: BittensorRiskLevel): BittensorCopilotAction[] {
  const watch = evaluation.watch;
  const actions: BittensorCopilotAction[] = [];
  const actionPrompt = evaluation.actionPrompt ?? actionPromptForWatch(watch);

  if (actionPrompt) {
    actions.push(copilotAction(
      evaluation.status === "ok" ? "Inspect watch context" : "Investigate alert",
      actionPrompt,
      evaluation.status === "ok"
        ? "Open the Bittensor analysis behind this watch before changing any position."
        : "Start with the relevant Bittensor intelligence view before preparing any action.",
      alertLevel,
    ));
  }

  if (watch.kind === "wallet" && watch.ss58Address) {
    actions.push(copilotAction(
      "Explain wallet exposure",
      `Explain my Bittensor wallet ${watch.ss58Address}, what changed, and what I should monitor next.`,
      "Wallet watches should turn into a portfolio explanation, not only a balance alert.",
      alertLevel,
    ));
  }

  if (watch.kind === "validator" && watch.validatorHotkey && watch.netuid !== null) {
    actions.push(copilotAction(
      "Compare validator options",
      `Compare validator ${watch.validatorHotkey} on subnet ${watch.netuid} and show safer alternatives if the public sample supports it.`,
      "Validator alerts should lead to public-data comparison before any staking decision.",
      alertLevel,
    ));
  }

  if ((watch.kind === "subnet" || watch.kind === "emissions" || watch.kind === "slippage") && watch.netuid !== null) {
    actions.push(copilotAction(
      "Refresh subnet intelligence",
      `Analyze subnet ${watch.netuid} and explain current risk, emissions, slippage, validator concentration, and source freshness.`,
      "Subnet alerts should refresh the full public-data picture before the user acts.",
      alertLevel,
    ));
  }

  if (watch.kind === "slippage" && watch.netuid !== null) {
    actions.push(copilotAction(
      "Prepare fresh preview",
      `Prepare a fresh unsigned Bittensor staking preview for subnet ${watch.netuid} only after I provide the amount, coldkey, and validator hotkey.`,
      "Slippage alerts should push the user toward a fresh unsigned preview and explicit context, not stale action data.",
      alertLevel,
    ));
  }

  if (evaluation.status !== "ok") {
    actions.push(copilotAction(
      "Check alerts again",
      "Check my Bittensor alerts again and explain which watches still need attention.",
      "A second check confirms whether the alert is still present before the user escalates.",
      alertLevel,
    ));
  }

  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.prompt)) return false;
    seen.add(action.prompt);
    return true;
  }).slice(0, 5);
}

function finalizeWatchEvaluation(evaluation: BittensorWatchEvaluation): BittensorWatchEvaluation {
  const alertLevel: BittensorRiskLevel =
    evaluation.status === "warning" ? "medium" :
    evaluation.status === "unavailable" ? "high" :
    "low";
  const actionPrompt = evaluation.actionPrompt ?? actionPromptForWatch(evaluation.watch);
  const next = {
    ...evaluation,
    alertLevel,
    actionPrompt,
    copilotActions: evaluation.copilotActions?.length
      ? evaluation.copilotActions
      : watchEvaluationCopilotActions({ ...evaluation, alertLevel, actionPrompt }, alertLevel),
    alertKey: evaluation.alertKey ?? alertKeyForWatch(evaluation.watch),
    shouldNotify: evaluation.shouldNotify ?? evaluation.status !== "ok",
    notificationIntent: evaluation.notificationIntent ?? notificationIntentForWatch(evaluation.watch, evaluation.status),
  };
  if (next.status !== "ok") {
    const existing = watchlist.get(next.watch.id);
    if (existing) {
      existing.lastAlertAt = next.checkedAt;
      watchlist.set(existing.id, existing);
      persistWatchlist();
      next.watch = existing;
    }
  }
  return next;
}

export async function evaluateBittensorWatch(watch: BittensorWatch): Promise<BittensorWatchEvaluation> {
  const checkedAt = nowIso();
  if (watch.kind === "wallet") {
    if (!watch.ss58Address) {
      return finalizeWatchEvaluation({
        watch,
        status: "unavailable",
        summary: "Wallet watch needs an SS58 coldkey public address.",
        observedValue: null,
        threshold: watch.threshold,
        source: "matterhorn",
        checkedAt,
      });
    }
    const wallet = await bittensorProvider.getWallet(watch.ss58Address);
    const status = wallet.providerStatus === "ok" ? compareThreshold(wallet.estimatedValueTao, watch.threshold, "max") : "unavailable";
    return finalizeWatchEvaluation({
      watch,
      status,
      summary: wallet.providerStatus === "ok"
        ? status === "warning"
          ? `Wallet estimated value is above the configured alert threshold across ${wallet.stakePositions.length} position(s).`
          : `Wallet has ${wallet.stakePositions.length} subnet stake position(s).`
        : wallet.message ?? "Wallet provider data is unavailable.",
      observedValue: wallet.estimatedValueTao,
      threshold: watch.threshold,
      source: wallet.providerStatus === "ok" ? "provider" : "matterhorn",
      checkedAt,
    });
  }

  if (watch.netuid === null) {
    return finalizeWatchEvaluation({
      watch,
      status: "unavailable",
      summary: "This watch needs a subnet netuid before it can be checked.",
      observedValue: null,
      threshold: watch.threshold,
      source: "matterhorn",
      checkedAt,
    });
  }

  const subnet = await bittensorProvider.getSubnet(watch.netuid);
  if (watch.kind === "emissions") {
    const status = compareThreshold(subnet.emission, watch.threshold, "min");
    return finalizeWatchEvaluation({
      watch,
      status,
      summary: subnet.emission === null
        ? `Emission data for ${subnet.name} is unavailable.`
        : status === "warning"
          ? `${subnet.name} emission is below the configured threshold.`
          : `${subnet.name} emission is within the configured range.`,
      observedValue: subnet.emission,
      threshold: watch.threshold,
      source: subnet.source,
      checkedAt,
    });
  }

  if (watch.kind === "slippage") {
    const status = compareThreshold(subnet.priceTao, watch.threshold, "max");
    return finalizeWatchEvaluation({
      watch,
      status,
      summary: subnet.priceTao === null
        ? `Live alpha price for ${subnet.name} is unavailable; quote-specific slippage cannot be inferred.`
        : status === "warning"
          ? `${subnet.name} alpha price moved above the configured alert threshold. Build a fresh preview before staking.`
        : `${subnet.name} alpha price is ${subnet.priceTao} TAO. Build an action preview for quote-specific slippage.`,
      observedValue: subnet.priceTao,
      threshold: watch.threshold,
      source: subnet.source,
      checkedAt,
    });
  }

  if (watch.kind === "validator") {
    const target = watch.validatorHotkey ?? watch.ss58Address;
    const match = target
      ? subnet.topValidators.find((validator) => validator.hotkey === target || validator.coldkey === target)
      : null;
    return finalizeWatchEvaluation({
      watch,
      status: target && match ? "ok" : target ? "warning" : "unavailable",
      summary: target
        ? match
          ? `Validator ${shortSs58(target)} appears in the top validator sample for ${subnet.name}.`
          : `Validator ${shortSs58(target)} was not found in the top validator sample for ${subnet.name}.`
        : "Validator watch needs a hotkey or coldkey public address.",
      observedValue: match?.stake ?? null,
      threshold: watch.threshold,
      source: subnet.source,
      checkedAt,
    });
  }

  return finalizeWatchEvaluation({
    watch,
    status: subnet.source === "curated-fallback" ? "warning" : "ok",
    summary: subnet.source === "curated-fallback"
      ? `Reference metadata is available for ${subnet.name}; live metrics are unavailable.`
      : `${subnet.name} metadata is available from ${subnet.source}.`,
    observedValue: subnet.metagraphSummary.neurons ?? subnet.emission ?? subnet.priceTao,
    threshold: watch.threshold,
    source: subnet.source,
    checkedAt,
  });
}

export async function evaluateBittensorWatches(ownerScope?: string): Promise<BittensorWatchEvaluation[]> {
  const watches = listBittensorWatches(ownerScope);
  return Promise.all(watches.map((watch) => evaluateBittensorWatch(watch)));
}

function summarizeWatchEvaluationForDigest(evaluation: BittensorWatchEvaluation) {
  const firstAction = evaluation.copilotActions?.[0] ?? null;
  return {
    status: evaluation.status,
    alertLevel: evaluation.alertLevel ?? "unknown",
    alertKey: evaluation.alertKey ?? alertKeyForWatch(evaluation.watch),
    notificationIntent: evaluation.notificationIntent ?? notificationIntentForWatch(evaluation.watch, evaluation.status),
    shouldNotify: evaluation.shouldNotify ?? evaluation.status !== "ok",
    watchId: evaluation.watch.id,
    kind: evaluation.watch.kind,
    label: evaluation.watch.label,
    netuid: evaluation.watch.netuid,
    ss58Address: evaluation.watch.ss58Address,
    validatorHotkey: evaluation.watch.validatorHotkey,
    observedValue: evaluation.observedValue,
    threshold: evaluation.threshold,
    reason: evaluation.summary,
    prompt: firstAction?.prompt ?? evaluation.actionPrompt ?? null,
    actionLabel: firstAction?.label ?? null,
    source: evaluation.source,
    checkedAt: evaluation.checkedAt,
  };
}

export function buildBittensorWatchDigest(
  evaluations: BittensorWatchEvaluation[],
  options: { maxAlerts?: number | null; includeOk?: boolean } = {},
) {
  const maxAlerts = Math.max(1, Math.min(50, Math.floor(Number(options.maxAlerts ?? 10) || 10)));
  const statusCounts = evaluations.reduce<Record<string, number>>((counts, evaluation) => {
    const status = evaluation.status || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  const alertLike = evaluations.filter((evaluation) => evaluation.status !== "ok");
  const okLike = options.includeOk === true
    ? evaluations.filter((evaluation) => evaluation.status === "ok")
    : [];
  const alerts = [...alertLike, ...okLike].slice(0, maxAlerts).map(summarizeWatchEvaluationForDigest);
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    total: evaluations.length,
    alertCount: alertLike.length,
    statusCounts,
    alerts,
    source: "bittensor.monitoring.digest",
  };
}

function readinessStatus(checks: BittensorReadinessCheck[]): BittensorReadinessReport["status"] {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "pass";
}

function secretFieldPath(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = secretFieldPath(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(seed|mnemonic|private|secret|password|passphrase|keyfile|suri)/i.test(key)) return [...path, key].join(".");
    const nested = secretFieldPath(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}


function normalizeProviderReviewStatus(value: unknown): BittensorSubnetAdapterProviderRegistryEntry["reviewStatus"] {
  return value === "reviewed" || value === "blocked" || value === "candidate" ? value : "candidate";
}

function providerRegistryEvidenceFromRecord(record: Record<string, unknown>): BittensorSubnetAdapterProviderRegistryEvidence {
  const evidence = asRecord(record["evidence"] ?? record["review"]);
  return {
    providerIdentityReviewed: evidence["providerIdentityReviewed"] === true || evidence["provider_identity_reviewed"] === true,
    privacyReviewed: evidence["privacyReviewed"] === true || evidence["privacy_reviewed"] === true,
    termsReviewed: evidence["termsReviewed"] === true || evidence["terms_reviewed"] === true,
    rateLimitsDocumented: evidence["rateLimitsDocumented"] === true || evidence["rate_limits_documented"] === true,
    rollbackOwnerConfirmed: evidence["rollbackOwnerConfirmed"] === true || evidence["rollback_owner_confirmed"] === true,
    canaryFixtureReviewed: evidence["canaryFixtureReviewed"] === true || evidence["canary_fixture_reviewed"] === true,
  };
}

function providerRegistryAdaptersFromValue(value: unknown): Array<Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">> {
  const rawValues = (Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  const adapters: Array<Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">> = [];
  for (const raw of rawValues) {
    const adapter = normalizeServiceAdapter(raw, "unsupported");
    if (directSubnetAdapterKind(adapter) && !adapters.includes(adapter)) adapters.push(adapter);
  }
  return adapters;
}

function providerRegistryNetuidsFromValue(value: unknown): number[] {
  const rawValues = Array.isArray(value) ? value : typeof value === "number" || typeof value === "string" ? [value] : [];
  return rawValues
    .map((item) => typeof item === "number" ? item : Number(item))
    .filter((item, index, all) => Number.isInteger(item) && item >= 0 && all.indexOf(item) === index);
}

function providerRegistryOrigin(value: unknown): { origin: string | null; error: string | null } {
  if (typeof value !== "string" || !value.trim()) return { origin: null, error: null };
  try {
    const parsed = new URL(value.trim());
    const hasPathOrSecretShape = parsed.pathname !== "/" || parsed.search.length > 0 || parsed.hash.length > 0;
    if (parsed.protocol !== "https:") return { origin: parsed.origin, error: "Provider endpoint origin must use https." };
    if (hasPathOrSecretShape) return { origin: parsed.origin, error: "Provider endpointOrigin must be an origin only, without paths, query strings, fragments, or tokens." };
    return { origin: parsed.origin, error: null };
  } catch {
    return { origin: null, error: "Provider endpointOrigin must be a valid HTTPS origin." };
  }
}

function buildProviderRegistryEntry(input: unknown, index: number): BittensorSubnetAdapterProviderRegistryEntry {
  const record = asRecord(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  const forbiddenField = secretFieldPath(record);
  const forbiddenProviderField = Object.keys(record).find((key) => /(api[_-]?key|token|authorization|credential|secret|password)/i.test(key));
  const forbiddenValue = secretValuePath(record);
  if (forbiddenField) errors.push("Provider registry entry contains a secret-shaped field at " + forbiddenField + ".");
  if (forbiddenProviderField) errors.push("Provider registry entry contains a secret-shaped field at " + forbiddenProviderField + ".");
  if (forbiddenValue) errors.push("Provider registry entry contains a secret-shaped value at " + forbiddenValue + ".");
  const providerId = firstString(record, ["providerId", "provider_id", "id", "slug"]) ?? "provider-" + (index + 1);
  const displayName = firstString(record, ["displayName", "display_name", "name"]) ?? providerId;
  const reviewStatus = normalizeProviderReviewStatus(record["reviewStatus"] ?? record["status"]);
  const serviceAdapters = providerRegistryAdaptersFromValue(record["serviceAdapters"] ?? record["service_adapters"] ?? record["adapter"] ?? record["serviceAdapter"]);
  const netuids = providerRegistryNetuidsFromValue(record["netuids"] ?? record["netuid"]);
  const origin = providerRegistryOrigin(record["endpointOrigin"] ?? record["endpoint_origin"] ?? record["origin"]);
  const websiteOrigin = providerRegistryOrigin(record["website"]);
  const contact = firstString(record, ["contact", "contactEmail", "contact_email", "rollbackOwner", "rollback_owner"]);
  const evidence = providerRegistryEvidenceFromRecord(record);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(providerId)) errors.push("providerId must be 3-64 characters and use letters, numbers, dots, underscores, or hyphens.");
  if (!serviceAdapters.length) errors.push("At least one direct service adapter kind is required.");
  if (!netuids.length) warnings.push("No target netuids are declared yet.");
  if (origin.error) errors.push(origin.error);
  if (websiteOrigin.error) warnings.push(websiteOrigin.error);
  if (!contact) warnings.push("Provider contact or rollback owner is not declared.");
  const evidenceComplete = Object.values(evidence).every(Boolean);
  if (!evidenceComplete) warnings.push("Provider evidence is incomplete; keep this provider in candidate review.");
  const readyForCanary = errors.length === 0 && reviewStatus === "reviewed" && evidenceComplete;
  return {
    providerId,
    displayName,
    reviewStatus,
    serviceAdapters,
    netuids,
    endpointOrigin: origin.origin,
    website: websiteOrigin.origin,
    contact,
    evidence,
    readyForCanary,
    errors,
    warnings,
  };
}

export function buildBittensorSubnetAdapterProviderRegistryTemplate(input: {
  providerId?: string | null;
  displayName?: string | null;
  adapter?: string | null;
  netuid?: number | null;
} = {}): BittensorSubnetAdapterProviderRegistryTemplate {
  const adapter = directSubnetAdapterKind(normalizeServiceAdapter(input.adapter, "data_search"))
    ? normalizeServiceAdapter(input.adapter, "data_search") as Exclude<BittensorSubnetServiceAdapterKind, "universal" | "unsupported">
    : "data_search";
  const netuid = Number.isInteger(input.netuid ?? null) && Number(input.netuid) >= 0 ? Number(input.netuid) : 18;
  const rawProvider = {
    providerId: input.providerId?.trim() || "reviewed-provider-example",
    displayName: input.displayName?.trim() || "Reviewed provider example",
    reviewStatus: "candidate",
    serviceAdapters: [adapter],
    netuids: [netuid],
    endpointOrigin: "https://adapter-provider.example",
    website: "https://adapter-provider.example",
    contact: "ops@example.com",
    evidence: {
      providerIdentityReviewed: false,
      privacyReviewed: false,
      termsReviewed: false,
      rateLimitsDocumented: false,
      rollbackOwnerConfirmed: false,
      canaryFixtureReviewed: false,
    },
  };
  const provider = buildProviderRegistryEntry(rawProvider, 0);
  return {
    kind: "bittensor_subnet_adapter_provider_registry_template",
    generatedAt: nowIso(),
    env: {
      key: "BITTENSOR_SUBNET_ADAPTER_PROVIDER_REGISTRY_JSON",
      value: JSON.stringify([rawProvider], null, 2),
    },
    provider,
    warnings: ["This template is provider-review evidence only and does not configure or invoke a subnet service adapter."],
    nextActions: [
      "Replace placeholder provider identity, contact, netuids, adapter kind, and endpoint origin.",
      "Mark review evidence true only after human review of provider identity, privacy, terms, rate limits, rollback owner, and canary fixture.",
      "Run the provider registry audit before generating any real adapter canary packet.",
    ],
  };
}


function summarizeBittensorSubnetAdapterProviderRegistry(input: {
  adapter?: BittensorCapabilityManifest["serviceAdapter"] | string | null;
  netuid?: number | null;
}): BittensorSubnetAdapterProviderRegistryReference {
  const registry = getBittensorSubnetAdapterProviderRegistry();
  const adapter = normalizeServiceAdapter(input.adapter, "unsupported");
  const hasDirectAdapter = directSubnetAdapterKind(adapter);
  const netuid = Number.isInteger(input.netuid ?? null) && Number(input.netuid) >= 0 ? Number(input.netuid) : null;
  const matching = registry.entries.filter((entry) => {
    if (!entry.readyForCanary) return false;
    if (hasDirectAdapter && !entry.serviceAdapters.includes(adapter)) return false;
    if (netuid !== null && !entry.netuids.includes(netuid)) return false;
    return true;
  });
  const warnings = uniqueWarnings(
    registry.warnings,
    matching.length
      ? ["Matching reviewed provider evidence exists, but this does not authorize real subnet execution."]
      : ["No matching canary-ready provider registry entry was found for the requested adapter/netuid."],
  );
  return {
    status: registry.status,
    providerCount: registry.providerCount,
    readyForCanaryCount: registry.readyForCanaryCount,
    matchingReadyProviderCount: matching.length,
    matchingProviderIds: matching.map((entry) => entry.providerId).slice(0, 5),
    warnings,
    nextActions: matching.length
      ? ["Use provider registry evidence as review context only; keep canary gate, exact request-hash approval, and user confirmation separate."]
      : ["Add or review a provider registry entry before treating a real adapter canary as provider-reviewed."],
  };
}

export function getBittensorSubnetAdapterProviderRegistry(): BittensorSubnetAdapterProviderRegistry {
  const generatedAt = nowIso();
  const template = buildBittensorSubnetAdapterProviderRegistryTemplate();
  const raw = readEnv("BITTENSOR_SUBNET_ADAPTER_PROVIDER_REGISTRY_JSON");
  if (!raw) {
    return {
      kind: "bittensor_subnet_adapter_provider_registry",
      generatedAt,
      status: "empty",
      configured: false,
      providerCount: 0,
      readyForCanaryCount: 0,
      blockedCount: 0,
      entries: [],
      template,
      warnings: ["No Bittensor subnet adapter provider registry is configured."],
      nextActions: ["Copy the provider registry template, complete human evidence review, then rerun this audit."],
    };
  }
  let parsed: unknown[];
  let parseError: string | null = null;
  try {
    const value = JSON.parse(raw);
    parsed = Array.isArray(value) ? value : [];
    if (!Array.isArray(value)) parseError = "Provider registry JSON must be an array.";
  } catch {
    parsed = [];
    parseError = "Provider registry JSON could not be parsed.";
  }
  const entries = parsed.map((entry, index) => buildProviderRegistryEntry(entry, index));
  const readyForCanaryCount = entries.filter((entry) => entry.readyForCanary).length;
  const blockedCount = entries.filter((entry) => entry.errors.length > 0 || entry.reviewStatus === "blocked").length;
  const warnings = uniqueWarnings(
    parseError ? [parseError] : [],
    entries.flatMap((entry) => entry.warnings.map((warning) => entry.providerId + ": " + warning)),
    entries.flatMap((entry) => entry.errors.map((error) => entry.providerId + ": " + error)),
    readyForCanaryCount ? ["Provider registry has reviewed provider candidates, but this does not authorize real subnet execution."] : [],
  );
  const status: BittensorSubnetAdapterProviderRegistry["status"] = parseError || blockedCount
    ? "blocked"
    : entries.length === 0
      ? "empty"
      : readyForCanaryCount > 0
        ? "ready_for_canary"
        : "needs_review";
  return {
    kind: "bittensor_subnet_adapter_provider_registry",
    generatedAt,
    status,
    configured: true,
    providerCount: entries.length,
    readyForCanaryCount,
    blockedCount,
    entries,
    template,
    warnings,
    nextActions: status === "ready_for_canary"
      ? ["Use reviewed provider entries as evidence input only; keep canary gates and exact request-hash approval separate.", "Audit the real-adapter canary gate before and after any canary."]
      : status === "blocked"
        ? ["Fix provider registry errors before using any provider entry in a canary packet."]
        : ["Complete provider identity, privacy, terms, rate-limit, rollback, and canary-fixture review."],
  };
}

export async function auditBittensorReadiness(): Promise<BittensorReadinessReport> {
  const checks: BittensorReadinessCheck[] = [];
  const checkedAt = nowIso();

  try {
    const samples: Array<[string, BittensorChatIntent]> = [
      ["I'm new to Bittensor, explain coldkeys and hotkeys", "learn"],
      ["Which subnet helps with image generation?", "discover"],
      ["Show my Bittensor wallet", "wallet"],
      ["Stake 1 TAO to subnet 14 safely", "stake_plan"],
      ["Use subnet 14 for this task", "subnet_use"],
      ["Monitor subnet 14 emissions", "monitor"],
    ];
    const plans = samples.map(([message]) => planBittensorChat({ message }));
    const mismatches = plans.flatMap((plan, index) => plan.intent === samples[index]?.[1] ? [] : [`${samples[index]?.[0]} -> ${plan.intent}`]);
    checks.push({
      id: "chat_intents",
      label: "Chat intent planner",
      status: mismatches.length ? "fail" : "pass",
      summary: mismatches.length ? "Some Bittensor chat intents classified incorrectly." : "Core Bittensor chat intents classify into deterministic workflows.",
      details: { mismatches, intents: plans.map((plan) => plan.intent) },
    });
  } catch (err) {
    checks.push({ id: "chat_intents", label: "Chat intent planner", status: "fail", summary: err instanceof Error ? err.message : "Intent planner failed." });
  }

  try {
    const result = await executeBittensorChatWorkflow({ message: "explain Bittensor context memory" });
    const disallowed = secretFieldPath(result.context);
    checks.push({
      id: "chat_context",
      label: "Public chat context",
      status: result.context && !disallowed ? "pass" : "fail",
      summary: result.context && !disallowed
        ? "Bittensor chat returns reusable public context without signing-material fields."
        : "Bittensor chat context was missing or carried a disallowed field.",
      details: { contextId: result.context?.id ?? null, disallowed },
    });
  } catch (err) {
    checks.push({ id: "chat_context", label: "Public chat context", status: "fail", summary: err instanceof Error ? err.message : "Chat context audit failed." });
  }

  let subnets: BittensorSubnetSummary[] = [];
  try {
    subnets = await bittensorProvider.listSubnets();
    const fallbackOnly = subnets.length > 0 && subnets.every((subnet) => subnet.source === "curated-fallback");
    const providerBacked = subnets.filter((subnet) => subnet.source !== "curated-fallback");
    const providerBackedWithFreshness = providerBacked.filter((subnet) => (subnet.block !== null && subnet.block !== undefined) || Boolean(subnet.freshness));
    checks.push({
      id: "subnet_discovery",
      label: "Subnet discovery",
      status: subnets.length ? fallbackOnly ? "warning" : "pass" : "fail",
      summary: subnets.length
        ? fallbackOnly
          ? "Subnet discovery is available, but only reference metadata is loaded."
          : "Subnet discovery returned live or provider-backed subnet metadata."
        : "Subnet discovery returned no subnets.",
      details: { count: subnets.length, sources: [...new Set(subnets.map((subnet) => subnet.source))] },
    });
    checks.push({
      id: "live_read_freshness",
      label: "Live-read freshness",
      status: providerBacked.length === 0 ? "warning" : providerBackedWithFreshness.length ? "pass" : "warning",
      summary: providerBacked.length === 0
        ? "No provider-backed subnet freshness was available; Matterhorn will label reference data clearly."
        : providerBackedWithFreshness.length
          ? "Provider-backed subnet metadata includes block or freshness labels for chat cards."
          : "Provider-backed subnet metadata is available but does not include block or freshness labels.",
      details: {
        providerBacked: providerBacked.length,
        withFreshness: providerBackedWithFreshness.length,
        fallback: subnets.length - providerBacked.length,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_discovery", label: "Subnet discovery", status: "fail", summary: err instanceof Error ? err.message : "Subnet discovery failed." });
  }

  try {
    const capabilities = subnets.length ? subnets.map(capabilityFromSubnet) : await listBittensorCapabilities();
    const missingUniversal = capabilities.filter((capability) =>
      !capability.supportedChatIntents.includes("learn") ||
      !capability.supportedChatIntents.includes("discover") ||
      !capability.supportedChatIntents.includes("wallet") ||
      !capability.supportedChatIntents.includes("stake_plan") ||
      !capability.supportedChatIntents.includes("monitor")
    );
    const missingV2Fields = capabilities.filter((capability) =>
      !capability.capabilityLevel ||
      !Array.isArray(capability.userBenefits) ||
      !capability.userBenefits.length ||
      !Array.isArray(capability.examplePrompts) ||
      !capability.examplePrompts.length ||
      !capability.adapterStatus ||
      !capability.dataFreshness
    );
    const missingServiceMarketplaceFields = capabilities.filter((capability) =>
      !capability.supportedChatIntents.includes("subnet_use") ||
      !capability.requiredAuth ||
      !capability.costModel ||
      !capability.adapterStatus?.message ||
      !capability.requestSchema ||
      typeof capability.requestSchema !== "object" ||
      Array.isArray(capability.requestSchema) ||
      !capability.resultSchema ||
      typeof capability.resultSchema !== "object" ||
      Array.isArray(capability.resultSchema) ||
      !Array.isArray(capability.safetyNotes) ||
      !capability.safetyNotes.length ||
      Boolean(secretFieldPath(capability))
    );
    checks.push({
      id: "capabilities",
      label: "Subnet capability registry",
      status: missingUniversal.length || missingV2Fields.length || missingServiceMarketplaceFields.length ? "fail" : capabilities.length ? "pass" : "warning",
      summary: missingUniversal.length
        ? "Some capability manifests are missing universal chat support."
        : missingV2Fields.length
          ? "Some capability manifests are missing Phase 3/4 capability metadata."
        : missingServiceMarketplaceFields.length
          ? "Some capability manifests are missing subnet service marketplace safety metadata."
        : capabilities.length
          ? "Capability manifests include universal Bittensor chat support, adapter readiness, examples, freshness labels, schemas, auth/cost metadata, and service safety notes."
          : "No capability manifests were available to audit.",
      details: {
        count: capabilities.length,
        missingNetuids: missingUniversal.map((capability) => capability.netuid),
        missingV2Netuids: missingV2Fields.map((capability) => capability.netuid),
        missingServiceMarketplaceNetuids: missingServiceMarketplaceFields.map((capability) => capability.netuid),
        adapterReady: capabilities.filter((capability) => capability.capabilityLevel === "adapter_ready").length,
        adapterRequired: capabilities.filter((capability) => capability.capabilityLevel === "adapter_required").length,
      },
    });
  } catch (err) {
    checks.push({ id: "capabilities", label: "Subnet capability registry", status: "fail", summary: err instanceof Error ? err.message : "Capability audit failed." });
  }

  try {
    const doctor = doctorBittensorSubnetAdapters();
    checks.push({
      id: "subnet_adapter_doctor",
      label: "Subnet adapter registry doctor",
      status: doctor.status === "fail" ? "fail" : doctor.status === "warning" ? "warning" : "pass",
      summary: doctor.rawConfigured
        ? doctor.status === "pass"
          ? `${doctor.readyCount} subnet service adapter entries passed doctor checks.`
          : `${doctor.blockedCount} blocked and ${doctor.warningCount} warning subnet service adapter entries need review.`
        : "No direct subnet service adapters are configured; universal Bittensor chat flows remain available.",
      details: {
        rawEntryCount: doctor.rawEntryCount,
        readyCount: doctor.readyCount,
        warningCount: doctor.warningCount,
        blockedCount: doctor.blockedCount,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_adapter_doctor", label: "Subnet adapter registry doctor", status: "fail", summary: err instanceof Error ? err.message : "Adapter registry doctor failed." });
  }

  try {
    const conformance = await probeBittensorSubnetAdapterConformance();
    checks.push({
      id: "subnet_adapter_conformance",
      label: "Subnet adapter conformance",
      status: conformance.status === "fail" ? "fail" : conformance.status === "pass" ? "pass" : "warning",
      summary: conformance.total
        ? conformance.status === "pass"
          ? `${conformance.passed} subnet service adapter metadata probe(s) passed without sending user task text.`
          : `${conformance.failed} failed and ${conformance.skipped} skipped subnet service adapter conformance probe(s) need review.`
        : "No direct subnet service adapters are configured for metadata conformance probing.",
      details: {
        total: conformance.total,
        passed: conformance.passed,
        failed: conformance.failed,
        skipped: conformance.skipped,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_adapter_conformance", label: "Subnet adapter conformance", status: "fail", summary: err instanceof Error ? err.message : "Adapter conformance probe failed." });
  }

  try {
    const example = getBittensorSubnetAdapterManifestExamples({ adapter: "data_search", netuid: 18, limit: 1 }).examples[0];
    const preflight = example
      ? buildBittensorSubnetAdapterPreflightPacket({
        manifest: example.manifest,
        result: {
          mode: "mock",
          requestSha256: "e".repeat(64),
          output: "Readiness sample output.",
          warnings: [],
        },
      })
      : null;
    checks.push({
      id: "subnet_adapter_preflight",
      label: "Subnet adapter preflight",
      status: preflight?.status === "fail" ? "fail" : preflight ? "pass" : "warning",
      summary: preflight
        ? preflight.readyForCanaryEvidence
          ? "Adapter manifest and result preflight checks pass before endpoint conformance or canary review."
          : "Adapter preflight is available, but canary evidence is incomplete."
        : "No adapter manifest example was available for preflight.",
      details: {
        readyForConformance: preflight?.readyForConformance ?? false,
        readyForCanaryEvidence: preflight?.readyForCanaryEvidence ?? false,
        manifestStatus: preflight?.manifestValidation.status ?? null,
        resultStatus: preflight?.resultValidation?.status ?? null,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_adapter_preflight", label: "Subnet adapter preflight", status: "fail", summary: err instanceof Error ? err.message : "Adapter preflight check failed." });
  }

  try {
    const marketplace = await listBittensorSubnetAdapterMarketplace({ limit: 20 });
    checks.push({
      id: "subnet_adapter_marketplace",
      label: "Subnet adapter marketplace",
      status: marketplace.status,
      summary: marketplace.status === "pass"
        ? "Subnet adapter marketplace has at least one adapter ready for mock rehearsal or manual review."
        : marketplace.status === "fail"
          ? "Subnet adapter marketplace has blocked entries that must not be invoked."
          : "Subnet adapter marketplace is available, but no direct subnet service adapter is ready yet.",
      details: {
        total: marketplace.total,
        universalOnly: marketplace.summary.universalOnly,
        needsAdapter: marketplace.summary.needsAdapter,
        mockReady: marketplace.summary.mockReady,
        manualReviewRequired: marketplace.summary.manualReviewRequired,
        blocked: marketplace.summary.blocked,
        unsupported: marketplace.summary.unsupported,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_adapter_marketplace", label: "Subnet adapter marketplace", status: "fail", summary: err instanceof Error ? err.message : "Adapter marketplace check failed." });
  }

  try {
    const roadmap = await planBittensorSubnetAdapterRoadmap({ limit: 3 });
    checks.push({
      id: "subnet_adapter_roadmap",
      label: "Subnet adapter roadmap",
      status: roadmap.status,
      summary: roadmap.recommendations.length
        ? `Adapter roadmap has ${roadmap.recommendations.length} prioritized next-step recommendation${roadmap.recommendations.length === 1 ? "" : "s"}.`
        : "Adapter roadmap is available, but no prioritized next adapter work is visible yet.",
      details: {
        recommendationCount: roadmap.recommendations.length,
        highPriority: roadmap.recommendations.filter((recommendation) => recommendation.priority === "high").length,
        mediumPriority: roadmap.recommendations.filter((recommendation) => recommendation.priority === "medium").length,
        topAdapter: roadmap.recommendations[0]?.serviceAdapter ?? null,
        topPriority: roadmap.recommendations[0]?.priority ?? null,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_adapter_roadmap", label: "Subnet adapter roadmap", status: "fail", summary: err instanceof Error ? err.message : "Adapter roadmap check failed." });
  }

  try {
    const handoff = await buildBittensorSubnetAdapterOperatorHandoff({
      adapter: "data_search",
      netuid: 18,
      task: "Matterhorn adapter readiness handoff fixture.",
      limit: 1,
    });
    checks.push({
      id: "subnet_adapter_operator_handoff",
      label: "Subnet adapter operator handoff",
      status: handoff.status === "blocked" ? "warning" : "pass",
      summary: handoff.status === "mock_rehearsal_ready"
        ? "Adapter operator handoff can summarize evidence, conformance, and dry-run gates for mock rehearsal."
        : handoff.status === "manual_review_required"
          ? "Adapter operator handoff is available for manual real-canary review, but does not authorize execution."
          : "Adapter operator handoff is available but blocked or incomplete until adapter evidence, conformance, and dry-run gates are resolved.",
      details: {
        status: handoff.status,
        evidenceReviewStatus: handoff.evidenceReview.status,
        conformanceStatus: handoff.conformanceExport.status,
        dryRunStatus: handoff.dryRunExport.status,
        warningCount: handoff.warnings.length,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_adapter_operator_handoff", label: "Subnet adapter operator handoff", status: "fail", summary: err instanceof Error ? err.message : "Adapter operator handoff check failed." });
  }

  try {
    const fixtureHash = "f".repeat(64);
    const outcome = buildBittensorSubnetAdapterCanaryOutcomeReport({
      adapter: "data_search",
      netuid: 18,
      expectedRequestSha256: fixtureHash,
      result: {
        ok: true,
        mode: "mock",
        adapterKind: "data_search",
        netuid: 18,
        requestSha256: fixtureHash,
        message: "Readiness canary outcome fixture.",
        output: { summary: "readiness fixture" },
        warnings: [],
        usage: { units: 1, label: "readiness_fixture" },
        costEstimate: { amount: 0, currency: "TAO", model: "free_read" },
      },
    });
    checks.push({
      id: "subnet_adapter_canary_outcome",
      label: "Subnet adapter canary outcome",
      status: outcome.resultValidation.status === "fail" || !outcome.requestHash.matches ? "fail" : "pass",
      summary: outcome.requestHash.matches && outcome.resultValidation.status !== "fail"
        ? "Canary outcome reports can validate result envelopes, prove request-hash continuity, and redact full hashes for operator review."
        : "Canary outcome report fixture failed request-hash or adapter-result validation.",
      details: {
        reportStatus: outcome.status,
        resultValidationStatus: outcome.resultValidation.status,
        requestHashMatched: outcome.requestHash.matches,
        canaryGateStatus: outcome.canaryGate.status,
        fullHashRedacted: outcome.summary.fullHashRedacted,
        warningCount: outcome.warnings.length,
      },
    });
  } catch (err) {
    checks.push({ id: "subnet_adapter_canary_outcome", label: "Subnet adapter canary outcome", status: "fail", summary: err instanceof Error ? err.message : "Adapter canary outcome check failed." });
  }

  try {
    const wallet = await bittensorProvider.getWallet("invalid-ss58");
    checks.push({
      id: "wallet_safety",
      label: "Wallet read safety",
      status: wallet.providerStatus === "provider_unavailable" && wallet.message?.includes("valid watch-only SS58") ? "pass" : "fail",
      summary: wallet.providerStatus === "provider_unavailable"
        ? "Wallet reads reject invalid SS58 addresses without asking for secrets."
        : "Wallet read did not reject an invalid SS58 address as expected.",
      details: { providerStatus: wallet.providerStatus },
    });
  } catch (err) {
    checks.push({ id: "wallet_safety", label: "Wallet read safety", status: "fail", summary: err instanceof Error ? err.message : "Wallet safety check failed." });
  }

  try {
    const preview = await prepareBittensorExtrinsic({ action: "stake", netuid: 14, amountTao: "1" });
    const handoff = createBittensorSigningHandoff(preview);
    const forbiddenPath = secretFieldPath({ preview, handoff });
    checks.push({
      id: "signing_safety",
      label: "Signing safety",
      status: forbiddenPath ? "fail" : preview.requiresExternalSignature && handoff.payloadSha256.length === 64 ? "pass" : "fail",
      summary: forbiddenPath
        ? `Unsigned signing flow exposes a forbidden field: ${forbiddenPath}.`
        : "Extrinsic previews and handoffs stay unsigned, checksumed, and external-signature-only.",
      details: {
        action: preview.action,
        signerMode: preview.signer.mode,
        canSign: preview.signer.canSign,
        canSubmit: preview.signer.canSubmit,
      },
    });
  } catch (err) {
    checks.push({ id: "signing_safety", label: "Signing safety", status: "fail", summary: err instanceof Error ? err.message : "Signing safety check failed." });
  }

  try {
    const signer = getBittensorSignerStatus();
    const sidecar = await checkSubtensorSidecarHealth();
    checks.push({
      id: "sidecar_status",
      label: "Subtensor sidecar status",
      status: sidecar.status === "healthy" ? "pass" : "warning",
      summary: sidecar.status === "healthy"
        ? "Subtensor sidecar is configured and reachable for live chain reads and signed-payload submission."
        : sidecar.status === "unreachable"
          ? "Subtensor sidecar is configured but unreachable; Matterhorn will rely on provider data and safe fallbacks."
          : "Subtensor sidecar is not configured; Matterhorn will rely on provider data and safe fallbacks.",
      details: { signerMode: signer.mode, canSubmit: signer.canSubmit, network: sidecar.network, reachable: sidecar.reachable },
    });
  } catch (err) {
    checks.push({ id: "sidecar_status", label: "Subtensor sidecar status", status: "fail", summary: err instanceof Error ? err.message : "Sidecar status check failed." });
  }

  try {
    const comparison = await compareBittensorValidators({ netuid: 14, strategy: "balanced", limit: 3 });
    checks.push({
      id: "validator_comparison",
      label: "Validator comparison",
      status: comparison.candidates.length ? "pass" : "warning",
      summary: comparison.candidates.length
        ? "Validator comparison returned public metagraph candidates."
        : "Validator comparison works, but no validator candidates are available from the current provider sample.",
      details: { candidates: comparison.candidates.length, source: comparison.source },
    });
  } catch (err) {
    checks.push({ id: "validator_comparison", label: "Validator comparison", status: "fail", summary: err instanceof Error ? err.message : "Validator comparison failed." });
  }

  try {
    const watch: BittensorWatch = {
      id: "bt-readiness-watch",
      kind: "subnet",
      netuid: 14,
      label: "Readiness watch",
      ss58Address: null,
      validatorHotkey: null,
      threshold: null,
      reason: null,
      lastAlertAt: null,
      createdAt: checkedAt,
    };
    const evaluation = await evaluateBittensorWatch(watch);
    checks.push({
      id: "monitoring",
      label: "Monitoring and watches",
      status: evaluation.status === "unavailable" ? "warning" : "pass",
      summary: evaluation.status === "unavailable"
        ? "Watch evaluation is wired, but provider data is unavailable for the sample watch."
        : "Watch creation and evaluation are wired for Bittensor monitoring.",
      details: { status: evaluation.status, source: evaluation.source },
    });
  } catch (err) {
    checks.push({ id: "monitoring", label: "Monitoring and watches", status: "fail", summary: err instanceof Error ? err.message : "Monitoring check failed." });
  }

  const status = readinessStatus(checks);
  const blockers = checks.filter((check) => check.status === "fail").map((check) => `${check.label}: ${check.summary}`);
  const warnings = checks.filter((check) => check.status === "warning").map((check) => `${check.label}: ${check.summary}`);
  return {
    status,
    checkedAt,
    checks,
    blockers,
    warnings,
    nextActions: [
      "Run this readiness audit after every Bittensor change and before starting Hyperliquid or Polymarket execution work.",
      sidecarBaseUrl()
        ? "Use the configured Subtensor sidecar for live metagraph, wallet, quote, and signed-payload submission checks."
        : "Configure BITTENSOR_SUBTENSOR_SIDECAR_URL to upgrade fallback warnings into live-chain checks.",
      "Add subnet service adapters only behind explicit capability manifests and unsupported-adapter fallbacks.",
      "Keep external signing mandatory until a separate custody/security review is complete.",
    ],
  };
}

export function buildBittensorReadinessOperatorReport(report: BittensorReadinessReport): BittensorReadinessOperatorReport {
  const liveChecks = report.checks.filter((check) => check.status === "pass");
  const fallbackChecks = report.checks.filter((check) => check.status === "warning");
  const blockedChecks = report.checks.filter((check) => check.status === "fail");
  const sidecarCheck = report.checks.find((check) => check.id === "sidecar_status");
  const liveReadCheck = report.checks.find((check) => check.id === "live_read_freshness");
  const roadmapCheck = report.checks.find((check) => check.id === "subnet_adapter_roadmap");
  const canaryOutcomeCheck = report.checks.find((check) => check.id === "subnet_adapter_canary_outcome");
  const operatorPrompts = [
    ...(blockedChecks.length ? [
      copilotAction(
        "Fix blockers",
        "Explain the Bittensor readiness blockers and suggest the next fix.",
        "A failed readiness check should be resolved before expanding execution surfaces.",
        "high",
      ),
    ] : []),
    ...(fallbackChecks.length ? [
      copilotAction(
        "Inspect data source",
        "Show which Bittensor flows are using reference metadata and how to enable live Bittensor reads.",
        "Reference metadata is clearly labeled, but live reads are required for current metrics.",
        "medium",
      ),
    ] : []),
    ...(roadmapCheck ? [
      copilotAction(
        "Export adapter roadmap",
        "Export the Bittensor adapter roadmap as markdown.",
        "The roadmap export gives agents a redacted, copy-pasteable next-adapter plan without enabling real subnet execution.",
        "medium",
      ),
    ] : []),
    ...(canaryOutcomeCheck ? [
      copilotAction(
        "Build canary outcome report",
        "Build a Bittensor adapter canary outcome report for data search subnet 18.",
        "Outcome reports give operators a sanitized post-canary artifact with request-hash continuity and result validation.",
        "medium",
      ),
    ] : []),
    copilotAction(
      "Check alerts",
      "Check my Bittensor alerts.",
      "Monitoring is the quickest follow-up after a readiness pass or warning.",
      "low",
    ),
    copilotAction(
      "Create watch policy",
      "Create a Bittensor watch policy for subnet 14.",
      "Watch policies keep the operator loop active after readiness checks.",
      "low",
    ),
  ];
  const operatorSummary = blockedChecks.length
    ? `${blockedChecks.length} Bittensor readiness blocker(s) need fixes before expanding execution.`
    : fallbackChecks.length
      ? `Bittensor is usable with ${fallbackChecks.length} fallback/runtime warning(s); live-read labels should stay visible.`
      : "Bittensor is ready for the current non-custodial chat, watch, and unsigned-preview workflows.";
  return {
    kind: "readiness_operator_report",
    status: report.status,
    checkedAt: report.checkedAt,
    liveChecks,
    fallbackChecks,
    blockedChecks,
    operatorSummary,
    operatorPrompts,
    warnings: uniqueWarnings(
      report.warnings,
      sidecarCheck?.status === "warning" ? [sidecarCheck.summary] : [],
      liveReadCheck?.status === "warning" ? [liveReadCheck.summary] : [],
    ),
    blockers: report.blockers,
    source: "readiness_audit",
    related: { report },
  };
}

function formatMetric(value: number | null | undefined, suffix = "", digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })}${suffix}`;
}

function formatPercentFromBps(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${(value / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function shortSs58(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value.length > 16 ? `${value.slice(0, 7)}...${value.slice(-6)}` : value;
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function cardItem(label: string, value: string | number | null | undefined, tone?: BittensorChatCardItem["tone"]): BittensorChatCardItem {
  return { label, value: value === null || value === undefined || value === "" ? "Unavailable" : String(value), tone };
}

function isReferenceBittensorData(source: string | null | undefined): boolean {
  return source?.trim().toLowerCase() === "curated-fallback";
}

function bittensorSourceLabel(source: string | null | undefined): string {
  const normalized = source?.trim().toLowerCase() ?? "";
  if (!normalized || normalized === "unknown") return "Unavailable";
  if (isReferenceBittensorData(source)) return "Reference metadata";
  if (/(mock|fixture|test)/.test(normalized)) return "Test data";
  if (/(sidecar|subtensor|provider)/.test(normalized)) return "Live provider data";
  return "Connected data";
}

function buildBittensorCustomerGuidanceCard(result: BittensorChatExecutionResult): BittensorChatCard | null {
  if (result.cards.some((card) => card.kind === "customer_guidance")) return null;
  if (result.execution === "clarification_required") return null;
  const cardKinds = new Set(result.cards.map((card) => card.kind));
  const intent = result.plan.intent;
  let title = "Bittensor next steps";
  let summary = "Use this as customer-facing guidance for the next safe Bittensor step. It is educational context, not financial advice.";
  let firstStep = "Review the live/freshness labels before acting.";
  let followUpPrompt = "Explain the safest next step from this Bittensor result.";

  if (cardKinds.has("wallet_snapshot") || intent === "wallet") {
    title = "Wallet copilot next steps";
    summary = "Matterhorn can turn this watch-only wallet read into exposure checks, validator comparisons, watches, and unsigned previews.";
    firstStep = "Review free TAO, staked TAO, position concentration, and source/freshness before making any staking decision.";
    followUpPrompt = "Analyze this Bittensor wallet exposure and suggest watch-only alerts.";
  } else if (cardKinds.has("validator_selection") || intent === "stake_plan") {
    title = result.execution === "unsigned_preview" ? "Unsigned action review next steps" : "Validator copilot next steps";
    summary = result.execution === "unsigned_preview"
      ? "This preview is still non-custodial. Matterhorn prepared information only; an external signer is required before anything can move."
      : "Matterhorn can compare visible validator candidates, explain tradeoffs, and prepare an unsigned preview only after you choose a validator hotkey.";
    firstStep = result.execution === "unsigned_preview"
      ? "Verify coldkey, hotkey, netuid, amount, rate tolerance, fee/slippage notes, and consequence text in your external signer."
      : "Choose a validator hotkey only after reviewing live, recent, or reference-only data labels and concentration risk.";
    followUpPrompt = result.execution === "unsigned_preview"
      ? "Review this unsigned Bittensor action preview for safety before external signing."
      : "Explain the validator shortlist tradeoffs and what to monitor next.";
  } else if (cardKinds.has("watchlist") || intent === "monitor") {
    title = "Watch and alert next steps";
    summary = "Matterhorn can keep monitoring public Bittensor data and turn warning states into review prompts without signing or broadcasting.";
    firstStep = "Inspect warning watches first, then refresh the relevant wallet, subnet, validator, or slippage context before preparing any action.";
    followUpPrompt = "Review my Bittensor watch alerts and suggest the next read-only checks.";
  } else if (intent === "discover" || cardKinds.has("subnet_comparison")) {
    title = "Subnet discovery next steps";
    summary = "Matterhorn can explain why a subnet matched your goal, check live metagraph context, and compare validator exposure before any staking preview.";
    firstStep = "Open the strongest subnet candidates and check whether their data is live, recent, stale, or reference-only.";
    followUpPrompt = "Compare the strongest Bittensor subnet candidates and explain the risks in beginner language.";
  } else if (intent === "subnet_use" || cardKinds.has("subnet_result") || cardKinds.has("unsupported_adapter")) {
    title = "Subnet service next steps";
    summary = "Matterhorn separates staking into a subnet from using a subnet service. Direct service calls require a reviewed adapter and exact request-hash confirmation.";
    firstStep = "If the adapter is unsupported, use explanation, monitoring, and staking guidance only; if supported, confirm the exact request SHA-256 before invocation.";
    followUpPrompt = "Explain what this subnet can do and whether Matterhorn can call its service safely.";
  } else {
    return null;
  }

  return {
    kind: "customer_guidance",
    title,
    subtitle: titleCase(intent),
    summary,
    tone: result.execution === "unsupported" ? "warning" : "default",
    items: [
      cardItem("First safe step", firstStep),
      cardItem("Matterhorn can", "Explain, compare, monitor, prepare unsigned previews, and hand off to external signing."),
      cardItem("Matterhorn will not", "Ask for seeds/private keys, custody wallets, sign, broadcast, or provide financial advice.", "warning"),
    ],
    actions: [{
      label: "Send follow-up",
      kind: "send_to_chat",
      payload: { prompt: followUpPrompt },
    }],
    warnings: ["Educational guidance only; verify live data and use your own judgment before any external signing."],
    data: {
      intent,
      execution: result.execution,
      followUpPrompt,
    },
  };
}

function withBittensorCustomerGuidance(result: BittensorChatExecutionResult): BittensorChatExecutionResult {
  const guidance = buildBittensorCustomerGuidanceCard(result);
  if (!guidance) return result;
  return {
    ...result,
    cards: [...result.cards, guidance],
    data: { ...result.data, customerGuidance: guidance.data ?? null },
    warnings: uniqueWarnings(result.warnings, guidance.warnings),
  };
}

function adapterRunResultFromInvocation(invocation: BittensorSubnetInvocation): BittensorSubnetAdapterRunResult | null {
  const output = asRecord(invocation.result["output"]);
  const mode = output["mode"];
  const adapterKind = output["adapterKind"];
  const requestSha256 = output["requestSha256"];
  if ((mode !== "mock" && mode !== "http") || typeof adapterKind !== "string" || typeof requestSha256 !== "string") return null;
  return output as unknown as BittensorSubnetAdapterRunResult;
}

function adapterRunUsageLabel(result: BittensorSubnetAdapterRunResult): string {
  if (!result.usage) return "Unavailable";
  const units = result.usage.units === null ? "unknown" : String(result.usage.units);
  return result.usage.label ? `${units} ${result.usage.label}` : units;
}

function adapterRunCostLabel(result: BittensorSubnetAdapterRunResult): string {
  if (!result.costEstimate) return titleCase(result.adapterKind);
  const amount = result.costEstimate.amount === null ? "unknown" : String(result.costEstimate.amount);
  const currency = result.costEstimate.currency ?? "";
  return `${amount}${currency ? ` ${currency}` : ""} · ${titleCase(result.costEstimate.model)}`;
}

function adapterRunOutputSummary(result: BittensorSubnetAdapterRunResult): string {
  const output = asRecord(result.output);
  const completion = firstString(output, ["completion", "answer", "text"]);
  if (completion) return completion;
  const results = arrayFrom(output["results"]);
  const first = asRecord(results[0]);
  const summary = firstString(first, ["summary", "title"]);
  if (summary) return summary;
  const nestedResult = asRecord(output["result"]);
  const nestedAnswer = firstString(nestedResult, ["answer", "summary", "text"]);
  if (nestedAnswer) return nestedAnswer;
  return result.message;
}

export function buildBittensorPlanCards(plan: BittensorPlan): BittensorChatCard[] {
  return [{
    kind: "subnet_result",
    title: "Bittensor chat plan",
    subtitle: titleCase(plan.intent),
    summary: plan.requiresClarification
      ? plan.clarificationQuestion
      : "Matterhorn has enough context to continue this Bittensor workflow safely.",
    tone: plan.requiresClarification ? "warning" : "default",
    items: [
      cardItem("Intent", titleCase(plan.intent)),
      cardItem("Confidence", `${Math.round(plan.confidence * 100)}%`),
      cardItem("Netuids", plan.netuids.length ? plan.netuids.join(", ") : "None detected", plan.netuids.length ? "default" : "muted"),
      cardItem("Wallet", plan.ss58Address ? shortSs58(plan.ss58Address) : "Not provided", plan.ss58Address ? "default" : "muted"),
    ],
    warnings: plan.safetyNotes,
    data: { plan },
  }];
}

export function buildBittensorSubnetCards(subnets: BittensorSubnetSummary[]): BittensorChatCard[] {
  return subnets.slice(0, 6).map((subnet) => {
    const capability = capabilityFromSubnet(subnet);
    const referenceOnly = isReferenceBittensorData(subnet.source);
    const adapterWarning = capability.capabilityLevel === "adapter_required"
      ? "Matterhorn can explain and monitor this subnet, but direct service execution needs a configured subnet adapter."
      : null;
    return {
      kind: "subnet_comparison",
      title: `${subnet.name} (${subnet.symbol})`,
      subtitle: `Subnet ${subnet.netuid} · ${subnet.category}`,
      summary: referenceOnly
        ? "Reference metadata only. Live Bittensor metrics are unavailable."
        : subnet.benefitSummary,
      tone: referenceOnly ? "warning" : "default",
      items: [
        cardItem("Price", subnet.priceTao === null ? "Unavailable" : `${formatMetric(subnet.priceTao)} TAO`),
        cardItem("Emission", formatMetric(subnet.emission)),
        cardItem("Tempo", formatMetric(subnet.tempo)),
        cardItem("Capability", titleCase(capability.capabilityLevel.replace(/_/g, " ")), capability.capabilityLevel === "adapter_ready" ? "good" : capability.capabilityLevel === "adapter_required" ? "warning" : "default"),
        cardItem("Adapter", capability.adapterStatus.configured ? capability.serviceAdapter.replace(/_/g, " ") : "Not configured", capability.adapterStatus.configured ? "good" : "muted"),
        cardItem("Freshness", subnet.freshness ?? "Unavailable", subnet.freshness ? "default" : "muted"),
        cardItem("Source", bittensorSourceLabel(subnet.source), referenceOnly ? "warning" : "muted"),
      ],
      actions: [{
        label: "Inspect subnet",
        kind: "send_to_chat",
        payload: { prompt: `Explain Bittensor subnet ${subnet.netuid} (${subnet.name}) and how it can help my work.` },
      }],
      warnings: uniqueWarnings(
        referenceOnly ? ["Live Bittensor metrics are unavailable. Refresh before acting on this reference data."] : [],
        adapterWarning ? [adapterWarning] : [],
      ),
      data: { subnet, capability },
    } satisfies BittensorChatCard;
  });
}

export function buildBittensorWalletCard(wallet: BittensorWalletSnapshot): BittensorChatCard {
  const stakeTotal = wallet.stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
  const riskiest = wallet.stakePositions.find((position) => position.slippageRisk === "high")
    ?? wallet.stakePositions.find((position) => position.slippageRisk === "medium")
    ?? wallet.stakePositions[0]
    ?? null;
  return {
    kind: "wallet_snapshot",
    title: "Bittensor wallet snapshot",
    subtitle: shortSs58(wallet.ss58Address),
    summary: wallet.providerStatus === "ok"
      ? "Watch-only balance and stake exposure loaded."
      : wallet.message ?? "Wallet provider data is unavailable.",
    tone: wallet.providerStatus === "ok" ? "default" : "warning",
    items: [
      cardItem("Free TAO", wallet.taoBalance === null ? "Unavailable" : `${formatMetric(wallet.taoBalance)} TAO`),
      cardItem("Staked value", `${formatMetric(stakeTotal)} TAO`),
      cardItem("Positions", wallet.stakePositions.length),
      cardItem("Highest risk", riskiest ? `${riskiest.subnetName}: ${riskiest.slippageRisk}` : "Unavailable", riskiest?.slippageRisk === "high" ? "warning" : "muted"),
      cardItem("Source", bittensorSourceLabel(wallet.source ?? "provider"), wallet.source?.includes("mock") ? "warning" : "muted"),
      cardItem("Block", wallet.block ?? "Unavailable", wallet.block === null || wallet.block === undefined ? "muted" : "default"),
    ],
    warnings: wallet.providerStatus === "ok" ? wallet.warnings ?? [] : [wallet.message ?? "Wallet provider data is unavailable."],
    data: { wallet },
  };
}

export function buildBittensorSubnetIntelligenceCard(report: BittensorSubnetIntelligenceReport): BittensorChatCard {
  return {
    kind: "intelligence_report",
    title: `${report.name} intelligence`,
    subtitle: `Subnet ${report.netuid} · ${report.category}`,
    summary: `Public-data score ${report.score}/100: ${titleCase(report.rating.replace(/_/g, " "))}.`,
    tone: report.rating === "limited_provider_context" ? "warning" : "default",
    items: [
      cardItem("Score", `${report.score}/100`, report.score >= 75 ? "good" : report.score >= 50 ? "warning" : "danger"),
      cardItem("Provider", bittensorSourceLabel(report.market.source), isReferenceBittensorData(report.market.source) ? "warning" : "default"),
      cardItem("Freshness", report.market.freshness ?? "Unavailable", report.market.freshness ? "default" : "muted"),
      cardItem("Price", report.market.priceTao === null ? "Unavailable" : `${formatMetric(report.market.priceTao)} TAO`),
      cardItem("Validators sampled", report.metagraph.validatorsSampled),
      cardItem("Concentration", report.metagraph.concentrationRisk, riskTone(report.metagraph.concentrationRisk)),
      cardItem("Mechanisms", report.mechanismSummary.available ? String(report.mechanismSummary.count ?? "Available") : "Not exposed", report.mechanismSummary.available ? "good" : "muted"),
      cardItem("Adapter", report.capability.adapterStatus.configured ? report.capability.serviceAdapter.replace(/_/g, " ") : "Not configured", report.capability.adapterStatus.configured ? "good" : "muted"),
      cardItem("Copilot actions", report.copilotActions.length),
      cardItem("Watch suggestions", report.watchSuggestions.length),
    ],
    actions: report.copilotActions.slice(0, 3).map((action) => ({
      label: action.label,
      kind: "send_to_chat",
      payload: { prompt: action.prompt, reason: action.reason, riskLevel: action.riskLevel },
    })),
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorWalletIntelligenceCard(report: BittensorWalletIntelligenceReport): BittensorChatCard {
  const topValidator = report.validatorExposure[0] ?? null;
  return {
    kind: "intelligence_report",
    title: "Bittensor wallet intelligence",
    subtitle: shortSs58(report.ss58Address),
    summary: `Watch-only exposure across ${report.subnetCount} subnet(s) and ${report.validatorCount} validator hotkey(s).`,
    tone: report.staleDataRisk === "high" || report.concentrationRisk === "high" || report.slippageRisk === "high" ? "warning" : "default",
    items: [
      cardItem("Free TAO", report.freeTao === null ? "Unavailable" : `${formatMetric(report.freeTao)} TAO`),
      cardItem("Staked TAO", report.stakeTotalTao === null ? "Unavailable" : `${formatMetric(report.stakeTotalTao)} TAO`),
      cardItem("Largest position", report.largestPositionShare === null ? "Unknown" : `${Math.round(report.largestPositionShare * 100)}%`, riskTone(report.concentrationRisk)),
      cardItem("Concentration", report.concentrationRisk, riskTone(report.concentrationRisk)),
      cardItem("Slippage", report.slippageRisk, riskTone(report.slippageRisk)),
      cardItem("Top validator", topValidator ? shortSs58(topValidator.validatorHotkey) : "Unavailable", topValidator ? riskTone(topValidator.risk) : "muted"),
      cardItem("Freshness", report.freshness ?? "Unavailable", riskTone(report.staleDataRisk)),
      cardItem("Source", bittensorSourceLabel(report.source), isReferenceBittensorData(report.source) ? "warning" : "muted"),
      cardItem("Block", report.block ?? "Unavailable", report.block === null ? "muted" : "default"),
      cardItem("Copilot actions", report.copilotActions.length),
      cardItem("Watch suggestions", report.watchSuggestions.length),
    ],
    actions: report.copilotActions.slice(0, 4).map((action) => ({
      label: action.label,
      kind: "send_to_chat",
      payload: { prompt: action.prompt, reason: action.reason, riskLevel: action.riskLevel },
    })),
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorValidatorIntelligenceCard(report: BittensorValidatorIntelligenceReport): BittensorChatCard {
  return {
    kind: "intelligence_report",
    title: "Validator intelligence",
    subtitle: `Subnet ${report.netuid} · ${shortSs58(report.validatorHotkey)}`,
    summary: report.foundInSample
      ? `Public-data validator score ${report.score}/100 on ${report.subnetName}.`
      : `Validator was not found in the current visible sample for ${report.subnetName}.`,
    tone: report.risk === "high" ? "warning" : "default",
    items: [
      cardItem("Subnet", `${report.subnetName} (${report.netuid})`),
      cardItem("Hotkey", shortSs58(report.validatorHotkey)),
      cardItem("Found", report.foundInSample ? "Yes" : "No", report.foundInSample ? "good" : "danger"),
      cardItem("Score", report.foundInSample ? `${report.score}/100` : "Unavailable", riskTone(report.risk)),
      cardItem("Stake", report.stake === null ? "Unavailable" : `${formatMetric(report.stake)} TAO`, report.stake === null ? "muted" : "default"),
      cardItem("Trust", report.trust === null ? "Unavailable" : formatMetric(report.trust, "", 4), report.trust === null ? "muted" : "default"),
      cardItem("Dividends", report.dividends === null ? "Unavailable" : formatMetric(report.dividends, "", 4), report.dividends === null ? "muted" : "default"),
      cardItem("Risk", report.risk, riskTone(report.risk)),
      cardItem("Source", bittensorSourceLabel(report.source), isReferenceBittensorData(report.source) ? "warning" : "muted"),
      cardItem("Watch suggestions", report.watchSuggestions.length),
    ],
    actions: report.copilotActions.slice(0, 4).map((action) => ({
      label: action.label,
      kind: "send_to_chat",
      payload: { prompt: action.prompt, reason: action.reason, riskLevel: action.riskLevel },
    })),
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorStakingPlanCard(plan: BittensorStakingPlan): BittensorChatCard {
  const firstStep = plan.steps[0] ?? null;
  return {
    kind: "intelligence_report",
    title: "Bittensor staking plan",
    subtitle: `${formatMetric(plan.totalAmountTao)} TAO · ${titleCase(plan.strategy)} strategy`,
    summary: plan.steps.length
      ? `Drafted ${plan.steps.length} unsigned staking step(s) for ${plan.goal}.`
      : `No staking steps could be drafted for ${plan.goal}.`,
    tone: plan.warnings.length ? "warning" : "default",
    items: [
      cardItem("Goal", plan.goal),
      cardItem("Total", `${formatMetric(plan.totalAmountTao)} TAO`),
      cardItem("Strategy", titleCase(plan.strategy)),
      cardItem("Steps", plan.steps.length, plan.steps.length ? "default" : "warning"),
      cardItem("First subnet", firstStep ? `${firstStep.subnetName} (${firstStep.netuid})` : "Unavailable", firstStep ? "default" : "muted"),
      cardItem("First validator", firstStep?.validatorHotkey ? shortSs58(firstStep.validatorHotkey) : "Choose before signing", firstStep?.validatorHotkey ? "default" : "warning"),
      cardItem("Preview count", plan.unsignedPreviews.length),
      cardItem("Watch suggestions", plan.watchSuggestions.length),
    ],
    actions: plan.copilotActions.slice(0, 3).map((action) => ({
      label: action.label,
      kind: "send_to_chat",
      payload: { prompt: action.prompt, reason: action.reason, riskLevel: action.riskLevel },
    })),
    warnings: plan.warnings,
    data: { plan },
  };
}

export function buildBittensorDecisionBriefCard(brief: BittensorDecisionBrief): BittensorChatCard {
  const nowOptions = brief.options.filter((option) => option.priority === "now").length;
  const signingOptions = brief.options.filter((option) => option.requiresExternalSignature).length;
  return {
    kind: "intelligence_report",
    title: brief.title,
    subtitle: `${titleCase(brief.focus)} focus · ${brief.score}/100`,
    summary: brief.summary,
    tone: brief.risk === "high" ? "warning" : "default",
    items: [
      cardItem("Focus", titleCase(brief.focus)),
      cardItem("Decision score", `${brief.score}/100`, brief.score >= 75 ? "good" : brief.score >= 50 ? "warning" : "danger"),
      cardItem("Risk", brief.risk, riskTone(brief.risk)),
      cardItem("Source", bittensorSourceLabel(brief.source), isReferenceBittensorData(brief.source) ? "warning" : "muted"),
      cardItem("Do now", nowOptions),
      cardItem("Options", brief.options.length),
      cardItem("External signing", signingOptions ? `${signingOptions} later option(s)` : "Not required for first step", signingOptions ? "warning" : "good"),
      cardItem("Watch suggestions", brief.watchSuggestions.length),
    ],
    actions: brief.options.slice(0, 4).map((option) => ({
      label: option.label,
      kind: "send_to_chat",
      payload: {
        prompt: option.prompt,
        reason: option.rationale,
        priority: option.priority,
        riskLevel: option.riskLevel,
        requiresExternalSignature: option.requiresExternalSignature,
      },
    })),
    warnings: brief.warnings,
    data: { brief },
  };
}

export function buildBittensorWatchPolicyPresetCard(policy: BittensorWatchPolicyPreset): BittensorChatCard {
  const highestRuleRisk = highestRisk(...policy.rules.map((rule) => rule.riskLevel));
  return {
    kind: "intelligence_report",
    title: policy.label,
    subtitle: `${titleCase(policy.scope)} watch policy · ${titleCase(policy.priority)}`,
    summary: policy.summary,
    tone: highestRuleRisk === "high" ? "warning" : "default",
    items: [
      cardItem("Scope", titleCase(policy.scope)),
      cardItem("Priority", titleCase(policy.priority), policy.priority === "now" ? "warning" : "default"),
      cardItem("Rules", policy.rules.length, policy.rules.length ? "default" : "warning"),
      cardItem("Highest risk", highestRuleRisk, riskTone(highestRuleRisk)),
      cardItem("Source", bittensorSourceLabel(policy.source), isReferenceBittensorData(policy.source) ? "warning" : "muted"),
      cardItem("First trigger", policy.rules[0]?.trigger ?? "Unavailable", policy.rules[0] ? "default" : "muted"),
      cardItem("Copilot actions", policy.copilotActions.length),
    ],
    actions: policy.copilotActions.slice(0, 4).map((action) => ({
      label: action.label,
      kind: "send_to_chat",
      payload: { prompt: action.prompt, reason: action.reason, riskLevel: action.riskLevel, policyScope: policy.scope },
    })),
    warnings: policy.warnings,
    data: { policy },
  };
}

export function buildBittensorQuoteCard(quote: BittensorActionQuote): BittensorChatCard {
  return {
    kind: "staking_quote",
    title: `${titleCase(quote.action)} quote`,
    subtitle: quote.netuid === null ? "Bittensor action" : `Subnet ${quote.netuid}`,
    summary: "Quote only. Nothing can move until the user reviews and signs externally.",
    tone: quote.warnings.length ? "warning" : "default",
    items: [
      cardItem("Amount", quote.amountTao === null ? "Unavailable" : `${formatMetric(quote.amountTao)} TAO`),
      cardItem("Price", quote.priceTao === null || quote.priceTao === undefined ? "Unavailable" : `${formatMetric(quote.priceTao)} TAO`),
      cardItem("Ideal alpha", formatMetric(quote.idealAlpha)),
      cardItem("Expected alpha", formatMetric(quote.expectedAlpha)),
      cardItem("Estimated fee", quote.feeTao === null ? "Unavailable" : `${formatMetric(quote.feeTao, " TAO", 6)}`),
      cardItem("Slippage", formatPercentFromBps(quote.slippageBps), quote.slippageBps && quote.slippageBps > 100 ? "warning" : "default"),
      cardItem("Source", quote.source ?? "provider", quote.source?.includes("mock") ? "warning" : "muted"),
    ],
    actions: [{
      label: "Review in chat",
      kind: "send_to_chat",
      payload: { prompt: `Review this Bittensor ${quote.action} quote before external signing.` },
    }],
    warnings: quote.warnings,
    data: { quote },
  };
}

export function buildBittensorExtrinsicPreviewCard(preview: BittensorExtrinsicPreview): BittensorChatCard {
  return {
    kind: "signed_action_review",
    title: `${titleCase(preview.action)} review`,
    subtitle: preview.netuid === null ? preview.network : `Subnet ${preview.netuid} · ${preview.network}`,
    summary: preview.consequenceSummary,
    tone: preview.warnings.length ? "warning" : "default",
    items: [
      cardItem("Coldkey", shortSs58(preview.coldkey)),
      cardItem("Hotkey", shortSs58(preview.hotkey)),
      cardItem("Amount", preview.amountTao === null ? "Unavailable" : `${formatMetric(preview.amountTao)} TAO`),
      cardItem("Signer", preview.signer.message, preview.signer.canSign ? "good" : "warning"),
      cardItem("Slippage", formatPercentFromBps(preview.slippageBps), preview.slippageBps && preview.slippageBps > 100 ? "warning" : "default"),
    ],
    actions: [{
      label: "Sign externally",
      kind: "sign_externally",
      payload: preview.unsignedPayload,
    }],
    warnings: preview.warnings,
    data: { preview },
  };
}

export function buildBittensorSigningSafetyChecklistCard(checklist: BittensorSigningSafetyChecklist): BittensorChatCard {
  const passed = checklist.checks.filter((check) => check.status === "pass").length;
  const warnings = checklist.checks.filter((check) => check.status === "warning").length;
  const failed = checklist.checks.filter((check) => check.status === "fail").length;
  return {
    kind: "signed_action_review",
    title: "External signing safety checklist",
    subtitle: `${titleCase(checklist.previewAction)} · ${checklist.network}`,
    summary: checklist.consequenceSummary,
    tone: checklist.status === "pass" ? "good" : checklist.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Passed", passed, passed ? "good" : "muted"),
      cardItem("Warnings", warnings, warnings ? "warning" : "muted"),
      cardItem("Failed", failed, failed ? "danger" : "muted"),
      cardItem("External signer", "Required", "warning"),
      cardItem("First check", checklist.checks[0]?.summary ?? "Unavailable", checklist.checks[0]?.status === "pass" ? "good" : checklist.checks[0]?.status === "fail" ? "danger" : checklist.checks[0]?.status ?? "muted"),
    ],
    actions: [{
      label: checklist.status === "fail" ? "Rebuild preview" : "Create signing handoff",
      kind: "send_to_chat",
      payload: {
        prompt: checklist.status === "fail"
          ? `Rebuild the unsigned Bittensor ${checklist.previewAction} preview with complete safe context.`
          : "Create signing handoff for this unsigned Bittensor preview.",
        status: checklist.status,
      },
    }],
    warnings: checklist.warnings,
    data: { checklist },
  };
}

export function buildBittensorSigningHandoffCard(handoff: BittensorSigningHandoff): BittensorChatCard {
  return {
    kind: "signing_handoff",
    title: "External signing handoff",
    subtitle: `${titleCase(handoff.action)} · ${handoff.network}`,
    summary: handoff.consequenceSummary,
    tone: handoff.warnings.length ? "warning" : "default",
    items: [
      cardItem("Payload SHA-256", handoff.payloadSha256.slice(0, 20), "muted"),
      cardItem("Filename", handoff.suggestedFilename),
      cardItem("Expires", handoff.expiresAt, "muted"),
      cardItem("Signer mode", titleCase(handoff.signerMode)),
    ],
    actions: [
      {
        label: "Copy payload",
        kind: "copy_payload",
        payload: {
          filename: handoff.suggestedFilename,
          payload: handoff.payload,
          payloadSha256: handoff.payloadSha256,
        },
      },
      {
        label: "Sign externally",
        kind: "sign_externally",
        payload: handoff.payload,
      },
    ],
    warnings: handoff.warnings,
    data: { handoff },
  };
}

export function buildBittensorSigningReceiptCard(receipt: BittensorSigningReceipt): BittensorChatCard {
  const submitted = receipt.status === "submitted";
  const invalid = receipt.status === "invalid_signature" || receipt.status === "rejected";
  return {
    kind: "signed_action_review",
    title: "Bittensor signing receipt",
    subtitle: `${titleCase(receipt.status)} · ${receipt.network}`,
    summary: receipt.message,
    tone: submitted ? "good" : invalid ? "danger" : receipt.status === "awaiting_signature" ? "warning" : "default",
    items: [
      cardItem("Action", titleCase(receipt.action)),
      cardItem("Netuid", receipt.netuid ?? "Network", receipt.netuid === null ? "muted" : "default"),
      cardItem("Payload SHA-256", receipt.payloadSha256.slice(0, 20), "muted"),
      cardItem("Signature SHA-256", receipt.signatureSha256 ? receipt.signatureSha256.slice(0, 20) : "Not received", receipt.signatureSha256 ? "muted" : "warning"),
      cardItem("Signer", receipt.signerAddress ? shortSs58(receipt.signerAddress) : "External signer", receipt.signerAddress ? "default" : "muted"),
      cardItem("Status", titleCase(receipt.status), submitted ? "good" : invalid ? "danger" : "warning"),
      cardItem("Transaction", receipt.txHash ?? "Unavailable", receipt.txHash ? "default" : "muted"),
    ],
    actions: [
      ...(receipt.explorerUrl ? [{
        label: "Open explorer",
        kind: "open_url" as const,
        href: receipt.explorerUrl,
      }] : []),
      ...receipt.nextActions.slice(0, 3).map((nextAction) => ({
        label: "Continue in chat",
        kind: "send_to_chat" as const,
        payload: {
          prompt: nextAction,
          receiptId: receipt.id,
          status: receipt.status,
          payloadSha256: receipt.payloadSha256,
        },
      })),
    ],
    warnings: receipt.warnings,
    data: { receipt },
  };
}

export function buildBittensorSignerCard(signer: BittensorSignerStatus): BittensorChatCard {
  return {
    kind: "signer_status",
    title: "Bittensor signer status",
    subtitle: titleCase(signer.mode),
    summary: signer.message,
    tone: signer.canSubmit || signer.canSign ? "default" : "warning",
    items: [
      cardItem("Network", signer.network),
      cardItem("Can sign", signer.canSign ? "Yes" : "No", signer.canSign ? "good" : "warning"),
      cardItem("Can submit", signer.canSubmit ? "Yes" : "No", signer.canSubmit ? "good" : "warning"),
      cardItem("Address", shortSs58(signer.address)),
    ],
    warnings: signer.canSign ? [] : ["Matterhorn does not hold signing authority. Use an external Bittensor-compatible signer."],
    data: { signer },
  };
}

export function buildBittensorSidecarHealthCard(health: BittensorSubtensorSidecarHealth): BittensorChatCard {
  return {
    kind: "signer_status",
    title: "Subtensor sidecar health",
    subtitle: titleCase(health.status),
    summary: health.message,
    tone: health.status === "healthy" ? "good" : "warning",
    items: [
      cardItem("Network", health.network),
      cardItem("Configured", health.configured ? "Yes" : "No", health.configured ? "good" : "warning"),
      cardItem("Reachable", health.reachable ? "Yes" : "No", health.reachable ? "good" : "warning"),
      cardItem("Latency", health.latencyMs === null ? "Unavailable" : `${health.latencyMs} ms`, health.latencyMs === null ? "muted" : "default"),
    ],
    warnings: health.status === "healthy" ? [] : [health.message],
    data: { health },
  };
}

export function buildBittensorSignedResultCard(result: BittensorSignedResult): BittensorChatCard {
  const submitted = result.status === "submitted";
  const invalid = result.status === "invalid_signature" || result.status === "rejected";
  return {
    kind: "signed_action_review",
    title: submitted ? "Bittensor action submitted" : "Bittensor action not submitted",
    subtitle: titleCase(result.status),
    summary: result.message,
    tone: submitted ? "good" : invalid ? "danger" : "warning",
    items: [
      cardItem("Status", titleCase(result.status), submitted ? "good" : invalid ? "danger" : "warning"),
      cardItem("Transaction", result.txHash ?? "Unavailable", result.txHash ? "default" : "muted"),
      cardItem("Block", result.blockHash ?? "Unavailable", result.blockHash ? "default" : "muted"),
      cardItem("Explorer", result.explorerUrl ?? "Unavailable", result.explorerUrl ? "default" : "muted"),
    ],
    actions: result.explorerUrl ? [{
      label: "Open explorer",
      kind: "open_url",
      href: result.explorerUrl,
    }] : [],
    warnings: submitted ? [] : [result.message],
    data: { result },
  };
}

export function buildBittensorInvocationPreviewCard(preview: BittensorSubnetInvocationPreview): BittensorChatCard {
  return {
    kind: preview.supported ? "subnet_result" : "unsupported_adapter",
    title: preview.supported ? "Bittensor service review" : `Subnet ${preview.netuid} adapter unavailable`,
    subtitle: `${preview.subnetName} · ${titleCase(preview.adapter)}`,
    summary: preview.consequenceSummary,
    tone: preview.supported ? "warning" : "warning",
    items: [
      cardItem("Netuid", preview.netuid),
      cardItem("Intent", titleCase(preview.intent)),
      cardItem("Adapter", titleCase(preview.adapter)),
      cardItem("Configured", preview.configured ? "Yes" : "No", preview.configured ? "good" : "warning"),
      cardItem("Supported", preview.supported ? "Yes" : "No", preview.supported ? "good" : "warning"),
      cardItem("Contract", preview.contractValidation.ok ? "Valid" : "Blocked", preview.contractValidation.ok ? "good" : "danger"),
      cardItem("Auth", titleCase(preview.requiredAuth), preview.requiredAuth === "none" ? "good" : "warning"),
      cardItem("Cost model", titleCase(preview.costModel)),
      cardItem("Task", preview.request.task ? "Included" : "Not provided", preview.request.task ? "default" : "muted"),
      cardItem("Request SHA-256", preview.requestSha256.slice(0, 20), "muted"),
    ],
    actions: preview.supported ? [{
      label: "Confirm service call",
      kind: "send_to_chat",
      payload: {
        prompt: preview.confirmationPrompt,
        invokeArgs: {
          netuid: preview.netuid,
          intent: preview.intent,
          task: preview.request.task,
          ss58Address: preview.request.ss58Address,
          previewRequestSha256: preview.requestSha256,
        },
        preview,
      },
    }] : [{
      label: "Explain subnet instead",
      kind: "send_to_chat",
      payload: {
        prompt: `Explain subnet ${preview.netuid} and what Matterhorn can do without a service adapter.`,
        preview,
      },
    }],
    warnings: preview.warnings,
    data: { preview },
  };
}

export function buildBittensorInvocationCard(invocation: BittensorSubnetInvocation): BittensorChatCard {
  const adapterResult = adapterRunResultFromInvocation(invocation);
  return {
    kind: invocation.supported ? "subnet_result" : "unsupported_adapter",
    title: invocation.supported ? `Subnet ${invocation.netuid} result` : `Subnet ${invocation.netuid} adapter unavailable`,
    subtitle: `${titleCase(invocation.intent)} · ${titleCase(invocation.adapter)}`,
    summary: adapterResult ? adapterRunOutputSummary(adapterResult) : invocation.message,
    tone: invocation.supported ? "default" : "warning",
    items: [
      cardItem("Netuid", invocation.netuid),
      cardItem("Intent", titleCase(invocation.intent)),
      cardItem("Adapter", titleCase(invocation.adapter)),
      cardItem("Supported", invocation.supported ? "Yes" : "No", invocation.supported ? "good" : "warning"),
      ...(adapterResult ? [
        cardItem("Adapter mode", titleCase(adapterResult.mode), adapterResult.mode === "mock" ? "warning" : "default"),
        cardItem("Request SHA-256", adapterResult.requestSha256.slice(0, 20), "muted"),
        cardItem("Output", adapterRunOutputSummary(adapterResult)),
        cardItem("Usage", adapterRunUsageLabel(adapterResult), adapterResult.usage ? "default" : "muted"),
        cardItem("Cost", adapterRunCostLabel(adapterResult), adapterResult.costEstimate?.amount === 0 ? "good" : "warning"),
      ] : []),
      ...(invocation.contractValidation
        ? [cardItem("Contract", invocation.contractValidation.ok ? "Valid" : "Blocked", invocation.contractValidation.ok ? "good" : "danger")]
        : []),
    ],
    warnings: uniqueWarnings(invocation.warnings, adapterResult?.warnings),
    data: { invocation },
  };
}

export function buildBittensorValidatorComparisonCards(comparison: BittensorValidatorComparison): BittensorChatCard[] {
  if (!comparison.candidates.length) {
    return [{
      kind: "validator_selection",
      title: "Validator comparison",
      subtitle: `Subnet ${comparison.netuid} · ${titleCase(comparison.strategy)}`,
      summary: "No validator candidates were available from the current provider sample.",
      tone: "warning",
      items: [
        cardItem("Subnet", comparison.subnetName),
        cardItem("Candidates", 0, "warning"),
        cardItem("Source", bittensorSourceLabel(comparison.source), isReferenceBittensorData(comparison.source) ? "warning" : "muted"),
      ],
      warnings: comparison.warnings,
      data: { comparison },
    }];
  }

  return comparison.candidates.slice(0, 6).map((candidate, index) => ({
    kind: "validator_selection",
    title: `Validator candidate ${index + 1}`,
    subtitle: `${comparison.subnetName} · Score ${candidate.score}/100`,
    summary: candidate.reasons.join(" "),
    tone: candidate.score >= 70 ? "good" : candidate.score >= 40 ? "default" : "warning",
    items: [
      cardItem("UID", candidate.uid ?? "Unavailable", candidate.uid === null ? "muted" : "default"),
      cardItem("Hotkey", shortSs58(candidate.hotkey)),
      cardItem("Stake", formatMetric(candidate.stake)),
      cardItem("Trust", formatMetric(candidate.trust, "", 4)),
      cardItem("Dividends", formatMetric(candidate.dividends, "", 4)),
      cardItem("Source", bittensorSourceLabel(candidate.source), isReferenceBittensorData(candidate.source) ? "warning" : "muted"),
    ],
    actions: candidate.hotkey ? [{
      label: "Plan stake",
      kind: "send_to_chat",
      payload: {
        prompt: `Prepare a safe Bittensor staking plan for subnet ${candidate.netuid} using validator hotkey ${candidate.hotkey}.`,
      },
    }] : [],
    warnings: [...comparison.warnings, ...candidate.warnings],
    data: { candidate, comparison },
  }));
}

export function buildBittensorReadinessCard(report: BittensorReadinessReport): BittensorChatCard {
  const passed = report.checks.filter((check) => check.status === "pass").length;
  const warning = report.checks.filter((check) => check.status === "warning").length;
  const failed = report.checks.filter((check) => check.status === "fail").length;
  return {
    kind: "readiness_report",
    title: "Bittensor readiness audit",
    subtitle: titleCase(report.status),
    summary: failed
      ? "Bittensor needs fixes before expanding into more execution surfaces."
      : warning
        ? "Bittensor chat is functional, with provider/runtime warnings to resolve before calling it perfect."
        : "Bittensor chat workflows passed the readiness gate.",
    tone: report.status === "pass" ? "good" : report.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Passed", passed, "good"),
      cardItem("Warnings", warning, warning ? "warning" : "muted"),
      cardItem("Failed", failed, failed ? "danger" : "muted"),
      cardItem("Checked", report.checkedAt, "muted"),
    ],
    warnings: [...report.blockers, ...report.warnings],
    data: { report },
  };
}

export function buildBittensorAdapterOnboardingCard(plan: BittensorSubnetAdapterOnboardingPlan): BittensorChatCard {
  const passed = plan.gates.filter((gate) => gate.status === "pass").length;
  const warning = plan.gates.filter((gate) => gate.status === "warning").length;
  const blocked = plan.gates.filter((gate) => gate.status === "blocked").length;
  const notConfigured = plan.gates.filter((gate) => gate.status === "not_configured").length;
  const nextPrompt = plan.status === "needs_configuration"
    ? `Help me configure a ${plan.requested.adapter ?? "Bittensor"} subnet adapter${plan.requested.netuid === null ? "" : ` for subnet ${plan.requested.netuid}`} without enabling real execution.`
    : plan.status === "needs_conformance"
      ? `Review Bittensor subnet adapter conformance issues${plan.requested.netuid === null ? "" : ` for subnet ${plan.requested.netuid}`}.`
      : plan.status === "ready_for_preview_review"
        ? `Prepare a reviewed no-execution canary preview${plan.requested.netuid === null ? "" : ` for subnet ${plan.requested.netuid}`}.`
        : "Review blocked Bittensor subnet adapter onboarding gates.";
  return {
    kind: "adapter_onboarding",
    title: "Bittensor adapter onboarding",
    subtitle: titleCase(plan.status),
    summary: plan.nextActions[0] ?? "Review adapter onboarding gates before any direct subnet service execution.",
    tone: plan.status === "ready_for_preview_review" ? "good" : plan.status === "blocked" ? "danger" : "warning",
    items: [
      cardItem("Adapter", plan.requested.adapter ?? "Any"),
      cardItem("Netuid", plan.requested.netuid ?? "Any", plan.requested.netuid === null ? "muted" : "default"),
      cardItem("Profiles", plan.candidateProfiles.profiles.length, plan.candidateProfiles.profiles.length ? "good" : "danger"),
      cardItem("Templates", plan.templates.templates.length, plan.templates.templates.length ? "good" : "danger"),
      cardItem("Doctor", titleCase(plan.doctor.status), plan.doctor.status === "pass" ? "good" : plan.doctor.status === "warning" ? "warning" : "danger"),
      cardItem("Conformance", titleCase(plan.conformance.status), plan.conformance.status === "pass" ? "good" : plan.conformance.status === "warning" ? "warning" : "danger"),
      cardItem("Passed gates", passed, passed ? "good" : "muted"),
      cardItem("Warnings", warning, warning ? "warning" : "muted"),
      cardItem("Blocked", blocked, blocked ? "danger" : "muted"),
      cardItem("Not configured", notConfigured, notConfigured ? "warning" : "muted"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: nextPrompt,
        adapter: plan.requested.adapter,
        netuid: plan.requested.netuid,
        onboardingStatus: plan.status,
      },
    }],
    warnings: plan.warnings,
    data: { plan },
  };
}

export function buildBittensorAdapterLaunchGateCard(report: BittensorSubnetAdapterLaunchGateReport): BittensorChatCard {
  const passed = report.requirements.filter((requirement) => requirement.status === "pass").length;
  const manual = report.requirements.filter((requirement) => requirement.status === "manual_review").length;
  const blocked = report.requirements.filter((requirement) => requirement.status === "blocked").length;
  const notConfigured = report.requirements.filter((requirement) => requirement.status === "not_configured").length;
  const nextPrompt = report.status === "mock_ready"
    ? `Run the Bittensor mock adapter dry-run harness${report.requested.netuid === null ? "" : ` for subnet ${report.requested.netuid}`}.`
    : report.status === "manual_review_required"
      ? `Review the real Bittensor subnet adapter canary plan${report.requested.netuid === null ? "" : ` for subnet ${report.requested.netuid}`} before any invocation.`
      : `Help me unblock Bittensor subnet adapter launch gates${report.requested.netuid === null ? "" : ` for subnet ${report.requested.netuid}`}.`;
  return {
    kind: "adapter_launch_gate",
    title: "Bittensor adapter launch gate",
    subtitle: titleCase(report.status),
    summary: report.nextActions[0] ?? "Review launch-gate requirements before any direct subnet service invocation.",
    tone: report.status === "mock_ready" ? "good" : report.status === "manual_review_required" ? "warning" : "danger",
    items: [
      cardItem("Adapter", report.requested.adapter ?? "Any"),
      cardItem("Netuid", report.requested.netuid ?? "Any", report.requested.netuid === null ? "muted" : "default"),
      cardItem("Mock ready", report.readyMockCount, report.readyMockCount ? "good" : "muted"),
      cardItem("Real review", report.readyRealCount, report.readyRealCount ? "warning" : "muted"),
      cardItem("Blocked entries", report.blockedCount, report.blockedCount ? "danger" : "muted"),
      cardItem("Passed", passed, passed ? "good" : "muted"),
      cardItem("Manual review", manual, manual ? "warning" : "muted"),
      cardItem("Blocked", blocked, blocked ? "danger" : "muted"),
      cardItem("Not configured", notConfigured, notConfigured ? "warning" : "muted"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: nextPrompt,
        adapter: report.requested.adapter,
        netuid: report.requested.netuid,
        launchGateStatus: report.status,
      },
    }],
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorAdapterEvidenceBundleCard(bundle: BittensorSubnetAdapterEvidenceBundle): BittensorChatCard {
  const required = bundle.requiredArtifacts.filter((artifact) => artifact.requiredBeforeRealCanary).length;
  const operator = bundle.requiredArtifacts.filter((artifact) => artifact.source === "operator").length;
  const canary = bundle.requiredArtifacts.filter((artifact) => artifact.source === "canary_review").length;
  const preflight = bundle.requiredArtifacts.filter((artifact) => artifact.source === "preflight").length;
  const blocked = bundle.launchGate.status === "blocked";
  const nextPrompt = blocked
    ? `Help me unblock the Bittensor adapter evidence bundle${bundle.requested.netuid === null ? "" : ` for subnet ${bundle.requested.netuid}`}.`
    : `Review the Bittensor adapter evidence bundle${bundle.requested.netuid === null ? "" : ` for subnet ${bundle.requested.netuid}`} before any real canary.`;
  return {
    kind: "adapter_evidence_bundle",
    title: "Bittensor adapter evidence bundle",
    subtitle: titleCase(bundle.launchGate.status),
    summary: bundle.nextActions[0] ?? "Collect evidence before any real subnet adapter canary.",
    tone: blocked ? "danger" : bundle.launchGate.status === "mock_ready" ? "good" : "warning",
    items: [
      cardItem("Adapter", bundle.requested.adapter ?? "Any"),
      cardItem("Netuid", bundle.requested.netuid ?? "Any", bundle.requested.netuid === null ? "muted" : "default"),
      cardItem("Onboarding", titleCase(bundle.onboarding.status), bundle.onboarding.status === "ready_for_preview_review" ? "good" : bundle.onboarding.status === "blocked" ? "danger" : "warning"),
      cardItem("Launch gate", titleCase(bundle.launchGate.status), blocked ? "danger" : bundle.launchGate.status === "mock_ready" ? "good" : "warning"),
      cardItem("Preflight", titleCase(bundle.preflight.status), bundle.preflight.status === "pass" ? "good" : bundle.preflight.status === "warning" ? "warning" : "danger"),
      cardItem("Canary evidence", bundle.preflight.readyForCanaryEvidence ? "Ready" : "Incomplete", bundle.preflight.readyForCanaryEvidence ? "good" : "warning"),
      cardItem("Required artifacts", required, required ? "warning" : "muted"),
      cardItem("Preflight artifacts", preflight, preflight ? "warning" : "muted"),
      cardItem("Canary items", canary, canary ? "warning" : "muted"),
      cardItem("Operator approvals", operator, operator ? "warning" : "muted"),
      cardItem("Warnings", bundle.exportWarnings.length, bundle.exportWarnings.length ? "warning" : "muted"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: nextPrompt,
        adapter: bundle.requested.adapter,
        netuid: bundle.requested.netuid,
        launchGateStatus: bundle.launchGate.status,
      },
    }],
    warnings: bundle.exportWarnings,
    data: { bundle },
  };
}

export function buildBittensorAdapterEvidenceReviewCard(review: BittensorSubnetAdapterEvidenceReviewDecision): BittensorChatCard {
  return {
    kind: "adapter_evidence_review",
    title: "Bittensor adapter evidence review",
    subtitle: titleCase(review.status),
    summary: review.summary,
    tone: review.status === "mock_dry_run_ready" ? "good" : review.status === "manual_real_canary_review_required" ? "warning" : "danger",
    items: [
      cardItem("Adapter", review.requested.adapter ?? "Any"),
      cardItem("Netuid", review.requested.netuid ?? "Any", review.requested.netuid === null ? "muted" : "default"),
      cardItem("Decision", titleCase(review.status), review.status === "mock_dry_run_ready" ? "good" : review.status === "blocked" ? "danger" : "warning"),
      cardItem("Launch gate", titleCase(review.launchGateStatus), review.launchGateStatus === "mock_ready" ? "good" : review.launchGateStatus === "blocked" ? "danger" : "warning"),
      cardItem("Onboarding", titleCase(review.onboardingStatus), review.onboardingStatus === "ready_for_preview_review" ? "good" : review.onboardingStatus === "blocked" ? "danger" : "warning"),
      cardItem("Required artifacts", review.requiredArtifactCount, review.requiredArtifactCount ? "warning" : "muted"),
      cardItem("Missing required", review.missingRequiredArtifactCount, review.missingRequiredArtifactCount ? "danger" : "good"),
      cardItem("Blocked reasons", review.blockedReasons.length, review.blockedReasons.length ? "danger" : "good"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: review.nextPrompt,
        adapter: review.requested.adapter,
        netuid: review.requested.netuid,
        evidenceReviewStatus: review.status,
      },
    }],
    warnings: review.warnings,
    data: { review },
  };
}

export function buildBittensorAdapterOperatorHandoffCard(handoff: BittensorSubnetAdapterOperatorHandoff): BittensorChatCard {
  const blocked = handoff.status === "blocked";
  const nextPrompt = blocked
    ? `Help me unblock the Bittensor adapter operator handoff${handoff.requested.netuid === null ? "" : ` for subnet ${handoff.requested.netuid}`}.`
    : handoff.status === "mock_rehearsal_ready"
      ? `Archive the Bittensor mock adapter handoff${handoff.requested.netuid === null ? "" : ` for subnet ${handoff.requested.netuid}`} and list the remaining real-canary blockers.`
      : `Prepare the manual real-adapter canary packet${handoff.requested.netuid === null ? "" : ` for subnet ${handoff.requested.netuid}`} without invoking the subnet.`;
  return {
    kind: "adapter_operator_handoff",
    title: "Bittensor adapter operator handoff",
    subtitle: titleCase(handoff.status),
    summary: handoff.nextActions[0] ?? "Review adapter handoff gates before any subnet service execution.",
    tone: blocked ? "danger" : handoff.status === "mock_rehearsal_ready" ? "good" : "warning",
    items: [
      cardItem("Adapter", handoff.requested.adapter ?? "Any"),
      cardItem("Netuid", handoff.requested.netuid ?? "Any", handoff.requested.netuid === null ? "muted" : "default"),
      cardItem("Evidence review", titleCase(handoff.evidenceReview.status), handoff.evidenceReview.status === "blocked" ? "danger" : handoff.evidenceReview.status === "mock_dry_run_ready" ? "good" : "warning"),
      cardItem("Conformance", titleCase(handoff.conformanceExport.status), handoff.conformanceExport.status === "pass" ? "good" : handoff.conformanceExport.status === "warning" ? "warning" : "danger"),
      cardItem("Dry-run", titleCase(handoff.dryRunExport.status), handoff.dryRunExport.status === "pass" ? "good" : handoff.dryRunExport.status === "warning" ? "warning" : "danger"),
      cardItem("Provider evidence", handoff.providerRegistry.matchingReadyProviderCount, handoff.providerRegistry.matchingReadyProviderCount ? "warning" : "muted"),
      cardItem("Warnings", handoff.warnings.length, handoff.warnings.length ? "warning" : "muted"),
      cardItem("Next actions", handoff.nextActions.length, handoff.nextActions.length ? "default" : "muted"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: nextPrompt,
        adapter: handoff.requested.adapter,
        netuid: handoff.requested.netuid,
        operatorHandoffStatus: handoff.status,
      },
    }, {
      label: "Copy markdown",
      kind: "copy_payload",
      payload: {
        markdown: handoff.markdown,
      },
    }],
    warnings: handoff.warnings,
    data: { handoff },
  };
}

export function buildBittensorAdapterMarketplaceCard(marketplace: BittensorSubnetAdapterMarketplace): BittensorChatCard {
  const firstActionable = marketplace.entries.find((entry) =>
    entry.status === "mock_ready" || entry.status === "manual_review_required" || entry.status === "blocked" || entry.status === "needs_adapter"
  );
  const prompt = firstActionable
    ? firstActionable.status === "mock_ready"
      ? `Build a ${firstActionable.serviceAdapter.replace(/_/g, " ")} adapter operator handoff packet for subnet ${firstActionable.netuid}.`
      : firstActionable.status === "manual_review_required"
        ? `Prepare a manual canary review for the ${firstActionable.serviceAdapter.replace(/_/g, " ")} adapter on subnet ${firstActionable.netuid} without invoking it.`
        : firstActionable.status === "blocked"
          ? `Help me fix the blocked ${firstActionable.serviceAdapter.replace(/_/g, " ")} adapter for subnet ${firstActionable.netuid}.`
          : `Help me configure a ${firstActionable.serviceAdapter.replace(/_/g, " ")} adapter for subnet ${firstActionable.netuid} without enabling real execution.`
    : "Show me the next safest Bittensor subnet adapter onboarding step.";
  return {
    kind: "adapter_marketplace",
    title: "Bittensor subnet adapter marketplace",
    subtitle: titleCase(marketplace.status),
    summary: marketplace.nextActions[0] ?? "Review which subnet service adapters are universal-only, missing, mock-ready, or waiting for manual review.",
    tone: marketplace.status === "pass" ? "good" : marketplace.status === "fail" ? "danger" : "warning",
    items: [
      cardItem("Total shown", marketplace.total),
      cardItem("Mock-ready", marketplace.summary.mockReady, marketplace.summary.mockReady ? "good" : "muted"),
      cardItem("Manual review", marketplace.summary.manualReviewRequired, marketplace.summary.manualReviewRequired ? "warning" : "muted"),
      cardItem("Needs adapter", marketplace.summary.needsAdapter, marketplace.summary.needsAdapter ? "warning" : "muted"),
      cardItem("Blocked", marketplace.summary.blocked, marketplace.summary.blocked ? "danger" : "good"),
      cardItem("Universal-only", marketplace.summary.universalOnly, marketplace.summary.universalOnly ? "default" : "muted"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt,
        marketplaceStatus: marketplace.status,
        firstActionable,
      },
    }],
    warnings: marketplace.warnings,
    data: { marketplace },
  };
}

export function buildBittensorAdapterRoadmapCard(roadmap: BittensorSubnetAdapterRoadmap): BittensorChatCard {
  const top = roadmap.recommendations[0] ?? null;
  const highPriority = roadmap.recommendations.filter((recommendation) => recommendation.priority === "high").length;
  const mediumPriority = roadmap.recommendations.filter((recommendation) => recommendation.priority === "medium").length;
  return {
    kind: "adapter_roadmap",
    title: "Bittensor adapter roadmap",
    subtitle: roadmap.goal ?? "Marketplace-based plan",
    summary: top?.rationale ?? "No immediate direct subnet service adapter work is visible in the current marketplace slice.",
    tone: highPriority ? "warning" : roadmap.status === "pass" ? "good" : "warning",
    items: [
      cardItem("Recommendations", roadmap.recommendations.length, roadmap.recommendations.length ? "default" : "muted"),
      cardItem("High priority", highPriority, highPriority ? "warning" : "muted"),
      cardItem("Medium priority", mediumPriority, mediumPriority ? "default" : "muted"),
      cardItem("Top adapter", top?.serviceAdapter.replace(/_/g, " ") ?? "None", top ? "default" : "muted"),
      cardItem("Candidate netuids", top?.candidateNetuids.length ? top.candidateNetuids.join(", ") : "None", top?.candidateNetuids.length ? "default" : "muted"),
      cardItem("Blocked marketplace entries", roadmap.marketplaceSummary.blocked, roadmap.marketplaceSummary.blocked ? "danger" : "good"),
    ],
    actions: top ? [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: top.nextPrompt,
        serviceAdapter: top.serviceAdapter,
        candidateNetuids: top.candidateNetuids,
      },
    }] : [],
    warnings: roadmap.warnings,
    data: { roadmap },
  };
}

export function buildBittensorAdapterApprovalAuditCard(report: BittensorSubnetAdapterRuntimeApprovalAudit): BittensorChatCard {
  const nextPrompt = report.activeCount
    ? "Review active Bittensor adapter request approvals and remove any stale entries."
    : "Help me prepare a safe exact-SHA Bittensor adapter request approval after evidence review.";
  return {
    kind: "adapter_approval_audit",
    title: "Bittensor adapter approval audit",
    subtitle: titleCase(report.status),
    summary: report.warnings[0] ?? (report.activeCount ? "Active exact request approvals are configured." : "No active request approvals are configured."),
    tone: report.status === "pass" ? "good" : "warning",
    items: [
      cardItem("Configured", report.configured ? "Yes" : "No", report.configured ? "default" : "warning"),
      cardItem("Active approvals", report.activeCount, report.activeCount ? "good" : "warning"),
      cardItem("Expired", report.expiredCount, report.expiredCount ? "warning" : "muted"),
      cardItem("Invalid", report.invalidCount, report.invalidCount ? "danger" : "muted"),
      cardItem("Visible hash", report.entries[0]?.requestSha256Prefix ?? "None", report.entries[0] ? "muted" : "warning"),
      cardItem("Checked", report.checkedAt, "muted"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: nextPrompt,
        approvalAuditStatus: report.status,
        activeCount: report.activeCount,
      },
    }],
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorAdapterCanaryGateCard(audit: BittensorSubnetAdapterCanaryGateAudit): BittensorChatCard {
  const tone = audit.status === "blocked" ? "danger" : audit.status === "safe_idle" ? "good" : "warning";
  const nextPrompt = audit.status === "canary_armed"
    ? "Help me close the Bittensor real-adapter canary window safely."
    : audit.status === "preview_ready"
      ? "Help me prepare the final reviewed Bittensor adapter canary acknowledgement checklist."
      : audit.status === "blocked"
        ? "Explain the Bittensor adapter canary gate blockers and how to fix them."
        : "Show the next safe Bittensor subnet adapter rehearsal step without real execution.";
  return {
    kind: "adapter_canary_gate",
    title: "Bittensor adapter canary gate",
    subtitle: audit.status.replace(/_/g, " "),
    summary: audit.blockers[0] ?? audit.warnings[0] ?? "Real subnet adapter invocation is idle and gated.",
    tone,
    items: [
      cardItem("Real adapters", audit.realAdaptersEnabled ? "Enabled" : "Off", audit.realAdaptersEnabled ? "warning" : "good"),
      cardItem("Canary ack", audit.canaryAcknowledgementEnabled ? "Enabled" : "Off", audit.canaryAcknowledgementEnabled ? "warning" : "good"),
      cardItem("Ready real adapters", audit.readyRealAdapterCount, audit.readyRealAdapterCount ? "warning" : "muted"),
      cardItem("Active approvals", audit.activeApprovalCount, audit.activeApprovalCount ? "warning" : "muted"),
      cardItem("Invalid approvals", audit.invalidApprovalCount, audit.invalidApprovalCount ? "danger" : "muted"),
      cardItem("Allowlist entries", audit.endpointAllowlistCount, audit.endpointAllowlistCount ? "muted" : "warning"),
      cardItem("Checked", audit.checkedAt, "muted"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: nextPrompt,
        canaryGateStatus: audit.status,
        realAdaptersEnabled: audit.realAdaptersEnabled,
        canaryAcknowledgementEnabled: audit.canaryAcknowledgementEnabled,
      },
    }],
    warnings: uniqueWarnings(audit.blockers, audit.warnings),
    data: { audit },
  };
}

export function buildBittensorAdapterProviderRegistryCard(registry: BittensorSubnetAdapterProviderRegistry): BittensorChatCard {
  const tone = registry.status === "blocked" ? "danger" : registry.status === "ready_for_canary" ? "warning" : registry.status === "empty" ? "warning" : "default";
  return {
    kind: "adapter_provider_registry",
    title: "Bittensor adapter provider registry",
    subtitle: registry.status.replace(/_/g, " "),
    summary: registry.warnings[0] ?? "Reviewed provider candidates are tracked as evidence only.",
    tone,
    items: [
      cardItem("Configured", registry.configured ? "Yes" : "No", registry.configured ? "default" : "warning"),
      cardItem("Providers", registry.providerCount, registry.providerCount ? "default" : "warning"),
      cardItem("Canary-ready", registry.readyForCanaryCount, registry.readyForCanaryCount ? "warning" : "muted"),
      cardItem("Blocked", registry.blockedCount, registry.blockedCount ? "danger" : "muted"),
      cardItem("Template env", registry.template.env.key, "muted"),
      cardItem("Generated", registry.generatedAt, "muted"),
    ],
    actions: [{
      label: "Copy template",
      kind: "copy_payload",
      payload: {
        envKey: registry.template.env.key,
        envValue: registry.template.env.value,
      },
    }, {
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: registry.status === "ready_for_canary"
          ? "Audit the Bittensor adapter canary gate before using this provider registry evidence."
          : "Help me complete the Bittensor adapter provider registry review without real execution.",
        providerRegistryStatus: registry.status,
      },
    }],
    warnings: registry.warnings,
    data: { registry },
  };
}

export function buildBittensorAdapterApprovalTemplateCard(template: BittensorSubnetAdapterRuntimeApprovalTemplate): BittensorChatCard {
  return {
    kind: "adapter_approval_template",
    title: "Bittensor adapter approval template",
    subtitle: `${template.approval.serviceAdapter} · subnet ${template.approval.netuid}`,
    summary: "Short-lived exact request approval template generated for a reviewed canary. This does not invoke or authorize a subnet service until an operator deliberately configures it.",
    tone: "warning",
    items: [
      cardItem("Adapter", template.approval.serviceAdapter),
      cardItem("Netuid", template.approval.netuid),
      cardItem("Request SHA-256", `${template.approval.requestSha256.slice(0, 12)}...`, "muted"),
      cardItem("Approved by", template.approval.approvedBy || "operator"),
      cardItem("Expires", template.approval.expiresAt ?? "Unset", template.approval.expiresAt ? "warning" : "danger"),
      cardItem("Env key", template.env.key, "muted"),
    ],
    actions: [{
      label: "Copy approval JSON",
      kind: "copy_payload",
      payload: {
        envKey: template.env.key,
        envValue: template.env.value,
      },
    }, {
      label: "Audit approvals after canary",
      kind: "send_to_chat",
      payload: {
        prompt: "Audit Bittensor subnet adapter request approvals and remove stale entries.",
        netuid: template.approval.netuid,
        serviceAdapter: template.approval.serviceAdapter,
      },
    }],
    warnings: template.warnings,
    data: {
      template: {
        ...template,
        approval: {
          ...template.approval,
          requestSha256: template.approval.requestSha256,
        },
      },
    },
  };
}

export function buildBittensorAdapterCanaryOperatorPacketCard(packet: BittensorSubnetAdapterCanaryOperatorPacket): BittensorChatCard {
  const tone = packet.status === "approval_template_ready"
    ? "warning"
    : packet.status === "needs_preview_hash"
      ? "warning"
      : "danger";
  const prompt = packet.status === "approval_template_ready"
    ? "Audit Bittensor subnet adapter request approvals after this canary."
    : packet.status === "needs_preview_hash"
      ? "Run a Bittensor subnet adapter preview and prepare the exact request SHA-256 for review."
      : "Help me unblock the Bittensor adapter canary packet before any real adapter invocation.";
  const actions: BittensorChatCardAction[] = [];
  if (packet.approvalTemplate) {
    actions.push({
      label: "Copy approval JSON",
      kind: "copy_payload",
      payload: {
        envKey: packet.approvalTemplate.env.key,
        envValue: packet.approvalTemplate.env.value,
      },
    });
  }
  actions.push({
    label: "Continue safely",
    kind: "send_to_chat",
    payload: {
      prompt,
      adapter: packet.requested.adapter,
      netuid: packet.requested.netuid,
      packetStatus: packet.status,
    },
  });
  return {
    kind: "adapter_canary_packet",
    title: "Bittensor adapter canary packet",
    subtitle: titleCase(packet.status),
    summary: packet.status === "approval_template_ready"
      ? "Evidence review reached manual real-canary review and an exact request-hash approval template is ready for operator review."
      : packet.status === "needs_preview_hash"
        ? "Evidence review reached manual real-canary review, but the exact preview request SHA-256 is still required."
        : "Evidence is blocked or only mock-ready. No real adapter approval template is included.",
    tone,
    items: [
      cardItem("Adapter", packet.requested.adapter ?? "Any"),
      cardItem("Netuid", packet.requested.netuid ?? "Any", packet.requested.netuid === null ? "muted" : "default"),
      cardItem("Packet status", titleCase(packet.status), packet.status === "approval_template_ready" ? "warning" : packet.status === "blocked" ? "danger" : "warning"),
      cardItem("Evidence review", titleCase(packet.evidenceReview.status), packet.evidenceReview.status === "manual_real_canary_review_required" ? "warning" : packet.evidenceReview.status === "mock_dry_run_ready" ? "good" : "danger"),
      cardItem("Launch gate", titleCase(packet.evidenceReview.launchGateStatus), packet.evidenceReview.launchGateStatus === "manual_review_required" ? "warning" : packet.evidenceReview.launchGateStatus === "mock_ready" ? "good" : "danger"),
      cardItem("Request hash", packet.previewRequestSha256Prefix ? `${packet.previewRequestSha256Prefix}...` : "Required", packet.previewRequestSha256Prefix ? "muted" : "warning"),
      cardItem("Provider evidence", packet.providerRegistry.matchingReadyProviderCount, packet.providerRegistry.matchingReadyProviderCount ? "warning" : "muted"),
      cardItem("Approval env", packet.approvalTemplate ? packet.approvalTemplate.env.key : "Not included", packet.approvalTemplate ? "warning" : "muted"),
    ],
    actions,
    warnings: packet.warnings,
    data: { packet },
  };
}

export function buildBittensorAdapterCanaryOutcomeReportCard(report: BittensorSubnetAdapterCanaryOutcomeReport): BittensorChatCard {
  const tone = report.status === "pass"
    ? "good"
    : report.status === "warning"
      ? "warning"
      : "danger";
  return {
    kind: "adapter_canary_outcome_report",
    title: "Bittensor adapter canary outcome",
    subtitle: titleCase(report.status),
    summary: report.status === "blocked"
      ? "No adapter result is attached yet. Run a preview-confirm-invoke loop before archiving a canary outcome."
      : report.status === "fail"
        ? "The adapter outcome failed request-hash, result-validation, or invocation-success checks."
        : "Sanitized adapter outcome evidence is ready for review. Full hashes and operator secrets are omitted.",
    tone,
    items: [
      cardItem("Adapter", report.requested.adapter ?? "Any"),
      cardItem("Netuid", report.requested.netuid ?? "Any", report.requested.netuid === null ? "muted" : "default"),
      cardItem("Mode", titleCase(report.mode), report.mode === "mock" ? "warning" : "default"),
      cardItem("Status", titleCase(report.status), report.status === "pass" ? "good" : report.status === "warning" ? "warning" : "danger"),
      cardItem("Request hash", report.requestHash.matches ? "Matched" : "Not proven", report.requestHash.matches ? "good" : "warning"),
      cardItem("Expected hash", report.requestHash.expectedPrefix ? `${report.requestHash.expectedPrefix}...` : "Missing", report.requestHash.expectedPrefix ? "muted" : "warning"),
      cardItem("Actual hash", report.requestHash.actualPrefix ? `${report.requestHash.actualPrefix}...` : "Missing", report.requestHash.actualPrefix ? "muted" : "warning"),
      cardItem("Result validation", titleCase(report.resultValidation.status), report.resultValidation.status === "pass" ? "good" : report.resultValidation.status === "warning" ? "warning" : "danger"),
      cardItem("Canary gate", titleCase(report.canaryGate.status), report.canaryGate.status === "canary_armed" ? "warning" : "muted"),
      cardItem("Provider evidence", report.providerRegistry.matchingReadyProviderCount, report.providerRegistry.matchingReadyProviderCount ? "warning" : "muted"),
      cardItem("Full hash redacted", "Yes", "good"),
    ],
    actions: [{
      label: "Copy report markdown",
      kind: "copy_payload",
      payload: { markdown: report.markdown },
    }, {
      label: "Review gate",
      kind: "send_to_chat",
      payload: {
        prompt: "Audit the Bittensor adapter canary gate status.",
        adapter: report.requested.adapter,
        netuid: report.requested.netuid,
      },
    }],
    warnings: report.warnings,
    data: { report },
  };
}

export function buildBittensorAdapterManifestValidationCard(validation: BittensorSubnetAdapterManifestValidation): BittensorChatCard {
  const prompt = validation.serviceCallReady
    ? "Run Bittensor subnet adapter metadata conformance for this validated manifest."
    : "Help me fix this Bittensor subnet adapter manifest before configuring an endpoint.";
  return {
    kind: "adapter_manifest_validation",
    title: "Bittensor adapter manifest validation",
    subtitle: titleCase(validation.status),
    summary: validation.errors[0] ?? validation.warnings[0] ?? "Adapter manifest satisfies Matterhorn's no-execution adapter contract checks.",
    tone: validation.status === "pass" ? "good" : validation.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Adapter", validation.manifest.serviceAdapter),
      cardItem("Netuid", validation.manifest.netuid ?? "Missing", validation.manifest.netuid === null ? "danger" : "default"),
      cardItem("Service call", validation.serviceCallReady ? "Ready" : "Blocked", validation.serviceCallReady ? "good" : "danger"),
      cardItem("Safe mode", validation.manifest.safeModeRequired === true ? "Required" : "Missing", validation.manifest.safeModeRequired === true ? "good" : "danger"),
      cardItem("Request hash", validation.manifest.requestHashRequired === true ? "Required" : "Missing", validation.manifest.requestHashRequired === true ? "good" : "danger"),
      cardItem("Max response", validation.manifest.maxResponseBytes ?? "Missing", validation.manifest.maxResponseBytes === null ? "danger" : "default"),
      cardItem("Health", validation.manifest.healthStatus ?? "Missing", validation.manifest.healthStatus === "ok" ? "good" : validation.manifest.healthStatus ? "warning" : "danger"),
      cardItem("Contract", validation.contractValidation.ok ? "Valid" : "Blocked", validation.contractValidation.ok ? "good" : "danger"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt,
        netuid: validation.manifest.netuid,
        serviceAdapter: validation.manifest.serviceAdapter,
        validationStatus: validation.status,
      },
    }],
    warnings: uniqueWarnings(validation.errors, validation.warnings),
    data: { validation },
  };
}

export function buildBittensorAdapterResultValidationCard(validation: BittensorSubnetAdapterResultValidation): BittensorChatCard {
  return {
    kind: "adapter_result_validation",
    title: "Bittensor adapter result validation",
    subtitle: titleCase(validation.status),
    summary: validation.errors[0] ?? validation.warnings[0] ?? "Adapter result envelope is bounded, renderable, and free of obvious secret-shaped fields or values.",
    tone: validation.status === "pass" ? "good" : validation.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Mode", validation.summary.mode ?? "Unknown", validation.summary.mode ? "default" : "muted"),
      cardItem("Request hash", validation.summary.requestSha256Prefix ? `${validation.summary.requestSha256Prefix}...` : "Missing", validation.summary.requestSha256Prefix ? "muted" : "warning"),
      cardItem("Bytes", validation.summary.responseBytes),
      cardItem("Output", validation.summary.outputPresent ? "Present" : "Missing", validation.summary.outputPresent ? "good" : "warning"),
      cardItem("Usage", validation.summary.usagePresent ? "Present" : "Missing", validation.summary.usagePresent ? "default" : "muted"),
      cardItem("Cost", validation.summary.costPresent ? "Present" : "Missing", validation.summary.costPresent ? "default" : "muted"),
      cardItem("Status", titleCase(validation.status), validation.status === "pass" ? "good" : validation.status === "warning" ? "warning" : "danger"),
    ],
    actions: [{
      label: "Continue safely",
      kind: "send_to_chat",
      payload: {
        prompt: validation.status === "fail"
          ? "Help me fix this Bittensor adapter result envelope before canary review."
          : "Attach this Bittensor adapter result validation to the canary evidence bundle.",
        validationStatus: validation.status,
      },
    }],
    warnings: uniqueWarnings(validation.errors, validation.warnings),
    data: { validation },
  };
}

export function buildBittensorReadinessOperatorCard(operatorReport: BittensorReadinessOperatorReport): BittensorChatCard {
  return {
    kind: "readiness_report",
    title: "Bittensor operator readiness",
    subtitle: titleCase(operatorReport.status),
    summary: operatorReport.operatorSummary,
    tone: operatorReport.status === "pass" ? "good" : operatorReport.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Live checks", operatorReport.liveChecks.length, operatorReport.liveChecks.length ? "good" : "muted"),
      cardItem("Fallback warnings", operatorReport.fallbackChecks.length, operatorReport.fallbackChecks.length ? "warning" : "muted"),
      cardItem("Blockers", operatorReport.blockedChecks.length, operatorReport.blockedChecks.length ? "danger" : "muted"),
      cardItem("Checked", operatorReport.checkedAt, "muted"),
      cardItem("Next prompt", operatorReport.operatorPrompts[0]?.label ?? "None", operatorReport.operatorPrompts.length ? "default" : "muted"),
    ],
    actions: operatorReport.operatorPrompts.slice(0, 4).map((action) => ({
      label: action.label,
      kind: "send_to_chat",
      payload: { prompt: action.prompt, reason: action.reason, riskLevel: action.riskLevel },
    })),
    warnings: [...operatorReport.blockers, ...operatorReport.warnings],
    data: { operatorReport },
  };
}

export function buildBittensorWatchCards(watches: BittensorWatch[]): BittensorChatCard[] {
  if (!watches.length) {
    return [{
      kind: "watchlist",
      title: "Bittensor watchlist",
      summary: "No Bittensor watches are configured yet.",
      tone: "default",
      items: [cardItem("Watches", 0, "muted")],
      data: { watches },
    }];
  }
  return watches.slice(0, 6).map((watch) => ({
    kind: "watchlist",
    title: watch.label,
    subtitle: titleCase(watch.kind),
    summary: watch.netuid === null ? "Wallet or validator watch." : `Watching subnet ${watch.netuid}.`,
    tone: "default",
    items: [
      cardItem("Kind", titleCase(watch.kind)),
      cardItem("Netuid", watch.netuid ?? "Any", watch.netuid === null ? "muted" : "default"),
      cardItem("Wallet", watch.ss58Address ? shortSs58(watch.ss58Address) : "Not scoped", "muted"),
      cardItem("Validator", watch.validatorHotkey ? shortSs58(watch.validatorHotkey) : "Not scoped", "muted"),
      cardItem("Threshold", watch.threshold ?? "Not set", watch.threshold === null ? "muted" : "default"),
      cardItem("Reason", watch.reason ?? "User-created watch", watch.reason ? "default" : "muted"),
      cardItem("Last alert", watch.lastAlertAt ?? "None", watch.lastAlertAt ? "warning" : "muted"),
    ],
    actions: actionPromptForWatch(watch)
      ? [{
        label: "Investigate",
        kind: "send_to_chat",
        payload: { prompt: actionPromptForWatch(watch), watchId: watch.id },
      }]
      : [],
    data: { watch },
  }));
}

export function buildBittensorWatchEvaluationCards(evaluations: BittensorWatchEvaluation[]): BittensorChatCard[] {
  if (!evaluations.length) {
    return [{
      kind: "watchlist",
      title: "Bittensor watch check",
      summary: "No Bittensor watches are configured yet.",
      tone: "default",
      items: [cardItem("Watches checked", 0, "muted")],
      data: { evaluations },
    }];
  }
  const visibleEvaluations = evaluations
    .slice()
    .sort((a, b) => {
      const priority = (evaluation: BittensorWatchEvaluation) => {
        if (evaluation.status === "warning") return 0;
        if (evaluation.shouldNotify) return 1;
        if (evaluation.copilotActions?.length || evaluation.actionPrompt) return 2;
        if (evaluation.status === "unavailable") return 3;
        return 4;
      };
      const priorityDelta = priority(a) - priority(b);
      if (priorityDelta !== 0) return priorityDelta;
      return b.checkedAt.localeCompare(a.checkedAt);
    })
    .slice(0, 8);

  return visibleEvaluations.map((evaluation) => ({
    kind: "watchlist",
    title: evaluation.watch.label,
    subtitle: `${titleCase(evaluation.watch.kind)} · ${titleCase(evaluation.status)}`,
    summary: evaluation.summary,
    tone: evaluation.status === "ok" ? "good" : evaluation.status === "warning" ? "warning" : "danger",
    items: [
      cardItem("Status", titleCase(evaluation.status), evaluation.status === "ok" ? "good" : evaluation.status === "warning" ? "warning" : "danger"),
      cardItem("Observed", evaluation.observedValue ?? "Unavailable", evaluation.observedValue === null ? "muted" : "default"),
      cardItem("Threshold", evaluation.threshold ?? "Not set", evaluation.threshold === null ? "muted" : "default"),
      cardItem("Alert level", evaluation.alertLevel ?? "unknown", riskTone(evaluation.alertLevel ?? "unknown")),
      cardItem("Source", bittensorSourceLabel(evaluation.source), isReferenceBittensorData(evaluation.source) ? "warning" : "muted"),
      cardItem("Notify", evaluation.shouldNotify ? "Yes" : "No", evaluation.shouldNotify ? "warning" : "good"),
      cardItem("Intent", evaluation.notificationIntent ?? "none", evaluation.notificationIntent && evaluation.notificationIntent !== "none" ? "default" : "muted"),
      cardItem("Next actions", evaluation.copilotActions?.length ?? 0, evaluation.copilotActions?.length ? "default" : "muted"),
    ],
    actions: (evaluation.copilotActions?.length
      ? evaluation.copilotActions
      : evaluation.actionPrompt
        ? [copilotAction("Investigate", evaluation.actionPrompt, "Inspect this Bittensor watch.", evaluation.alertLevel ?? "unknown")]
        : []
    ).slice(0, 4).map((action) => ({
        label: action.label,
        kind: "send_to_chat",
        payload: {
          prompt: action.prompt,
          reason: action.reason,
          riskLevel: action.riskLevel,
          watchId: evaluation.watch.id,
          status: evaluation.status,
          alertKey: evaluation.alertKey,
          notificationIntent: evaluation.notificationIntent,
        },
      })),
    warnings: evaluation.status === "ok" ? [] : [evaluation.summary],
    data: { evaluation },
  }));
}

function normalizeStakePosition(value: unknown, subnets: BittensorSubnetSummary[]): BittensorStakePosition | null {
  const record = asRecord(value);
  const netuid = firstNumber(record, ["netuid", "net_uid", "subnet_id"]);
  if (netuid === null || netuid < 0) return null;
  const subnet = subnets.find((item) => item.netuid === netuid);
  const taoValue = firstNumber(record, ["tao_value", "taoValue", "value_tao", "stake_tao", "tao"]);
  const alphaAmount = firstNumber(record, ["alpha", "alpha_amount", "alphaAmount", "stake", "stake_alpha"]);
  const slippageRisk =
    taoValue === null ? "unknown" :
    taoValue > 100 ? "high" :
    taoValue > 10 ? "medium" :
    "low";

  return {
    netuid,
    subnetName: subnet?.name ?? firstString(record, ["subnet_name", "name"]) ?? `Subnet ${netuid}`,
    validatorHotkey: firstString(record, ["hotkey", "validatorHotkey", "validator_hotkey", "delegateHotkey", "delegate_hotkey"]),
    alphaAmount,
    taoValue,
    slippageRisk,
  };
}

function normalizeSidecarWalletSnapshot(
  raw: Record<string, unknown>,
  ss58Address: string,
  subnets: BittensorSubnetSummary[],
): BittensorWalletSnapshot | null {
  const source = asRecord(raw.data ?? raw.wallet ?? raw);
  const positionsSource =
    source.stakePositions ??
    source.stakes ??
    source.delegations ??
    source.positions ??
    source.allocations ??
    [];
  const stakePositions = arrayFrom(positionsSource)
    .map((row) => normalizeStakePosition(row, subnets))
    .filter(Boolean) as BittensorStakePosition[];
  const taoBalance = firstNumber(source, ["taoBalance", "tao_balance", "freeBalance", "free_balance", "balance", "free"]);
  const estimatedValueTao =
    firstNumber(source, ["estimatedValueTao", "estimated_value_tao", "totalValueTao", "total_value_tao"]) ??
    ((taoBalance ?? 0) + stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0));

  if (taoBalance === null && !stakePositions.length && !("data" in raw) && !("wallet" in raw)) {
    return null;
  }

  return {
    ss58Address,
    taoBalance,
    stakePositions,
    estimatedValueTao,
    providerStatus: "ok",
    updatedAt: firstString(source, ["updatedAt", "updated_at", "timestamp"]) ?? nowIso(),
    message: `Loaded from configured Subtensor sidecar${firstString(source, ["source"]) ? ` (${firstString(source, ["source"])})` : ""}.`,
    source: firstString(source, ["source", "provider", "dataSource", "data_source"]) ?? "subtensor-sidecar",
    block: firstNumber(source, ["block", "blockNumber", "block_number"]),
    freshness: firstString(source, ["freshness", "dataFreshness", "data_freshness"]),
    warnings: arrayFrom(source["warnings"]).filter((item): item is string => typeof item === "string" && item.trim().length > 0),
  };
}

export class TaoAppBittensorProvider implements BittensorProvider {
  async listSubnets(): Promise<BittensorSubnetSummary[]> {
    return cached(`bittensor:subnets:${sidecarBaseUrl() || "tao-app"}`, async () => {
      const sidecar = subtensorSidecarClient();
      if (sidecar) {
        const data = await sidecar.listSubnets();
        const normalized = arrayFrom(data?.["subnets"] ?? data)
          .map((row) => normalizeSubnet(row, firstString(asRecord(row), ["source"]) ?? "subtensor-sidecar"))
          .filter(Boolean) as BittensorSubnetSummary[];
        if (normalized.length) return normalized.sort((a, b) => a.netuid - b.netuid);
        if (data) return FALLBACK_SUBNETS;
      }

      try {
        const data = await taoAppClient().get("/api/beta/analytics/subnets/info");
        const normalized = arrayFrom(data).map((row) => normalizeSubnet(row, "tao.app")).filter(Boolean) as BittensorSubnetSummary[];
        return normalized.length ? normalized.sort((a, b) => a.netuid - b.netuid) : FALLBACK_SUBNETS;
      } catch {
        return FALLBACK_SUBNETS;
      }
    });
  }

  async getSubnet(netuid: number): Promise<BittensorSubnetDetail> {
    return cached(`bittensor:subnet:${sidecarBaseUrl() || "tao-app"}:${netuid}`, async () => {
      const subnets = await this.listSubnets();
      let summary = subnets.find((item) => item.netuid === netuid) ?? fallbackSubnet(netuid);
      let metagraphRaw: unknown = null;
      const sidecar = subtensorSidecarClient();

      if (sidecar) {
        const dynamicRaw = await sidecar.getSubnetDynamic(netuid);
        const dynamicSummary = dynamicRaw ? normalizeSubnet(dynamicRaw, firstString(dynamicRaw, ["source"]) ?? "subtensor-sidecar") : null;
        if (dynamicSummary) summary = dynamicSummary;
      }

      if (!sidecar && !summary.source.includes("sidecar") && !summary.source.includes("bittensor-python-sdk")) {
        try {
          const data = await taoAppClient().get(`/api/beta/analytics/subnets/info/${netuid}`);
          summary = normalizeSubnet(data, "tao.app") ?? summary;
        } catch {
          // Keep list/fallback summary.
        }
      }

      if (sidecar) {
        metagraphRaw = await sidecar.getSubnetMetagraph(netuid);
      }

      if (!sidecar && !metagraphRaw) {
        try {
          metagraphRaw = await taoAppClient().get(`/api/beta/analytics/subnets/metagraph/${netuid}`);
        } catch {
          metagraphRaw = null;
        }
      }

      return {
        ...summary,
        metagraphSummary: extractMetagraphSummary(metagraphRaw),
        topValidators: extractTopValidators(metagraphRaw),
        knownUseCases: knownUseCasesFor(summary.category),
        risks: risksFor(summary),
        links: [
          { label: "TAO.app", url: `https://www.tao.app/subnets/${netuid}` },
          { label: "Bittensor docs", url: "https://docs.learnbittensor.org/subnets/working-with-subnets" },
        ],
      };
    });
  }

  async getWallet(ss58Address: string): Promise<BittensorWalletSnapshot> {
    if (!isValidSs58Address(ss58Address)) {
      return {
        ss58Address,
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: nowIso(),
        message: "Address must be a valid watch-only SS58 public address.",
      };
    }

    const sidecar = subtensorSidecarClient();
    if (sidecar) {
      const [sidecarWallet, subnets] = await Promise.all([
        sidecar.getWallet(ss58Address),
        this.listSubnets(),
      ]);
      if (sidecarWallet) {
        const wallet = normalizeSidecarWalletSnapshot(sidecarWallet, ss58Address, subnets);
        if (wallet) return wallet;
      }
    }

    if (!readEnv("TAO_APP_API_KEY")) {
      return {
        ss58Address,
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: nowIso(),
        message: "TAO_APP_API_KEY is not configured. Wallet portfolio endpoints are unavailable.",
      };
    }

    try {
      const [allocation, subnets] = await Promise.all([
        taoAppClient().get("/api/beta/portfolio/allocation", { coldkey: ss58Address }),
        this.listSubnets(),
      ]);
      const rows = arrayFrom(allocation);
      let taoBalance: number | null = null;
      const stakePositions = rows
        .map((row) => {
          const record = asRecord(row);
          const netuid = firstNumber(record, ["netuid", "net_uid", "subnet_id"]);
          if (netuid === -1) {
            taoBalance = firstNumber(record, ["tao", "tao_value", "balance", "amount"]);
            return null;
          }
          return normalizeStakePosition(row, subnets);
        })
        .filter(Boolean) as BittensorStakePosition[];
      const stakeTotal = stakePositions.reduce((sum, position) => sum + (position.taoValue ?? 0), 0);
      return {
        ss58Address,
        taoBalance,
        stakePositions,
        estimatedValueTao: (taoBalance ?? 0) + stakeTotal,
        providerStatus: "ok",
        updatedAt: nowIso(),
      };
    } catch {
      return {
        ss58Address,
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: nowIso(),
        message: "Wallet provider data is unavailable for this address.",
      };
    }
  }

  async quoteAction(input: BittensorActionQuoteInput): Promise<BittensorActionQuote> {
    const netuid = typeof input.netuid === "number" && Number.isFinite(input.netuid) ? input.netuid : null;
    const subnet = netuid === null ? undefined : await this.getSubnet(netuid).catch(() => fallbackSubnet(netuid));
    const local = buildBittensorQuote(input, subnet);
    const sidecar = subtensorSidecarClient();
    if (!sidecar) return local;
    const sidecarQuote = await sidecar.quoteAction(input);
    if (!sidecarQuote) return local;
    const sidecarWarnings = arrayFrom(sidecarQuote["warnings"]).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return {
      ...local,
      priceTao: firstNumber(sidecarQuote, ["priceTao", "price_tao", "price"]) ?? local.priceTao,
      idealAlpha: firstNumber(sidecarQuote, ["idealAlpha", "ideal_alpha"]) ?? local.idealAlpha,
      expectedAlpha: firstNumber(sidecarQuote, ["expectedAlpha", "expected_alpha", "alphaOut", "alpha_out"]) ?? local.expectedAlpha,
      feeTao: firstNumber(sidecarQuote, ["feeTao", "fee_tao", "partialFeeTao", "partial_fee_tao"]) ?? local.feeTao,
      slippageBps: firstNumber(sidecarQuote, ["slippageBps", "slippage_bps", "priceImpactBps", "price_impact_bps"]) ?? local.slippageBps,
      rateTolerance: firstNumber(sidecarQuote, ["rateTolerance", "rate_tolerance"]) ?? local.rateTolerance,
      source: firstString(sidecarQuote, ["source", "provider", "dataSource", "data_source"]) ?? local.source,
      block: firstNumber(sidecarQuote, ["block", "blockNumber", "block_number"]) ?? local.block,
      freshness: firstString(sidecarQuote, ["freshness", "dataFreshness", "data_freshness"]) ?? local.freshness,
      warnings: [...local.warnings, "Quote enriched by configured Subtensor sidecar.", ...sidecarWarnings],
    };
  }
}

export const bittensorProvider: BittensorProvider = new TaoAppBittensorProvider();
