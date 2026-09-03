import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReactNode } from "react";

import { fullSlideQuestionStageAttributes } from "@/editor/surfaces/model/assessment/full-slide-question-stage";

export function FullSlideQuestionStage({
  children,
  question,
}: {
  readonly children: ReactNode;
  readonly question: ProseMirrorNode;
}) {
  return (
    <div {...fullSlideQuestionStageAttributes(question.type.name)} tabIndex={-1}>
      {children}
    </div>
  );
}
