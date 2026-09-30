(function () {
  var mode = "system";
  try {
    var keys = ["matterhorn-work.react.settings.theme-mode", "openwork.react.settings.theme-mode", "openwork.themePref"];
    for (var i = 0; i < keys.length; i++) {
      var stored = localStorage.getItem(keys[i]);
      if (stored === "light" || stored === "dark" || stored === "system") {
        mode = stored;
        break;
      }
    }
  } catch (error) {
    // Storage can be blocked; keep following the system in that case.
  }
  var prefersDark = false;
  try {
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch (error) {}
  var resolved = mode === "dark" || (mode === "system" && prefersDark) ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
})();
