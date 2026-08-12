import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { MATTERHORN_DESK_TASK_STARTERS } from "../src/react-app/domains/session/workflows/desk-task-starters";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

function readAppLibSource(path: string) {
  return readFileSync(new URL(`../src/app/${path}`, import.meta.url), "utf8");
}

function readShellSource(path: string) {
  return readFileSync(new URL(`../src/react-app/shell/${path}`, import.meta.url), "utf8");
}

describe("WorkflowStageCard — render contract", () => {
  test("shows title and objective", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("title:");
    expect(source).toContain("objective?:");
  });

  test("does not expose raw prompt or technical prompt disclosure", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");

    expect(source).not.toContain("rawPrompt?:");
    expect(source).not.toContain("promptExpanded?:");
    expect(source).not.toContain("technical prompt");
    expect(source).not.toContain("ChevronDown");
    expect(source).not.toContain("ChevronRight");
  });

  test("has status badges for all runtime statuses", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain('"idle"');
    expect(source).toContain('"running"');
    expect(source).toContain('"waiting"');
    expect(source).toContain('"completed"');
    expect(source).toContain('"failed"');
    expect(source).toContain('"cancelled"');
  });

  test("shows outputs section when provided", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("outputs?:");
    expect(source).toContain("FileOutput");
  });

  test("shows evidence hints section when provided", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("evidenceHints?:");
    expect(source).toContain("Lightbulb");
  });

  test("shows user action hint when provided", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("userActionHint?:");
    expect(source).toContain("ArrowRight");
  });

  test("supports disabling task actions when workspace readiness is blocked", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("actionDisabled?:");
    expect(source).toContain("disabled={actionDisabled}");
    expect(source).toContain("actionTitle?:");
  });

  test("lets focused desk launchers give task copy the full card width", () => {
    const cardSource = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    const pageSource = readAppSource("domains/session/chat/session-page.tsx");

    expect(cardSource).toContain('actionPlacement?: "inline" | "below";');
    expect(cardSource).toContain('actionPlacement === "inline" ? "sm:flex" : null');
    expect(pageSource).toContain('actionPlacement="below"');
  });

  test("shows external signer lock indicator when required", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("requiresExternalSigner?:");
    expect(source).toContain("Lock");
  });

  test("shows current stage highlight when isCurrent is true", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("isCurrent?:");
    expect(source).toContain("isCurrent");
  });

  test("does not render numbered stage prefixes", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).not.toContain("stageNumber?:");
    expect(source).not.toContain("padStart");
    expect(source).not.toContain("tabular-nums");
  });

  test("does not show idle Ready copy next to Start task", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain('if (status === "idle") return null;');
  });

  test("keeps task actions visually distinct before hover", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain("bg-dls-surface-muted/[0.20]");
    expect(source).toContain("hover:bg-dls-surface-muted/[0.30]");
    expect(source).toContain("bg-dls-surface-muted/[0.38]");
    expect(source).toContain("hover:bg-dls-surface-muted/[0.52]");
    expect(source).not.toContain("h-6 gap-1 bg-transparent");
  });

  test("keeps idle task launch cards free of repetitive evidence disclosures", () => {
    const source = readAppSource("domains/session/workflows/workflow-stage-card.tsx");
    expect(source).toContain('hasHints && status !== "idle"');
  });

  test("in-session desk starters launch real tasks when the shell supports it", () => {
    const surfaceSrc = readAppSource("domains/session/surface/session-surface.tsx");
    const pageSrc = readAppSource("domains/session/chat/session-page.tsx");

    expect(surfaceSrc).toContain("onCreateDeskTask?");
    expect(surfaceSrc).toContain("const startDeskTask = useCallback");
    expect(surfaceSrc).toContain("const startStarterTask = useCallback");
    expect(surfaceSrc).toContain("sendImmediately: true");
    expect(surfaceSrc).toContain("props.onCreateDeskTask(prompt");
    expect(surfaceSrc).toContain("startDeskTask(activeDeskMode, prompt)");
    expect(surfaceSrc).toContain("startStarterTask(item)");
    expect(pageSrc).toContain("onCreateDeskTask={(prompt, options)");
    expect(pageSrc).toContain("props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, prompt, options)");
  });

  test("desk-panel handoffs open a dedicated chat instead of replacing active desk context", () => {
    const surfaceSrc = readAppSource("domains/session/surface/session-surface.tsx");

    expect(surfaceSrc).toContain("if (agent && props.onCreateDeskTask)");
    expect(surfaceSrc).not.toContain('source !== "bittensor-card-action"');
    expect(surfaceSrc).toContain("sendImmediately: false");
    expect(surfaceSrc).toContain("onSessionCreated: (sessionId) =>");
    expect(surfaceSrc).toContain('recordInspectorEvent("desk.chat_handoff.session_created"');
    expect(surfaceSrc).toContain('recordInspectorEvent("desk.chat_handoff.session_requested"');
  });

  test("a created desk chat remains visible when an optional setup hook fails", () => {
    const routeSrc = readShellSource("session-route.tsx");
    const launcherBlock = routeSrc.slice(
      routeSrc.indexOf("onCreateTaskWithPrompt:"),
      routeSrc.indexOf("onOpenRenameWorkspace:"),
    );
    const selectedSessionIndex = launcherBlock.indexOf(
      "selectedSessionIdRef.current = session.id;",
    );
    const sessionListIndex = launcherBlock.indexOf(
      "sessionsByWorkspaceIdRef.current = next;",
    );
    const navigateIndex = routeSrc.indexOf("navigateToWorkspaceSession(workspaceId, session.id);");
    const callbackIndex = routeSrc.indexOf("await options?.onSessionCreated?.(session.id);");

    expect(selectedSessionIndex).toBeGreaterThan(-1);
    expect(sessionListIndex).toBeGreaterThan(selectedSessionIndex);
    expect(launcherBlock.indexOf("navigateToWorkspaceSession(workspaceId, session.id);")).toBeGreaterThan(
      sessionListIndex,
    );
    expect(navigateIndex).toBeGreaterThan(-1);
    expect(callbackIndex).toBeGreaterThan(navigateIndex);
    expect(routeSrc).toContain('recordInspectorEvent("desk.task_launch.navigation_requested"');
    expect(routeSrc).toContain('recordInspectorEvent("desk.task_launch.setup_failed"');
    expect(routeSrc).toContain("Chat created; task setup needs review");
    expect(routeSrc).toContain("The prompt is saved in the new chat.");
  });
});

