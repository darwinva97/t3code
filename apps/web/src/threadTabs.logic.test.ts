import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { MAX_THREAD_TABS, closeThreadTab, moveThreadTab, openThreadTab } from "./threadTabs.logic";

const ref = (threadId: string, environmentId = "env") =>
  scopeThreadRef(environmentId as EnvironmentId, threadId as ThreadId);
const ids = (tabs: ReadonlyArray<{ threadId: string }>) => tabs.map((tab) => tab.threadId);

describe("openThreadTab", () => {
  it("inserts next to the tab the user was on", () => {
    const tabs = [ref("a"), ref("b"), ref("c")];
    expect(ids(openThreadTab(tabs, ref("x"), ref("a")))).toEqual(["a", "x", "b", "c"]);
  });

  it("keeps an already open thread where it is", () => {
    const tabs = [ref("a"), ref("b")];
    expect(openThreadTab(tabs, ref("a"), ref("b"))).toBe(tabs);
  });

  it("tells threads apart by environment", () => {
    const tabs = [ref("a", "one")];
    expect(openThreadTab(tabs, ref("a", "two"), null)).toHaveLength(2);
  });

  it("drops the oldest tab past the limit, never the one being opened", () => {
    const tabs = Array.from({ length: MAX_THREAD_TABS }, (_, i) => ref(`t${i}`));
    const next = openThreadTab(tabs, ref("new"), ref("t0"));
    expect(next).toHaveLength(MAX_THREAD_TABS);
    expect(ids(next).slice(0, 2)).toEqual(["new", "t1"]);
  });
});

describe("closeThreadTab", () => {
  it("hands focus to the right neighbor, then the left one", () => {
    const tabs = [ref("a"), ref("b"), ref("c")];
    expect(closeThreadTab(tabs, ref("b")).neighbor?.threadId).toBe("c");
    expect(closeThreadTab(tabs, ref("c")).neighbor?.threadId).toBe("b");
    expect(closeThreadTab([ref("a")], ref("a")).neighbor).toBeNull();
  });
});

describe("moveThreadTab", () => {
  it("reorders and ignores out-of-range moves", () => {
    const tabs = [ref("a"), ref("b"), ref("c")];
    expect(ids(moveThreadTab(tabs, 0, 2))).toEqual(["b", "c", "a"]);
    expect(moveThreadTab(tabs, 0, 5)).toBe(tabs);
  });
});
