/** @jsxImportSource react */
import { BrowserRouter } from "react-router";

import "../../app/index.css";
import { PublicTrustRoute } from "../domains/public/public-trust-route";

/**
 * Public trust pages deliberately sit above the authenticated application
 * boundary. They need routing and shared visual tokens, but no query client,
 * workspace providers, account session, wallet, or engine runtime.
 */
export default function PublicTrustBootstrap() {
  return (
    <BrowserRouter>
      <PublicTrustRoute />
    </BrowserRouter>
  );
}