describe("DeskWorkflowStagePanel — uses WorkflowStageCard", () => {
  test("imports WorkflowStageCard", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain('import { WorkflowStageCard');
  });

  test("maps manifest steps to WorkflowStageCard instances", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain("<WorkflowStageCard");
    expect(panelSrc).not.toContain("stageNumber={index + 1}");
    expect(panelSrc).toContain("title={step.name}");
    expect(panelSrc).toContain("objective={step.description}");
  });

  test("Longevity uses a guided current, completed, and next sequence", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    const pageSrc = readAppSource("domains/session/chat/session-page.tsx");

    expect(panelSrc).toContain('presentation?: "default" | "guided"');
    expect(panelSrc).toContain("const guidedSequence = presentation === \"guided\"");
    expect(panelSrc).toContain("Current stage");
    expect(panelSrc).toContain('{completed ? "Completed" : "Next"}');
    expect(panelSrc).toContain("Complete the current stage, review its output, then continue.");
    expect(pageSrc).toContain('presentation={deskId === "wellness" ? "guided" : "default"}');
    expect(pageSrc).toContain("showAgentHeader={false}");
  });

  test("derives outputs from step.outputArtifactIds and manifest.generatedArtifacts", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain("outputArtifactIds");
    expect(panelSrc).toContain("generatedArtifacts");
  });

  test("keeps generated prompts internal to stage actions", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain("buildStagePrompt");
    expect(panelSrc).toContain("onStartStage(step.id, rawPrompt)");
    expect(panelSrc).not.toContain("rawPrompt={rawPrompt}");
  });

  test("keeps workflow safety copy behind an info popover", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");

    expect(panelSrc).toContain("PopoverTrigger");
    expect(panelSrc).toContain("PopoverContent");
    expect(panelSrc).toContain("${visual.displayName} safety info");
    expect(panelSrc).toContain("{visual.sessionBoundary}");
    expect(panelSrc).not.toContain("Safety boundary:");
    expect(panelSrc).not.toContain("safetyBoundary={isCurrent");
  });

  test("cardStatus maps all runtime statuses correctly", () => {
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");
    expect(panelSrc).toContain('return "idle"');
    expect(panelSrc).toContain('return "completed"');
    expect(panelSrc).toContain('return "running"');
    expect(panelSrc).toContain('return "failed"');
    expect(panelSrc).toContain('return "cancelled"');
  });

  test("workflow desks give new users a direct model setup recovery", () => {
    const pageSrc = readAppSource("domains/session/chat/session-page.tsx");

    expect(pageSrc).toContain("modelUnavailable: boolean;");
    expect(pageSrc).toContain('"Connect a model before starting a desk task."');
    expect(pageSrc).toContain("onOpenModelSettings");
    expect(pageSrc).toContain("Set up model");
    expect(pageSrc).toContain("modelUnavailable={Boolean(props.modelUnavailable)}");
    expect(pageSrc).toContain("onOpenModelSettings={props.onOpenSettings}");
  });
});

