export const MATTERHORN_WORKFLOW_STATUSES = [
  "live_local",
  "planned_not_live",
  "preview_only",
  "external_handoff_required",
  "blocked_by_policy",
] as const;
export type MatterhornWorkflowStatus = (typeof MATTERHORN_WORKFLOW_STATUSES)[number];

export const MATTERHORN_WORKFLOW_CATEGORIES = [
  "wellness",
  "web3",
  "bittensor",
  "markets",
  "decentralized_services",
  "future",
] as const;
export type MatterhornWorkflowCategory = (typeof MATTERHORN_WORKFLOW_CATEGORIES)[number];

export const MATTERHORN_WORKFLOW_SERVICE_HOOK_TYPES = [
  "hosting",
  "storage",
  "email",
  "payments",
  "identity",
  "bittensor",
  "hyperliquid",
  "polymarket",
] as const;
export type MatterhornWorkflowServiceHookType =
  (typeof MATTERHORN_WORKFLOW_SERVICE_HOOK_TYPES)[number];

export interface MatterhornWorkflowInputPrompt {
  id: string;
  label: string;
  required: boolean;
  type: "text" | "number" | "boolean" | "select" | "multiselect" | "file_reference";
  options?: string[];
  helpText?: string;
}

export interface MatterhornWorkflowArtifact {
  id: string;
  name: string;
  mimeType: string;
  public: boolean;
  generatedByStep?: string;
  description?: string;
}

export interface MatterhornWorkflowStep {
  id: string;
  name: string;
  description: string;
  serviceHook?: MatterhornWorkflowServiceHookType;
  inputPromptIds: string[];
  outputArtifactIds: string[];
  status: MatterhornWorkflowStatus;
  requiresExternalSigner: boolean;
  requiresCustomerConfirmation: boolean;
}

export interface MatterhornWorkflowServiceHook {
  hook: MatterhornWorkflowServiceHookType;
  status: MatterhornWorkflowStatus;
  requiredAuth?: string[];
}

export interface MatterhornWorkflowSafetyPolicy {
  canExecute: boolean;
  liveExecutionEnabled: boolean;
  canSubmit: boolean;
  acceptsSecrets: boolean;
  acceptsPrivateKeys: boolean;
  acceptsRawSignatures: boolean;
  acceptsApiSecrets: boolean;
  requiresExternalSigner: boolean;
  requiresPreviewBeforeExecution: boolean;
  requiresConfirmationBeforeExecution: boolean;
}

export interface MatterhornWorkflowQAContract {
  checklist: string[];
  requiredTests: string[];
  successCriteria: string[];
  owner: string;
}

export interface MatterhornWorkflowManifest {
  version: "matterhorn.workflow.manifest.v1";
  workflowId: string;
  name: string;
  category: MatterhornWorkflowCategory;
  targetUserPersona: string;
  description: string;
  status: MatterhornWorkflowStatus;
  inputPrompts: MatterhornWorkflowInputPrompt[];
  requiredPublicContext: string[];
  generatedArtifacts: MatterhornWorkflowArtifact[];
  steps: MatterhornWorkflowStep[];
  serviceHooks: MatterhornWorkflowServiceHook[];
  safetyPolicy: MatterhornWorkflowSafetyPolicy;
  qaContract: MatterhornWorkflowQAContract;
}

export const DEFAULT_MATTERHORN_WORKFLOW_SAFETY_POLICY: MatterhornWorkflowSafetyPolicy = {
  canExecute: false,
  liveExecutionEnabled: false,
  canSubmit: false,
  acceptsSecrets: false,
  acceptsPrivateKeys: false,
  acceptsRawSignatures: false,
  acceptsApiSecrets: false,
  requiresExternalSigner: false,
  requiresPreviewBeforeExecution: true,
  requiresConfirmationBeforeExecution: true,
};

export const WELLNESS_CREATOR_SERVICES_WORKFLOW: MatterhornWorkflowManifest = {
  version: "matterhorn.workflow.manifest.v1",
  workflowId: "wellness_creator_services",
  name: "Wellness Creator Services",
  category: "wellness",
  targetUserPersona: "wellness creator or coach",
  description:
    "Helps a wellness creator plan services, content, and customer touchpoints without executing live provider actions.",
  status: "planned_not_live",
  inputPrompts: [
    {
      id: "service_name",
      label: "What is the name of your wellness service?",
      required: true,
      type: "text",
    },
    {
      id: "delivery_format",
      label: "How will you deliver it?",
      required: true,
      type: "select",
      options: ["video_course", "live_session", "newsletter", "community"],
    },
  ],
  requiredPublicContext: ["creator_name", "service_category", "target_audience"],
  generatedArtifacts: [
    {
      id: "service_plan",
      name: "Service Plan",
      mimeType: "application/json",
      public: false,
      generatedByStep: "plan_service",
    },
    {
      id: "content_calendar",
      name: "Content Calendar",
      mimeType: "text/markdown",
      public: false,
      generatedByStep: "build_calendar",
    },
  ],
  steps: [
    {
      id: "plan_service",
      name: "Plan Service",
      description: "Capture service name, format, and audience.",
      inputPromptIds: ["service_name", "delivery_format"],
      outputArtifactIds: ["service_plan"],
      status: "planned_not_live",
      requiresExternalSigner: false,
      requiresCustomerConfirmation: false,
    },
    {
      id: "build_calendar",
      name: "Build Content Calendar",
      description: "Generate a public content calendar based on the service plan.",
      inputPromptIds: ["service_name"],
      outputArtifactIds: ["content_calendar"],
      status: "planned_not_live",
      requiresExternalSigner: false,
      requiresCustomerConfirmation: false,
    },
  ],
  serviceHooks: [
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
    { hook: "hosting", status: "planned_not_live" },
  ],
  safetyPolicy: {
    canExecute: false,
    liveExecutionEnabled: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    requiresPreviewBeforeExecution: true,
    requiresConfirmationBeforeExecution: true,
  },
  qaContract: {
    checklist: [
      "Input prompts collect only public context",
      "No provider secrets are requested",
      "Artifacts are generated locally without live provider calls",
    ],
    requiredTests: ["scripts/wellness-creator-workflow.test.mjs"],
    successCriteria: [
      "Workflow manifest parses without errors",
      "All service hooks are planned_not_live",
      "Safety policy rejects secrets and live execution",
    ],
    owner: "claude",
  },
};

export const BITTENSOR_OPERATOR_WORKFLOW: MatterhornWorkflowManifest = {
  version: "matterhorn.workflow.manifest.v1",
  workflowId: "bittensor_operator",
  name: "Bittensor Operator",
  category: "bittensor",
  targetUserPersona: "TAO operator or delegator",
  description:
    "Guides a Bittensor operator through staking, delegation, and subnet monitoring using read-only previews and external-signer handoffs.",
  status: "live_local",
  inputPrompts: [
    {
      id: "wallet_address",
      label: "Wallet address to monitor or delegate from",
      required: true,
      type: "text",
      helpText: "Only the public address is needed. Never provide a private key.",
    },
    {
      id: "subnet",
      label: "Subnet ID",
      required: false,
      type: "number",
    },
  ],
  requiredPublicContext: ["wallet_address", "subnet", "stake_amount"],
  generatedArtifacts: [
    {
      id: "stake_preview",
      name: "Stake Preview",
      mimeType: "application/json",
      public: true,
      generatedByStep: "preview_stake",
    },
    {
      id: "external_signer_handoff",
      name: "External Signer Handoff",
      mimeType: "application/json",
      public: true,
      generatedByStep: "prepare_handoff",
    },
  ],
  steps: [
    {
      id: "preview_stake",
      name: "Preview Stake",
      description: "Show a read-only preview of the stake action.",
      serviceHook: "bittensor",
      inputPromptIds: ["wallet_address", "subnet"],
      outputArtifactIds: ["stake_preview"],
      status: "live_local",
      requiresExternalSigner: false,
      requiresCustomerConfirmation: false,
    },
    {
      id: "prepare_handoff",
      name: "Prepare External Signer Handoff",
      description: "Build a public handoff packet for the user to sign and submit externally.",
      serviceHook: "bittensor",
      inputPromptIds: ["wallet_address", "subnet"],
      outputArtifactIds: ["external_signer_handoff"],
      status: "external_handoff_required",
      requiresExternalSigner: true,
      requiresCustomerConfirmation: true,
    },
  ],
  serviceHooks: [{ hook: "bittensor", status: "live_local" }],
  safetyPolicy: {
    canExecute: true,
    liveExecutionEnabled: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: true,
    requiresPreviewBeforeExecution: true,
    requiresConfirmationBeforeExecution: true,
  },
  qaContract: {
    checklist: [
      "Wallet address is public only",
      "Private keys and seed phrases are never accepted",
      "All on-chain actions use external-signer handoffs",
    ],
    requiredTests: ["scripts/bittensor-operator-playbook.test.mjs"],
    successCriteria: [
      "Workflow produces read-only previews",
      "Handoff packet contains no signing material",
      "Matterhorn never submits transactions",
    ],
    owner: "kimi",
  },
};

export const MARKET_READ_PREVIEW_WORKFLOW: MatterhornWorkflowManifest = {
  version: "matterhorn.workflow.manifest.v1",
  workflowId: "market_read_preview",
  name: "Market Read / Preview",
  category: "markets",
  targetUserPersona: "trader or market watcher",
  description:
    "Provides read-only market data, previews, and external-signer handoffs for Hyperliquid and Polymarket without live submission.",
  status: "preview_only",
  inputPrompts: [
    {
      id: "venue",
      label: "Which venue?",
      required: true,
      type: "select",
      options: ["hyperliquid", "polymarket"],
    },
    {
      id: "market_id",
      label: "Market or asset identifier",
      required: false,
      type: "text",
    },
  ],
  requiredPublicContext: ["venue", "market_id", "wallet_address"],
  generatedArtifacts: [
    {
      id: "market_preview",
      name: "Market Preview",
      mimeType: "application/json",
      public: true,
      generatedByStep: "generate_preview",
    },
    {
      id: "signing_handoff",
      name: "Signing Handoff",
      mimeType: "application/json",
      public: true,
      generatedByStep: "prepare_handoff",
    },
  ],
  steps: [
    {
      id: "generate_preview",
      name: "Generate Market Preview",
      description: "Return a read-only or unsigned preview for the requested market action.",
      inputPromptIds: ["venue", "market_id"],
      outputArtifactIds: ["market_preview"],
      status: "preview_only",
      requiresExternalSigner: false,
      requiresCustomerConfirmation: false,
    },
    {
      id: "prepare_handoff",
      name: "Prepare Signing Handoff",
      description: "Build an external-signer handoff packet for any action that leaves read-only mode.",
      inputPromptIds: ["venue", "market_id"],
      outputArtifactIds: ["signing_handoff"],
      status: "external_handoff_required",
      requiresExternalSigner: true,
      requiresCustomerConfirmation: true,
    },
  ],
  serviceHooks: [
    { hook: "hyperliquid", status: "preview_only" },
    { hook: "polymarket", status: "preview_only" },
  ],
  safetyPolicy: {
    canExecute: false,
    liveExecutionEnabled: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    requiresPreviewBeforeExecution: true,
    requiresConfirmationBeforeExecution: true,
  },
  qaContract: {
    checklist: [
      "Market data is read-only until external handoff",
      "No API secrets or private keys are requested",
      "Unsigned previews never become signed payloads inside Matterhorn",
    ],
    requiredTests: ["scripts/market-execution-safety-gate.test.mjs"],
    successCriteria: [
      "Workflow status is preview_only",
      "All service hooks are preview_only",
      "Safety policy has canSubmit: false and liveExecutionEnabled: false",
    ],
    owner: "kimi",
  },
};

export const DECENTRALIZED_SERVICES_PLANNER_WORKFLOW: MatterhornWorkflowManifest = {
  version: "matterhorn.workflow.manifest.v1",
  workflowId: "decentralized_services_planner",
  name: "Decentralized Services Planner",
  category: "decentralized_services",
  targetUserPersona: "builder or operator needing hosting, storage, email, payments, or identity",
  description:
    "Plans future decentralized-service actions across hosting, storage, email, payments, and identity without executing against any live provider.",
  status: "planned_not_live",
  inputPrompts: [
    {
      id: "capability",
      label: "Which decentralized service do you want to plan?",
      required: true,
      type: "select",
      options: ["hosting", "storage", "email", "payments", "identity"],
    },
    {
      id: "intent_description",
      label: "Describe what you want to do",
      required: true,
      type: "text",
    },
  ],
  requiredPublicContext: ["capability", "intent_description", "provider_preference"],
  generatedArtifacts: [
    {
      id: "service_preview",
      name: "Service Preview",
      mimeType: "application/json",
      public: true,
      generatedByStep: "plan_service",
    },
    {
      id: "provider_comparison",
      name: "Provider Comparison",
      mimeType: "text/markdown",
      public: true,
      generatedByStep: "compare_providers",
    },
  ],
  steps: [
    {
      id: "plan_service",
      name: "Plan Service",
      description: "Capture capability and intent, then produce a safe future-contract preview.",
      inputPromptIds: ["capability", "intent_description"],
      outputArtifactIds: ["service_preview"],
      status: "planned_not_live",
      requiresExternalSigner: false,
      requiresCustomerConfirmation: false,
    },
    {
      id: "compare_providers",
      name: "Compare Providers",
      description: "Surface example provider fixtures for the selected capability.",
      inputPromptIds: ["capability"],
      outputArtifactIds: ["provider_comparison"],
      status: "planned_not_live",
      requiresExternalSigner: false,
      requiresCustomerConfirmation: false,
    },
  ],
  serviceHooks: [
    { hook: "hosting", status: "planned_not_live" },
    { hook: "storage", status: "planned_not_live" },
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
    { hook: "identity", status: "planned_not_live" },
  ],
  safetyPolicy: {
    canExecute: false,
    liveExecutionEnabled: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    requiresPreviewBeforeExecution: true,
    requiresConfirmationBeforeExecution: true,
  },
  qaContract: {
    checklist: [
      "All service hooks are planned_not_live",
      "No live provider calls are made",
      "Previews are future-contract only",
    ],
    requiredTests: ["scripts/decentralized-services-contract.test.mjs"],
    successCriteria: [
      "Workflow status is planned_not_live",
      "No fixture accepts secrets",
      "No submit or sign route is implied",
    ],
    owner: "kimi",
  },
};

export const MATTERHORN_WORKFLOW_FIXTURES: Record<string, MatterhornWorkflowManifest> = {
  wellness_creator_services: WELLNESS_CREATOR_SERVICES_WORKFLOW,
  bittensor_operator: BITTENSOR_OPERATOR_WORKFLOW,
  market_read_preview: MARKET_READ_PREVIEW_WORKFLOW,
  decentralized_services_planner: DECENTRALIZED_SERVICES_PLANNER_WORKFLOW,
};

export interface MatterhornWorkflowEvidenceItem {
  id: string;
  label: string;
  value: string | number | boolean | null;
  mimeType?: string;
  public: boolean;
  source?: string;
  verifiedAt?: string | null;
}

export interface MatterhornWorkflowEvidenceBundle {
  version: "matterhorn.workflow.evidence-bundle.v1";
  workflowId: string;
  domain: string;
  requestedOutcome: string;
  inputPrompt: string;
  generatedArtifactType: string;
  safetyStatus: MatterhornWorkflowStatus;
  liveExecutionEnabled: false;
  acceptsCustody: false;
  acceptsSigning: false;
  acceptsSecrets: false;
  publicEvidence: MatterhornWorkflowEvidenceItem[];
  plannedServiceHooks: MatterhornWorkflowServiceHook[];
  safetyFlags: string[];
  createdAt: string;
  source: "operator" | "agent" | "customer" | "system";
  status: MatterhornWorkflowStatus;
  canExecute: false;
  evidenceHash: string;
}

export const WELLNESS_CREATOR_WORKFLOW_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "wellness_creator_services",
  domain: "wellness",
  requestedOutcome: "Plan a safe wellness creator service package without collecting PII or secrets.",
  inputPrompt: "Create a wellness program for my clients",
  generatedArtifactType: "service_plan",
  safetyStatus: "planned_not_live",
  liveExecutionEnabled: false,
  acceptsCustody: false,
  acceptsSigning: false,
  acceptsSecrets: false,
  publicEvidence: [
    {
      id: "client_goal",
      label: "Client goal",
      value: "REDACTED",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "service_tier",
      label: "Selected service tier",
      value: "monthly_yoga_coaching",
      mimeType: "text/plain",
      public: true,
      source: "agent",
    },
    {
      id: "delivery_format",
      label: "Delivery format",
      value: "live_session",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
  ],
  plannedServiceHooks: [
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
    { hook: "hosting", status: "planned_not_live" },
  ],
  safetyFlags: [
    "no_secrets_collected",
    "no_live_execution",
    "customer_pii_redacted_in_public_evidence",
  ],
  createdAt: "2026-06-19T12:00:00Z",
  source: "agent",
  status: "planned_not_live",
  canExecute: false,
  evidenceHash: "422205c6d38466073feaa2f89f272708bebd9ae2358653978380b2bc07af3b89",
};

