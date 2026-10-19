import type { MessageKey } from "@/lib/i18n/translate";

/**
 * Merged sections: one sidebar entry, several pages behind tabs.
 * Owned by WP0 — pages render <ModuleTabs id="..." /> at the top.
 */
export const MODULE_TABS = {
  incidents: [
    { href: "/safety/incidents", key: "tabs.incidents" },
    { href: "/safety/investigations", key: "tabs.investigations" },
  ],
  workerSafety: [
    { href: "/safety/wellness", key: "tabs.wellness" },
    { href: "/safety/ppe", key: "tabs.ppe" },
  ],
  devices: [
    { href: "/operations/devices", key: "tabs.devices" },
    { href: "/operations/drones", key: "tabs.drones" },
    { href: "/operations/esp32", key: "tabs.esp32" },
  ],
  command: [
    { href: "/command", key: "tabs.commandWall", exact: true },
    { href: "/command/map", key: "tabs.commandMap" },
  ],
  assistant: [
    { href: "/intelligence/chat", key: "tabs.chat" },
    { href: "/intelligence/brain", key: "tabs.brain" },
    { href: "/intelligence/knowledge", key: "tabs.knowledge" },
    { href: "/intelligence/suggestions", key: "tabs.suggestions" },
    { href: "/intelligence/ai", key: "tabs.predictions" },
  ],
} satisfies Record<string, { href: string; key: MessageKey; exact?: boolean }[]>;

export type ModuleTabsId = keyof typeof MODULE_TABS;
