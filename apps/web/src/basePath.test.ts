// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  installBasePathScope,
  normalizeBasePath,
  readAppBasePath,
  scopeStoragePrototype,
  scopedStorageKey,
  stripBasePath,
  unscopedStorageKey,
  withBasePath,
} from "./basePath";

describe("base path", () => {
  it("normalizes prefixes and rejects anything that is not a plain path", () => {
    expect(normalizeBasePath("/darwin-sva-97/")).toBe("/darwin-sva-97/");
    expect(normalizeBasePath("equipo")).toBe("/equipo/");
    expect(normalizeBasePath("/a/b")).toBe("/a/b/");
    expect(normalizeBasePath("/")).toBe("/");
    expect(normalizeBasePath(null)).toBe("/");
    expect(normalizeBasePath("https://evil.example/")).toBe("/");
    expect(normalizeBasePath("/a/../b/")).toBe("/");
    expect(normalizeBasePath("/a b/")).toBe("/");
  });

  it("reads the prefix from the base element the build injects", () => {
    const base = document.createElement("base");
    base.setAttribute("href", "/equipo-web/");
    base.setAttribute("data-t3-base-path", "");
    document.head.prepend(base);
    expect(readAppBasePath()).toBe("/equipo-web/");
    base.remove();
    // A plain <base> (not ours) does not move the app.
    const plain = document.createElement("base");
    plain.setAttribute("href", "/elsewhere/");
    document.head.prepend(plain);
    expect(readAppBasePath()).toBe("/");
    plain.remove();
  });

  it("joins and strips server and app paths", () => {
    expect(withBasePath("/api/auth/session", "/ana/")).toBe("/ana/api/auth/session");
    expect(withBasePath("/ws", "/")).toBe("/ws");
    expect(withBasePath("pair", "/ana/")).toBe("/ana/pair");
    expect(stripBasePath("/ana/pair", "/ana/")).toBe("/pair");
    expect(stripBasePath("/ana", "/ana/")).toBe("/");
    expect(stripBasePath("/luis/pair", "/ana/")).toBe("/luis/pair");
    expect(stripBasePath("/pair", "/")).toBe("/pair");
  });

  it("scopes storage keys per prefix but shares appearance", () => {
    expect(scopedStorageKey("t3code:tabs", "/ana/")).toBe("/ana/t3code:tabs");
    expect(scopedStorageKey("t3code:theme", "/ana/")).toBe("t3code:theme");
    expect(scopedStorageKey("t3code:tabs", "/")).toBe("t3code:tabs");
    expect(unscopedStorageKey("/ana/t3code:tabs", "/ana/")).toBe("t3code:tabs");
    expect(unscopedStorageKey("/luis/t3code:tabs", "/ana/")).toBeNull();
    expect(unscopedStorageKey("t3code:theme-halves:v1", "/ana/")).toBe("t3code:theme-halves:v1");
  });
});

/** A fresh Storage implementation per test, so patching its prototype is contained. */
function makeStorageClass() {
  const data = new WeakMap<object, Map<string, string>>();
  const of = (self: object) => {
    let map = data.get(self);
    if (!map) data.set(self, (map = new Map()));
    return map;
  };
  class FakeStorage {
    get length() {
      return of(this).size;
    }
    getItem(key: string) {
      return of(this).get(key) ?? null;
    }
    setItem(key: string, value: string) {
      of(this).set(key, value);
    }
    removeItem(key: string) {
      of(this).delete(key);
    }
    key(index: number) {
      return [...of(this).keys()][index] ?? null;
    }
    clear() {
      of(this).clear();
    }
  }
  return { FakeStorage, raw: (self: object) => of(self) };
}

describe("storage scope", () => {
  it("gives two environments on one origin separate storage", () => {
    const { FakeStorage, raw } = makeStorageClass();
    const shared = new FakeStorage() as unknown as Storage;
    raw(shared).set("/luis/t3code:tabs", "luis");
    raw(shared).set("t3code:theme", "dark");

    scopeStoragePrototype(FakeStorage.prototype as unknown as Storage, "/ana/");
    shared.setItem("t3code:tabs", "ana");

    expect(shared.getItem("t3code:tabs")).toBe("ana");
    expect(raw(shared).get("/luis/t3code:tabs")).toBe("luis");
    expect(shared.getItem("t3code:theme")).toBe("dark");
    expect(shared.length).toBe(2);
    expect([shared.key(0), shared.key(1)].sort()).toEqual(["t3code:tabs", "t3code:theme"]);

    shared.clear();
    expect([...raw(shared).keys()]).toEqual(["/luis/t3code:tabs"]);
  });
});

describe("installBasePathScope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing at the origin root", () => {
    const addEventListener = vi.fn();
    installBasePathScope("/", { addEventListener } as unknown as Window & typeof globalThis);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("prefixes IndexedDB names and hands listeners their own storage events", () => {
    const { FakeStorage } = makeStorageClass();
    const opened: unknown[][] = [];
    const indexedDB = {
      open: (...args: unknown[]) => opened.push(args),
      deleteDatabase: (...args: unknown[]) => opened.push(["delete", ...args]),
    };
    const target = new EventTarget();
    const win = Object.assign(target, {
      Storage: FakeStorage,
      StorageEvent: window.StorageEvent,
      indexedDB,
      document: new EventTarget(),
      location: { hash: "" },
    }) as unknown as Window & typeof globalThis;

    installBasePathScope("/ana/", win);
    win.indexedDB.open("t3code-connections", 3);
    win.indexedDB.deleteDatabase("t3code-connections");
    expect(opened).toEqual([
      ["/ana/t3code-connections", 3],
      ["delete", "/ana/t3code-connections"],
    ]);

    const seen: Array<string | null> = [];
    win.addEventListener("storage", (event) => seen.push((event as StorageEvent).key));
    for (const key of ["/ana/t3code:tabs", "/luis/t3code:tabs", "t3code:theme"]) {
      win.dispatchEvent(new StorageEvent("storage", { key }));
    }
    expect(seen).toEqual(["t3code:tabs", "t3code:theme"]);
  });
});