export const BITTENSOR_BETA_WORKFLOW_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "bittensor_operator",
  domain: "bittensor",
  requestedOutcome: "Record the public inputs and safety checks for a TAO staking preview.",
  inputPrompt: "Show my Bittensor staking preview",
  generatedArtifactType: "stake_preview",
  safetyStatus: "external_handoff_required",
  liveExecutionEnabled: false,
  acceptsCustody: false,
  acceptsSigning: false,
  acceptsSecrets: false,
  publicEvidence: [
    {
      id: "wallet_address",
      label: "Wallet address",
      value: "5F3xxx...xxxx",
      mimeType: "text/plain",
      public: true,
      source: "customer",
      verifiedAt: "2026-06-19T12:00:00Z",
    },
    {
      id: "subnet",
      label: "Subnet ID",
      value: 1,
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "external_signer_required",
      label: "External signer required",
      value: true,
      mimeType: "text/plain",
      public: true,
      source: "system",
    },
  ],
  plannedServiceHooks: [{ hook: "bittensor", status: "live_local" }],
  safetyFlags: [
    "no_private_key_collected",
    "external_signer_required",
    "no_live_execution_by_matterhorn",
  ],
  createdAt: "2026-06-19T12:00:00Z",
  source: "operator",
  status: "external_handoff_required",
  canExecute: false,
  evidenceHash: "8c7b95b985070a721f94b0be660e2aac353fd23be2328e8794cdcb790f3b0aef",
};

export const HYPERLIQUID_PREVIEW_WORKFLOW_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "market_read_preview",
  domain: "hyperliquid",
  requestedOutcome: "Generate a read-only Hyperliquid market preview without submission or signing.",
  inputPrompt: "Preview a Hyperliquid trade",
  generatedArtifactType: "market_preview",
  safetyStatus: "preview_only",
  liveExecutionEnabled: false,
  acceptsCustody: false,
  acceptsSigning: false,
  acceptsSecrets: false,
  publicEvidence: [
    {
      id: "venue",
      label: "Venue",
      value: "hyperliquid",
      mimeType: "text/plain",
      public: true,
      source: "system",
    },
    {
      id: "market_id",
      label: "Market or asset identifier",
      value: "BTC-PERP",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "wallet_address",
      label: "Wallet address",
      value: "0x1234...abcd",
      mimeType: "text/plain",
      public: true,
      source: "customer",
      verifiedAt: "2026-06-19T12:00:00Z",
    },
  ],
  plannedServiceHooks: [{ hook: "hyperliquid", status: "preview_only" }],
  safetyFlags: [
    "no_secrets_collected",
    "no_live_execution",
    "preview_only_no_submission",
  ],
  createdAt: "2026-06-19T12:00:00Z",
  source: "agent",
  status: "preview_only",
  canExecute: false,
  evidenceHash: "67efcb8e3739e4c752de86a07f2eb45b25dbd7096d5aa68d87df02cc2466f22f",
};

export const POLYMARKET_PREVIEW_WORKFLOW_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "market_read_preview",
  domain: "polymarket",
  requestedOutcome: "Generate a read-only Polymarket market preview without submission or signing.",
  inputPrompt: "Preview a Polymarket trade",
  generatedArtifactType: "market_preview",
  safetyStatus: "preview_only",
  liveExecutionEnabled: false,
  acceptsCustody: false,
  acceptsSigning: false,
  acceptsSecrets: false,
  publicEvidence: [
    {
      id: "venue",
      label: "Venue",
      value: "polymarket",
      mimeType: "text/plain",
      public: true,
      source: "system",
    },
    {
      id: "market_id",
      label: "Market or asset identifier",
      value: "will-it-rain-in-nyc-2026-07-01",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "wallet_address",
      label: "Wallet address",
      value: "0xabcd...1234",
      mimeType: "text/plain",
      public: true,
      source: "customer",
      verifiedAt: "2026-06-19T12:00:00Z",
    },
  ],
  plannedServiceHooks: [{ hook: "polymarket", status: "preview_only" }],
  safetyFlags: [
    "no_secrets_collected",
    "no_live_execution",
    "preview_only_no_submission",
  ],
  createdAt: "2026-06-19T12:00:00Z",
  source: "agent",
  status: "preview_only",
  canExecute: false,
  evidenceHash: "e77a31b70aee28b0120981392e3ab69c8c1d1c5f072d74b2509e755e9a269fe2",
};

export const DECENTRALIZED_SERVICES_PLANNED_WORKFLOW_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "decentralized_services_planner",
  domain: "decentralized_services",
  requestedOutcome: "Capture the planned decentralized-service action and provider comparison.",
  inputPrompt: "Plan a decentralized storage upload",
  generatedArtifactType: "service_preview",
  safetyStatus: "planned_not_live",
  liveExecutionEnabled: false,
  acceptsCustody: false,
  acceptsSigning: false,
  acceptsSecrets: false,
  publicEvidence: [
    {
      id: "capability",
      label: "Selected capability",
      value: "storage",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "intent_description",
      label: "Intent description",
      value: "Pin a public research dataset to IPFS.",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "provider_fixture",
      label: "Example provider fixture",
      value: "example-storage-ipfs",
      mimeType: "text/plain",
      public: true,
      source: "agent",
    },
  ],
  plannedServiceHooks: [
    { hook: "storage", status: "planned_not_live" },
    { hook: "identity", status: "planned_not_live" },
  ],
  safetyFlags: [
    "no_secrets_collected",
    "no_live_provider_execution",
    "future_contract_only",
  ],
  createdAt: "2026-06-19T12:00:00Z",
  source: "agent",
  status: "planned_not_live",
  canExecute: false,
  evidenceHash: "6143f1edb3a656ea372ffb046887ddf3e123dd81a8aa80c4a6b81458747767b0",
};

export const MATTERHORN_WORKFLOW_EVIDENCE_BUNDLE_FIXTURES: Record<
  string,
  MatterhornWorkflowEvidenceBundle
> = {
  wellness_creator_workflow: WELLNESS_CREATOR_WORKFLOW_EVIDENCE_BUNDLE,
  bittensor_beta_workflow: BITTENSOR_BETA_WORKFLOW_EVIDENCE_BUNDLE,
  hyperliquid_preview_workflow: HYPERLIQUID_PREVIEW_WORKFLOW_EVIDENCE_BUNDLE,
  polymarket_preview_workflow: POLYMARKET_PREVIEW_WORKFLOW_EVIDENCE_BUNDLE,
  decentralized_services_planned_workflow: DECENTRALIZED_SERVICES_PLANNED_WORKFLOW_EVIDENCE_BUNDLE,
};

export interface MatterhornWorkflowTemplateSafetyBoundary {
  liveExecutionEnabled: false;
  canExecute: boolean;
  canSubmit: false;
  acceptsSecrets: false;
  acceptsPrivateKeys: false;
  acceptsRawSignatures: false;
  acceptsApiSecrets: false;
  requiresExternalSigner: boolean;
  allowsRealFunds: false;
}

export interface MatterhornWorkflowTemplate {
  version: "matterhorn.workflow.template.v1";
  templateId: string;
  title: string;
  category: MatterhornWorkflowCategory;
  intendedUser: string;
  promptStarters: string[];
  requiredPublicInputs: MatterhornWorkflowInputPrompt[];
  optionalPublicInputs: MatterhornWorkflowInputPrompt[];
  generatedArtifacts: MatterhornWorkflowArtifact[];
  evidenceBundleIds: string[];
  safetyBoundaries: MatterhornWorkflowTemplateSafetyBoundary;
  serviceHooks: MatterhornWorkflowServiceHook[];
}

export const DEFAULT_MATTERHORN_WORKFLOW_TEMPLATE_SAFETY_BOUNDARY: MatterhornWorkflowTemplateSafetyBoundary = {
  liveExecutionEnabled: false,
  canExecute: false,
  canSubmit: false,
  acceptsSecrets: false,
  acceptsPrivateKeys: false,
  acceptsRawSignatures: false,
  acceptsApiSecrets: false,
  requiresExternalSigner: false,
  allowsRealFunds: false,
};

export const WELLNESS_CREATOR_SERVICE_WORKFLOW_TEMPLATE: MatterhornWorkflowTemplate = {
  version: "matterhorn.workflow.template.v1",
  templateId: "wellness_creator_service_workflow",
  title: "Wellness Creator Service Workflow",
  category: "wellness",
  intendedUser: "personal trainer, gym instructor, yoga instructor, or dietician",
  promptStarters: [
    "Create a wellness program for my clients",
    "Design a nutrition plan",
    "Build a yoga class schedule",
    "Package my training services",
  ],
  requiredPublicInputs: [
    {
      id: "audience",
      label: "Who is the program for?",
      required: true,
      type: "text",
    },
    {
      id: "goal",
      label: "What is the primary goal?",
      required: true,
      type: "text",
    },
  ],
  optionalPublicInputs: [
    {
      id: "duration_weeks",
      label: "Program duration in weeks",
      required: false,
      type: "number",
    },
    {
      id: "equipment",
      label: "Available equipment",
      required: false,
      type: "text",
    },
  ],
  generatedArtifacts: [
    {
      id: "program_design_plan",
      name: "Program Design Plan",
      mimeType: "text/markdown",
      public: false,
    },
    {
      id: "weekly_schedule",
      name: "Weekly Schedule",
      mimeType: "text/markdown",
      public: false,
    },
    {
      id: "pricing_package_draft",
      name: "Pricing Package Draft",
      mimeType: "text/markdown",
      public: false,
    },
  ],
  evidenceBundleIds: ["wellness_creator_workflow"],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  serviceHooks: [
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
    { hook: "hosting", status: "planned_not_live" },
  ],
};

export const BITTENSOR_BETA_OPERATOR_WORKFLOW_TEMPLATE: MatterhornWorkflowTemplate = {
  version: "matterhorn.workflow.template.v1",
  templateId: "bittensor_beta_operator_workflow",
  title: "Bittensor Beta Operator Workflow",
  category: "bittensor",
  intendedUser: "TAO operator or delegator participating in the beta",
  promptStarters: [
    "Show my Bittensor staking preview",
    "Prepare a delegation handoff for subnet 1",
    "What is my current TAO balance?",
    "Generate an external signer packet for staking",
  ],
  requiredPublicInputs: [
    {
      id: "wallet_address",
      label: "Public wallet address",
      required: true,
      type: "text",
      helpText: "Only the public address. Never provide a private key or seed phrase.",
    },
  ],
  optionalPublicInputs: [
    {
      id: "subnet",
      label: "Subnet ID",
      required: false,
      type: "number",
    },
    {
      id: "stake_amount",
      label: "Stake amount to preview",
      required: false,
      type: "number",
    },
  ],
  generatedArtifacts: [
    {
      id: "stake_preview",
      name: "Stake Preview",
      mimeType: "application/json",
      public: true,
    },
    {
      id: "external_signer_handoff",
      name: "External Signer Handoff",
      mimeType: "application/json",
      public: true,
    },
  ],
  evidenceBundleIds: ["bittensor_beta_workflow"],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: true,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: true,
    allowsRealFunds: false,
  },
  serviceHooks: [{ hook: "bittensor", status: "live_local" }],
};

export const HYPERLIQUID_PREVIEW_WORKFLOW_TEMPLATE: MatterhornWorkflowTemplate = {
  version: "matterhorn.workflow.template.v1",
  templateId: "hyperliquid_preview_workflow",
  title: "Hyperliquid Preview Workflow",
  category: "markets",
  intendedUser: "trader who wants read-only Hyperliquid previews",
  promptStarters: [
    "Preview a Hyperliquid trade",
    "Show my Hyperliquid positions",
    "Generate a Hyperliquid signing handoff",
  ],
  requiredPublicInputs: [
    {
      id: "wallet_address",
      label: "Public wallet address",
      required: true,
      type: "text",
      helpText: "Only the public address. Never provide a private key.",
    },
  ],
  optionalPublicInputs: [
    {
      id: "market",
      label: "Market or asset",
      required: false,
      type: "text",
    },
    {
      id: "side",
      label: "Side",
      required: false,
      type: "select",
      options: ["buy", "sell", "long", "short"],
    },
  ],
  generatedArtifacts: [
    {
      id: "market_preview",
      name: "Market Preview",
      mimeType: "application/json",
      public: true,
    },
    {
      id: "signing_handoff",
      name: "Signing Handoff",
      mimeType: "application/json",
      public: true,
    },
  ],
  evidenceBundleIds: ["hyperliquid_preview_workflow"],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  serviceHooks: [{ hook: "hyperliquid", status: "preview_only" }],
};

export const POLYMARKET_PREVIEW_WORKFLOW_TEMPLATE: MatterhornWorkflowTemplate = {
  version: "matterhorn.workflow.template.v1",
  templateId: "polymarket_preview_workflow",
  title: "Polymarket Preview Workflow",
  category: "markets",
  intendedUser: "trader who wants read-only Polymarket previews",
  promptStarters: [
    "Preview a Polymarket trade",
    "Show my Polymarket positions",
    "Generate a Polymarket signing handoff",
  ],
  requiredPublicInputs: [
    {
      id: "wallet_address",
      label: "Public wallet address",
      required: true,
      type: "text",
      helpText: "Only the public address. Never provide a private key.",
    },
  ],
  optionalPublicInputs: [
    {
      id: "market_id",
      label: "Market ID",
      required: false,
      type: "text",
    },
    {
      id: "outcome",
      label: "Outcome",
      required: false,
      type: "select",
      options: ["yes", "no"],
    },
  ],
  generatedArtifacts: [
    {
      id: "market_preview",
      name: "Market Preview",
      mimeType: "application/json",
      public: true,
    },
    {
      id: "signing_handoff",
      name: "Signing Handoff",
      mimeType: "application/json",
      public: true,
    },
  ],
  evidenceBundleIds: ["polymarket_preview_workflow"],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  serviceHooks: [{ hook: "polymarket", status: "preview_only" }],
};

export const DECENTRALIZED_SERVICES_FUTURE_WORKFLOW_TEMPLATE: MatterhornWorkflowTemplate = {
  version: "matterhorn.workflow.template.v1",
  templateId: "decentralized_services_future_workflow",
  title: "Decentralized Services Future Workflow",
  category: "decentralized_services",
  intendedUser: "builder or operator planning future decentralized service actions",
  promptStarters: [
    "Plan a decentralized storage upload",
    "Preview a future email campaign",
    "Compare provider fixtures for hosting",
    "Plan identity-gated access for a resource",
  ],
  requiredPublicInputs: [
    {
      id: "capability",
      label: "Which decentralized service?",
      required: true,
      type: "select",
      options: ["hosting", "storage", "email", "payments", "identity"],
    },
    {
      id: "intent_description",
      label: "Describe what you want to do",
      required: true,
      type: "text",
    },
  ],
  optionalPublicInputs: [
    {
      id: "provider_preference",
      label: "Preferred provider fixture",
      required: false,
      type: "text",
    },
  ],
  generatedArtifacts: [
    {
      id: "service_preview",
      name: "Service Preview",
      mimeType: "application/json",
      public: true,
    },
    {
      id: "provider_comparison",
      name: "Provider Comparison",
      mimeType: "text/markdown",
      public: true,
    },
  ],
  evidenceBundleIds: ["decentralized_services_planned_workflow"],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  serviceHooks: [
    { hook: "hosting", status: "planned_not_live" },
    { hook: "storage", status: "planned_not_live" },
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
    { hook: "identity", status: "planned_not_live" },
  ],
};

export const MATTERHORN_WORKFLOW_TEMPLATE_REGISTRY: Record<string, MatterhornWorkflowTemplate> = {
  wellness_creator_service_workflow: WELLNESS_CREATOR_SERVICE_WORKFLOW_TEMPLATE,
  bittensor_beta_operator_workflow: BITTENSOR_BETA_OPERATOR_WORKFLOW_TEMPLATE,
  hyperliquid_preview_workflow: HYPERLIQUID_PREVIEW_WORKFLOW_TEMPLATE,
  polymarket_preview_workflow: POLYMARKET_PREVIEW_WORKFLOW_TEMPLATE,
  decentralized_services_future_workflow: DECENTRALIZED_SERVICES_FUTURE_WORKFLOW_TEMPLATE,
};

// -----------------------------------------------------------------------------
// Customer Workflow Template Registry
// -----------------------------------------------------------------------------
// Customer-facing template metadata for chat-first workflow selection.
// This is the canonical surface consumed by React UI, MCP, and CLI catalog tools.
// -----------------------------------------------------------------------------

export const MATTERHORN_CUSTOMER_WORKFLOW_STATUSES = [
  "beta_ready",
  "preview_only",
  "planned_not_live",
  "workflow_ready",
  "blank",
] as const;
export type MatterhornCustomerWorkflowStatus = (typeof MATTERHORN_CUSTOMER_WORKFLOW_STATUSES)[number];

