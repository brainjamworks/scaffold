import { XIcon as X } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useState } from "react";

import { SemanticHierarchyViewController } from "@/document/authoring/semantic-document/semantic-hierarchy-view-controller";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document/semantic-document-storage";
import {
  registerAuthoringInteractionHost,
  resolveAuthoringInteractionRoot,
} from "@/editor/interactions/dom/authoring-root";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { DocumentOutline, DocumentOutlineRowViewport } from "./DocumentOutline";

export interface DocumentOutlineHostProps {
  readonly editor: Editor;
  readonly onClose: () => void;
}

export function DocumentOutlineHost({ editor, onClose }: DocumentOutlineHostProps) {
  const controller = getSemanticDocumentControllerForEditor(editor);
  const viewport = useMemo(() => new DocumentOutlineRowViewport(), []);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [viewController, setViewController] = useState<SemanticHierarchyViewController | null>(
    null,
  );

  useEffect(() => {
    const next = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });
    setViewController(next);

    return () => {
      next.destroy();
      setViewController((current) => (current === next ? null : current));
    };
  }, [controller, viewport]);

  useEffect(() => () => viewport.destroy(), [viewport]);

  useEffect(() => {
    if (!host) return;
    return registerAuthoringInteractionHost(resolveAuthoringInteractionRoot(editor.view.dom), host);
  }, [editor, host]);

  return (
    <aside
      ref={setHost}
      aria-label="Document Outline"
      className="sc-authoring-outline-dock"
      data-testid="authoring-outline-dock"
    >
      <header className="sc-authoring-outline-dock-header">
        <h2 className="sc-authoring-outline-dock-title">Document Outline</h2>
        <IconButton
          aria-label="Close Document Outline"
          size="md"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X aria-hidden size={iconSm} />
        </IconButton>
      </header>
      <div className="sc-authoring-outline-dock-scroll">
        {viewController ? (
          <DocumentOutline
            controller={controller}
            viewController={viewController}
            viewport={viewport}
          />
        ) : null}
      </div>
    </aside>
  );
}
