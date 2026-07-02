import type {
  MatterhornWorkflowRun,
} from "@matterhorn-work/types/workflow-runs";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";

export type StageWorkflowRunInput = {
  workspaceId: string;
  sessionId: string;
  deskId: string;
  actionId?: string;
  stageId?: string;
  visibleUserIntent: string;
};

export type WorkflowRunClient = Pick<MatterhornServerClient, "stageWorkflowRun" | "startWorkflowRun">;

export async function stageWorkflowRun(client: WorkflowRunClient, input: StageWorkflowRunInput): Promise<MatterhornWorkflowRun> {
  const json = await client.stageWorkflowRun(input);
  return json.run;
}

export async function startWorkflowRun(client: WorkflowRunClient, workflowRunId: string): Promise<MatterhornWorkflowRun> {
  const json = await client.startWorkflowRun(workflowRunId);
  return json.run;
}
