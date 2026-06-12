export type BittensorProviderStatus = "ok" | "provider_unavailable";

export type BittensorSubnetSummary = {
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
};

export type BittensorSubnetDetail = BittensorSubnetSummary & {
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
};

export type BittensorStakePosition = {
  netuid: number;
  subnetName: string;
  validatorHotkey: string | null;
  alphaAmount: number | null;
  taoValue: number | null;
  slippageRisk: "unknown" | "low" | "medium" | "high";
};

export type BittensorWalletSnapshot = {
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
};

export type BittensorActionQuote = {
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
};

export type BittensorChatIntent =
  | "learn"
  | "discover"
  | "wallet"
  | "stake_plan"
  | "subnet_use"
  | "monitor";

export type BittensorPlan = {
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
  >;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
};

export type BittensorCapabilityManifest = {
  netuid: number;
  name: string;
  category: string;
  utilitySummary: string;
  capabilityLevel: "universal_read" | "adapter_ready" | "adapter_required" | "unsupported";
  userBenefits: string[];
  examplePrompts: string[];
  supportedChatIntents: BittensorChatIntent[];
  serviceAdapter:
    | "universal"
    | "inference"
    | "data_search"
    | "compute"
    | "creative_media"
    | "agent_tooling"
    | "unsupported";
  requiredAuth: "none" | "api_key" | "external_wallet" | "unknown";
  costModel: "free_read" | "tao_fee" | "provider_priced" | "unknown";
  requestSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
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
};

export type BittensorSignerStatus = {
  mode: "read_only" | "injected_substrate" | "desktop_handoff" | "sidecar";
  available: boolean;
  canSign: boolean;
  canSubmit: boolean;
  network: "finney" | "test" | "local";
  address: string | null;
  message: string;
};

export type BittensorExtrinsicPreview = {
  action:
    | "stake"
    | "unstake"
    | "move_stake"
    | "transfer"
    | "set_child_hotkey"
    | "register"
    | "serve";
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
};

export type BittensorSignedResult = {
  status: "submitted" | "sidecar_unavailable" | "rejected" | "invalid_signature";
  txHash: string | null;
  blockHash: string | null;
  message: string;
  explorerUrl: string | null;
};

export type BittensorSigningHandoff = {
  id: string;
  action: BittensorExtrinsicPreview["action"];
  network: BittensorExtrinsicPreview["network"];
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
};

export type BittensorSubnetInvocation = {
  netuid: number;
  intent: "explain" | "metagraph" | "stake_guidance" | "wallet_guidance" | "service_call";
  adapter: BittensorCapabilityManifest["serviceAdapter"];
  supported: boolean;
  result: Record<string, unknown>;
  message: string;
  warnings: string[];
};

export type BittensorValidatorCandidate = {
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
};

export type BittensorValidatorComparison = {
  netuid: number;
  subnetName: string;
  strategy: "balanced" | "yield" | "safety";
  candidates: BittensorValidatorCandidate[];
  warnings: string[];
  source: string;
  updatedAt: string;
};

export type BittensorRiskLevel = "unknown" | "low" | "medium" | "high";

export type BittensorIntelligenceSignal = {
  label: string;
  value: string;
  tone: "default" | "good" | "warning" | "danger" | "muted";
  explanation: string;
};

export type BittensorCopilotAction = {
  label: string;
  prompt: string;
  reason: string;
  riskLevel: BittensorRiskLevel;
};

export type BittensorWatchSuggestion = {
  kind: BittensorWatch["kind"];
  label: string;
  netuid: number | null;
  ss58Address: string | null;
  validatorHotkey?: string | null;
  threshold: number | null;
  reason: string;
};

export type BittensorValidatorExposureInsight = {
  validatorHotkey: string;
  taoValue: number | null;
  subnetCount: number;
  netuids: number[];
  share: number | null;
  risk: BittensorRiskLevel;
  prompt: string;
};

export type BittensorValidatorIntelligenceReport = {
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
};

export type BittensorStakingPlanStep = {
  netuid: number;
  subnetName: string;
  validatorHotkey: string | null;
  amountTao: number;
  strategy: "balanced" | "yield" | "safety";
  expectedAlpha: number | null;
  slippageBps: number | null;
  source: string;
  warnings: string[];
  rationale: string;
};

export type BittensorStakingPlan = {
  kind: "staking_plan";
  goal: string;
  totalAmountTao: number;
  strategy: "balanced" | "yield" | "safety";
  steps: BittensorStakingPlanStep[];
  unsignedPreviews: BittensorExtrinsicPreview[];
  assumptions: string[];
  warnings: string[];
  nextQuestions: string[];
  copilotActions: BittensorCopilotAction[];
  watchSuggestions: BittensorWatchSuggestion[];
  updatedAt: string;
};

export type BittensorSubnetIntelligenceReport = {
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
};

export type BittensorWalletIntelligenceReport = {
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
};

export type BittensorWatch = {
  id: string;
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

export type BittensorWatchEvaluation = {
  watch: BittensorWatch;
  status: "ok" | "warning" | "unavailable";
  summary: string;
  observedValue: number | string | null;
  threshold: number | null;
  alertLevel?: BittensorRiskLevel;
  actionPrompt?: string | null;
  source: string;
  checkedAt: string;
};

export type BittensorReadinessCheck = {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  summary: string;
  details?: Record<string, unknown>;
};

export type BittensorReadinessReport = {
  status: "pass" | "warning" | "fail";
  checkedAt: string;
  checks: BittensorReadinessCheck[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
};

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
  | "intelligence_report";

export type BittensorChatCardItem = {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning" | "danger" | "muted";
};

export type BittensorChatCardAction = {
  label: string;
  kind: "copy_payload" | "open_url" | "sign_externally" | "send_to_chat";
  href?: string | null;
  payload?: Record<string, unknown> | null;
};

export type BittensorChatCard = {
  kind: BittensorChatCardKind;
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  tone?: "default" | "good" | "warning" | "danger";
  items: BittensorChatCardItem[];
  actions?: BittensorChatCardAction[];
  warnings?: string[];
  data?: Record<string, unknown>;
};

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
  strategy?: "balanced" | "yield" | "safety" | null;
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

export type BittensorSubtensorSidecarStatus = {
  configured: boolean;
  network: "finney" | "test" | "local";
  canRead: boolean;
  canPrepare: boolean;
  canSubmit: boolean;
  message: string;
};

export type BittensorSubtensorSidecarHealth = BittensorSubtensorSidecarStatus & {
  reachable: boolean;
  status: "healthy" | "unreachable" | "unconfigured";
  latencyMs: number | null;
  checkedAt: string;
};
