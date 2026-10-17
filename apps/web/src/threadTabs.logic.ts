import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

/** Most tabs kept open; opening one more drops the oldest that is not active. */
export const MAX_THREAD_TABS = 24;

const sameRef = (a: ScopedThreadRef, b: ScopedThreadRef) =>
  scopedThreadKey(a) === scopedThreadKey(b);

/**
 * Adds `ref` right after `after` (the tab the user was on), or at the end.
 * A ref that is already open keeps its place, so revisiting a thread from
 * the sidebar never reshuffles the strip.
 */
export function openThreadTab(
  tabs: ReadonlyArray<ScopedThreadRef>,
  ref: ScopedThreadRef,
  after: ScopedThreadRef | null,
): ReadonlyArray<ScopedThreadRef> {
  if (tabs.some((tab) => sameRef(tab, ref))) return tabs;
  const afterIndex = after ? tabs.findIndex((tab) => sameRef(tab, after)) : -1;
  const next =
    afterIndex === -1
      ? [...tabs, ref]
      : [...tabs.slice(0, afterIndex + 1), ref, ...tabs.slice(afterIndex + 1)];
  if (next.length <= MAX_THREAD_TABS) return next;
  const dropIndex = next.findIndex((tab) => !sameRef(tab, ref));
  return next.filter((_, index) => index !== dropIndex);
}

/**
 * Removes `ref` and says which tab should take focus when it was the active
 * one: the tab to its right, else the one to its left, else none.
 */
export function closeThreadTab(
  tabs: ReadonlyArray<ScopedThreadRef>,
  ref: ScopedThreadRef,
): { tabs: ReadonlyArray<ScopedThreadRef>; neighbor: ScopedThreadRef | null } {
  const index = tabs.findIndex((tab) => sameRef(tab, ref));
  if (index === -1) return { tabs, neighbor: null };
  const remaining = tabs.filter((_, i) => i !== index);
  return { tabs: remaining, neighbor: remaining[index] ?? remaining[index - 1] ?? null };
}

/** Moves the tab at `from` so it lands at `to` (both indexes in the current strip). */
export function moveThreadTab(
  tabs: ReadonlyArray<ScopedThreadRef>,
  from: number,
  to: number,
): ReadonlyArray<ScopedThreadRef> {
  if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return tabs;
  const next = [...tabs];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/**
 * Pestaña vecina para `thread.previous` / `thread.next`, dando la vuelta en los extremos.
 * Null si no hay al menos dos pestañas o la activa no es una de ellas: entonces manda
 * el orden de la barra lateral.
 */
export function adjacentThreadTab(
  tabs: ReadonlyArray<ScopedThreadRef>,
  active: ScopedThreadRef | null,
  direction: "previous" | "next",
): ScopedThreadRef | null {
  if (!active || tabs.length < 2) return null;
  const index = tabs.findIndex((tab) => sameRef(tab, active));
  if (index === -1) return null;
  const step = direction === "next" ? 1 : -1;
  return tabs[(index + step + tabs.length) % tabs.length] ?? null;
}
