import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ContextMenuItem, ScopedThreadRef } from "@t3tools/contracts";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToFirstScrollableAncestor, restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from "react";

import { ScrollArea } from "~/components/ui/scroll-area";
import { PanelTabCloseButton } from "~/components/ui/panel-tab-close-button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { startNewThreadFromContext } from "~/lib/chatThreadActions";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { isElectron } from "~/env";
import { isCommandPaletteOpen } from "~/commandPaletteBus";
import { resolveShortcutCommand, threadTraversalDirectionFromCommand } from "~/keybindings";
import { isTerminalFocused } from "~/lib/terminalFocus";
import { isModelPickerOpen } from "~/modelPickerVisibility";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { useThreadShell } from "~/state/entities";
import { adjacentThreadTab } from "~/threadTabs.logic";
import { buildThreadRouteParams } from "~/threadRoutes";
import { useThreadTabsStore } from "~/threadTabsStore";
import { ThreadStatusLabel } from "./ThreadStatusIndicators";
import { resolveThreadStatusPill } from "./Sidebar.logic";

const TAB_DRAG_MODIFIERS = [restrictToHorizontalAxis, restrictToFirstScrollableAncestor];
const TAB_CLASS =
  "cursor-pointer group/tab flex h-6 max-w-48 shrink-0 items-center gap-1 rounded-md pr-2 pl-1.5 text-xs";

type TabMenuAction = "close" | "close-others";

/**
 * Chat tabs above the thread view. Only the active chat is mounted; a tab is a
 * remembered route, so switching costs the same as picking the thread in the
 * sidebar and background chats keep running on the server as they always do.
 */
export function ThreadTabs({
  activeRef,
  draftActive,
}: {
  activeRef: ScopedThreadRef | null;
  draftActive: boolean;
}) {
  const navigate = useNavigate();
  const tabs = useThreadTabsStore((state) => state.tabs);
  const move = useThreadTabsStore((state) => state.move);
  const newThreadContext = useHandleNewThread();
  const activeKey = activeRef ? scopedThreadKey(activeRef) : null;
  const tabKeys = useMemo(() => tabs.map(scopedThreadKey), [tabs]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const goTo = useCallback(
    (ref: ScopedThreadRef | null) => {
      if (ref) {
        void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
      } else {
        void navigate({ to: "/" });
      }
    },
    [navigate],
  );

  const closeTab = useCallback(
    (ref: ScopedThreadRef) => {
      const neighbor = useThreadTabsStore.getState().close(ref);
      if (activeKey === scopedThreadKey(ref)) goTo(neighbor);
    },
    [activeKey, goTo],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      move(tabKeys.indexOf(String(active.id)), tabKeys.indexOf(String(over.id)));
    },
    [move, tabKeys],
  );

  // Con pestañas abiertas, thread.previous / thread.next (⌘⇧[ y ⌘⇧], como en el navegador)
  // las recorren. Se escucha en captura y se marca el evento, así la barra lateral, que
  // ignora eventos ya atendidos, sólo navega por su orden cuando no hay pestañas.
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen() || isModelPickerOpen())
        return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform: navigator.platform,
        context: {
          terminalFocus: isTerminalFocused(),
          modelPickerOpen: false,
          isWeb: !isElectron,
          isDesktop: isElectron,
        },
      });
      const direction = threadTraversalDirectionFromCommand(command);
      if (!direction) return;
      const target = adjacentThreadTab(useThreadTabsStore.getState().tabs, activeRef, direction);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      goTo(target);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [activeRef, goTo, keybindings]);

  const startNewChat = useCallback(() => {
    void startNewThreadFromContext({
      activeDraftThread: newThreadContext.activeDraftThread,
      activeThread: newThreadContext.activeThread ?? undefined,
      defaultProjectRef: newThreadContext.defaultProjectRef,
      handleNewThread: newThreadContext.handleNewThread,
    });
  }, [newThreadContext]);

  if (tabs.length === 0 && !draftActive) return null;

  return (
    <div
      className="hidden h-9 shrink-0 items-center gap-1 border-b border-border/60 pr-28 pl-2 md:flex"
      data-thread-tabs
    >
      <ScrollArea radius="none" hideScrollbars scrollFade className="min-w-0 flex-1">
        <div className="flex h-full w-max min-w-full items-center gap-1" role="tablist">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={TAB_DRAG_MODIFIERS}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tabKeys} strategy={horizontalListSortingStrategy}>
              {tabs.map((ref, index) => (
                <ThreadTab
                  key={tabKeys[index]}
                  tabKey={tabKeys[index] ?? ""}
                  threadRef={ref}
                  active={tabKeys[index] === activeKey}
                  onSelect={goTo}
                  onClose={closeTab}
                />
              ))}
            </SortableContext>
          </DndContext>
          {draftActive ? (
            <div className={cn(TAB_CLASS, "bg-accent text-foreground")} role="tab" aria-selected>
              <MessageSquareIcon className="size-3 shrink-0" />
              <span className="truncate">New chat</span>
            </div>
          ) : null}
        </div>
      </ScrollArea>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="cursor-pointer flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              aria-label="New chat"
              onClick={startNewChat}
            >
              <PlusIcon className="size-3.5" />
            </button>
          }
        />
        <TooltipPopup>New chat</TooltipPopup>
      </Tooltip>
    </div>
  );
}

function ThreadTab({
  tabKey,
  threadRef,
  active,
  onSelect,
  onClose,
}: {
  tabKey: string;
  threadRef: ScopedThreadRef;
  active: boolean;
  onSelect: (ref: ScopedThreadRef) => void;
  onClose: (ref: ScopedThreadRef) => void;
}) {
  const shell = useThreadShell(threadRef);
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tabKey });
  // Shells can arrive after the tab renders, so only an explicit deletion
  // closes a tab; opening a thread that is gone falls back like the sidebar.
  const deleted = shell?.deletedAt != null;
  useEffect(() => {
    if (deleted) useThreadTabsStore.getState().close(threadRef);
  }, [deleted, threadRef]);

  const handleContextMenu = useCallback(
    async (event: ReactMouseEvent) => {
      event.preventDefault();
      const api = readLocalApi();
      if (!api) return;
      const items: ContextMenuItem<TabMenuAction>[] = [
        { id: "close", label: "Close tab" },
        { id: "close-others", label: "Close other tabs" },
      ];
      const action = await api.contextMenu.show(items, { x: event.clientX, y: event.clientY });
      if (action === "close") onClose(threadRef);
      if (action === "close-others") {
        useThreadTabsStore.getState().closeOthers(threadRef);
        if (!active) onSelect(threadRef);
      }
    },
    [active, onClose, onSelect, threadRef],
  );

  if (deleted) return null;
  const title = shell?.title.trim() || "Chat";
  const status = shell ? resolveThreadStatusPill({ thread: shell }) : null;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      role="tab"
      aria-selected={active}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        TAB_CLASS,
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        isDragging && "relative z-10",
      )}
      onClick={(event) => {
        // The close button sits inside the tab; its click must not reopen it.
        if ((event.target as HTMLElement).closest("button")) return;
        if (!active) onSelect(threadRef);
      }}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        onClose(threadRef);
      }}
      onContextMenu={(event) => void handleContextMenu(event)}
    >
      <PanelTabCloseButton label={`Close ${title}`} onClick={() => onClose(threadRef)}>
        {status ? (
          <ThreadStatusLabel status={status} compact />
        ) : (
          <MessageSquareIcon className="size-3" />
        )}
      </PanelTabCloseButton>
      <span className="truncate">{title}</span>
    </div>
  );
}
