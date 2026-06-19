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
  publicEvidence: MatterhornWorkflowEvidenceItem[];
  plannedServiceHooks: MatterhornWorkflowServiceHook[];
  safetyFlags: string[];
  createdAt: string;
  source: "operator" | "agent" | "customer" | "system";
  status: MatterhornWorkflowStatus;
  canExecute: false;
}

export const WELLNESS_CUSTOMER_INTAKE_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "wellness_creator_services",
  domain: "wellness",
  requestedOutcome: "Create a safe intake summary for a new wellness client.",
  publicEvidence: [
    {
      id: "client_goal",
      label: "Client goal",
      value: "Improve flexibility and reduce stress",
      mimeType: "text/plain",
      public: false,
      source: "customer",
    },
    {
      id: "service_tier",
      label: "Selected service tier",
      value: "monthly_yoga_coaching",
      mimeType: "text/plain",
      public: false,
      source: "agent",
    },
  ],
  plannedServiceHooks: [
    { hook: "email", status: "planned_not_live" },
    { hook: "payments", status: "planned_not_live" },
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
};

export const CRYPTO_STAKING_DECISION_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "bittensor_operator",
  domain: "crypto",
  requestedOutcome: "Record the inputs and safety checks for a staking preview decision.",
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
};

export const DECENTRALIZED_SERVICES_PLAN_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "decentralized_services_planner",
  domain: "decentralized_services",
  requestedOutcome: "Capture the planned decentralized-service action and provider comparison.",
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
};

export const RESEARCH_SUMMARY_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "research_summary",
  domain: "research",
  requestedOutcome: "Record the public inputs used to generate a research summary.",
  publicEvidence: [
    {
      id: "topic",
      label: "Research topic",
      value: "Decentralized identity adoption in 2026",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "source_count",
      label: "Number of public sources reviewed",
      value: 12,
      mimeType: "text/plain",
      public: true,
      source: "agent",
    },
  ],
  plannedServiceHooks: [{ hook: "storage", status: "planned_not_live" }],
  safetyFlags: [
    "no_secrets_collected",
    "no_live_execution",
    "public_sources_only",
  ],
  createdAt: "2026-06-19T12:00:00Z",
  source: "system",
  status: "preview_only",
  canExecute: false,
};

export const CONTENT_PUBLISH_PLAN_EVIDENCE_BUNDLE: MatterhornWorkflowEvidenceBundle = {
  version: "matterhorn.workflow.evidence-bundle.v1",
  workflowId: "content_publish",
  domain: "content",
  requestedOutcome: "Capture the plan for publishing content without executing provider actions.",
  publicEvidence: [
    {
      id: "content_title",
      label: "Content title",
      value: "Intro to Bittensor Staking",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
    {
      id: "publish_channel",
      label: "Publish channel",
      value: "newsletter",
      mimeType: "text/plain",
      public: true,
      source: "customer",
    },
  ],
  plannedServiceHooks: [
    { hook: "email", status: "planned_not_live" },
    { hook: "hosting", status: "planned_not_live" },
  ],
  safetyFlags: [
    "no_secrets_collected",
    "no_live_execution",
    "preview_before_publish",
  ],
  createdAt: "2026-06-19T12:00:00Z",
  source: "agent",
  status: "planned_not_live",
  canExecute: false,
};

export const MATTERHORN_WORKFLOW_EVIDENCE_BUNDLE_FIXTURES: Record<
  string,
  MatterhornWorkflowEvidenceBundle
> = {
  wellness_customer_intake: WELLNESS_CUSTOMER_INTAKE_EVIDENCE_BUNDLE,
  crypto_staking_decision: CRYPTO_STAKING_DECISION_EVIDENCE_BUNDLE,
  decentralized_services_plan: DECENTRALIZED_SERVICES_PLAN_EVIDENCE_BUNDLE,
  research_summary: RESEARCH_SUMMARY_EVIDENCE_BUNDLE,
  content_publish_plan: CONTENT_PUBLISH_PLAN_EVIDENCE_BUNDLE,
};
