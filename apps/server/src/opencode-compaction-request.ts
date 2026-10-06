// This marker requests conversion by the trusted runtime plugin. It is not an
// authorization: the plugin must claim the exact server-bound run and message.
export const MATTERHORN_COMPACTION_REQUEST = "matterhornCompactionRun";

export function compactionPromptPart(runId: string): {
  type: "text"; text: string; synthetic: boolean; ignored: boolean; metadata: Record<string, string>;
} {
  return {
    type: "text",
    text: "",
    synthetic: true,
    ignored: true,
    metadata: { [MATTERHORN_COMPACTION_REQUEST]: runId },
  };
}
