import type {
  MatterhornWorkflowRun,
} from "@matterhorn-work/types/workflow-runs";

export type StageWorkflowRunInput = {
  workspaceId: string;
  sessionId: string;
  deskId: string;
  actionId?: string;
  stageId?: string;
  visibleUserIntent: string;
};

export async function stageWorkflowRun(input: StageWorkflowRunInput): Promise<MatterhornWorkflowRun> {
  const response = await fetch("/api/workflows/runs/stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: `Could not stage workflow run (${response.status})` }));
    throw new Error(typeof body?.message === "string" ? body.message : String(body));
  }

  const json = (await response.json()) as { run: MatterhornWorkflowRun };
  return json.run;
}

export async function startWorkflowRun(workflowRunId: string): Promise<MatterhornWorkflowRun> {
  const response = await fetch(`/api/workflows/runs/${encodeURIComponent(workflowRunId)}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: `Could not start workflow run (${response.status})` }));
    throw new Error(typeof body?.message === "string" ? body.message : String(body));
  }

  const json = (await response.json()) as { run: MatterhornWorkflowRun };
  return json.run;
}
