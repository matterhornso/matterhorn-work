import type { ReactNode } from "react";
import type { DenAuthStatus } from "../domains/cloud/den-auth-provider";

export function SigninBoundary(props: {
  required: boolean;
  status: DenAuthStatus;
  loading: ReactNode;
  signedOut: ReactNode;
  children: ReactNode;
}) {
  if (props.required) {
    // A pending cookie check is not a signed-out result. Do not mount either
    // the account landing page or protected content until it settles.
    if (props.status === "checking") return props.loading;
    if (props.status === "signed_out") return props.signedOut;
  }
  return props.children;
}