export const MATTERHORN_CUSTOMER_WORKFLOW_RECOMMENDED_SURFACES = [
  "protocol_desk",
  "workflow_chat",
  "evidence_packet",
  "future_service",
] as const;
export type MatterhornCustomerWorkflowRecommendedSurface =
  (typeof MATTERHORN_CUSTOMER_WORKFLOW_RECOMMENDED_SURFACES)[number];

export const MATTERHORN_CUSTOMER_WORKFLOW_ICON_HINTS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "services",
  "blank",
] as const;
export type MatterhornCustomerWorkflowIconHint =
  (typeof MATTERHORN_CUSTOMER_WORKFLOW_ICON_HINTS)[number];

export const MATTERHORN_CUSTOMER_WORKFLOW_ACCENTS = [
  "matterhorn_blue",
  "neutral",
  "caution",
] as const;
export type MatterhornCustomerWorkflowAccent = (typeof MATTERHORN_CUSTOMER_WORKFLOW_ACCENTS)[number];

export const MATTERHORN_CUSTOMER_WORKFLOW_ROUTING_CHAT_MODES = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "services",
  "general",
] as const;
export type MatterhornCustomerWorkflowRoutingChatMode =
  (typeof MATTERHORN_CUSTOMER_WORKFLOW_ROUTING_CHAT_MODES)[number];

export const MATTERHORN_CUSTOMER_WORKFLOW_OPEN_PANELS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
] as const;
export type MatterhornCustomerWorkflowOpenPanel =
  (typeof MATTERHORN_CUSTOMER_WORKFLOW_OPEN_PANELS)[number];

export interface MatterhornCustomerWorkflowLaunchMetadata {
  primaryCta: string;
  secondaryCta: string;
  defaultPrompt: string;
  handoffContextLabel: string;
  recommendedSurface: MatterhornCustomerWorkflowRecommendedSurface;
}

export interface MatterhornCustomerWorkflowUiMetadata {
  iconHint: MatterhornCustomerWorkflowIconHint;
  accent: MatterhornCustomerWorkflowAccent;
  shortDescription: string;
}

export interface MatterhornCustomerWorkflowRoutingMetadata {
  chatMode: MatterhornCustomerWorkflowRoutingChatMode;
  opensPanel?: MatterhornCustomerWorkflowOpenPanel;
  startsSession: boolean;
}

export interface MatterhornCustomerWorkflowTemplate {
  version: "matterhorn.customer.workflow.template.v1";
  id: string;
  name: string;
  summary: string;
  promise: string;
  category: MatterhornWorkflowCategory;
  examplePrompts: string[];
  expectedArtifacts: MatterhornWorkflowArtifact[];
  requiredContext: MatterhornWorkflowInputPrompt[];
  optionalContext: MatterhornWorkflowInputPrompt[];
  status: MatterhornCustomerWorkflowStatus;
  safetyBoundaries: MatterhornWorkflowTemplateSafetyBoundary;
  forbiddenInputs: string[];
  handoffReceiptSupport: {
    supported: boolean;
    types?: string[];
    description?: string;
  };
  serviceHooks: MatterhornWorkflowServiceHook[];
  chatMode: string;
  launch: MatterhornCustomerWorkflowLaunchMetadata;
  ui: MatterhornCustomerWorkflowUiMetadata;
  routing: MatterhornCustomerWorkflowRoutingMetadata;
  recommendedCommands?: {
    cli?: string[];
    mcp?: string[];
  };
}

export const BITTENSOR_OPERATOR_CUSTOMER_TEMPLATE: MatterhornCustomerWorkflowTemplate = {
  version: "matterhorn.customer.workflow.template.v1",
  id: "bittensor_operator",
  name: "Use Bittensor",
  summary:
    "Read TAO balances, compare subnets and validators, and prepare external-signer staking handoffs.",
  promise:
    "You stay non-custodial. Matterhorn never holds your private key or submits a transaction.",
  category: "bittensor",
  examplePrompts: [
    "Show my TAO",
    "Which subnet is useful for image generation?",
    "Compare validators on subnet 14",
    "Prepare staking 1 TAO",
  ],
  expectedArtifacts: [
    {
      id: "balance_card",
      name: "TAO Balance Card",
      mimeType: "application/json",
      public: true,
      description: "Public TAO balance and stake overview.",
    },
    {
      id: "subnet_comparison",
      name: "Subnet Comparison",
      mimeType: "text/markdown",
      public: true,
      description: "Validator and subnet comparison for research.",
    },
    {
      id: "stake_preview",
      name: "Stake Preview",
      mimeType: "application/json",
      public: true,
      description: "Non-binding stake preview with estimated returns.",
    },
    {
      id: "external_signer_handoff",
      name: "External Signer Handoff",
      mimeType: "application/json",
      public: true,
      description: "Handoff payload for an external wallet or signer.",
    },
  ],
  requiredContext: [
    {
      id: "wallet_address",
      label: "Public wallet address",
      required: true,
      type: "text",
      helpText: "Only the public address. Never provide a private key or seed phrase.",
    },
  ],
  optionalContext: [
    {
      id: "subnet",
      label: "Subnet ID",
      required: false,
      type: "number",
    },
    {
      id: "stake_amount",
      label: "Stake amount to preview",
      required: false,
      type: "number",
    },
  ],
  status: "beta_ready",
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: true,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: true,
    allowsRealFunds: false,
  },
  forbiddenInputs: [
    "private key",
    "seed phrase",
    "mnemonic",
    "raw signature",
    "signed payload",
    "wallet export",
  ],
  handoffReceiptSupport: {
    supported: true,
    types: ["external_signer_handoff", "stake_preview_receipt"],
    description:
      "Produces an external-signer handoff and a public stake preview receipt.",
  },
  serviceHooks: [{ hook: "bittensor", status: "live_local" }],
  chatMode: "crypto chat",
  launch: {
    primaryCta: "Open Bittensor panel",
    secondaryCta: "Preview a stake handoff",
    defaultPrompt: "Show my TAO",
    handoffContextLabel: "Public wallet address",
    recommendedSurface: "protocol_desk",
  },
  ui: {
    iconHint: "bittensor",
    accent: "matterhorn_blue",
    shortDescription:
      "Read TAO balances and prepare external-signer staking handoffs.",
  },
  routing: {
    chatMode: "bittensor",
    opensPanel: "bittensor",
    startsSession: true,
  },
  recommendedCommands: {
    cli: ['matterhorn-work crypto chat --message "show my TAO" --json'],
    mcp: ["matterhorn_crypto_chat"],
  },
};

export const HYPERLIQUID_TRADER_CUSTOMER_TEMPLATE: MatterhornCustomerWorkflowTemplate = {
  version: "matterhorn.customer.workflow.template.v1",
  id: "hyperliquid_trader",
  name: "Trade on Hyperliquid",
  summary:
    "Preview Hyperliquid orders, check positions, and generate external-signer handoffs without live submission.",
  promise:
    "Preview-only. No live submission, no custody, and no signing by Matterhorn.",
  category: "markets",
  examplePrompts: [
    "Preview a Hyperliquid BTC-PERP trade",
    "Show my Hyperliquid exposure",
    "Generate a Hyperliquid signing handoff",
  ],
  expectedArtifacts: [
    {
      id: "market_preview",
      name: "Market Preview",
      mimeType: "application/json",
      public: true,
      description: "Read-only market preview with sizing and price estimates.",
    },
    {
      id: "signing_handoff",
      name: "Signing Handoff",
      mimeType: "application/json",
      public: true,
      description: "External-signer handoff for the user or wallet to sign.",
    },
  ],
  requiredContext: [
    {
      id: "wallet_address",
      label: "Public wallet address",
      required: true,
      type: "text",
      helpText: "Only the public address. Never provide a private key.",
    },
  ],
  optionalContext: [
    {
      id: "market",
      label: "Market or asset",
      required: false,
      type: "text",
    },
    {
      id: "side",
      label: "Side",
      required: false,
      type: "select",
      options: ["buy", "sell", "long", "short"],
    },
    {
      id: "size",
      label: "Order size",
      required: false,
      type: "number",
    },
  ],
  status: "preview_only",
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenInputs: [
    "private key",
    "API secret",
    "raw signature",
    "signed payload",
    "signed order",
  ],
  handoffReceiptSupport: {
    supported: true,
    types: ["market_preview", "signing_handoff"],
    description:
      "Produces a read-only market preview and an external-signer handoff.",
  },
  serviceHooks: [{ hook: "hyperliquid", status: "preview_only" }],
  chatMode: "crypto chat",
  launch: {
    primaryCta: "Open Hyperliquid panel",
    secondaryCta: "Preview a trade",
    defaultPrompt: "Preview a Hyperliquid BTC-PERP trade",
    handoffContextLabel: "Public wallet address",
    recommendedSurface: "protocol_desk",
  },
  ui: {
    iconHint: "hyperliquid",
    accent: "matterhorn_blue",
    shortDescription:
      "Preview Hyperliquid trades and generate external-signer handoffs.",
  },
  routing: {
    chatMode: "hyperliquid",
    opensPanel: "hyperliquid",
    startsSession: true,
  },
  recommendedCommands: {
    cli: ['matterhorn-work crypto chat --message "preview Hyperliquid BTC-PERP" --json'],
    mcp: ["matterhorn_hyperliquid_prepare_handoff"],
  },
};

export const POLYMARKET_RESEARCHER_CUSTOMER_TEMPLATE: MatterhornCustomerWorkflowTemplate = {
  version: "matterhorn.customer.workflow.template.v1",
  id: "polymarket_researcher",
  name: "Bet on Polymarket",
  summary:
    "Research Polymarket markets, preview positions, and prepare compliance-aware signing handoffs without live submission.",
  promise:
    "Preview-only. Compliance and external signer required. No live submission by Matterhorn.",
  category: "markets",
  examplePrompts: [
    "Summarize this Polymarket market",
    "Preview a Polymarket trade",
    "Show my Polymarket positions",
  ],
  expectedArtifacts: [
    {
      id: "market_preview",
      name: "Market Preview",
      mimeType: "application/json",
      public: true,
      description: "Read-only market preview with odds and outcome analysis.",
    },
    {
      id: "signing_handoff",
      name: "Signing Handoff",
      mimeType: "application/json",
      public: true,
      description: "External-signer handoff for the user or wallet to sign.",
    },
  ],
  requiredContext: [
    {
      id: "wallet_address",
      label: "Public wallet address",
      required: true,
      type: "text",
      helpText: "Only the public address. Never provide a private key.",
    },
  ],
  optionalContext: [
    {
      id: "market_id",
      label: "Market ID",
      required: false,
      type: "text",
    },
    {
      id: "outcome",
      label: "Outcome",
      required: false,
      type: "select",
      options: ["yes", "no"],
    },
  ],
  status: "preview_only",
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenInputs: [
    "private key",
    "API secret",
    "raw signature",
    "signed payload",
    "signed order",
  ],
  handoffReceiptSupport: {
    supported: true,
    types: ["market_preview", "signing_handoff"],
    description:
      "Produces a read-only market preview and an external-signer handoff.",
  },
  serviceHooks: [{ hook: "polymarket", status: "preview_only" }],
  chatMode: "crypto chat",
  launch: {
    primaryCta: "Open Polymarket panel",
    secondaryCta: "Research markets",
    defaultPrompt: "Summarize this Polymarket market",
    handoffContextLabel: "Public wallet address",
    recommendedSurface: "protocol_desk",
  },
  ui: {
    iconHint: "polymarket",
    accent: "matterhorn_blue",
    shortDescription:
      "Research Polymarket markets and prepare signing handoffs.",
  },
  routing: {
    chatMode: "polymarket",
    opensPanel: "polymarket",
    startsSession: true,
  },
  recommendedCommands: {
    cli: ['matterhorn-work crypto chat --message "preview Polymarket market" --json'],
    mcp: ["matterhorn_polymarket_prepare_handoff"],
  },
};

export const WELLNESS_CREATOR_WORKFLOW_CUSTOMER_TEMPLATE: MatterhornCustomerWorkflowTemplate = {
  version: "matterhorn.customer.workflow.template.v1",
  id: "wellness_creator_workflow",
  name: "Build a Wellness Creator business workflow",
  summary:
    "Design wellness programs, service packages, and client management workflows without giving medical advice.",
  promise:
    "Plan your wellness business. No medical advice. Service hooks remain planned-not-live until you connect providers.",
  category: "wellness",
  examplePrompts: [
    "Create a wellness program for my clients",
    "Design a nutrition plan",
    "Build a yoga class schedule",
    "Package my training services",
  ],
  expectedArtifacts: [
    {
      id: "program_design_plan",
      name: "Program Design Plan",
      mimeType: "text/markdown",
      public: true,
      description: "High-level program design with safety disclaimers.",
    },
    {
      id: "weekly_schedule",
      name: "Weekly Schedule",
      mimeType: "text/markdown",
      public: true,
      description: "Weekly session and content schedule.",
    },
    {
      id: "pricing_package_draft",
      name: "Pricing Package Draft",
      mimeType: "text/markdown",
      public: true,
      description: "Draft pricing and packaging options.",
    },
    {
      id: "service_plan",
      name: "Service Plan",
      mimeType: "application/json",
      public: true,
      description: "Public/redacted service plan for the workflow registry.",
    },
  ],
  requiredContext: [
    {
      id: "audience",
      label: "Who is the program for?",
      required: true,
      type: "text",
    },
    {
      id: "goal",
      label: "What is the primary goal?",
      required: true,
      type: "text",
    },
  ],
  optionalContext: [
    {
      id: "duration_weeks",
      label: "Program duration in weeks",
      required: false,
      type: "number",
    },
    {
      id: "equipment",
      label: "Available equipment",
      required: false,
      type: "text",
    },
  ],
  status: "workflow_ready",
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenInputs: [
    "medical diagnosis",
    "prescription advice",
    "protected health information beyond redacted goals",
  ],
  handoffReceiptSupport: {
    supported: true,
    types: ["service_plan", "content_calendar"],
    description:
      "Produces a public/redacted service plan and workflow evidence bundle.",
  },
  serviceHooks: [
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
    { hook: "hosting", status: "planned_not_live" },
  ],
  chatMode: "workflow chat",
  launch: {
    primaryCta: "Start wellness workflow",
    secondaryCta: "Plan a service",
    defaultPrompt: "Create a wellness program for my clients",
    handoffContextLabel: "Audience and goal",
    recommendedSurface: "workflow_chat",
  },
  ui: {
    iconHint: "wellness",
    accent: "neutral",
    shortDescription:
      "Design wellness programs and service packages without medical advice.",
  },
  routing: {
    chatMode: "wellness",
    startsSession: true,
  },
  recommendedCommands: {
    cli: [
      "matterhorn-work workflows catalog --workflow wellness_creator_workflow --include-prompts --json",
    ],
  },
};

export const DECENTRALIZED_SERVICES_OPERATOR_CUSTOMER_TEMPLATE: MatterhornCustomerWorkflowTemplate = {
  version: "matterhorn.customer.workflow.template.v1",
  id: "decentralized_services_operator",
  name: "Explore future decentralized services",
  summary:
    "Plan future decentralized service actions across storage, hosting, email, payments, and identity.",
  promise: "Future-contract planning only. No live provider execution.",
  category: "decentralized_services",
  examplePrompts: [
    "Plan a decentralized storage upload",
    "Preview a future email campaign",
    "Compare provider fixtures for hosting",
    "Plan identity-gated access for a resource",
  ],
  expectedArtifacts: [
    {
      id: "service_preview",
      name: "Service Preview",
      mimeType: "application/json",
      public: true,
      description: "Planned service action and provider comparison.",
    },
    {
      id: "provider_comparison",
      name: "Provider Comparison",
      mimeType: "text/markdown",
      public: true,
      description: "Comparison of example provider fixtures.",
    },
  ],
  requiredContext: [
    {
      id: "capability",
      label: "Which decentralized service?",
      required: true,
      type: "select",
      options: ["hosting", "storage", "email", "payments", "identity"],
    },
    {
      id: "intent_description",
      label: "Describe what you want to do",
      required: true,
      type: "text",
    },
  ],
  optionalContext: [
    {
      id: "provider_preference",
      label: "Preferred provider fixture",
      required: false,
      type: "text",
    },
  ],
  status: "planned_not_live",
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenInputs: [
    "private key",
    "API secret",
    "payment credential",
    "email password",
    "hosting credential",
  ],
  handoffReceiptSupport: {
    supported: false,
    description: "Future contract; handoffs are not yet implemented.",
  },
  serviceHooks: [
    { hook: "hosting", status: "planned_not_live" },
    { hook: "storage", status: "planned_not_live" },
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
    { hook: "identity", status: "planned_not_live" },
  ],
  chatMode: "services chat",
  launch: {
    primaryCta: "Plan future services",
    secondaryCta: "Compare fixtures",
    defaultPrompt: "Plan a decentralized storage upload",
    handoffContextLabel: "Capability and intent",
    recommendedSurface: "future_service",
  },
  ui: {
    iconHint: "services",
    accent: "neutral",
    shortDescription:
      "Plan future decentralized services across storage, hosting, email, payments, and identity.",
  },
  routing: {
    chatMode: "services",
    startsSession: true,
  },
  recommendedCommands: {
    cli: ["matterhorn-work services capabilities --json"],
  },
};

