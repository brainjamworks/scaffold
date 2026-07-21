import { XIcon as X } from "@phosphor-icons/react";
import { useEditorState, type Editor } from "@tiptap/react";

import * as Dialog from "@/ui/components/Dialog/Dialog";
import * as VisuallyHidden from "@/ui/components/VisuallyHidden/VisuallyHidden";
import { zIndex } from "@/ui/overlays/z-index";

import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import type {
  SurfaceCatalogueSection,
  SurfaceTemplatePreviewNode,
} from "../model/surface-variant-definition";
import type { SurfaceVariantRegistry } from "../model/surface-variant-registry";

import {
  closeSurfaceTemplatePicker,
  getAuthoringSlideDividersState,
} from "./AuthoringSlideDividers";
import {
  createSurfaceInsertCatalog,
  type SurfaceInsertCatalog,
  type SurfaceInsertCatalogEntry,
} from "./surface-insert-catalog";
import { insertSurfaceTemplateAfterSurface } from "./surface-template-insertion";

import "./SurfaceTemplatePickerHost.css";

interface SurfaceTemplatePickerHostProps {
  editor: Editor;
}

interface SurfaceTemplatePickerProps extends SurfaceTemplatePickerHostProps {
  catalog: SurfaceInsertCatalog;
  surfaceVariants: SurfaceVariantRegistry;
}

const builtInSurfaceInsertCatalog = createSurfaceInsertCatalog(builtInSurfaceVariantRegistry);

const CATALOGUE_SECTIONS: readonly {
  id: SurfaceCatalogueSection;
  label: string;
}[] = [
  { id: "title", label: "Title layouts" },
  { id: "content", label: "Content layouts" },
  { id: "image", label: "Image layouts" },
];

export function SurfaceTemplatePickerHost({ editor }: SurfaceTemplatePickerHostProps) {
  return (
    <SurfaceTemplatePicker
      editor={editor}
      catalog={builtInSurfaceInsertCatalog}
      surfaceVariants={builtInSurfaceVariantRegistry}
    />
  );
}

export function SurfaceTemplatePicker({
  editor,
  catalog,
  surfaceVariants,
}: SurfaceTemplatePickerProps) {
  const request = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      getAuthoringSlideDividersState(currentEditor.state).templatePickerRequest,
  });
  const mode = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => readCourseMode(currentEditor),
  });
  const definitions = mode ? catalog.forMode(mode) : [];
  const groups = CATALOGUE_SECTIONS.map((section) => ({
    ...section,
    definitions: definitions.filter((definition) => definition.catalogue.section === section.id),
  })).filter((group) => group.definitions.length > 0);
  const open = Boolean(request && mode && definitions.length > 0);

  const close = () => {
    closeSurfaceTemplatePicker(editor.view);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="sc-surface-template-picker-overlay"
          style={{ zIndex: zIndex.modalBackdrop }}
        />
        <Dialog.Content
          className="sc-surface-template-picker-dialog"
          style={{ zIndex: zIndex.modal }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!editor.isDestroyed) editor.view.focus();
          }}
        >
          <header className="sc-surface-template-picker-header">
            <div>
              <Dialog.Title className="sc-surface-template-picker-title">
                Choose slide template
              </Dialog.Title>
              <VisuallyHidden.Root asChild>
                <Dialog.Description>
                  Select the surface variant to insert after the current slide.
                </Dialog.Description>
              </VisuallyHidden.Root>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close template picker"
                className="sc-surface-template-picker-close"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="sc-surface-template-picker-body">
            {groups.map((group) => {
              const headingId = `surface-template-picker-${group.id}-heading`;
              return (
                <section
                  key={group.id}
                  aria-labelledby={headingId}
                  className="sc-surface-template-picker-group"
                >
                  <h2 id={headingId} className="sc-surface-template-picker-group-title">
                    {group.label}
                  </h2>
                  <div className="sc-surface-template-picker-grid">
                    {group.definitions.map((definition) => {
                      const titleId = `surface-template-picker-${definition.variantId}-title`;
                      const descriptionId = `surface-template-picker-${definition.variantId}-description`;
                      return (
                        <button
                          key={definition.variantId}
                          type="button"
                          aria-labelledby={titleId}
                          aria-describedby={descriptionId}
                          className="sc-surface-template-picker-card"
                          onClick={() => {
                            if (!request) return;
                            const inserted = insertSurfaceTemplateAfterSurface(
                              editor,
                              surfaceVariants,
                              {
                                afterSurfaceId: request.afterSurfaceId,
                                variantId: definition.variantId,
                              },
                            );
                            if (inserted) close();
                          }}
                        >
                          <SurfaceTemplatePreview definition={definition} />
                          <span id={titleId} className="sc-surface-template-picker-card-title">
                            {definition.title}
                          </span>
                          <span
                            id={descriptionId}
                            className="sc-surface-template-picker-card-description"
                          >
                            {definition.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SurfaceTemplatePreview({ definition }: { definition: SurfaceInsertCatalogEntry }) {
  return (
    <span
      aria-hidden
      className="sc-surface-template-picker-preview"
      data-surface-template-preview={definition.variantId}
    >
      <SurfaceTemplatePreviewNodeView node={definition.catalogue.preview} path="preview" />
    </span>
  );
}

function SurfaceTemplatePreviewNodeView({
  node,
  path,
}: {
  node: SurfaceTemplatePreviewNode;
  path: string;
}) {
  if (node.kind === "slot") {
    return (
      <span
        data-surface-template-preview-node="slot"
        data-role={node.role}
        data-emphasis={node.emphasis ?? "normal"}
        className="sc-surface-template-picker-preview-slot"
      />
    );
  }

  if (node.kind === "overlay") {
    return (
      <span
        data-surface-template-preview-node="overlay"
        data-placement={node.placement}
        className="sc-surface-template-picker-preview-overlay"
      >
        <span className="sc-surface-template-picker-preview-overlay-base">
          <SurfaceTemplatePreviewNodeView node={node.base} path={`${path}.base`} />
        </span>
        <span className="sc-surface-template-picker-preview-overlay-layer">
          <SurfaceTemplatePreviewNodeView node={node.overlay} path={`${path}.overlay`} />
        </span>
      </span>
    );
  }

  return (
    <span
      data-surface-template-preview-node={node.kind}
      data-gap={node.gap ?? "none"}
      className="sc-surface-template-picker-preview-stack"
    >
      {node.children.map((child, index) => (
        <span
          key={`${path}.${index}`}
          className="sc-surface-template-picker-preview-track"
          style={{ flexGrow: node.proportions?.[index] ?? 1 }}
        >
          <SurfaceTemplatePreviewNodeView node={child} path={`${path}.${index}`} />
        </span>
      ))}
    </span>
  );
}

function readCourseMode(editor: Editor) {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    return null;
  }

  const mode = courseDocument.attrs["mode"];
  return mode === "page" || mode === "slideshow" ? mode : null;
}
