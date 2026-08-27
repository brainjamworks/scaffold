import {
  ArrowRightIcon as ArrowRight,
  ImageSquareIcon as ImageSquare,
  XIcon as X,
} from "@phosphor-icons/react";
import type { PersistedCourseTheme } from "@scaffold/contracts";
import { useEditorState, type Editor } from "@tiptap/react";
import { useRef, useState, type KeyboardEvent } from "react";

import { PersistedCourseThemeSchema } from "@/schemas/course-document";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import * as Dialog from "@/ui/components/Dialog/Dialog";
import * as VisuallyHidden from "@/ui/components/VisuallyHidden/VisuallyHidden";
import { zIndex } from "@/ui/overlays/z-index";

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
  type SurfaceCreationCatalog,
  type SurfaceCreationCatalogEntry,
} from "./surface-creation-catalog";
import { insertSurfaceTemplateAfterSurface } from "./surface-template-insertion";

import "./SurfaceTemplatePickerHost.css";

interface SurfaceTemplatePickerProps {
  courseAppearance?: ScaffoldColorMode;
  editor: Editor;
  surfaceCreationCatalog: SurfaceCreationCatalog;
  surfaceVariants: SurfaceVariantRegistry;
}

const CATALOGUE_SECTIONS: readonly {
  id: SurfaceCatalogueSection;
  label: string;
}[] = [
  { id: "title", label: "Title layouts" },
  { id: "content", label: "Content layouts" },
  { id: "image", label: "Image layouts" },
  { id: "assessment", label: "Assessment slides" },
];

