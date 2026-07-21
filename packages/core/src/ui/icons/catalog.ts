export interface EmojiItem {
  emoji: string;
  name: string;
}

export interface IconCategory {
  slug: string;
  title: string;
  icon: string;
  count: number;
}

export interface EmojiGroup {
  name: string;
  slug: string;
  count: number;
  preview: string;
}

export type IconNodeTag = "circle" | "ellipse" | "line" | "path" | "polygon" | "polyline" | "rect";

export type IconNodeAttrs = Readonly<Record<string, string | number>>;
export type IconNode = readonly [IconNodeTag, IconNodeAttrs];

export interface IconData {
  icons: Record<string, readonly IconNode[]>;
  categories: Record<string, { title: string; icon: string; icons: string[] }>;
}

export interface EmojiData {
  groups: { name: string; slug: string; emojis: EmojiItem[] }[];
}

export interface IconCatalog {
  icons: IconData;
  emojis: EmojiData;
}

export interface IconCatalogState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

export const ESSENTIAL_ICON_NODES: Readonly<Record<string, readonly IconNode[]>> = {
  info: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],
  "check-circle": [
    ["path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }],
    ["path", { d: "m9 11 3 3L22 4" }],
  ],
  "x-circle": [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "m15 9-6 6" }],
    ["path", { d: "m9 9 6 6" }],
  ],
  "alert-triangle": [
    [
      "path",
      {
        d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      },
    ],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
  lightbulb: [
    [
      "path",
      {
        d: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
      },
    ],
    ["path", { d: "M9 18h6" }],
    ["path", { d: "M10 22h4" }],
  ],
  "file-text": [
    ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }],
    ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
    ["path", { d: "M10 9H8" }],
    ["path", { d: "M16 13H8" }],
    ["path", { d: "M16 17H8" }],
  ],
  search: [
    ["circle", { cx: 11, cy: 11, r: 8 }],
    ["path", { d: "m21 21-4.3-4.3" }],
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
};

const ICON_ALIASES: Record<string, string> = {
  error: "x-circle",
  success: "check-circle",
  tip: "lightbulb",
  warning: "alert-triangle",
  note: "file-text",
};

const EMOJI_RE = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;

let catalog: IconCatalog | null = null;
let loadPromise: Promise<IconCatalog> | null = null;
let state: IconCatalogState = {
  loaded: false,
  loading: false,
  error: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertIconData(value: unknown): asserts value is IconData {
  if (!isRecord(value) || !isRecord(value["icons"]) || !isRecord(value["categories"])) {
    throw new Error("Icon catalog has an unexpected shape.");
  }
}

function assertEmojiData(value: unknown): asserts value is EmojiData {
  if (!isRecord(value) || !Array.isArray(value["groups"])) {
    throw new Error("Emoji catalog has an unexpected shape.");
  }
}

function normalizeIconName(value: string): string {
  return value.trim().toLowerCase();
}

function resolveIconName(value: string): string {
  const normalized = normalizeIconName(value);
  return ICON_ALIASES[normalized] ?? normalized;
}

function getCatalogIconData(): IconData | null {
  return catalog?.icons ?? null;
}

function getCatalogEmojiData(): EmojiData | null {
  return catalog?.emojis ?? null;
}

export function isEmojiIcon(value: string): boolean {
  return EMOJI_RE.test(value.trim());
}

export function getIconNodes(name: string): readonly IconNode[] | null {
  const resolved = resolveIconName(name);
  if (!resolved) return null;

  const loadedNodes = getCatalogIconData()?.icons?.[resolved];
  if (loadedNodes) return loadedNodes;

  return ESSENTIAL_ICON_NODES[resolved] ?? null;
}

export function getIconDisplayName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Default icon";
  if (isEmojiIcon(trimmed)) return trimmed;
  return trimmed
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getIconCatalogState(): IconCatalogState {
  return { ...state };
}

export async function loadIconCatalog(): Promise<IconCatalog> {
  if (catalog) return catalog;
  if (loadPromise) return loadPromise;

  state = { loaded: false, loading: true, error: null };
  loadPromise = (async () => {
    try {
      const [iconsJson, emojisJson] = await Promise.all([
        import("./lucide-icons.json").then((mod) => mod.default as unknown),
        import("./emojis.json").then((mod) => mod.default as unknown),
      ]);

      assertIconData(iconsJson);
      assertEmojiData(emojisJson);

      catalog = { icons: iconsJson, emojis: emojisJson };
      state = { loaded: true, loading: false, error: null };
      return catalog;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load icon catalog.";
      state = { loaded: false, loading: false, error: message };
      loadPromise = null;
      throw error;
    }
  })();

  return loadPromise;
}

export function searchIcons(query: string, limit = 120): string[] {
  const icons = getCatalogIconData()?.icons;
  if (!icons) return [];

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return Object.keys(icons).slice(0, limit);

  return Object.keys(icons)
    .filter((name) => {
      const searchable = name.replaceAll("-", " ");
      return terms.every((term) => searchable.includes(term));
    })
    .slice(0, limit);
}

export function getIconCategories(): IconCategory[] {
  const categories = getCatalogIconData()?.categories;
  if (!categories) return [];

  return Object.entries(categories)
    .map(([slug, data]) => ({
      slug,
      title: data.title,
      icon: data.icon,
      count: data.icons.length,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getIconsByCategory(slug: string | null, limit = 120): string[] {
  const icons = getCatalogIconData()?.icons;
  const categories = getCatalogIconData()?.categories;
  if (!icons || !categories) return [];
  if (slug === null) return Object.keys(icons).slice(0, limit);
  return categories[slug]?.icons ?? [];
}

export function searchEmojis(query: string, limit = 120): EmojiItem[] {
  const groups = getCatalogEmojiData()?.groups;
  if (!groups) return [];

  const q = query.trim().toLowerCase();
  if (!q) return groups[0]?.emojis.slice(0, limit) ?? [];

  const results: EmojiItem[] = [];
  for (const group of groups) {
    for (const emoji of group.emojis) {
      if (emoji.name.toLowerCase().includes(q)) {
        results.push(emoji);
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

export function getEmojiGroups(): EmojiGroup[] {
  const groups = getCatalogEmojiData()?.groups;
  if (!groups) return [];

  return groups.map((group) => ({
    name: group.name,
    slug: group.slug,
    count: group.emojis.length,
    preview: group.emojis[0]?.emoji ?? "",
  }));
}

export function getEmojisByGroup(index: number): EmojiItem[] {
  return getCatalogEmojiData()?.groups[index]?.emojis ?? [];
}

export function setIconCatalogForTests(next: IconCatalog | null): void {
  catalog = next;
  loadPromise = null;
  state = next
    ? { loaded: true, loading: false, error: null }
    : { loaded: false, loading: false, error: null };
}