describe("ProtocolDeskEmptyState — uses WorkflowStageCard for task buttons", () => {
  test("session-page imports WorkflowStageCard", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    expect(src).toContain("WorkflowStageCard");
  });

  test("replaces raw prompt list with WorkflowStageCard instances per task", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    // Each prompt item should become a WorkflowStageCard.
    expect(src).toContain("<WorkflowStageCard");
    expect(src).toContain("objective={item.detail}");
    expect(src).not.toContain("rawPrompt={item.prompt}");
    // The old giant raw-prompt text display is gone.
    expect(src).not.toContain("item.prompt}</span>");
    expect(src).not.toContain('className="group grid w-full grid-cols-[minmax(0,1fr)] gap-2 px-4 py-4');
  });

  test("uses user-facing task details instead of prompt-derived objective text", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    expect(src).toContain("detail:");
    expect(src).toContain("objective={item.detail}");
    expect(src).not.toContain("objective = item.prompt");
    expect(src).not.toContain("slice(0, 90)");
  });

  test("sets evidence hint per panel type", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    expect(src).toContain('panel === "bittensor"');
    expect(src).toContain('panel === "hyperliquid"');
    expect(src).toContain('panel === "polymarket"');
    // The hint is stored in a local `const evidenceHint` variable.
    expect(src).toContain("const evidenceHint =");
    expect(src).toContain("reads:");
  });

  test("keeps desk safety copy behind an info popover", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    const surfaceSrc = readAppSource("domains/session/surface/session-surface.tsx");

    expect(src).toContain("deskSafetyInfo");
    expect(src).toContain("desk safety info");
    expect(src).toContain("Chat prepares exact Hyperliquid orders and changes.");
    expect(src).toContain("connected-wallet approval; agents and watches cannot submit unattended.");
    expect(src).toContain("Chat prepares research or exact buy, sell, and cancel terms.");
    expect(src).toContain("Uses public wallet details and prepares exact transaction drafts.");
    expect(surfaceSrc).toContain("Agent tasks run market and account checks and prepare order context, but cannot submit.");
    expect(surfaceSrc).toContain("Manual execution is available only in the Hyperliquid panel after exact review and connected-wallet approval.");
    expect(src).toContain("<PopoverTrigger");
    expect(src).toContain("<PopoverContent");
    expect(src).not.toContain("Boundary:");
  });

  test("uses positive task copy for protocol desks", () => {
    const hyperliquidTitles = MATTERHORN_DESK_TASK_STARTERS.hyperliquid.map((starter) => starter.title);
    const polymarketTitles = MATTERHORN_DESK_TASK_STARTERS.polymarket.map((starter) => starter.title);

    expect(hyperliquidTitles).toContain("Read orderbook depth");
    expect(hyperliquidTitles).toContain("Review a wallet-approved trade");
    expect(polymarketTitles).toContain("Buy an outcome");
    expect(polymarketTitles).toContain("Sell shares");
    expect(polymarketTitles).toContain("Cancel orders");
  });

  test("focused desk transaction cards prepare an editable chat request before wallet review", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    const surfaceSrc = readAppSource("domains/session/surface/session-surface.tsx");

    expect(src).toContain("reviewedActionChatDraft");
    expect(src).toContain("if (item.reviewedAction)");
    expect(src).toContain("startTask(draft, item.title, { sendImmediately: false })");
    expect(src).toContain("sendImmediately: options?.sendImmediately ?? true");
    expect(src).toContain("launchingTaskTitle");
    expect(src).toContain("Starting {launchingTaskTitle} in a new chat.");
    expect(src).toContain('? "Prepare in chat"');
    expect(src).toContain("Start an editable chat request. Exact terms move to Wallet for review and signature.");
    expect(src).not.toContain("onOpenReviewedAction(item.reviewedAction");
    expect(src).not.toContain("draftedPromptTitle");
    expect(src).not.toContain("Draft ready");
    expect(surfaceSrc).toContain("Choose a starter below to run");
    expect(surfaceSrc).toContain("DeskSafetyInfoButton");
    expect(surfaceSrc).toContain('.filter((card) => card.id !== "blank_chat_workflow")');
    expect(surfaceSrc).toContain("Choose a desk task. Matterhorn starts it in a new chat.");
    expect(surfaceSrc).not.toContain("Every prompt stays editable before sending.");
    expect(surfaceSrc).not.toContain("Choose a desk or start a blank chat.");
    expect(surfaceSrc).not.toContain("Ready in composer");
    expect(surfaceSrc).not.toContain("Composer handoff");
    expect(surfaceSrc).not.toContain("starters fill the composer");
  });

  test("focused desks offer a blank chat with the desk agent already selected", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");

    expect(src).toContain('const blankChatTitle = `${visual?.displayName ?? panel} chat`;');
    expect(src).toContain("Start a blank chat or choose a task below.");
    expect(src).toContain('onClick={() => startTask("", blankChatTitle, { sendImmediately: false })}');
    expect(src).toContain('`Start ${visual?.displayName ?? panel} chat`');
    expect(src).toContain("The desk agent and its working context are already selected.");
    expect(src).toContain("Research freely and prepare wallet-reviewed buy, sell, and cancel actions.");
    expect(src).toContain("agent: agentIdForDesk(focusedProtocolPanel)");
    expect(src).toContain("deskId: focusedProtocolPanel");
  });

  test("focused desk close cannot overwrite a newly opened task session", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    const routeState = readAppSource("shell/session-panel-route.ts");

    expect(src).toContain("const liveLocationRef = useRef(location)");
    expect(src).toContain("const currentLocation = liveLocationRef.current");
    expect(src).not.toContain('const currentLocation = typeof window !== "undefined" ? window.location : location');
    expect(src).toContain("resolveSessionPanelNavigation(currentLocation.search, panel)");
    expect(src).toContain("pathname: currentLocation.pathname");
    expect(src).toContain("hash: currentLocation.hash");
    expect(routeState).toContain("new URLSearchParams(search)");
  });

  test("desk launchers run tasks while Home New chat stays blank", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");

    expect(src).toContain("primeProtocolRailPrompt");
    expect(src).toContain("agent: agentIdForDesk(panel)");
    expect(src).toContain("sendImmediately: true");
    expect(src).toContain('onClick={() => props.sidebar.onCreateTaskInWorkspace(props.selectedWorkspaceId)}');
    expect(src).not.toContain("blankWorkflowLauncher");
    expect(src).not.toContain('new CustomEvent("matterhorn:crypto-chat-handoff"');
  });

  test("workflow desk stages launch a real agent chat instead of stopping at a run record", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    const panelSrc = readAppSource("domains/session/workflows/desk-workflow-stage-panel.tsx");

    expect(src).toContain("launchAgent?: boolean");
    expect(src).toContain("if (!options?.launchAgent)");
    expect(src).toContain("props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, visibleUserIntent");
    expect(src).toContain("agent: agentIdForDesk(deskId)");
    expect(src).toContain("launchAgent: true");
    expect(src).toContain('!props.matterhornServerClient');
    expect(src).toContain('? "failed"');
    expect(src).toContain(': modelUnavailable');
    expect(src).toContain('? "setup_required"');
    expect(src).toContain(': "ready"');
    expect(src).toContain("Connect a model before starting a stage. Nothing has been sent.");
    expect(src).toContain("Choose a stage to begin. Outputs will save under");
    expect(src).toContain('status: "launching"');
    expect(src).not.toContain("Started. Outputs will save under");
    expect(panelSrc).toContain('actionLabel={stageActionDisabled ? stageActionLabel : "Run in chat"}');
  });

  test("focused desk task cards show readiness blockers before launch", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");

    expect(src).toContain("protocol-desk-readiness");
    expect(src).toContain("matterhornServerClient.workspaceReadiness(readinessWorkspaceId)");
    expect(src).toContain("features.start_desk_task");
    expect(src).toContain(': startTaskBlocked');
    expect(src).toContain('? startTaskActionLabel');
    expect(src).toContain('? "Engine offline"');
    expect(src).toContain('? "Open workspace"');
    expect(src).toContain(': "Platform setup"');
    expect(src).toContain("actionDisabled={Boolean(launchingTaskTitle) || startTaskBlocked}");
    expect(src).toContain("Start an editable chat request. Exact terms move to Wallet for review and signature.");
    expect(src).toContain("Start this task, then answer the ${inputRequirement.label.toLowerCase()} question in chat.");
    expect(src).toContain("getDeskTaskInputRequirement(item.prompt)");
    expect(src).toContain("buildDeskTaskPromptRequestingInput(item.prompt, requirement)");
    expect(src).not.toContain("pendingInput");
    expect(src).not.toContain("desk-task-input-");
  });

  test("Bittensor desk reports live provider readiness without blocking fallback task launch", () => {
    const src = readAppSource("domains/session/chat/session-page.tsx");
    const clientSrc = readAppLibSource("lib/matterhorn-server.ts");

    expect(clientSrc).toContain("bittensorSidecarHealth");
    expect(clientSrc).toContain("/api/bittensor/sidecar/health");
    expect(src).toContain("bittensor-sidecar-health");
    expect(src).toContain("matterhornServerClient.bittensorSidecarHealth()");
    expect(src).toContain("bittensorSidecarNotice");
    expect(src).toContain("Bittensor live provider unreachable");
    expect(src).toContain("Tasks still start; live TAO reads may fail until it returns.");
    expect(src).toContain("Tasks still start with public and fallback data.");
    expect(src).toContain("providerNotice");
    expect(src).not.toContain("blockingCheckIds.includes(\"bittensor");
  });

  test("route-level task launcher reports setup failures instead of silently returning", () => {
    const routeSrc = readShellSource("session-route.tsx");
    const launcherBlock = routeSrc.slice(
      routeSrc.indexOf("onCreateTaskWithPrompt:"),
      routeSrc.indexOf("onOpenRenameWorkspace:"),
    );

    expect(launcherBlock).toContain('title: "Could not start task"');
    expect(launcherBlock).toContain('title: "Matterhorn Desks engine is offline"');
    expect(launcherBlock).toContain("selectedModelUnavailable");
    expect(launcherBlock).toContain('handleOpenSettings("/settings/ai", workspaceId, { pendingDeskTask })');
    expect(launcherBlock).toContain("writePendingDeskTask(workspaceId, pendingDeskTask)");
    expect(launcherBlock).toContain("Nothing has been sent.");
    expect(launcherBlock).toContain("Add a provider in Models, then choose one of its available models.");
    expect(launcherBlock).toContain('title: `Starting ${title || "desk task"}`');
    expect(launcherBlock).toContain('title: `${title || "Desk task"} started`');
    expect(launcherBlock).toContain('title: "Task was not sent"');
    expect(launcherBlock).toContain('reason: "provider_privacy_unverified"');
    expect(launcherBlock).toContain('actionLabel: "Privacy details"');
    expect(launcherBlock).toContain('recordInspectorEvent("desk.task_launch.requested"');
    expect(launcherBlock).toContain('recordInspectorEvent("desk.task_launch.session_created"');
    expect(launcherBlock).toContain('recordInspectorEvent("desk.task_launch.prompt_send_started"');
    expect(launcherBlock).toContain('recordInspectorEvent("desk.task_launch.prompt_sent"');
    expect(launcherBlock).toContain('recordInspectorEvent("desk.task_launch.fallback_saved"');
    expect(launcherBlock).toContain('recordInspectorEvent("desk.task_launch.failed"');
    expect(launcherBlock).not.toContain("The task is ready in the composer.");
    expect(launcherBlock).not.toContain("void handleCreateTaskInWorkspace(workspaceId);");
    expect(launcherBlock).not.toContain("if (!workspace) return;");
    expect(launcherBlock).not.toContain("if (!endpoint?.token) return;");
  });

  test("task launch observability never records raw prompt text", () => {
    const routeSrc = readShellSource("session-route.tsx");
    const launcherBlock = routeSrc.slice(
      routeSrc.indexOf("onCreateTaskWithPrompt:"),
      routeSrc.indexOf("onOpenRenameWorkspace:"),
    );
    const taskLaunchEventBlock = launcherBlock.slice(
      launcherBlock.indexOf("const taskLaunchEvent ="),
      launcherBlock.indexOf('recordInspectorEvent("desk.task_launch.requested"'),
    );

    expect(launcherBlock).toContain("promptLength: prompt.length");
    expect(launcherBlock).toContain("taskLaunchEvent");
    expect(taskLaunchEventBlock).toContain("promptLength: prompt.length");
    expect(taskLaunchEventBlock).not.toContain("text: prompt");
    expect(taskLaunchEventBlock).not.toContain("prompt:");
  });

  test("task launcher returns a result so desk UI can recover from failed starts", () => {
    const pageSrc = readAppSource("domains/session/chat/session-page.tsx");
    const routeSrc = readShellSource("session-route.tsx");
    const launcherBlock = routeSrc.slice(
      routeSrc.indexOf("onCreateTaskWithPrompt:"),
      routeSrc.indexOf("onOpenRenameWorkspace:"),
    );

    expect(pageSrc).toContain("Promise<boolean | void>");
    expect(pageSrc).toContain("if (started === false)");
    expect(pageSrc).toContain("setLaunchingTaskTitle((current) => current === title ? null : current)");
    expect(pageSrc).toContain("const startResult = props.sidebar.onCreateTaskWithPrompt?.(props.selectedWorkspaceId, prompt");
    expect(pageSrc).toContain("return Promise.resolve(startResult).then((started) =>");
    expect(launcherBlock).toContain("return (async () => {");
    expect(launcherBlock).toContain("return false;");
    expect(launcherBlock).toContain("return true;");
    expect(launcherBlock).not.toContain("void (async () => {");
  });

  test("workflow desk stage cards reuse backend readiness blockers", () => {
    const pageSrc = readAppSource("domains/session/chat/session-page.tsx");
    const surfaceSrc = readAppSource("domains/session/surface/session-surface.tsx");

    expect(pageSrc).toContain("workflow-desk-readiness");
    expect(pageSrc).toContain("stageActionDisabled={startTaskBlocked}");
    expect(pageSrc).toContain("stageActionTitle={startTaskBlocker ?? undefined}");
    expect(surfaceSrc).toContain("session-desk-readiness");
    expect(surfaceSrc).toContain("stageActionDisabled={activeDeskStartBlocked}");
    expect(surfaceSrc).toContain("stageActionTitle={activeDeskStartBlocker ?? undefined}");
  });

  test("task launcher route can send the prompt immediately", () => {
    const src = readAppSource("shell/session-route.tsx");

    expect(src).toContain("sendImmediately");
    expect(src).toContain("workspaceClient.session.promptAsync");
    expect(src).toContain("sessionID: session.id");
    expect(src).toContain("selectedPromptModel");
    expect(src).toContain("client.workspaceModelSelection(selectedWorkspaceId)");
    expect(src).toContain("model: selectedPromptModel ?? undefined");
    expect(src).toContain("current={selectedPromptModel");
    expect(src).toContain("agent: agent || undefined");
    expect(src).toContain('buildSessionSystemContext(prompt, session.id, agent, "work")');
    expect(src).toContain("getMatterhornDeskAgentById(agentId)");
    expect(src).toContain("buildMatterhornDeskAgentSystemPrompt(deskAgent)");
    expect(src).toContain("startOptimisticRun(activityWorkspaceId, session.id");
    expect(src).toContain("cancelOptimisticRun(activityWorkspaceId, session.id)");
  });

  test("task launcher exposes an immediate in-session activity state", () => {
    const routeSrc = readAppSource("shell/session-route.tsx");
    const surfaceSrc = readAppSource("domains/session/surface/session-surface.tsx");
    const storeSrc = readAppSource("domains/session/status/session-activity-store.ts");

    expect(storeSrc).toContain("startOptimisticRun:");
    expect(storeSrc).toContain("optimisticRunTitle");
    expect(storeSrc).toContain("runStartedAt");
    expect(routeSrc).toContain("startOptimisticRun(activityWorkspaceId, session.id");
    expect(surfaceSrc).toContain("assistantActivityLabel");
    expect(surfaceSrc).toContain('sessionActivityStatus === "thinking"');
    expect(surfaceSrc).toContain('sessionActivityStatus === "responding"');
    expect(surfaceSrc).toContain("Working on ${optimisticRunTitle}");
    expect(surfaceSrc).toContain("formatAssistantRunElapsed");
    expect(surfaceSrc).toContain("elapsedSeconds >= 10");
    expect(surfaceSrc).toContain("Taking longer than usual. You can stop this run at any time.");
    expect(surfaceSrc).toContain("latestSessionSnapshotFailure");
    expect(surfaceSrc).toContain("snapshotQuery.refetch()");
    expect(surfaceSrc).toContain("Matterhorn could not complete this response. Your prompt is ready to retry.");
    expect(surfaceSrc).toContain("suppressNextAbortFailureRef");
    expect(surfaceSrc).not.toContain("(!chatStreaming && awaitingAssistantBaseline === null)");
    expect(surfaceSrc).toContain("isError: snapshotQuery.isError,");
    expect(surfaceSrc).not.toContain("isError: snapshotQuery.isError || Boolean(error)");
    expect(surfaceSrc).not.toContain("Starting ${optimisticRunTitle}");
  });

  test("session route scopes selected agent updates to the active chat", () => {
    const src = readAppSource("shell/session-route.tsx");

    expect(src).toContain("useSessionAgentState(");
    expect(src).toContain("selectedAgentRef.current = agent");
    expect(src).toContain("onSelectAgent: handleSelectAgent");
    expect(src).not.toContain("pendingSelectedAgentRef");
    expect(src).not.toContain("window.setTimeout(commit, 0)");
    expect(src).not.toContain("onSelectAgent: (agent: string | null) => setSelectedAgent(agent)");
  });

  test("ordinary assistant prose cannot switch the active desk", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");

    expect(src).toContain('.filter((message) => message.role === "user")');
    expect(src).not.toContain("renderedMessages.map(messageToReadableText)");
  });

  test("stopping a response returns the local activity state to idle", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    const abortBlock = src.slice(src.indexOf("const handleAbort"), src.indexOf("const handleDismissError"));

    expect(abortBlock).toContain("setSending(false)");
    expect(abortBlock).toContain("setAwaitingAssistantBaseline(null)");
    expect(abortBlock).toContain('activity.setRunStatus(props.workspaceId, props.sessionId, { type: "idle" })');
    expect(abortBlock).toContain("activity.clearError(props.workspaceId, props.sessionId)");
  });

  test("completed responses cannot leave a stale responding footer", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    const storeSrc = readAppSource("domains/session/status/session-activity-store.ts");

    expect(src).toContain('if (sessionActivityStatus !== "thinking" && sessionActivityStatus !== "responding") return;');
    expect(src).toContain('setRunStatus(props.workspaceId, props.sessionId, { type: "idle" })');
    expect(storeSrc).toContain("pendingOptimisticRun");
    expect(storeSrc).toContain("preservePendingOptimisticRun");
    expect(storeSrc).toContain("OPTIMISTIC_RUN_RECONCILE_GRACE_MS");
  });
});

describe("LongevityWorkflowStagePreview — uses WorkflowStageCard", () => {
  test("session-surface imports WorkflowStageCard", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    expect(src).toContain("WorkflowStageCard");
  });

  test("LongevityWorkflowStagePreview renders one WorkflowStageCard per stage", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    expect(src).toContain("<WorkflowStageCard");
    expect(src).not.toContain("stageNumber={index + 1}");
    // The component binds `const manifest = WELLNESS_CREATOR_SERVICES_WORKFLOW` then uses `manifest.steps.map`.
    expect(src).toContain("manifest.steps.map");
  });

  test("derives outputs per stage from outputArtifactIds", () => {
    const src = readAppSource("domains/session/surface/session-surface.tsx");
    expect(src).toContain("outputArtifactIds");
    expect(src).toContain("generatedArtifacts");
  });
});
