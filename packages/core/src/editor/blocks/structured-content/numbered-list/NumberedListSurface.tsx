import type { ReactNode } from "react";

export function NumberedListSection({
  addGhost,
  children,
  itemOwnerIds,
  showTitle,
}: {
  addGhost?: ReactNode;
  children: ReactNode;
  itemOwnerIds: readonly string[];
  showTitle: boolean;
}) {
  return (
    <section
      aria-label={showTitle ? undefined : "Numbered list"}
      className="sc-course-numbered-list__section"
    >
      <div className="sc-course-numbered-list__items">{children}</div>
      <div
        aria-label="Numbered list items"
        aria-owns={itemOwnerIds.length > 0 ? itemOwnerIds.join(" ") : undefined}
        className="sc-course-numbered-list__semantic-list"
        role="list"
      />
      {addGhost ?? null}
    </section>
  );
}

export function numberedListItemOwnerId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0
    ? `sc-course-numbered-list-item-${encodeURIComponent(value)}`
    : null;
}
