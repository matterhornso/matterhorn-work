/** @jsxImportSource react */
import type { PublicCloudConfig } from "../../app/lib/public-cloud-config";
import { PublicWebSigninPage } from "../domains/cloud/public-web-signin-page";

type PublicSigninBootstrapProps = {
  config: PublicCloudConfig;
  onSignedIn: () => void;
};

/**
 * Small public-web gate used before the authenticated shell is requested.
 * Cookie-backed sessions are checked here; a valid session then unlocks the
 * lazy workspace bundle without forcing a page reload.
 */
export default function PublicSigninBootstrap(
  props: PublicSigninBootstrapProps,
) {
  return <PublicWebSigninPage {...props} />;
}
