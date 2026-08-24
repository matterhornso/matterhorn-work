const publicBetaWeb =
  import.meta.env.VITE_MATTERHORN_DEPLOYMENT?.trim().toLowerCase() === "web"
  && /^(1|true|yes|on)$/i.test(
    import.meta.env.VITE_MATTERHORN_PUBLIC_BETA?.trim() ?? "",
  );

const startMatterhorn = () => {
  void import("./index.react");
};

// The public-beta build includes a progressive, non-interactive signed-out
// shell in the document. Let that security/loading state reach the first paint
// before downloading and hydrating React. Authenticated and desktop builds
// retain the immediate boot path.
if (publicBetaWeb && document.querySelector("[data-matterhorn-static-auth]")) {
  requestAnimationFrame(startMatterhorn);
} else {
  startMatterhorn();
}
