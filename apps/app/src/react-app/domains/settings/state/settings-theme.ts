import { useSyncExternalStore } from "react";

import {
  getInitialThemeMode,
  setThemeMode,
  subscribeToTheme,
  type ThemeMode,
} from "../../../../app/theme";

export type SettingsThemeMode = ThemeMode;

export function useSettingsThemeMode() {
  const themeMode = useSyncExternalStore(
    subscribeToTheme,
    getInitialThemeMode,
    getInitialThemeMode,
  );

  return [themeMode, setThemeMode] as const;
}
