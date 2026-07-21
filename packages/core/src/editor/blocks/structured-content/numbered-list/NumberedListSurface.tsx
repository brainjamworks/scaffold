import type { ReactNode } from "react";

export function NumberedListSection({
  addGhost,
  children,
  showTitle,
}: {
  addGhost?: ReactNode;
  children: ReactNode;
  showTitle: boolean;
}) {
  return (
    <section
      aria-label={showTitle ? undefined : "Numbered list"}
      className="sc-numbered-list__section"
      role="list"
    >
      <div className="sc-numbered-list__items">{children}</div>
      {addGhost ?? null}
    </section>
  );
}