export const BLANK_CHAT_WORKFLOW_CUSTOMER_TEMPLATE: MatterhornCustomerWorkflowTemplate = {
  version: "matterhorn.customer.workflow.template.v1",
  id: "blank_chat_workflow",
  name: "Blank chat",
  summary: "Start a free-form chat session with the Matterhorn Work engine.",
  promise: "Open-ended assistance. You choose the goal.",
  category: "future",
  examplePrompts: [
    "What can you do?",
    "Help me think through a problem",
    "Draft an email",
  ],
  expectedArtifacts: [],
  requiredContext: [],
  optionalContext: [],
  status: "blank",
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenInputs: [],
  handoffReceiptSupport: {
    supported: false,
  },
  serviceHooks: [],
  chatMode: "free chat",
  launch: {
    primaryCta: "Start blank chat",
    secondaryCta: "Browse templates",
    defaultPrompt: "What can you do?",
    handoffContextLabel: "Goal",
    recommendedSurface: "workflow_chat",
  },
  ui: {
    iconHint: "blank",
    accent: "neutral",
    shortDescription:
      "Start a free-form chat with the Matterhorn Work engine.",
  },
  routing: {
    chatMode: "general",
    startsSession: true,
  },
};

export const MATTERHORN_CUSTOMER_WORKFLOW_TEMPLATE_REGISTRY: Record<
  string,
  MatterhornCustomerWorkflowTemplate
> = {
  bittensor_operator: BITTENSOR_OPERATOR_CUSTOMER_TEMPLATE,
  hyperliquid_trader: HYPERLIQUID_TRADER_CUSTOMER_TEMPLATE,
  polymarket_researcher: POLYMARKET_RESEARCHER_CUSTOMER_TEMPLATE,
  wellness_creator_workflow: WELLNESS_CREATOR_WORKFLOW_CUSTOMER_TEMPLATE,
  decentralized_services_operator: DECENTRALIZED_SERVICES_OPERATOR_CUSTOMER_TEMPLATE,
  blank_chat_workflow: BLANK_CHAT_WORKFLOW_CUSTOMER_TEMPLATE,
};


// -----------------------------------------------------------------------------
// Protocol Workspace Manifest Registry
// -----------------------------------------------------------------------------
// Integration-layer metadata that maps customer workflow templates to protocol
// workspaces without touching app UI code. Used by CLI, MCP, and runtime agents
// to decide how to launch and constrain a workspace session.
// -----------------------------------------------------------------------------

export const MATTERHORN_PROTOCOL_WORKSPACE_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "decentralized_services",
] as const;
export type MatterhornProtocolWorkspaceId =
  (typeof MATTERHORN_PROTOCOL_WORKSPACE_IDS)[number];

export const MATTERHORN_PROTOCOL_WORKSPACE_CUSTOMER_STATUSES = [
  "beta_ready",
  "preview_only",
  "workflow_ready",
  "planned_not_live",
] as const;
export type MatterhornProtocolWorkspaceCustomerStatus =
  (typeof MATTERHORN_PROTOCOL_WORKSPACE_CUSTOMER_STATUSES)[number];

export const MATTERHORN_PROTOCOL_WORKSPACE_LAUNCH_BEHAVIORS = [
  "starts_chat",
  "opens_desk",
  "planned_not_live",
] as const;
export type MatterhornProtocolWorkspaceLaunchBehavior =
  (typeof MATTERHORN_PROTOCOL_WORKSPACE_LAUNCH_BEHAVIORS)[number];

export const MATTERHORN_PROTOCOL_WORKSPACE_CARD_KINDS = [
  "balance_card",
  "market_card",
  "validator_card",
  "preview_card",
  "handoff_card",
  "receipt_card",
  "plan_card",
  "schedule_card",
  "package_card",
  "capability_card",
  "provider_card",
] as const;
export type MatterhornProtocolWorkspaceCardKind =
  (typeof MATTERHORN_PROTOCOL_WORKSPACE_CARD_KINDS)[number];

export interface MatterhornProtocolWorkspaceMcpCliHints {
  cli?: string;
  mcp?: string;
}

export interface MatterhornProtocolWorkspaceManifest {
  version: "matterhorn.protocol.workspace.manifest.v1";
  id: MatterhornProtocolWorkspaceId;
  displayName: string;
  category: MatterhornWorkflowCategory;
  customerStatus: MatterhornProtocolWorkspaceCustomerStatus;
  allowedIntents: string[];
  safetyBoundaries: MatterhornWorkflowTemplateSafetyBoundary;
  primaryPanelRouteId: string;
  mcpCliHints: MatterhornProtocolWorkspaceMcpCliHints;
  supportedCardKinds: MatterhornProtocolWorkspaceCardKind[];
  demoPrompt: string;
  launchBehavior: MatterhornProtocolWorkspaceLaunchBehavior;
}

export const BITTENSOR_PROTOCOL_WORKSPACE_MANIFEST: MatterhornProtocolWorkspaceManifest = {
  version: "matterhorn.protocol.workspace.manifest.v1",
  id: "bittensor",
  displayName: "Bittensor",
  category: "bittensor",
  customerStatus: "beta_ready",
  allowedIntents: [
    "read balance",
    "compare subnets",
    "compare validators",
    "preview stake",
    "prepare handoff",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: true,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: true,
    allowsRealFunds: false,
  },
  primaryPanelRouteId: "/workspaces/bittensor",
  mcpCliHints: {
    cli: 'matterhorn-work crypto chat --message "show my TAO" --json',
    mcp: "matterhorn_crypto_chat",
  },
  supportedCardKinds: [
    "balance_card",
    "validator_card",
    "preview_card",
    "handoff_card",
    "receipt_card",
  ],
  demoPrompt: "Show my TAO",
  launchBehavior: "opens_desk",
};

