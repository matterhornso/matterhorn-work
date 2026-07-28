/** @jsxImportSource react */
import {
  createContext,
  use,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { MatterhornServerStore } from "./matterhorn-server-store";

const MatterhornServerContext = createContext<MatterhornServerStore | null>(null);

export function MatterhornServerProvider(props: {
  store: MatterhornServerStore;
  children: ReactNode;
}) {
  return (
    <MatterhornServerContext.Provider value={props.store}>
      {props.children}
    </MatterhornServerContext.Provider>
  );
}

export function useOpenworkServer() {
  const store = use(MatterhornServerContext);
  if (!store) {
    throw new Error("Matterhorn server access must be used within a MatterhornServerProvider.");
  }

  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return store;
}
