import type { InsertAction } from "@/editor/insertion/insert-action";

/**
 * SlashItem is just the catalog item: the slash command and the
 * block strip consume the same `InsertAction` shape. Kept as
 * an exported type for any consumer that imports it.
 */
export type SlashItem = InsertAction;

type RankedSlashItem = {
  index: number;
  item: InsertAction;
  score: number;
};

export function searchSlashItems(items: readonly InsertAction[], query: string): InsertAction[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [...items];

  return items
    .map((item, index): RankedSlashItem | null => {
      const score = scoreSlashItem(item, normalizedQuery);
      return score === null ? null : { index, item, score };
    })
    .filter((item): item is RankedSlashItem => item !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ item }) => item);
}

function scoreSlashItem(item: InsertAction, normalizedQuery: string): number | null {
  const title = normalizeSearchText(item.title);
  const id = normalizeSearchText(item.id);
  const nodeType = normalizeSearchText(item.nodeType);
  const keywords = (item.keywords ?? []).map(normalizeSearchText);
  const description = normalizeSearchText(item.description);

  if (title === normalizedQuery || id === normalizedQuery) return 0;
  if (title.startsWith(normalizedQuery)) return 1;
  if (id.startsWith(normalizedQuery) || nodeType.startsWith(normalizedQuery)) {
    return 2;
  }
  if (title.includes(normalizedQuery)) return 3;
  if (
    keywords.some((keyword) => keyword === normalizedQuery || keyword.startsWith(normalizedQuery))
  ) {
    return 4;
  }
  if (
    keywords.some((keyword) => keyword.includes(normalizedQuery)) ||
    id.includes(normalizedQuery) ||
    nodeType.includes(normalizedQuery)
  ) {
    return 5;
  }
  if (description.includes(normalizedQuery)) return 6;

  return null;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}
