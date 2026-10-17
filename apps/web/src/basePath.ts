/**
 * Serving the web under a path prefix (`https://host/<env>/`), so one static
 * build can front several environments on one origin.
 *
 * The prefix is the `href` of a `<base data-t3-base-path>` element. Builds made
 * with `T3CODE_WEB_BASE_PATH=first-segment` (see vite.config.ts) add one before
 * anything else loads, taken from the first segment of the page path, so the
 * relative asset URLs of that build resolve under the prefix on any deep link.
 * A server may inject the element itself instead. Without it the app lives at
 * `/`, exactly as upstream.
 *
 * Environments under one origin would otherwise share browser storage, so the
 * scope installed at boot gives each prefix its own localStorage/sessionStorage
 * keys and IndexedDB databases, as if it were its own origin. Appearance keys
 * stay shared: they are a preference of the browser, and index.html reads them
 * before any module runs.
 */

const BASE_ELEMENT_SELECTOR = "base[data-t3-base-path]";
const SHARED_STORAGE_KEY_PREFIX = "t3code:theme";

/** `"/env"`, `"env/"` or `"/env/"` → `"/env/"`; anything empty or invalid → `"/"`. */
export function normalizeBasePath(raw: string | null | undefined): string {
  const trimmed = raw?.trim().replace(/^\/+|\/+$/g, "") ?? "";
  if (trimmed === "" || !/^[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(trimmed)) return "/";
  if (trimmed.split("/").some((segment) => segment === "." || segment === "..")) return "/";
  return `/${trimmed}/`;
}

export function readAppBasePath(doc: Pick<Document, "querySelector"> = document): string {
  return normalizeBasePath(doc.querySelector(BASE_ELEMENT_SELECTOR)?.getAttribute("href"));
}

let cachedBasePath: string | null = null;

/** The prefix the app is served under, `"/"` at the origin root. */
export function appBasePath(): string {
  cachedBasePath ??=
    typeof document === "undefined" || typeof document.querySelector !== "function"
      ? "/"
      : readAppBasePath();
  return cachedBasePath;
}

/** `"/api/x"` under `"/env/"` → `"/env/api/x"`. */
export function withBasePath(pathname: string, basePath: string = appBasePath()): string {
  return `${basePath.replace(/\/+$/, "")}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

/** `"/env/pair"` under `"/env/"` → `"/pair"`; paths outside the prefix come back unchanged. */
export function stripBasePath(pathname: string, basePath: string = appBasePath()): string {
  if (basePath === "/") return pathname;
  if (pathname === basePath.slice(0, -1)) return "/";
  return pathname.startsWith(basePath) ? pathname.slice(basePath.length - 1) : pathname;
}

export function scopedStorageKey(key: string, basePath: string): string {
  return basePath === "/" || key.startsWith(SHARED_STORAGE_KEY_PREFIX) ? key : `${basePath}${key}`;
}

/** The key as the app sees it, or null when it belongs to another prefix. */
export function unscopedStorageKey(key: string, basePath: string): string | null {
  if (basePath === "/" || key.startsWith(SHARED_STORAGE_KEY_PREFIX)) return key;
  return key.startsWith(basePath) ? key.slice(basePath.length) : null;
}

type StoragePrototype = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "clear">;

/** Patches `Storage.prototype` so every Storage instance only sees this prefix's keys. */
export function scopeStoragePrototype(proto: StoragePrototype, basePath: string): void {
  const { getItem, setItem, removeItem, key } = proto;
  const lengthOf = Object.getOwnPropertyDescriptor(proto, "length")?.get;
  if (!lengthOf) return;
  const ownKeys = (storage: Storage): string[] => {
    const keys: string[] = [];
    const total = lengthOf.call(storage) as number;
    for (let index = 0; index < total; index++) {
      const raw = key.call(storage, index);
      const own = raw === null ? null : unscopedStorageKey(raw, basePath);
      if (own !== null) keys.push(own);
    }
    return keys;
  };
  const scope = (name: string) => scopedStorageKey(String(name), basePath);
  Object.assign(proto, {
    getItem(this: Storage, name: string) {
      return getItem.call(this, scope(name));
    },
    setItem(this: Storage, name: string, value: string) {
      setItem.call(this, scope(name), value);
    },
    removeItem(this: Storage, name: string) {
      removeItem.call(this, scope(name));
    },
    key(this: Storage, index: number) {
      return ownKeys(this)[index] ?? null;
    },
    clear(this: Storage) {
      for (const name of ownKeys(this)) removeItem.call(this, scope(name));
    },
  });
  Object.defineProperty(proto, "length", {
    configurable: true,
    get(this: Storage) {
      return ownKeys(this).length;
    },
  });
}

type ScopedWindow = Pick<
  Window,
  "addEventListener" | "dispatchEvent" | "indexedDB" | "document" | "location"
> & { readonly Storage: typeof Storage; readonly StorageEvent: typeof StorageEvent };

/**
 * Installs the per-prefix scope. Runs once at boot, before any module reads
 * storage; a no-op at the origin root.
 */
export function installBasePathScope(
  basePath: string = appBasePath(),
  target?: ScopedWindow,
): void {
  if (basePath === "/") return;
  const win: ScopedWindow = target ?? window;
  scopeStoragePrototype(win.Storage.prototype, basePath);

  // Cross-tab `storage` events carry raw keys: drop other prefixes' and give
  // listeners the key they wrote. Registered first, so it runs before them.
  const rescoped = new WeakSet<Event>();
  win.addEventListener(
    "storage",
    (event) => {
      if (rescoped.has(event) || event.key === null) return;
      const own = unscopedStorageKey(event.key, basePath);
      if (own === event.key) return;
      event.stopImmediatePropagation();
      if (own === null) return;
      const copy = new win.StorageEvent("storage", {
        key: own,
        oldValue: event.oldValue,
        newValue: event.newValue,
        url: event.url,
        storageArea: event.storageArea,
      });
      rescoped.add(copy);
      win.dispatchEvent(copy);
    },
    { capture: true },
  );

  const factory = win.indexedDB;
  if (factory) {
    const open = factory.open.bind(factory);
    const deleteDatabase = factory.deleteDatabase.bind(factory);
    factory.open = (name: string, version?: number) =>
      version === undefined ? open(`${basePath}${name}`) : open(`${basePath}${name}`, version);
    factory.deleteDatabase = (name: string) => deleteDatabase(`${basePath}${name}`);
  }

  // With a <base> element, `href="#x"` would leave the current route for the
  // prefix root. Keep in-page fragment links in the page.
  win.document.addEventListener("click", (event) => {
    const anchor = (event.target as Element | null)?.closest?.("a[href^='#']");
    if (!anchor || event.defaultPrevented || anchor.getAttribute("target")) return;
    event.preventDefault();
    win.location.hash = anchor.getAttribute("href") ?? "";
  });
}
