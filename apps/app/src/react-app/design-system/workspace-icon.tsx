/** @jsxImportSource react */

export type WorkspaceIconProps = {
  /** Workspace name retained for call-site and API compatibility. */
  seed: string;
  /** CSS size class, e.g. "size-4", "size-5.5". Defaults to "size-4". */
  sizeClass?: string;
};

/** Keep workspace identity consistent with the Matterhorn product mark. */
export function WorkspaceIcon({ sizeClass = "size-4" }: WorkspaceIconProps) {
  return (
    <img
      src="/matterhorn-logo-square.svg"
      alt=""
      aria-hidden="true"
      className={`${sizeClass} shrink-0 rounded-[4px]`}
    />
  );
}
