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
      className="sc-course-numbered-list__section"
      role="list"
    >
      <div className="sc-course-numbered-list__items">{children}</div>
      {addGhost ?? null}
    </section>
  );
}