export function SurfaceTemplatePicker({
  courseAppearance = "light",
  editor,
  surfaceCreationCatalog,
  surfaceVariants,
}: SurfaceTemplatePickerProps) {
  const [activeSectionId, setActiveSectionId] = useState<SurfaceCatalogueSection>("title");
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const selectedChoiceRef = useRef<HTMLInputElement>(null);
  const request = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      getAuthoringSlideDividersState(currentEditor.state).templatePickerRequest,
  });
  const mode = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => readCourseMode(currentEditor),
  });
  const persistedTheme = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => readCourseTheme(currentEditor),
  });
  const parsedTheme = PersistedCourseThemeSchema.safeParse(persistedTheme);
  const surfaceCreationEntries = mode ? surfaceCreationCatalog.forMode(mode) : [];
  const groups = CATALOGUE_SECTIONS.map((section) => ({
    ...section,
    entries: surfaceCreationEntries.filter((entry) => entry.catalogue.section === section.id),
  })).filter((group) => group.entries.length > 0);
  const activeGroup = groups.find((group) => group.id === activeSectionId) ?? groups[0];
  const selectedEntry =
    activeGroup?.entries.find((entry) => entry.variantId === selectedVariantId) ??
    activeGroup?.entries[0];
  const open = Boolean(request && mode && parsedTheme.success && surfaceCreationEntries.length > 0);

  const close = () => {
    closeSurfaceTemplatePicker(editor.view);
  };

  const selectCategory = (group: (typeof groups)[number]) => {
    setActiveSectionId(group.id);
    setSelectedVariantId(group.entries[0]?.variantId ?? null);
  };

  const handleCategoryKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % groups.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + groups.length) % groups.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = groups.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextGroup = groups[nextIndex];
    if (!nextGroup) return;
    selectCategory(nextGroup);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-catalogue-section="${nextGroup.id}"]`)
      ?.focus();
  };

  const insertSelectedTemplate = () => {
    if (!request || !selectedEntry) return;
    const inserted = insertSurfaceTemplateAfterSurface(editor, surfaceVariants, {
      afterSurfaceId: request.afterSurfaceId,
      variantId: selectedEntry.variantId,
    });
    if (inserted) close();
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
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            selectedChoiceRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!editor.isDestroyed) editor.view.focus();
          }}
        >
          <header className="sc-surface-template-picker-header">
            <div className="sc-surface-template-picker-header-copy">
              <Dialog.Title className="sc-surface-template-picker-title">
                Choose a slide layout
              </Dialog.Title>
              <Dialog.Description className="sc-surface-template-picker-description">
                Choose a layout for the slide you want to add.
              </Dialog.Description>
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
            <div
              aria-label="Slide layout categories"
              className="sc-surface-template-picker-tabs"
              role="tablist"
            >
              {groups.map((group, index) => {
                const active = group.id === activeGroup?.id;
                return (
                  <button
                    aria-controls={`surface-template-picker-${group.id}-panel`}
                    aria-selected={active}
                    className="sc-surface-template-picker-tab"
                    data-catalogue-section={group.id}
                    id={`surface-template-picker-${group.id}-tab`}
                    key={group.id}
                    onClick={() => selectCategory(group)}
                    onKeyDown={(event) => handleCategoryKeyDown(event, index)}
                    role="tab"
                    tabIndex={active ? 0 : -1}
                    type="button"
                  >
                    <span>{group.label}</span>
                    <span aria-hidden className="sc-surface-template-picker-tab-count">
                      {group.entries.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeGroup && selectedEntry && parsedTheme.success ? (
              <div
                aria-labelledby={`surface-template-picker-${activeGroup.id}-tab`}
                className="sc-surface-template-picker-workspace"
                id={`surface-template-picker-${activeGroup.id}-panel`}
                role="tabpanel"
              >
                <fieldset className="sc-surface-template-picker-choices">
                  <VisuallyHidden.Root asChild>
                    <legend>{activeGroup.label}</legend>
                  </VisuallyHidden.Root>
                  <div
                    aria-label={activeGroup.label}
                    className="sc-surface-template-picker-choice-list"
                    role="radiogroup"
                  >
                    {activeGroup.entries.map((entry) => {
                      const selected = entry.variantId === selectedEntry.variantId;
                      return (
                        <label
                          className="sc-surface-template-picker-choice"
                          data-selected={selected}
                          key={entry.variantId}
                        >
                          <input
                            checked={selected}
                            className="sc-surface-template-picker-choice-input"
                            name="surface-template-picker-layout"
                            onChange={() => setSelectedVariantId(entry.variantId)}
                            ref={selected ? selectedChoiceRef : undefined}
                            type="radio"
                            value={entry.variantId}
                          />
                          <SurfaceTemplatePreview
                            appearance={courseAppearance}
                            context="choice"
                            entry={entry}
                            theme={parsedTheme.data}
                          />
                          <span className="sc-surface-template-picker-choice-title">
                            {entry.title}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <section
                  aria-labelledby={`surface-template-picker-${selectedEntry.variantId}-title`}
                  className="sc-surface-template-picker-stage"
                >
                  <SurfaceTemplatePreview
                    appearance={courseAppearance}
                    context="stage"
                    entry={selectedEntry}
                    theme={parsedTheme.data}
                  />
                  <div className="sc-surface-template-picker-stage-footer">
                    <div className="sc-surface-template-picker-stage-copy">
                      <h2
                        className="sc-surface-template-picker-stage-title"
                        id={`surface-template-picker-${selectedEntry.variantId}-title`}
                      >
                        {selectedEntry.title}
                      </h2>
                      <p className="sc-surface-template-picker-stage-description">
                        {selectedEntry.description}
                      </p>
                    </div>
                    <button
                      aria-label={`Add ${selectedEntry.title} slide`}
                      className="sc-surface-template-picker-add"
                      onClick={insertSelectedTemplate}
                      type="button"
                    >
                      <span>Add slide</span>
                      <ArrowRight aria-hidden size={18} />
                    </button>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SurfaceTemplatePreview({
  appearance,
  context,
  entry,
  theme,
}: {
  appearance: ScaffoldColorMode;
  context: "choice" | "stage";
  entry: SurfaceCreationCatalogEntry;
  theme: PersistedCourseTheme;
}) {
  return (
    <div
      aria-hidden
      className="sc-surface-template-picker-preview"
      data-preview-context={context}
      data-surface-template-preview={entry.variantId}
    >
      <CourseThemeProvider appearance={appearance} hasBackground={false} theme={theme}>
        <div className="sc-surface-template-picker-preview-canvas">
          <SurfaceTemplatePreviewNodeView
            node={entry.catalogue.preview}
            path="preview"
            variantId={entry.variantId}
          />
        </div>
      </CourseThemeProvider>
    </div>
  );
}

function SurfaceTemplatePreviewNodeView({
  node,
  path,
  variantId,
}: {
  node: SurfaceTemplatePreviewNode;
  path: string;
  variantId: string;
}) {
  if (node.kind === "slot") {
    return (
      <span
        className="sc-surface-template-picker-preview-slot"
        data-emphasis={node.emphasis ?? "normal"}
        data-role={node.role}
        data-surface-template-preview-node="slot"
      >
        <SurfaceTemplatePreviewSlotContent path={path} role={node.role} variantId={variantId} />
      </span>
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
          <SurfaceTemplatePreviewNodeView
            node={node.base}
            path={`${path}.base`}
            variantId={variantId}
          />
        </span>
        <span className="sc-surface-template-picker-preview-overlay-layer">
          <SurfaceTemplatePreviewNodeView
            node={node.overlay}
            path={`${path}.overlay`}
            variantId={variantId}
          />
        </span>
      </span>
    );
  }

  return (
    <span
      data-surface-template-preview-node={node.kind}
      data-preview-content-group={
        node.children.every(
          (child) => child.kind === "slot" && (child.role === "title" || child.role === "label"),
        )
          ? "typographic"
          : undefined
      }
      data-gap={node.gap ?? "none"}
      className="sc-surface-template-picker-preview-stack"
    >
      {node.children.map((child, index) => (
        <span
          key={`${path}.${index}`}
          className="sc-surface-template-picker-preview-track"
          style={{ flexGrow: node.proportions?.[index] ?? 1 }}
        >
          <SurfaceTemplatePreviewNodeView
            node={child}
            path={`${path}.${index}`}
            variantId={variantId}
          />
        </span>
      ))}
    </span>
  );
}

function SurfaceTemplatePreviewSlotContent({
  path,
  role,
  variantId,
}: {
  path: string;
  role: Extract<SurfaceTemplatePreviewNode, { kind: "slot" }>["role"];
  variantId: string;
}) {
  const copy = resolveSurfaceTemplatePreviewCopy(variantId, path);

  if (role === "title") {
    return (
      <span className="sc-surface-template-picker-preview-title" data-preview-content="title">
        {copy.title}
      </span>
    );
  }

  if (role === "label") {
    return (
      <span className="sc-surface-template-picker-preview-label" data-preview-content="label">
        {copy.label}
      </span>
    );
  }

  if (role === "image") {
    return (
      <span className="sc-surface-template-picker-preview-image" data-preview-content="image">
        <ImageSquare aria-hidden className="sc-surface-template-picker-preview-image-icon" />
      </span>
    );
  }

  return (
    <span className="sc-surface-template-picker-preview-copy" data-preview-content={role}>
      <span className="sc-surface-template-picker-preview-copy-title">{copy.contentTitle}</span>
      <span className="sc-surface-template-picker-preview-copy-body">{copy.contentBody}</span>
    </span>
  );
}

function resolveSurfaceTemplatePreviewCopy(variantId: string, path: string) {
  if (variantId === "slide-module-cover") {
    const label =
      path === "preview.0"
        ? "Module 02"
        : path === "preview.1.2"
          ? "4 lessons · 18 min"
          : "Design foundations";

    return {
      contentBody: "A focused explanation gives the idea room to breathe.",
      contentTitle: "Key takeaway",
      label,
      title: "Visual systems",
    };
  }

  return {
    contentBody: "A focused explanation gives the idea room to breathe.",
    contentTitle: "Key takeaway",
    label: "Learning moment",
    title: "A clear idea",
  };
}

function readCourseMode(editor: Editor) {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    return null;
  }

  const mode = courseDocument.attrs["mode"];
  return mode === "page" || mode === "slideshow" ? mode : null;
}

function readCourseTheme(editor: Editor): unknown {
  const courseDocument = editor.state.doc.firstChild;
  return courseDocument?.type.name === "courseDocument" ? courseDocument.attrs["theme"] : null;
}
