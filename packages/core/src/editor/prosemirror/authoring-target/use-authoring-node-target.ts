import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useState } from "react";

import {
  createAuthoringNodeTarget,
  type AuthoringNodeRef,
  type AuthoringNodeTarget,
} from "./authoring-node-target";

export function useAuthoringNodeTarget(
  editor: Editor,
  ref: AuthoringNodeRef | null,
): AuthoringNodeTarget | null {
  const [, setRevision] = useState(0);
  const targetId = ref?.id;
  const nodeType = ref?.nodeType;
  const target = useMemo(() => {
    if (targetId === undefined || nodeType === undefined) return null;
    return createAuthoringNodeTarget(editor, { id: targetId, nodeType });
  }, [editor, nodeType, targetId]);

  useEffect(() => {
    if (targetId === undefined || nodeType === undefined) return undefined;

    const handleTransaction = () => setRevision((current) => current + 1);
    editor.on("transaction", handleTransaction);

    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [editor, nodeType, targetId]);

  return target;
}
