/** Local managed credentials are never credentials for a remote workspace. */
export function routerWorkspaceRequestOptions(
  workspaceType: "local" | "remote",
  managedHeaders: Readonly<Record<string, string>>,
): { headers: Record<string, string>; redirect: "error" } {
  return {
    headers: workspaceType === "local" ? { ...managedHeaders } : {},
    // Do not carry scoped credentials or workspace metadata through redirects.
    redirect: "error",
  };
}
