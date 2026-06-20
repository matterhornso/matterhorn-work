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
