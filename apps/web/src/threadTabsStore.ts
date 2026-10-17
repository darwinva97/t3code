import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";
import { closeThreadTab, moveThreadTab, openThreadTab } from "./threadTabs.logic";

interface ThreadTabsState {
  tabs: ReadonlyArray<ScopedThreadRef>;
  /** The tab the user was last on; new tabs open next to it. */
  lastActive: ScopedThreadRef | null;
  /** Records a visit: opens the thread as a tab if needed and marks it active. */
  visit: (ref: ScopedThreadRef) => void;
  /** Closes a tab and returns the one that should take focus if it was active. */
  close: (ref: ScopedThreadRef) => ScopedThreadRef | null;
  closeOthers: (ref: ScopedThreadRef) => void;
  move: (from: number, to: number) => void;
}

const isThreadRef = Schema.is(ScopedThreadRef);

/** Open chat tabs, kept per browser like the rest of the layout state. */
export const useThreadTabsStore = create<ThreadTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      lastActive: null,
      visit: (ref) =>
        set((state) => {
          const tabs = openThreadTab(state.tabs, ref, state.lastActive);
          const sameActive =
            state.lastActive !== null && scopedThreadKey(state.lastActive) === scopedThreadKey(ref);
          return tabs === state.tabs && sameActive ? state : { tabs, lastActive: ref };
        }),
      close: (ref) => {
        const { tabs, neighbor } = closeThreadTab(get().tabs, ref);
        set((state) => ({
          tabs,
          lastActive:
            state.lastActive && scopedThreadKey(state.lastActive) === scopedThreadKey(ref)
              ? neighbor
              : state.lastActive,
        }));
        return neighbor;
      },
      closeOthers: (ref) =>
        set((state) => ({
          tabs: state.tabs.filter((tab) => scopedThreadKey(tab) === scopedThreadKey(ref)),
          lastActive: ref,
        })),
      move: (from, to) => set((state) => ({ tabs: moveThreadTab(state.tabs, from, to) })),
    }),
    {
      name: "bezenti:thread-tabs:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: ({ tabs, lastActive }) => ({ tabs, lastActive }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Pick<ThreadTabsState, "tabs" | "lastActive">> | null;
        return {
          ...current,
          tabs: Array.isArray(saved?.tabs) ? saved.tabs.filter(isThreadRef) : [],
          lastActive: isThreadRef(saved?.lastActive) ? saved.lastActive : null,
        };
      },
    },
  ),
);