export const HYPERLIQUID_PROTOCOL_WORKSPACE_MANIFEST: MatterhornProtocolWorkspaceManifest = {
  version: "matterhorn.protocol.workspace.manifest.v1",
  id: "hyperliquid",
  displayName: "Hyperliquid",
  category: "markets",
  customerStatus: "preview_only",
  allowedIntents: [
    "preview trade",
    "show exposure",
    "prepare handoff",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  primaryPanelRouteId: "/workspaces/hyperliquid",
  mcpCliHints: {
    cli: 'matterhorn-work crypto chat --message "preview Hyperliquid BTC-PERP" --json',
    mcp: "matterhorn_hyperliquid_prepare_handoff",
  },
  supportedCardKinds: [
    "market_card",
    "preview_card",
    "handoff_card",
    "receipt_card",
  ],
  demoPrompt: "Preview a Hyperliquid BTC-PERP trade",
  launchBehavior: "opens_desk",
};

export const POLYMARKET_PROTOCOL_WORKSPACE_MANIFEST: MatterhornProtocolWorkspaceManifest = {
  version: "matterhorn.protocol.workspace.manifest.v1",
  id: "polymarket",
  displayName: "Polymarket",
  category: "markets",
  customerStatus: "preview_only",
  allowedIntents: [
    "research market",
    "preview trade",
    "show positions",
    "prepare handoff",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  primaryPanelRouteId: "/workspaces/polymarket",
  mcpCliHints: {
    cli: 'matterhorn-work crypto chat --message "preview Polymarket market" --json',
    mcp: "matterhorn_polymarket_prepare_handoff",
  },
  supportedCardKinds: [
    "market_card",
    "preview_card",
    "handoff_card",
    "receipt_card",
  ],
  demoPrompt: "Summarize this Polymarket market",
  launchBehavior: "opens_desk",
};

export const WELLNESS_PROTOCOL_WORKSPACE_MANIFEST: MatterhornProtocolWorkspaceManifest = {
  version: "matterhorn.protocol.workspace.manifest.v1",
  id: "wellness",
  displayName: "Wellness Creator",
  category: "wellness",
  customerStatus: "planned_not_live",
  allowedIntents: [
    "plan program",
    "design nutrition plan",
    "build schedule",
    "package services",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  primaryPanelRouteId: "/workspaces/wellness",
  mcpCliHints: {
    cli: "matterhorn-work workflows catalog --workflow wellness_creator_workflow --include-prompts --json",
  },
  supportedCardKinds: [
    "plan_card",
    "schedule_card",
    "package_card",
    "receipt_card",
  ],
  demoPrompt: "Create a wellness program for my clients",
  launchBehavior: "planned_not_live",
};

export const DECENTRALIZED_SERVICES_PROTOCOL_WORKSPACE_MANIFEST: MatterhornProtocolWorkspaceManifest = {
  version: "matterhorn.protocol.workspace.manifest.v1",
  id: "decentralized_services",
  displayName: "Decentralized Services",
  category: "decentralized_services",
  customerStatus: "planned_not_live",
  allowedIntents: [
    "plan storage",
    "plan hosting",
    "plan email",
    "plan payments",
    "plan identity",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  primaryPanelRouteId: "/workspaces/decentralized-services",
  mcpCliHints: {
    cli: "matterhorn-work services capabilities --json",
  },
  supportedCardKinds: [
    "capability_card",
    "provider_card",
    "plan_card",
  ],
  demoPrompt: "Plan a decentralized storage upload",
  launchBehavior: "planned_not_live",
};

export const MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY: Record<
  string,
  MatterhornProtocolWorkspaceManifest
> = {
  bittensor: BITTENSOR_PROTOCOL_WORKSPACE_MANIFEST,
  hyperliquid: HYPERLIQUID_PROTOCOL_WORKSPACE_MANIFEST,
  polymarket: POLYMARKET_PROTOCOL_WORKSPACE_MANIFEST,
  wellness: WELLNESS_PROTOCOL_WORKSPACE_MANIFEST,
  decentralized_services: DECENTRALIZED_SERVICES_PROTOCOL_WORKSPACE_MANIFEST,
};

export const MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE: Record<
  string,
  MatterhornProtocolWorkspaceId
> = {
  bittensor_operator: "bittensor",
  hyperliquid_trader: "hyperliquid",
  polymarket_researcher: "polymarket",
  wellness_creator_workflow: "wellness",
  decentralized_services_operator: "decentralized_services",
};

// -----------------------------------------------------------------------------
// Monday Beta Customer Demo Scenario Registry
// -----------------------------------------------------------------------------
// Typed demo scenarios for the 10-customer Monday beta. Each scenario maps to
// an existing workflow manifest and customer workflow template, defines a safe
// entry prompt, expected artifacts, readiness commands, and pass/fail criteria.
// -----------------------------------------------------------------------------

export const MONDAY_BETA_CUSTOMER_DEMO_STATUSES = [
  "demo_ready",
  "preview_only",
  "planned_not_live",
] as const;
export type MondayBetaCustomerDemoStatus = (typeof MONDAY_BETA_CUSTOMER_DEMO_STATUSES)[number];

export interface CustomerBetaDemoPassFailCriteria {
  pass: string[];
  fail: string[];
}

export interface CustomerBetaDemoScenario {
  version: "matterhorn.customer.beta.demo.scenario.v1";
  id: string;
  displayName: string;
  targetCustomerPersona: string;
  assignedBetaCustomers: string[];
  entryPrompt: string;
  expectedArtifacts: MatterhornWorkflowArtifact[];
  readinessCommands: string[];
  safetyBoundaries: MatterhornWorkflowTemplateSafetyBoundary;
  forbiddenClaims: string[];
  forbiddenInputs: string[];
  passFailCriteria: CustomerBetaDemoPassFailCriteria;
  evidenceOutputPath: string;
  status: MondayBetaCustomerDemoStatus;
  mapsToWorkflowId: string;
  mapsToCustomerTemplateId: string;
}

export const BITTENSOR_TAO_STAKING_PREVIEW_DEMO_SCENARIO: CustomerBetaDemoScenario = {
  version: "matterhorn.customer.beta.demo.scenario.v1",
  id: "bittensor_tao_staking_preview",
  displayName: "Bittensor TAO staking preview",
  targetCustomerPersona: "TAO operator or delegator participating in the Monday beta",
  assignedBetaCustomers: ["Alpha Node DAO", "TensorVault Labs"],
  entryPrompt: "Show my TAO, compare validators on subnet 1, and prepare an unsigned 1 TAO staking preview",
  expectedArtifacts: [
    {
      id: "balance_card",
      name: "TAO Balance Card",
      mimeType: "application/json",
      public: true,
      description: "Public TAO balance and stake overview.",
    },
    {
      id: "subnet_comparison",
      name: "Subnet Comparison",
      mimeType: "text/markdown",
      public: true,
      description: "Validator and subnet comparison for research.",
    },
    {
      id: "stake_preview",
      name: "Stake Preview",
      mimeType: "application/json",
      public: true,
      description: "Non-binding stake preview with estimated returns.",
    },
    {
      id: "external_signer_handoff",
      name: "External Signer Handoff",
      mimeType: "application/json",
      public: true,
      description: "Handoff payload for an external wallet or signer.",
    },
  ],
  readinessCommands: [
    'matterhorn-work crypto chat --message "show my TAO" --json',
    "matterhorn-work bittensor handoff --wallet-address $WALLET --subnet 1 --amount 1 --json",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: true,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: true,
    allowsRealFunds: false,
  },
  forbiddenClaims: [
    "Matterhorn can stake without your external signer",
    "Matterhorn holds your private key",
    "Matterhorn submits transactions",
    "Matterhorn can move your TAO",
  ],
  forbiddenInputs: [
    "private key",
    "seed phrase",
    "mnemonic",
    "raw signature",
    "signed payload",
    "wallet export",
  ],
  passFailCriteria: {
    pass: [
      "Balance card shows public TAO balance without asking for secrets",
      "Subnet comparison lists validators and emissions without secrets",
      "Stake preview is unsigned and non-binding",
      "External signer handoff is produced and contains no signing material",
    ],
    fail: [
      "Requests a private key or seed phrase",
      "Produces a signed transaction",
      "Submits to the Bittensor network",
      "Claims Matterhorn can stake without external signer",
    ],
  },
  evidenceOutputPath: "docs/evidence/monday-beta/bittensor/{customer}-scenario-evidence.json",
  status: "demo_ready",
  mapsToWorkflowId: "bittensor_operator",
  mapsToCustomerTemplateId: "bittensor_operator",
};

export const HYPERLIQUID_ORDER_PREVIEW_DEMO_SCENARIO: CustomerBetaDemoScenario = {
  version: "matterhorn.customer.beta.demo.scenario.v1",
  id: "hyperliquid_order_preview",
  displayName: "Hyperliquid order preview",
  targetCustomerPersona: "Crypto trader reviewing Hyperliquid markets during the Monday beta",
  assignedBetaCustomers: ["Arbor Trading", "PerpPrime Capital"],
  entryPrompt: "Preview a Hyperliquid BTC-PERP long without signing or submitting anything",
  expectedArtifacts: [
    {
      id: "market_preview",
      name: "Market Preview",
      mimeType: "application/json",
      public: true,
      description: "Read-only market preview with sizing and price estimates.",
    },
    {
      id: "signing_handoff",
      name: "Signing Handoff",
      mimeType: "application/json",
      public: true,
      description: "External-signer handoff for the user or wallet to sign.",
    },
  ],
  readinessCommands: [
    'matterhorn-work crypto chat --message "preview Hyperliquid BTC-PERP long" --json',
    "matterhorn-work hyperliquid handoff --market BTC-PERP --side long --size 0.1 --json",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenClaims: [
    "Matterhorn can submit Hyperliquid orders",
    "Matterhorn stores API secrets",
    "Matterhorn signs orders",
    "Matterhorn can trade on your behalf",
  ],
  forbiddenInputs: [
    "private key",
    "API secret",
    "raw signature",
    "signed payload",
    "signed order",
    "wallet export",
  ],
  passFailCriteria: {
    pass: [
      "Orderbook and account context are read-only",
      "Preview shows sizing and price estimates without binding execution",
      "External signer handoff is produced and contains no signing material",
    ],
    fail: [
      "Requests an API secret or private key",
      "Submits an order to Hyperliquid",
      "Produces a signed order or signature",
      "Claims Matterhorn can trade without external signer",
    ],
  },
  evidenceOutputPath: "docs/evidence/monday-beta/hyperliquid/{customer}-scenario-evidence.json",
  status: "preview_only",
  mapsToWorkflowId: "market_read_preview",
  mapsToCustomerTemplateId: "hyperliquid_trader",
};

export const POLYMARKET_MARKET_RESEARCH_DEMO_SCENARIO: CustomerBetaDemoScenario = {
  version: "matterhorn.customer.beta.demo.scenario.v1",
  id: "polymarket_market_research",
  displayName: "Polymarket market research and preview",
  targetCustomerPersona: "Prediction market researcher participating in the Monday beta",
  assignedBetaCustomers: ["Forecast Collective", "EdgeBet Research"],
  entryPrompt: "Summarize this Polymarket market and preview a yes position without signing or submitting",
  expectedArtifacts: [
    {
      id: "market_preview",
      name: "Market Preview",
      mimeType: "application/json",
      public: true,
      description: "Read-only market preview with odds and outcome analysis.",
    },
    {
      id: "signing_handoff",
      name: "Signing Handoff",
      mimeType: "application/json",
      public: true,
      description: "External-signer handoff for the user or wallet to sign.",
    },
  ],
  readinessCommands: [
    'matterhorn-work crypto chat --message "summarize Polymarket market" --json',
    "matterhorn-work polymarket handoff --market-id will-it-rain-in-nyc-2026-07-01 --outcome yes --size 10 --json",
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenClaims: [
    "Matterhorn can place Polymarket trades",
    "Matterhorn stores private keys",
    "Matterhorn submits signed transactions",
    "Matterhorn can trade on your behalf",
  ],
  forbiddenInputs: [
    "private key",
    "API secret",
    "raw signature",
    "signed payload",
    "signed order",
    "wallet export",
  ],
  passFailCriteria: {
    pass: [
      "Market summary includes odds, liquidity, and outcome analysis",
      "Compliance block is shown before any handoff",
      "External signer handoff is produced and contains no signing material",
    ],
    fail: [
      "Requests a private key or API secret",
      "Places a live Polymarket trade",
      "Produces a signed transaction or signature",
      "Claims Matterhorn can trade without external signer",
    ],
  },
  evidenceOutputPath: "docs/evidence/monday-beta/polymarket/{customer}-scenario-evidence.json",
  status: "preview_only",
  mapsToWorkflowId: "market_read_preview",
  mapsToCustomerTemplateId: "polymarket_researcher",
};

export const WELLNESS_CLIENT_PROGRAM_PACKET_DEMO_SCENARIO: CustomerBetaDemoScenario = {
  version: "matterhorn.customer.beta.demo.scenario.v1",
  id: "wellness_client_program_packet",
  displayName: "Wellness client program packet",
  targetCustomerPersona: "Wellness creator or coach running the Monday beta",
  assignedBetaCustomers: ["Summit Wellness Co", "FitPath Studio"],
  entryPrompt: "Create a 6-week strength program packet for busy professionals with a weekly check-in workflow",
  expectedArtifacts: [
    {
      id: "program_design_plan",
      name: "Program Design Plan",
      mimeType: "text/markdown",
      public: true,
      description: "High-level program design with safety disclaimers.",
    },
    {
      id: "weekly_schedule",
      name: "Weekly Schedule",
      mimeType: "text/markdown",
      public: true,
      description: "Weekly session and content schedule.",
    },
    {
      id: "pricing_package_draft",
      name: "Pricing Package Draft",
      mimeType: "text/markdown",
      public: true,
      description: "Draft pricing and packaging options.",
    },
    {
      id: "service_plan",
      name: "Service Plan",
      mimeType: "application/json",
      public: true,
      description: "Public/redacted service plan for the workflow registry.",
    },
  ],
  readinessCommands: [
    "matterhorn-work workflows catalog --workflow wellness_creator_workflow --include-prompts --json",
    'matterhorn-work wellness program --audience "busy professionals" --goal "strength" --duration 6 --json',
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenClaims: [
    "Matterhorn gives medical advice",
    "Matterhorn stores protected health information",
    "Matterhorn diagnoses conditions",
    "Matterhorn replaces a licensed medical professional",
  ],
  forbiddenInputs: [
    "medical diagnosis",
    "prescription advice",
    "protected health information beyond redacted goals",
    "full medical history",
  ],
  passFailCriteria: {
    pass: [
      "Program packet includes safety disclaimers and non-medical framing",
      "Check-in workflow is generated without collecting PII",
      "No protected health information is stored in public evidence",
    ],
    fail: [
      "Provides a medical diagnosis or prescription advice",
      "Requests protected health information beyond redacted goals",
      "Claims to replace a licensed medical professional",
    ],
  },
  evidenceOutputPath: "docs/evidence/monday-beta/wellness/{customer}-scenario-evidence.json",
  status: "planned_not_live",
  mapsToWorkflowId: "wellness_creator_services",
  mapsToCustomerTemplateId: "wellness_creator_workflow",
};

export const DECENTRALIZED_SERVICES_FUTURE_PLAN_DEMO_SCENARIO: CustomerBetaDemoScenario = {
  version: "matterhorn.customer.beta.demo.scenario.v1",
  id: "decentralized_services_future_plan",
  displayName: "Decentralized services future plan",
  targetCustomerPersona: "Builder or operator planning future decentralized service actions during the Monday beta",
  assignedBetaCustomers: ["OpenResearch DAO", "StackSafe Labs"],
  entryPrompt: "Plan a decentralized storage and email workflow for my research group",
  expectedArtifacts: [
    {
      id: "service_preview",
      name: "Service Preview",
      mimeType: "application/json",
      public: true,
      description: "Planned service action and provider comparison.",
    },
    {
      id: "provider_comparison",
      name: "Provider Comparison",
      mimeType: "text/markdown",
      public: true,
      description: "Comparison of example provider fixtures.",
    },
  ],
  readinessCommands: [
    "matterhorn-work services capabilities --json",
    'matterhorn-work services plan --capability storage --intent "Pin a public research dataset" --json',
  ],
  safetyBoundaries: {
    liveExecutionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsSecrets: false,
    acceptsPrivateKeys: false,
    acceptsRawSignatures: false,
    acceptsApiSecrets: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
  },
  forbiddenClaims: [
    "Matterhorn executes live provider actions",
    "Matterhorn stores provider credentials",
    "Matterhorn provisions hosting today",
    "Matterhorn sends emails or processes payments now",
  ],
  forbiddenInputs: [
    "private key",
    "API secret",
    "payment credential",
    "email password",
    "hosting credential",
    "identity secret",
  ],
  passFailCriteria: {
    pass: [
      "Service preview is a future contract with no live provider calls",
      "Provider comparison uses example fixtures without real credentials",
      "No hosting, storage, email, payment, or identity secrets are requested",
    ],
    fail: [
      "Requests provider credentials or secrets",
      "Makes a live provider call",
      "Claims the service is live or will execute today",
    ],
  },
  evidenceOutputPath: "docs/evidence/monday-beta/services/{customer}-scenario-evidence.json",
  status: "planned_not_live",
  mapsToWorkflowId: "decentralized_services_planner",
  mapsToCustomerTemplateId: "decentralized_services_operator",
};

export const MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS: Record<string, CustomerBetaDemoScenario> = {
  bittensor_tao_staking_preview: BITTENSOR_TAO_STAKING_PREVIEW_DEMO_SCENARIO,
  hyperliquid_order_preview: HYPERLIQUID_ORDER_PREVIEW_DEMO_SCENARIO,
  polymarket_market_research: POLYMARKET_MARKET_RESEARCH_DEMO_SCENARIO,
  wellness_client_program_packet: WELLNESS_CLIENT_PROGRAM_PACKET_DEMO_SCENARIO,
  decentralized_services_future_plan: DECENTRALIZED_SERVICES_FUTURE_PLAN_DEMO_SCENARIO,
};

export const MATTERHORN_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "memory",
  "mcp",
  "settings",
  "services",
] as const;
export type MatterhornDeskId = (typeof MATTERHORN_DESK_IDS)[number];

export const MATTERHORN_DESK_STATUSES = [
  "beta_ready",
  "preview_only",
  "workflow_ready",
  "planned_not_live",
  "blank",
] as const;
export type MatterhornDeskStatus = (typeof MATTERHORN_DESK_STATUSES)[number];

export const MATTERHORN_DESK_ACCENTS = [
  "matterhorn_blue",
  "purple",
  "green",
  "orange",
  "caution",
  "neutral",
] as const;
export type MatterhornDeskAccent = (typeof MATTERHORN_DESK_ACCENTS)[number];

export interface MatterhornDeskManifest {
  version: "matterhorn.desk.manifest.v1";
  deskId: MatterhornDeskId;
  deskDisplayName: string;
  deskShortName: string;
  deskDescription: string;
  deskAccent: MatterhornDeskAccent;
  customerPrimaryAction: string;
  customerSafetyStrip: string;
  status: MatterhornDeskStatus;
  allowedSurfaces: string[];
  liveSubmissionEnabled: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  requiresExternalSigner: boolean;
  isPrimaryCustomerDesk: boolean;
}

export const BITTENSOR_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "bittensor",
  deskDisplayName: "Bittensor",
  deskShortName: "TAO",
  deskDescription: "Read, preview, and external-signer handoffs for Bittensor staking and delegation.",
  deskAccent: "purple",
  customerPrimaryAction: "Preview stake or delegation handoff",
  customerSafetyStrip: "Beta-ready. Read-only previews and external-signer handoffs only. Never provide private keys or seed phrases.",
  status: "beta_ready",
  allowedSurfaces: ["protocol_desk", "workflow_chat", "evidence_packet"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: true,
  isPrimaryCustomerDesk: true,
};

export const HYPERLIQUID_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "hyperliquid",
  deskDisplayName: "Hyperliquid",
  deskShortName: "HL",
  deskDescription: "Read-only market previews and watchlists for Hyperliquid. No live submission or signing.",
  deskAccent: "green",
  customerPrimaryAction: "Preview market or manage watchlist",
  customerSafetyStrip: "Preview-only. No live submission, signing, custody, or secrets.",
  status: "preview_only",
  allowedSurfaces: ["protocol_desk", "workflow_chat"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  isPrimaryCustomerDesk: true,
};

export const POLYMARKET_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "polymarket",
  deskDisplayName: "Polymarket",
  deskShortName: "PM",
  deskDescription: "Read-only market research and watchlists for Polymarket. No live submission or signing.",
  deskAccent: "orange",
  customerPrimaryAction: "Research market or manage watchlist",
  customerSafetyStrip: "Preview-only. No live submission, signing, custody, or secrets.",
  status: "preview_only",
  allowedSurfaces: ["protocol_desk", "workflow_chat"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  isPrimaryCustomerDesk: true,
};

export const WELLNESS_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "wellness",
  deskDisplayName: "Wellness",
  deskShortName: "Wellness",
  deskDescription: "Workflow-ready wellness program builder for creators and coaches. Educational and non-medical.",
  deskAccent: "matterhorn_blue",
  customerPrimaryAction: "Build a wellness program packet",
  customerSafetyStrip: "Workflow-ready. Educational content only. Not medical advice. No live payments, no live email, no live hosting, and no live data access.",
  status: "workflow_ready",
  allowedSurfaces: ["workflow_chat", "evidence_packet"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  isPrimaryCustomerDesk: true,
};

export const MEMORY_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "memory",
  deskDisplayName: "Memory",
  deskShortName: "Memory",
  deskDescription: "Inspect and manage what Matterhorn remembers across desks. User-controlled, editable, forgettable.",
  deskAccent: "matterhorn_blue",
  customerPrimaryAction: "Review and manage saved memory",
  customerSafetyStrip: "User-controlled memory. Nothing hidden. Secrets, keys, and clinical records are rejected.",
  status: "beta_ready",
  allowedSurfaces: ["settings", "workflow_chat"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  isPrimaryCustomerDesk: false,
};

export const MCP_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "mcp",
  deskDisplayName: "MCP Tools",
  deskShortName: "MCP",
  deskDescription: "Manage approved Model Context Protocol tools and their memory boundaries.",
  deskAccent: "neutral",
  customerPrimaryAction: "Manage MCP tool preferences",
  customerSafetyStrip: "MCP tools operate with explicit user approval. No secrets or custody.",
  status: "planned_not_live",
  allowedSurfaces: ["settings"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  isPrimaryCustomerDesk: false,
};

export const SETTINGS_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "settings",
  deskDisplayName: "Settings",
  deskShortName: "Settings",
  deskDescription: "Preferences, accounts, and workspace configuration.",
  deskAccent: "neutral",
  customerPrimaryAction: "Manage preferences",
  customerSafetyStrip: "Settings never request private keys, seed phrases, API secrets, or signatures.",
  status: "beta_ready",
  allowedSurfaces: ["settings"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  isPrimaryCustomerDesk: false,
};

export const SERVICES_DESK_MANIFEST: MatterhornDeskManifest = {
  version: "matterhorn.desk.manifest.v1",
  deskId: "services",
  deskDisplayName: "Services",
  deskShortName: "Services",
  deskDescription: "Future decentralized services planner. Not a primary customer desk in the beta.",
  deskAccent: "caution",
  customerPrimaryAction: "Plan future service capabilities",
  customerSafetyStrip: "Planned-not-live. No provider execution, hosting, email, payments, or identity access today.",
  status: "planned_not_live",
  allowedSurfaces: ["workflow_chat", "evidence_packet"],
  liveSubmissionEnabled: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  isPrimaryCustomerDesk: false,
};

export const MATTERHORN_DESK_MANIFEST_REGISTRY: Record<MatterhornDeskId, MatterhornDeskManifest> = {
  bittensor: BITTENSOR_DESK_MANIFEST,
  hyperliquid: HYPERLIQUID_DESK_MANIFEST,
  polymarket: POLYMARKET_DESK_MANIFEST,
  wellness: WELLNESS_DESK_MANIFEST,
  memory: MEMORY_DESK_MANIFEST,
  mcp: MCP_DESK_MANIFEST,
  settings: SETTINGS_DESK_MANIFEST,
  services: SERVICES_DESK_MANIFEST,
};

export const MATTERHORN_CUSTOMER_TEMPLATE_TO_DESK: Record<string, MatterhornDeskId> = {
  bittensor_operator: "bittensor",
  hyperliquid_trader: "hyperliquid",
  polymarket_researcher: "polymarket",
  wellness_creator_workflow: "wellness",
  decentralized_services_operator: "services",
  blank_chat_workflow: "settings",
};

export const PROTOCOL_DESK_VISUAL_STATUSES = [
  "beta_ready",
  "preview_only",
  "workflow_ready",
  "planned_not_live",
] as const;
export type ProtocolDeskVisualStatus = (typeof PROTOCOL_DESK_VISUAL_STATUSES)[number];

export const PROTOCOL_DESK_CATEGORIES = [
  "web3",
  "bittensor",
  "markets",
  "wellness",
  "memory",
  "mcps",
  "services",
] as const;
export type ProtocolDeskCategory = (typeof PROTOCOL_DESK_CATEGORIES)[number];

export const PROTOCOL_DESK_WALLET_REQUIREMENTS = [
  "none",
  "evm_read_only",
  "ss58_read_only",
  "ss58_external_signer",
] as const;
export type ProtocolDeskWalletRequirement = (typeof PROTOCOL_DESK_WALLET_REQUIREMENTS)[number];

export const PROTOCOL_DESK_WALLET_RAIL_MODES = [
  "external_signer",
  "evm_preview",
  "none",
] as const;
export type ProtocolDeskWalletRailMode = (typeof PROTOCOL_DESK_WALLET_RAIL_MODES)[number];

export const PROTOCOL_DESK_STATUS_BADGE_TONES = [
  "success",
  "caution",
  "info",
  "neutral",
] as const;
export type ProtocolDeskStatusBadgeTone = (typeof PROTOCOL_DESK_STATUS_BADGE_TONES)[number];

export const PROTOCOL_DESK_READINESS_TONES = [
  "beta_ready",
  "preview_only",
  "workflow_ready",
  "local_only",
] as const;
export type ProtocolDeskReadinessTone = (typeof PROTOCOL_DESK_READINESS_TONES)[number];

export const PROTOCOL_DESK_BACKEND_STATUSES = [
  "live",
  "partial",
  "preview",
  "static_catalog",
  "disabled",
] as const;
export type ProtocolDeskBackendStatus = (typeof PROTOCOL_DESK_BACKEND_STATUSES)[number];

export const PROTOCOL_DESK_ACTION_STATUSES = [
  "read_only",
  "preview_only",
  "external_signer",
  "workflow_only",
] as const;
export type ProtocolDeskActionStatus = (typeof PROTOCOL_DESK_ACTION_STATUSES)[number];

export const PROTOCOL_DESK_EXTENSION_STATUSES = [
  "built_in_live",
  "built_in_partial",
  "static_catalog",
  "requires_setup",
] as const;
export type ProtocolDeskExtensionStatus = (typeof PROTOCOL_DESK_EXTENSION_STATUSES)[number];

export interface ProtocolDeskAction {
  actionId: string;
  label: string;
  iconHint?: string;
  intent: string;
  requiresConfirmation: boolean;
  surface: "desk_panel" | "chat" | "context_menu" | "command_palette";
}

export interface ProtocolDeskThemeTokenHints {
  background: string;
  surface: string;
  accent: string;
  accentHover: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  safetyStrip: string;
  iconFill: string;
}

export interface ProtocolDeskSafetyBoundaries {
  liveSubmissionEnabled: false;
  canExecute: boolean;
  canSubmit: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  requiresExternalSigner: boolean;
  allowsRealFunds: false;
  medicalClaimsAllowed: false;
}

export interface ProtocolDeskManifest {
  version: "matterhorn.protocol.desk.manifest.v1";
  id: string;
  displayName: string;
  shortDescription: string;
  launcherTitle: string;
  launcherDescription: string;
  launcherPrompt: string;
  rightRailSummary: string;
  logoAssetId: string;
  officialLogoAssetId: string;
  logoAlt: string;
  category: ProtocolDeskCategory;
  status: ProtocolDeskVisualStatus;
  readinessTone: ProtocolDeskReadinessTone;
  backendStatus: ProtocolDeskBackendStatus;
  actionStatus: ProtocolDeskActionStatus;
  extensionStatus: ProtocolDeskExtensionStatus;
  statusBadgeLabel: string;
  statusBadgeTone: ProtocolDeskStatusBadgeTone;
  routeOrPanelId: string;
  logoAssetKey: string;
  preferredColorToken: string;
  lightThemeTokenHints: ProtocolDeskThemeTokenHints;
  darkThemeTokenHints: ProtocolDeskThemeTokenHints;
  primaryActions: ProtocolDeskAction[];
  primaryActionLabel: string;
  secondaryActions: ProtocolDeskAction[];
  walletRequirements: ProtocolDeskWalletRequirement[];
  walletRailMode: ProtocolDeskWalletRailMode;
  safetyBoundaries: ProtocolDeskSafetyBoundaries;
  customerVisible: boolean;
  capabilityBullets: string[];
  safetySummary: string;
  customerCapabilitySummary: string;
  noCustodySafetyLine: string;
  suggestedPromptTitles: string[];
  emptyStateCopy: {
    headline: string;
    body: string;
    primaryActionId?: string;
  };
  degradedStateCopy: {
    headline: string;
    body: string;
    primaryActionId?: string;
  };
}

export interface ProtocolBrandAssetManifest {
  version: "matterhorn.protocol.brand.asset.v1";
  assetKey: string;
  protocol: string;
  sourceUrl?: string;
  allowedUseNote: string;
  lightAssetPath: string;
  darkAssetPath: string;
  monochromeAssetPath?: string;
  fallbackInitials: string;
}

export const DEFAULT_PROTOCOL_DESK_SAFETY_BOUNDARIES: ProtocolDeskSafetyBoundaries = {
  liveSubmissionEnabled: false,
  canExecute: false,
  canSubmit: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  allowsRealFunds: false,
  medicalClaimsAllowed: false,
};

export const BITTENSOR_PROTOCOL_DESK_MANIFEST: ProtocolDeskManifest = {
  version: "matterhorn.protocol.desk.manifest.v1",
  id: "bittensor",
  displayName: "Bittensor",
  shortDescription: "TAO staking, delegation, and subnet previews with external-signer handoffs.",
  launcherTitle: "Bittensor",
  launcherDescription: "Stake, delegate, and monitor TAO with read-only previews and external-signer handoffs.",
  launcherPrompt: "Show my TAO or compare validators on subnet 1",
  rightRailSummary: "External signer required. Paste a public SS58 address to preview staking and delegation handoffs.",
  logoAssetId: "bittensor-logo",
  officialLogoAssetId: "bittensor-logo",
  logoAlt: "Bittensor TAO logo",
  category: "bittensor",
  status: "beta_ready",
  readinessTone: "beta_ready",
  backendStatus: "partial",
  actionStatus: "external_signer",
  extensionStatus: "built_in_partial",
  statusBadgeLabel: "Beta",
  statusBadgeTone: "success",
  routeOrPanelId: "/workspaces/bittensor",
  logoAssetKey: "bittensor-logo",
  preferredColorToken: "--desk-bittensor-accent",
  lightThemeTokenHints: {
    background: "#FAF5FF",
    surface: "#FFFFFF",
    accent: "#7C3AED",
    accentHover: "#6D28D9",
    textPrimary: "#1F2937",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    safetyStrip: "#F3E8FF",
    iconFill: "#7C3AED",
  },
  darkThemeTokenHints: {
    background: "#0C0C0C",
    surface: "#141414",
    accent: "#A78BFA",
    accentHover: "#8B5CF6",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    border: "#1F2937",
    safetyStrip: "#2E1065",
    iconFill: "#A78BFA",
  },
  primaryActions: [
    {
      actionId: "preview-stake",
      label: "Preview stake",
      iconHint: "stake",
      intent: "preview stake",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
    {
      actionId: "prepare-handoff",
      label: "Prepare handoff",
      iconHint: "external-signer",
      intent: "prepare handoff",
      requiresConfirmation: true,
      surface: "desk_panel",
    },
  ],
  primaryActionLabel: "Preview or hand off",
  secondaryActions: [
    {
      actionId: "compare-validators",
      label: "Compare validators",
      iconHint: "validator",
      intent: "compare validators",
      requiresConfirmation: false,
      surface: "chat",
    },
    {
      actionId: "watch-subnet",
      label: "Watch subnet",
      iconHint: "watch",
      intent: "watch subnet",
      requiresConfirmation: false,
      surface: "chat",
    },
  ],
  walletRequirements: ["ss58_read_only", "ss58_external_signer"],
  walletRailMode: "external_signer",
  safetyBoundaries: {
    liveSubmissionEnabled: false,
    canExecute: true,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: true,
    allowsRealFunds: false,
    medicalClaimsAllowed: false,
  },
  customerVisible: true,
  capabilityBullets: [
    "Read TAO balances and stake allocations",
    "Discover subnets and compare validators",
    "Prepare stake, unstake, and transfer handoffs",
    "Watch subnets and import public receipts",
  ],
  safetySummary: "External signer required. Matterhorn never holds your coldkey, hotkey, or seed phrase.",
  customerCapabilitySummary: "Read TAO balances, stake allocations, subnet data, and validator comparisons. Prepare stake, unstake, and transfer handoffs for external signing.",
  noCustodySafetyLine: "Matterhorn never holds your coldkey, hotkey, or seed phrase. All on-chain actions are signed outside the app.",
  suggestedPromptTitles: [
    "Show my TAO",
    "Where am I staked?",
    "Compare validators on subnet 1",
    "Prepare staking 1 TAO",
  ],
  emptyStateCopy: {
    headline: "Connect a Bittensor wallet",
    body: "Paste a public SS58 address or connect an external signer to preview staking and delegation. Private keys and seed phrases are never accepted.",
    primaryActionId: "preview-stake",
  },
  degradedStateCopy: {
    headline: "Bittensor preview unavailable",
    body: "Provider data is temporarily unreachable. You can still inspect memory or prepare a handoff from saved context.",
    primaryActionId: "prepare-handoff",
  },
};

export const HYPERLIQUID_PROTOCOL_DESK_MANIFEST: ProtocolDeskManifest = {
  version: "matterhorn.protocol.desk.manifest.v1",
  id: "hyperliquid",
  displayName: "Hyperliquid",
  shortDescription: "Read-only perp market previews and watchlists.",
  launcherTitle: "Hyperliquid",
  launcherDescription: "Preview perp markets and manage watchlists. Read-only.",
  launcherPrompt: "Preview a Hyperliquid BTC-PERP trade",
  rightRailSummary: "Preview-only desk. Enter a public EVM wallet address or market for read-only previews.",
  logoAssetId: "hyperliquid-logo",
  officialLogoAssetId: "hyperliquid-logo",
  logoAlt: "Hyperliquid logo",
  category: "markets",
  status: "preview_only",
  readinessTone: "preview_only",
  backendStatus: "preview",
  actionStatus: "preview_only",
  extensionStatus: "built_in_live",
  statusBadgeLabel: "Preview",
  statusBadgeTone: "caution",
  routeOrPanelId: "/workspaces/hyperliquid",
  logoAssetKey: "hyperliquid-logo",
  preferredColorToken: "--desk-hyperliquid-accent",
  lightThemeTokenHints: {
    background: "#F0FDF4",
    surface: "#FFFFFF",
    accent: "#22C55E",
    accentHover: "#16A34A",
    textPrimary: "#1F2937",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    safetyStrip: "#DCFCE7",
    iconFill: "#22C55E",
  },
  darkThemeTokenHints: {
    background: "#0C0C0C",
    surface: "#141414",
    accent: "#4ADE80",
    accentHover: "#22C55E",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    border: "#1F2937",
    safetyStrip: "#064E3B",
    iconFill: "#4ADE80",
  },
  primaryActions: [
    {
      actionId: "preview-trade",
      label: "Preview trade",
      iconHint: "preview",
      intent: "preview trade",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
    {
      actionId: "manage-watchlist",
      label: "Manage watchlist",
      iconHint: "watch",
      intent: "manage watchlist",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
  ],
  primaryActionLabel: "Preview market",
  secondaryActions: [
    {
      actionId: "show-exposure",
      label: "Show exposure",
      iconHint: "chart",
      intent: "show exposure",
      requiresConfirmation: false,
      surface: "chat",
    },
  ],
  walletRequirements: ["evm_read_only"],
  walletRailMode: "evm_preview",
  safetyBoundaries: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    medicalClaimsAllowed: false,
  },
  customerVisible: true,
  capabilityBullets: [
    "Read perp market data, orderbooks, and funding",
    "Show account exposure and open orders",
    "Preview trades without order placement",
    "Manage market watches and receipts",
  ],
  safetySummary: "Matterhorn never holds your credentials. All market data is read-only.",
  customerCapabilitySummary: "Read perp market data, orderbooks, funding, account exposure, and open orders. Preview trades without order placement.",
  noCustodySafetyLine: "Matterhorn never holds your credentials. All market data is read-only.",
  suggestedPromptTitles: [
    "Show BTC-PERP on Hyperliquid",
    "Preview a BTC long",
    "Show my Hyperliquid exposure",
    "Watch BTC funding",
  ],
  emptyStateCopy: {
    headline: "Preview Hyperliquid markets",
    body: "Enter a public wallet address or market to generate a read-only preview.",
    primaryActionId: "preview-trade",
  },
  degradedStateCopy: {
    headline: "Market preview unavailable",
    body: "Hyperliquid market data is temporarily unreachable. Your watchlists and saved context are still available.",
    primaryActionId: "manage-watchlist",
  },
};

export const POLYMARKET_PROTOCOL_DESK_MANIFEST: ProtocolDeskManifest = {
  version: "matterhorn.protocol.desk.manifest.v1",
  id: "polymarket",
  displayName: "Polymarket",
  shortDescription: "Read-only prediction market research and previews.",
  launcherTitle: "Polymarket",
  launcherDescription: "Research prediction markets and preview positions. Read-only.",
  launcherPrompt: "Find Polymarket markets about AI",
  rightRailSummary: "Preview-only desk. Search markets or enter a public EVM wallet address for read-only research.",
  logoAssetId: "polymarket-logo",
  officialLogoAssetId: "polymarket-logo",
  logoAlt: "Polymarket logo",
  category: "markets",
  status: "preview_only",
  readinessTone: "preview_only",
  backendStatus: "preview",
  actionStatus: "preview_only",
  extensionStatus: "built_in_live",
  statusBadgeLabel: "Preview",
  statusBadgeTone: "caution",
  routeOrPanelId: "/workspaces/polymarket",
  logoAssetKey: "polymarket-logo",
  preferredColorToken: "--desk-polymarket-accent",
  lightThemeTokenHints: {
    background: "#FFF7ED",
    surface: "#FFFFFF",
    accent: "#F97316",
    accentHover: "#EA580C",
    textPrimary: "#1F2937",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    safetyStrip: "#FFEDD5",
    iconFill: "#F97316",
  },
  darkThemeTokenHints: {
    background: "#0C0C0C",
    surface: "#141414",
    accent: "#FB923C",
    accentHover: "#F97316",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    border: "#1F2937",
    safetyStrip: "#7C2D12",
    iconFill: "#FB923C",
  },
  primaryActions: [
    {
      actionId: "research-market",
      label: "Research market",
      iconHint: "search",
      intent: "research market",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
    {
      actionId: "preview-position",
      label: "Preview position",
      iconHint: "preview",
      intent: "preview position",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
  ],
  primaryActionLabel: "Research market",
  secondaryActions: [
    {
      actionId: "show-orderbook",
      label: "Show orderbook",
      iconHint: "orderbook",
      intent: "show orderbook",
      requiresConfirmation: false,
      surface: "chat",
    },
  ],
  walletRequirements: ["evm_read_only"],
  walletRailMode: "evm_preview",
  safetyBoundaries: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    medicalClaimsAllowed: false,
  },
  customerVisible: true,
  capabilityBullets: [
    "Search and filter prediction markets",
    "View outcome probabilities and orderbooks",
    "Preview trades without order placement",
    "Manage market watches and receipts",
  ],
  safetySummary: "Matterhorn never holds your credentials. All market data is read-only.",
  customerCapabilitySummary: "Research prediction markets, view outcome probabilities, orderbooks, and compliance status. Preview trades without order placement.",
  noCustodySafetyLine: "Matterhorn never holds your credentials. All market data is read-only.",
  suggestedPromptTitles: [
    "Find markets about AI",
    "Show probabilities for this market",
    "Preview a yes position",
    "Watch this market",
  ],
  emptyStateCopy: {
    headline: "Research Polymarket",
    body: "Search markets or enter a public wallet address for read-only research.",
    primaryActionId: "research-market",
  },
  degradedStateCopy: {
    headline: "Market data unavailable",
    body: "Polymarket data is temporarily unreachable. Saved watchlists and research context remain available.",
    primaryActionId: "research-market",
  },
};

export const WELLNESS_PROTOCOL_DESK_MANIFEST: ProtocolDeskManifest = {
  version: "matterhorn.protocol.desk.manifest.v1",
  id: "wellness",
  displayName: "Wellness",
  shortDescription: "Workflow-ready wellness program builder for creators and coaches.",
  launcherTitle: "Wellness Creator",
  launcherDescription: "Build educational, non-medical wellness programs and service packages through chat.",
  launcherPrompt: "Create a 4-week beginner strength plan",
  rightRailSummary: "Workflow-ready desk. No account or keys required. Generates educational content only, not medical advice.",
  logoAssetId: "wellness-logo",
  officialLogoAssetId: "wellness-logo",
  logoAlt: "Wellness Creator logo",
  category: "wellness",
  status: "workflow_ready",
  readinessTone: "workflow_ready",
  backendStatus: "static_catalog",
  actionStatus: "workflow_only",
  extensionStatus: "static_catalog",
  statusBadgeLabel: "Ready",
  statusBadgeTone: "info",
  routeOrPanelId: "/workspaces/wellness",
  logoAssetKey: "wellness-logo",
  preferredColorToken: "--desk-wellness-accent",
  lightThemeTokenHints: {
    background: "#F0F9FF",
    surface: "#FFFFFF",
    accent: "#3B82F6",
    accentHover: "#2563EB",
    textPrimary: "#1F2937",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    safetyStrip: "#DBEAFE",
    iconFill: "#3B82F6",
  },
  darkThemeTokenHints: {
    background: "#0C0C0C",
    surface: "#141414",
    accent: "#93C5FD",
    accentHover: "#60A5FA",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    border: "#1F2937",
    safetyStrip: "#1E3A8A",
    iconFill: "#93C5FD",
  },
  primaryActions: [
    {
      actionId: "build-program",
      label: "Build program",
      iconHint: "program",
      intent: "build program",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
    {
      actionId: "package-service",
      label: "Package service",
      iconHint: "package",
      intent: "package service",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
  ],
  primaryActionLabel: "Build program",
  secondaryActions: [
    {
      actionId: "generate-artifacts",
      label: "Generate artifacts",
      iconHint: "document",
      intent: "generate artifacts",
      requiresConfirmation: false,
      surface: "chat",
    },
  ],
  walletRequirements: ["none"],
  walletRailMode: "none",
  safetyBoundaries: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    medicalClaimsAllowed: false,
  },
  customerVisible: true,
  capabilityBullets: [
    "Build educational, non-medical wellness programs",
    "Generate intake forms, schedules, and packets",
    "Package services without live execution",
    "Plan future live-service integrations",
  ],
  safetySummary: "Educational and opt-in. Matterhorn does not process payments, send email, host sites, or access external accounts.",
  customerCapabilitySummary: "Build educational, non-medical wellness programs, generate client artifacts, and package services through chat. No Web3 trading required.",
  noCustodySafetyLine: "Wellness content is educational and opt-in. Matterhorn does not process payments, send email, host sites, or access external accounts.",
  suggestedPromptTitles: [
    "Create a 4-week strength plan",
    "Draft a yoga class for lower backs",
    "Generate a meal-planning template",
    "Package this as a service offer",
  ],
  emptyStateCopy: {
    headline: "Build a wellness program",
    body: "Describe your audience, goal, and format. Matterhorn generates an educational, non-medical program packet you can refine and export.",
    primaryActionId: "build-program",
  },
  degradedStateCopy: {
    headline: "Wellness builder unavailable",
    body: "The program builder is temporarily unavailable. Your saved program packets and memory are still accessible.",
    primaryActionId: "build-program",
  },
};

export const MEMORY_PROTOCOL_DESK_MANIFEST: ProtocolDeskManifest = {
  version: "matterhorn.protocol.desk.manifest.v1",
  id: "memory",
  displayName: "Memory",
  shortDescription: "Inspect and manage what Matterhorn remembers across desks.",
  launcherTitle: "Memory",
  launcherDescription: "Review and manage what Matterhorn remembers across desks. Editable and forgettable.",
  launcherPrompt: "Show my saved memory",
  rightRailSummary: "User-controlled memory. Confirm, edit, or dismiss suggestions. Secrets and clinical records are rejected.",
  logoAssetId: "memory-logo",
  officialLogoAssetId: "memory-logo",
  logoAlt: "Memory logo",
  category: "memory",
  status: "beta_ready",
  readinessTone: "beta_ready",
  backendStatus: "live",
  actionStatus: "read_only",
  extensionStatus: "built_in_live",
  statusBadgeLabel: "Beta",
  statusBadgeTone: "success",
  routeOrPanelId: "/memory",
  logoAssetKey: "memory-logo",
  preferredColorToken: "--desk-memory-accent",
  lightThemeTokenHints: {
    background: "#F8FAFC",
    surface: "#FFFFFF",
    accent: "#0EA5E9",
    accentHover: "#0284C7",
    textPrimary: "#1F2937",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    safetyStrip: "#E0F2FE",
    iconFill: "#0EA5E9",
  },
  darkThemeTokenHints: {
    background: "#0C0C0C",
    surface: "#141414",
    accent: "#7DD3FC",
    accentHover: "#38BDF8",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    border: "#1F2937",
    safetyStrip: "#0C4A6E",
    iconFill: "#7DD3FC",
  },
  primaryActions: [
    {
      actionId: "review-memory",
      label: "Review memory",
      iconHint: "memory",
      intent: "review memory",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
    {
      actionId: "manage-suggestions",
      label: "Manage suggestions",
      iconHint: "inbox",
      intent: "manage suggestions",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
  ],
  primaryActionLabel: "Review memory",
  secondaryActions: [
    {
      actionId: "forget-record",
      label: "Forget record",
      iconHint: "trash",
      intent: "forget record",
      requiresConfirmation: true,
      surface: "context_menu",
    },
  ],
  walletRequirements: ["none"],
  walletRailMode: "none",
  safetyBoundaries: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    medicalClaimsAllowed: false,
  },
  customerVisible: true,
  capabilityBullets: [
    "Inspect and edit saved memory records",
    "Confirm, edit, or dismiss suggestions",
    "Export safe records for backup",
    "Reject secrets and clinical records automatically",
  ],
  safetySummary: "User-controlled and visible. Nothing is hidden, auto-captured, or stored without explicit confirmation.",
  customerCapabilitySummary: "Inspect, edit, and delete memory records and suggestions across desks. Export safe records and reject secrets or clinical data.",
  noCustodySafetyLine: "Memory is user-controlled and visible. Nothing is hidden, auto-captured, or stored without explicit confirmation.",
  suggestedPromptTitles: [
    "Show my memory",
    "Review my suggestions",
    "Forget my wallet labels",
    "Export my safe memory",
  ],
  emptyStateCopy: {
    headline: "Nothing saved yet",
    body: "As you confirm suggestions across desks, safe, editable memory will appear here. Secrets and clinical records are rejected.",
    primaryActionId: "review-memory",
  },
  degradedStateCopy: {
    headline: "Memory index unavailable",
    body: "Memory lookup is temporarily unavailable. Existing records are still stored locally and will reappear shortly.",
    primaryActionId: "review-memory",
  },
};

export const MCPS_PROTOCOL_DESK_MANIFEST: ProtocolDeskManifest = {
  version: "matterhorn.protocol.desk.manifest.v1",
  id: "mcps",
  displayName: "MCP Tools",
  shortDescription: "Manage approved Model Context Protocol tools and their memory boundaries.",
  launcherTitle: "MCP Tools",
  launcherDescription: "Browse, install, and manage approved MCP tools. No custody or signing.",
  launcherPrompt: "Browse available MCP tools",
  rightRailSummary: "Install and use surfaces only. MCP tools run with explicit approval and cannot hold keys or sign.",
  logoAssetId: "mcp-logo",
  officialLogoAssetId: "mcp-logo",
  logoAlt: "MCP Tools logo",
  category: "mcps",
  status: "planned_not_live",
  readinessTone: "local_only",
  backendStatus: "disabled",
  actionStatus: "workflow_only",
  extensionStatus: "requires_setup",
  statusBadgeLabel: "Soon",
  statusBadgeTone: "neutral",
  routeOrPanelId: "/mcps",
  logoAssetKey: "mcp-logo",
  preferredColorToken: "--desk-mcps-accent",
  lightThemeTokenHints: {
    background: "#FAFAFA",
    surface: "#FFFFFF",
    accent: "#6B7280",
    accentHover: "#4B5563",
    textPrimary: "#1F2937",
    textSecondary: "#6B7280",
    border: "#E5E7EB",
    safetyStrip: "#F3F4F6",
    iconFill: "#6B7280",
  },
  darkThemeTokenHints: {
    background: "#0C0C0C",
    surface: "#141414",
    accent: "#9CA3AF",
    accentHover: "#D1D5DB",
    textPrimary: "#F9FAFB",
    textSecondary: "#9CA3AF",
    border: "#1F2937",
    safetyStrip: "#1F2937",
    iconFill: "#9CA3AF",
  },
  primaryActions: [
    {
      actionId: "browse-tools",
      label: "Browse tools",
      iconHint: "tools",
      intent: "browse tools",
      requiresConfirmation: false,
      surface: "desk_panel",
    },
  ],
  primaryActionLabel: "Browse tools",
  secondaryActions: [
    {
      actionId: "manage-permissions",
      label: "Manage permissions",
      iconHint: "shield",
      intent: "manage permissions",
      requiresConfirmation: false,
      surface: "context_menu",
    },
  ],
  walletRequirements: ["none"],
  walletRailMode: "none",
  safetyBoundaries: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    medicalClaimsAllowed: false,
  },
  customerVisible: true,
  capabilityBullets: [
    "Browse approved MCP tools",
    "Install and manage tool permissions",
    "Review memory access granted to tools",
    "Run tools only with explicit approval",
  ],
  safetySummary: "Install-and-use only. Matterhorn does not grant tools keys, signing ability, or access to secrets.",
  customerCapabilitySummary: "Browse, install, and manage approved MCP tools and their permissions. Tool execution requires explicit approval; no custody or signing.",
  noCustodySafetyLine: "MCP tools are install-and-use only. Matterhorn does not grant them keys, signing ability, or access to secrets.",
  suggestedPromptTitles: [
    "Browse MCP tools",
    "Install an MCP tool",
    "Show my MCP permissions",
    "How do MCP tools work?",
  ],
  emptyStateCopy: {
    headline: "MCP tools coming soon",
    body: "Browse, approve, and manage MCP tool integrations once this desk goes live. No secrets or custody required.",
    primaryActionId: "browse-tools",
  },
  degradedStateCopy: {
    headline: "MCP tools unavailable",
    body: "MCP tool management is not yet live. Approved tools will appear here when the desk launches.",
    primaryActionId: "browse-tools",
  },
};

export const PROTOCOL_DESK_MANIFEST_REGISTRY: Record<string, ProtocolDeskManifest> = {
  bittensor: BITTENSOR_PROTOCOL_DESK_MANIFEST,
  hyperliquid: HYPERLIQUID_PROTOCOL_DESK_MANIFEST,
  polymarket: POLYMARKET_PROTOCOL_DESK_MANIFEST,
  wellness: WELLNESS_PROTOCOL_DESK_MANIFEST,
  memory: MEMORY_PROTOCOL_DESK_MANIFEST,
  mcps: MCPS_PROTOCOL_DESK_MANIFEST,
};

export const CUSTOMER_DESK_ORDER: string[] = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "memory",
  "mcps",
];

export function getProtocolDeskManifest(id: string): ProtocolDeskManifest | undefined {
  return PROTOCOL_DESK_MANIFEST_REGISTRY[id];
}

export function listCustomerProtocolDesks(): ProtocolDeskManifest[] {
  return CUSTOMER_DESK_ORDER.map((id) => PROTOCOL_DESK_MANIFEST_REGISTRY[id]).filter(
    (manifest): manifest is ProtocolDeskManifest => manifest?.customerVisible === true,
  );
}

export function getDeskLauncherPrompt(id: string): string | undefined {
  return getProtocolDeskManifest(id)?.launcherPrompt;
}

export function getDeskSafetySummary(id: string): string | undefined {
  const manifest = getProtocolDeskManifest(id);
  if (!manifest) return undefined;

  if (manifest.safetyBoundaries.requiresExternalSigner) {
    return "External signer required. Matterhorn never holds your keys.";
  }
  if (manifest.walletRailMode === "evm_preview") {
    return "Preview-only. No live submission or signing.";
  }
  if (manifest.id === "wellness") {
    return "Educational and non-medical. No wallet required.";
  }
  if (manifest.id === "memory") {
    return "User-controlled memory. Nothing hidden.";
  }
  if (manifest.id === "mcps") {
    return "Install and use surfaces only. No custody or signing.";
  }
  return "Read-only and non-custodial.";
}

export function getDeskWalletRequirementSummary(id: string): string | undefined {
  const manifest = getProtocolDeskManifest(id);
  if (!manifest) return undefined;

  switch (manifest.walletRailMode) {
    case "external_signer":
      return "SS58 address + external signer";
    case "evm_preview":
      return "EVM address for read-only previews";
    case "none":
      return "No wallet needed";
    default:
      return undefined;
  }
}

export function getDeskLogoFallback(id: string): string | undefined {
  const manifest = getProtocolDeskManifest(id);
  if (!manifest) return undefined;
  return PROTOCOL_BRAND_ASSET_REGISTRY[manifest.logoAssetKey]?.fallbackInitials;
}

export const BITTENSOR_BRAND_ASSET_MANIFEST: ProtocolBrandAssetManifest = {
  version: "matterhorn.protocol.brand.asset.v1",
  assetKey: "bittensor-logo",
  protocol: "bittensor",
  sourceUrl: "https://bittensor.com/brand",
  allowedUseNote: "Use only in Matterhorn Work UI surfaces. Do not modify colors or distort proportions.",
  lightAssetPath: "/assets/desks/bittensor/logo-light.svg",
  darkAssetPath: "/assets/desks/bittensor/logo-dark.svg",
  monochromeAssetPath: "/assets/desks/bittensor/logo-mono.svg",
  fallbackInitials: "TAO",
};

export const HYPERLIQUID_BRAND_ASSET_MANIFEST: ProtocolBrandAssetManifest = {
  version: "matterhorn.protocol.brand.asset.v1",
  assetKey: "hyperliquid-logo",
  protocol: "hyperliquid",
  sourceUrl: "https://hyperliquid.xyz/about",
  allowedUseNote: "Use only in Matterhorn Work UI surfaces. Do not modify colors or distort proportions.",
  lightAssetPath: "/assets/desks/hyperliquid/logo-light.svg",
  darkAssetPath: "/assets/desks/hyperliquid/logo-dark.svg",
  fallbackInitials: "HL",
};

export const POLYMARKET_BRAND_ASSET_MANIFEST: ProtocolBrandAssetManifest = {
  version: "matterhorn.protocol.brand.asset.v1",
  assetKey: "polymarket-logo",
  protocol: "polymarket",
  sourceUrl: "https://polymarket.com/press",
  allowedUseNote: "Use only in Matterhorn Work UI surfaces. Do not modify colors or distort proportions.",
  lightAssetPath: "/assets/desks/polymarket/logo-light.svg",
  darkAssetPath: "/assets/desks/polymarket/logo-dark.svg",
  fallbackInitials: "PM",
};

export const WELLNESS_BRAND_ASSET_MANIFEST: ProtocolBrandAssetManifest = {
  version: "matterhorn.protocol.brand.asset.v1",
  assetKey: "wellness-logo",
  protocol: "matterhorn",
  sourceUrl: "https://matterhorn.so/brand",
  allowedUseNote: "Matterhorn-owned asset. Free to use across Matterhorn Work UI surfaces.",
  lightAssetPath: "/assets/desks/wellness/logo-light.svg",
  darkAssetPath: "/assets/desks/wellness/logo-dark.svg",
  fallbackInitials: "WL",
};

export const MEMORY_BRAND_ASSET_MANIFEST: ProtocolBrandAssetManifest = {
  version: "matterhorn.protocol.brand.asset.v1",
  assetKey: "memory-logo",
  protocol: "matterhorn",
  sourceUrl: "https://matterhorn.so/brand",
  allowedUseNote: "Matterhorn-owned asset. Free to use across Matterhorn Work UI surfaces.",
  lightAssetPath: "/assets/desks/memory/logo-light.svg",
  darkAssetPath: "/assets/desks/memory/logo-dark.svg",
  fallbackInitials: "ME",
};

export const MCP_BRAND_ASSET_MANIFEST: ProtocolBrandAssetManifest = {
  version: "matterhorn.protocol.brand.asset.v1",
  assetKey: "mcp-logo",
  protocol: "matterhorn",
  sourceUrl: "https://matterhorn.so/brand",
  allowedUseNote: "Matterhorn-owned asset. Free to use across Matterhorn Work UI surfaces.",
  lightAssetPath: "/assets/desks/mcps/logo-light.svg",
  darkAssetPath: "/assets/desks/mcps/logo-dark.svg",
  fallbackInitials: "MCP",
};

export const PROTOCOL_BRAND_ASSET_REGISTRY: Record<string, ProtocolBrandAssetManifest> = {
  "bittensor-logo": BITTENSOR_BRAND_ASSET_MANIFEST,
  "hyperliquid-logo": HYPERLIQUID_BRAND_ASSET_MANIFEST,
  "polymarket-logo": POLYMARKET_BRAND_ASSET_MANIFEST,
  "wellness-logo": WELLNESS_BRAND_ASSET_MANIFEST,
  "memory-logo": MEMORY_BRAND_ASSET_MANIFEST,
  "mcp-logo": MCP_BRAND_ASSET_MANIFEST,
};


// --- Matterhorn MCP catalog contract ---
// Data-driven contract for customer-facing MCP cards. Production UI should render
// Matterhorn MCPs from this registry instead of hardcoding copy islands.

export const MATTERHORN_MCP_STATUSES = [
  "live",
  "preview",
  "requires_setup",
  "planned",
] as const;
export type MatterhornMcpStatus = (typeof MATTERHORN_MCP_STATUSES)[number];

export const MATTERHORN_MCP_COMPATIBLE_CLIENTS = [
  "codex",
  "claude_code",
  "claude_desktop",
  "cursor",
  "windsurf",
  "generic_sse",
] as const;
export type MatterhornMcpCompatibleClient = (typeof MATTERHORN_MCP_COMPATIBLE_CLIENTS)[number];

export interface MatterhornMcpToolDescriptor {
  name: string;
  description: string;
  isReadOnly: boolean;
}

export interface MatterhornMcpSafetyBoundary {
  liveSubmissionEnabled: false;
  canExecute: boolean;
  canSubmit: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  requiresExternalSigner: boolean;
  allowsRealFunds: false;
  requiresUserConfirmation: boolean;
  operatesOnPublicDataOnly: boolean;
}

export interface MatterhornMcpCatalogItem {
  version: "matterhorn.mcp.catalog.item.v1";
  id: string;
  displayName: string;
  deskId: string;
  description: string;
  installCommand: string;
  supportedTools: MatterhornMcpToolDescriptor[];
  safetyBoundary: MatterhornMcpSafetyBoundary;
  compatibleClients: MatterhornMcpCompatibleClient[];
  status: MatterhornMcpStatus;
  documentationUrl?: string;
  isBuiltIn: boolean;
}

export const BITTENSOR_MCP_CATALOG_ITEM: MatterhornMcpCatalogItem = {
  version: "matterhorn.mcp.catalog.item.v1",
  id: "matterhorn-bittensor",
  displayName: "Matterhorn Bittensor",
  deskId: "bittensor",
  description:
    "Read Bittensor subnet, stake, and balance data. Prepare unsigned previews and external-signer handoffs for stake, unstake, and transfer.",
  installCommand: "matterhorn-work mcp install matterhorn-bittensor",
  supportedTools: [
    { name: "bittensor_read_balance", description: "Read a public SS58 balance.", isReadOnly: true },
    { name: "bittensor_read_stake", description: "Read stake and delegate state.", isReadOnly: true },
    { name: "bittensor_list_subnets", description: "List subnets and validators.", isReadOnly: true },
    { name: "bittensor_compare_validators", description: "Compare validator yields.", isReadOnly: true },
    { name: "bittensor_preview_stake", description: "Preview a stake action without signing.", isReadOnly: true },
    { name: "bittensor_prepare_stake_handoff", description: "Build an external-signer handoff packet.", isReadOnly: false },
    { name: "bittensor_import_receipt", description: "Import a signed receipt for record-keeping.", isReadOnly: false },
  ],
  safetyBoundary: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: true,
    allowsRealFunds: false,
    requiresUserConfirmation: true,
    operatesOnPublicDataOnly: true,
  },
  compatibleClients: ["codex", "claude_code", "claude_desktop", "cursor", "windsurf", "generic_sse"],
  status: "preview",
  isBuiltIn: true,
};

export const HYPERLIQUID_MCP_CATALOG_ITEM: MatterhornMcpCatalogItem = {
  version: "matterhorn.mcp.catalog.item.v1",
  id: "matterhorn-hyperliquid",
  displayName: "Matterhorn Hyperliquid",
  deskId: "hyperliquid",
  description:
    "Read Hyperliquid market data and preview trades. Prepare external-signer handoffs and verify receipts. No live submission or signing.",
  installCommand: "matterhorn-work mcp install matterhorn-hyperliquid",
  supportedTools: [
    { name: "hyperliquid_read_market", description: "Read perp market metadata.", isReadOnly: true },
    { name: "hyperliquid_read_orderbook", description: "Read the orderbook.", isReadOnly: true },
    { name: "hyperliquid_read_exposure", description: "Read account exposure for a public address.", isReadOnly: true },
    { name: "hyperliquid_preview_order", description: "Preview an order without signing.", isReadOnly: true },
    { name: "hyperliquid_prepare_handoff", description: "Build an external-signer handoff packet.", isReadOnly: false },
    { name: "hyperliquid_import_receipt", description: "Import a signed receipt for record-keeping.", isReadOnly: false },
  ],
  safetyBoundary: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    requiresUserConfirmation: true,
    operatesOnPublicDataOnly: true,
  },
  compatibleClients: ["codex", "claude_code", "claude_desktop", "cursor", "windsurf", "generic_sse"],
  status: "live",
  isBuiltIn: true,
};

export const POLYMARKET_MCP_CATALOG_ITEM: MatterhornMcpCatalogItem = {
  version: "matterhorn.mcp.catalog.item.v1",
  id: "matterhorn-polymarket",
  displayName: "Matterhorn Polymarket",
  deskId: "polymarket",
  description:
    "Search Polymarket markets, read probabilities, and preview positions. Prepare external-signer handoffs and verify receipts. No live bet placement.",
  installCommand: "matterhorn-work mcp install matterhorn-polymarket",
  supportedTools: [
    { name: "polymarket_search_markets", description: "Search prediction markets.", isReadOnly: true },
    { name: "polymarket_read_probabilities", description: "Read outcome probabilities.", isReadOnly: true },
    { name: "polymarket_read_orderbook", description: "Read market orderbook.", isReadOnly: true },
    { name: "polymarket_preview_trade", description: "Preview a trade without signing.", isReadOnly: true },
    { name: "polymarket_prepare_handoff", description: "Build an external-signer handoff packet.", isReadOnly: false },
    { name: "polymarket_import_receipt", description: "Import a signed receipt for record-keeping.", isReadOnly: false },
  ],
  safetyBoundary: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    requiresUserConfirmation: true,
    operatesOnPublicDataOnly: true,
  },
  compatibleClients: ["codex", "claude_code", "claude_desktop", "cursor", "windsurf", "generic_sse"],
  status: "live",
  isBuiltIn: true,
};

export const MEMORY_MCP_CATALOG_ITEM: MatterhornMcpCatalogItem = {
  version: "matterhorn.mcp.catalog.item.v1",
  id: "matterhorn-memory",
  displayName: "Matterhorn Memory",
  deskId: "memory",
  description:
    "Read, manage, and export user-confirmed memory records. No hidden saves or access to secrets.",
  installCommand: "matterhorn-work mcp install matterhorn-memory",
  supportedTools: [
    { name: "memory_review", description: "Review saved memory records.", isReadOnly: true },
    { name: "memory_manage_suggestions", description: "Manage pending memory suggestions.", isReadOnly: false },
    { name: "memory_forget_record", description: "Forget a saved memory record.", isReadOnly: false },
    { name: "memory_export", description: "Export safe memory records.", isReadOnly: true },
  ],
  safetyBoundary: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    requiresUserConfirmation: true,
    operatesOnPublicDataOnly: false,
  },
  compatibleClients: ["codex", "claude_code", "claude_desktop", "cursor", "windsurf"],
  status: "live",
  isBuiltIn: true,
};

export const WORKFLOW_MCP_CATALOG_ITEM: MatterhornMcpCatalogItem = {
  version: "matterhorn.mcp.catalog.item.v1",
  id: "matterhorn-workflow",
  displayName: "Matterhorn Workflow",
  deskId: "workflow",
  description:
    "Invoke customer workflow templates and evidence bundles. Workflow output is local and reviewed before any external step.",
  installCommand: "matterhorn-work mcp install matterhorn-workflow",
  supportedTools: [
    { name: "workflow_list_templates", description: "List available workflow templates.", isReadOnly: true },
    { name: "workflow_run_template", description: "Run a workflow template and return artifacts.", isReadOnly: false },
    { name: "workflow_show_evidence", description: "Show evidence bundle for a workflow.", isReadOnly: true },
  ],
  safetyBoundary: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    requiresUserConfirmation: true,
    operatesOnPublicDataOnly: false,
  },
  compatibleClients: ["codex", "claude_code", "claude_desktop", "cursor", "windsurf"],
  status: "preview",
  isBuiltIn: true,
};

export const UI_CONTROL_MCP_CATALOG_ITEM: MatterhornMcpCatalogItem = {
  version: "matterhorn.mcp.catalog.item.v1",
  id: "matterhorn-ui-control",
  displayName: "Matterhorn UI Control",
  deskId: "ui_control",
  description:
    "Control local Matterhorn UI surfaces such as desk focus, panel state, and prompt input. No backend execution.",
  installCommand: "matterhorn-work mcp install matterhorn-ui-control",
  supportedTools: [
    { name: "ui_focus_desk", description: "Focus a desk in the UI.", isReadOnly: false },
    { name: "ui_set_prompt", description: "Set the chat prompt input.", isReadOnly: false },
    { name: "ui_toggle_panel", description: "Toggle a side panel.", isReadOnly: false },
  ],
  safetyBoundary: {
    liveSubmissionEnabled: false,
    canExecute: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    requiresExternalSigner: false,
    allowsRealFunds: false,
    requiresUserConfirmation: false,
    operatesOnPublicDataOnly: false,
  },
  compatibleClients: ["codex", "claude_code"],
  status: "planned",
  isBuiltIn: true,
};

export const MATTERHORN_MCP_CATALOG_REGISTRY: Record<string, MatterhornMcpCatalogItem> = {
  "matterhorn-bittensor": BITTENSOR_MCP_CATALOG_ITEM,
  "matterhorn-hyperliquid": HYPERLIQUID_MCP_CATALOG_ITEM,
  "matterhorn-polymarket": POLYMARKET_MCP_CATALOG_ITEM,
  "matterhorn-memory": MEMORY_MCP_CATALOG_ITEM,
  "matterhorn-workflow": WORKFLOW_MCP_CATALOG_ITEM,
  "matterhorn-ui-control": UI_CONTROL_MCP_CATALOG_ITEM,
};

export function getMatterhornMcpCatalogItem(id: string): MatterhornMcpCatalogItem | undefined {
  return MATTERHORN_MCP_CATALOG_REGISTRY[id];
}

export function listMatterhornMcpCatalogItems(): MatterhornMcpCatalogItem[] {
  return Object.values(MATTERHORN_MCP_CATALOG_REGISTRY);
}


// --- Matterhorn surface readiness contract ---
// Feature-linkage matrix: one typed row per customer-facing surface declaring
// its readiness status, backend linkage, safety posture, and owner.

export const MATTERHORN_SURFACE_STATUSES = [
  "ready",
  "needs_setup",
  "preview",
  "desktop_only",
  "cloud_only",
  "developer",
] as const;
export type MatterhornSurfaceStatus = (typeof MATTERHORN_SURFACE_STATUSES)[number];

export const MATTERHORN_SURFACE_KINDS = [
  "desk",
  "setting",
  "mcp",
  "wallet",
  "memory",
  "workflow",
] as const;
export type MatterhornSurfaceKind = (typeof MATTERHORN_SURFACE_KINDS)[number];

export const MATTERHORN_SURFACE_OWNERS = [
  "matterhorn",
  "protocol",
  "customer",
  "third_party",
] as const;
export type MatterhornSurfaceOwner = (typeof MATTERHORN_SURFACE_OWNERS)[number];

export interface MatterhornSurfaceSafetyPosture {
  canSubmit: boolean;
  liveSubmissionEnabled: boolean;
  custody: boolean;
  secretInputsAllowed: boolean;
}

export interface MatterhornSurfaceReadinessEntry {
  version: "matterhorn.surface.readiness.v1";
  id: string;
  displayName: string;
  kind: MatterhornSurfaceKind;
  status: MatterhornSurfaceStatus;
  routeOrPanelId: string;
  backendRouteOrTool?: string;
  mcpEquivalent?: string;
  cliEquivalent?: string;
  owner: MatterhornSurfaceOwner;
  safetyPosture: MatterhornSurfaceSafetyPosture;
  notes?: string;
}

export const SURFACE_READINESS_REGISTRY: Record<string, MatterhornSurfaceReadinessEntry> = {
  bittensor_desk: {
    version: "matterhorn.surface.readiness.v1",
    id: "bittensor_desk",
    displayName: "Bittensor Desk",
    kind: "desk",
    status: "preview",
    routeOrPanelId: "/workspaces/bittensor",
    backendRouteOrTool: "GET /api/bittensor/subnets, POST /api/bittensor/handoff",
    mcpEquivalent: "matterhorn-bittensor",
    cliEquivalent: "matterhorn-work bittensor handoff",
    owner: "protocol",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Read previews and external-signer handoffs only. External signer required.",
  },
  hyperliquid_desk: {
    version: "matterhorn.surface.readiness.v1",
    id: "hyperliquid_desk",
    displayName: "Hyperliquid Desk",
    kind: "desk",
    status: "preview",
    routeOrPanelId: "/workspaces/hyperliquid",
    backendRouteOrTool: "GET /api/hyperliquid/markets, POST /api/hyperliquid/orders/handoff",
    mcpEquivalent: "matterhorn-hyperliquid",
    cliEquivalent: "matterhorn-work hyperliquid handoff",
    owner: "protocol",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Read-only previews and handoffs. No live order submission.",
  },
  polymarket_desk: {
    version: "matterhorn.surface.readiness.v1",
    id: "polymarket_desk",
    displayName: "Polymarket Desk",
    kind: "desk",
    status: "preview",
    routeOrPanelId: "/workspaces/polymarket",
    backendRouteOrTool: "GET /api/polymarket/markets, POST /api/polymarket/orders/handoff",
    mcpEquivalent: "matterhorn-polymarket",
    cliEquivalent: "matterhorn-work polymarket handoff",
    owner: "protocol",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Market research, previews, and handoffs. No live bet placement.",
  },
  wellness_desk: {
    version: "matterhorn.surface.readiness.v1",
    id: "wellness_desk",
    displayName: "Wellness Creator Desk",
    kind: "desk",
    status: "ready",
    routeOrPanelId: "/workspaces/wellness",
    backendRouteOrTool: "Local workflow generation; no live provider execution",
    mcpEquivalent: undefined,
    cliEquivalent: "matterhorn-work workflow run wellness_creator_services",
    owner: "matterhorn",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Educational, non-medical, static-catalog workflows. No live payments/email/hosting.",
  },
  memory_desk: {
    version: "matterhorn.surface.readiness.v1",
    id: "memory_desk",
    displayName: "Memory Desk",
    kind: "memory",
    status: "ready",
    routeOrPanelId: "/memory",
    backendRouteOrTool: "Local memory store + memory API",
    mcpEquivalent: "matterhorn-memory",
    cliEquivalent: "matterhorn-work memory review",
    owner: "matterhorn",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "User-confirmed memory only. No hidden saves or secrets.",
  },
  mcps_desk: {
    version: "matterhorn.surface.readiness.v1",
    id: "mcps_desk",
    displayName: "MCP Tools Desk",
    kind: "mcp",
    status: "needs_setup",
    routeOrPanelId: "/mcps",
    backendRouteOrTool: "MCP catalog registry only; execution happens in client MCP host",
    mcpEquivalent: "MATTERHORN_MCP_CATALOG_REGISTRY",
    cliEquivalent: "matterhorn-work mcps browse",
    owner: "matterhorn",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Catalog and permission management. Real MCPs require user setup in a compatible client.",
  },
  wallet_settings: {
    version: "matterhorn.surface.readiness.v1",
    id: "wallet_settings",
    displayName: "Wallet Settings",
    kind: "wallet",
    status: "needs_setup",
    routeOrPanelId: "/settings/wallet",
    backendRouteOrTool: "Wallet rail state + external signer adapter config",
    mcpEquivalent: undefined,
    cliEquivalent: "matterhorn-work config wallet",
    owner: "customer",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Matterhorn never holds keys. User connects external signer or read-only address.",
  },
  profile_settings: {
    version: "matterhorn.surface.readiness.v1",
    id: "profile_settings",
    displayName: "Profile Settings",
    kind: "setting",
    status: "ready",
    routeOrPanelId: "/settings/profile",
    backendRouteOrTool: "User profile API",
    mcpEquivalent: undefined,
    cliEquivalent: undefined,
    owner: "matterhorn",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Basic profile and preferences.",
  },
  ai_providers_settings: {
    version: "matterhorn.surface.readiness.v1",
    id: "ai_providers_settings",
    displayName: "AI Providers Settings",
    kind: "setting",
    status: "cloud_only",
    routeOrPanelId: "/settings/ai-providers",
    backendRouteOrTool: "Provider key metadata stored encrypted in cloud; keys never exposed to UI",
    mcpEquivalent: undefined,
    cliEquivalent: "matterhorn-work config providers",
    owner: "matterhorn",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Keys are cloud-managed and never returned to the client.",
  },
  environment_settings: {
    version: "matterhorn.surface.readiness.v1",
    id: "environment_settings",
    displayName: "Environment Settings",
    kind: "setting",
    status: "developer",
    routeOrPanelId: "/settings/environment",
    backendRouteOrTool: "Local env store / CLI config",
    mcpEquivalent: undefined,
    cliEquivalent: "matterhorn-work config env",
    owner: "customer",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Desktop-only developer surface.",
  },
  agent_marketplace: {
    version: "matterhorn.surface.readiness.v1",
    id: "agent_marketplace",
    displayName: "Agent Marketplace",
    kind: "setting",
    status: "preview",
    routeOrPanelId: "/marketplace",
    backendRouteOrTool: "Static catalog API; install triggers local setup",
    mcpEquivalent: undefined,
    cliEquivalent: "matterhorn-work marketplace list",
    owner: "matterhorn",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Browse static catalog. Installed agents may require setup.",
  },
  feedback_surface: {
    version: "matterhorn.surface.readiness.v1",
    id: "feedback_surface",
    displayName: "Feedback",
    kind: "setting",
    status: "ready",
    routeOrPanelId: "/feedback",
    backendRouteOrTool: "Feedback API",
    mcpEquivalent: undefined,
    cliEquivalent: "matterhorn-work feedback",
    owner: "matterhorn",
    safetyPosture: {
      canSubmit: true,
      liveSubmissionEnabled: true,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "User feedback submission. No credentials or custody.",
  },
  subscribetome_future: {
    version: "matterhorn.surface.readiness.v1",
    id: "subscribetome_future",
    displayName: "SubscribeToMe Integration",
    kind: "workflow",
    status: "needs_setup",
    routeOrPanelId: "/workflows/subscribetome",
    backendRouteOrTool: "Planned: SubscribeToMe webhook handler",
    mcpEquivalent: undefined,
    cliEquivalent: undefined,
    owner: "third_party",
    safetyPosture: {
      canSubmit: false,
      liveSubmissionEnabled: false,
      custody: false,
      secretInputsAllowed: false,
    },
    notes: "Future integration. Requires user OAuth/setup when available.",
  },
};

export function getMatterhornSurfaceReadinessEntry(id: string): MatterhornSurfaceReadinessEntry | undefined {
  return SURFACE_READINESS_REGISTRY[id];
}

export function listMatterhornSurfaceReadinessEntries(): MatterhornSurfaceReadinessEntry[] {
  return Object.values(SURFACE_READINESS_REGISTRY);
}

export function listSurfacesByKind(kind: MatterhornSurfaceKind): MatterhornSurfaceReadinessEntry[] {
  return listMatterhornSurfaceReadinessEntries().filter((entry) => entry.kind === kind);
}

export function listSurfacesByStatus(status: MatterhornSurfaceStatus): MatterhornSurfaceReadinessEntry[] {
  return listMatterhornSurfaceReadinessEntries().filter((entry) => entry.status === status);
}
