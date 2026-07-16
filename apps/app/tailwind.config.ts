import tailwindColors from "tailwindcss/colors";

import { radixColors, tailwindSafelist } from "./src/styles/tailwind-colors";

const mergedRadixColors = Object.fromEntries(
  Object.entries(radixColors).map(([name, radixScale]) => [
    name,
    {
      ...(tailwindColors[name as keyof typeof tailwindColors] as Record<string, string> | undefined),
      ...radixScale,
    },
  ]),
);

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  safelist: [tailwindSafelist],
  theme: {
    colors: {
      ...tailwindColors,
      ...mergedRadixColors,
      dls: {
        surface: "var(--dls-surface)",
        background: "var(--dls-background)",
        canvas: "var(--dls-canvas)",
        "surface-muted": "var(--dls-surface-muted)",
        "surface-raised": "var(--dls-surface-raised)",
        sidebar: "var(--dls-sidebar)",
        border: "var(--dls-border)",
        accent: "var(--dls-accent)",
        text: "var(--dls-text-primary)",
        secondary: "var(--dls-text-secondary)",
        hover: "var(--dls-hover)",
        active: "var(--dls-active)",
      },
      white: "#ffffff",
      black: "#000000",
    },
  },
};
