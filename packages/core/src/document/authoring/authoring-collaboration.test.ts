// @vitest-environment happy-dom

import * as Y from "yjs";
import { describe, expect, it } from "vite-plus/test";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { initializeCourseDocumentFragment } from "@/document/model/initialize-document";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { createAuthoringEditorCollaborationSetup } from "./authoring-collaboration";

describe("authoring collaboration setup", () => {
  it("creates collaboration mapping only for valid authoritative content", () => {
    const document = new Y.Doc();
    initializeCourseDocumentFragment(document, { mode: "page" });

    const result = createAuthoringEditorCollaborationSetup({ document, editable: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected valid authoring setup");
    expect(result.content).toMatchObject({ type: "doc" });
    expect(result.extensions.length).toBeGreaterThan(0);
  });

  it("returns invalid without mutating or partially setting up an invalid Y.Doc", () => {
    const document = new Y.Doc();
    const invalid = createScaffoldDocumentContent({ mode: "page" });
    const surface = invalid.content?.[0]?.content?.[0];
    if (!surface) throw new Error("missing invalid fixture surface");
    surface.attrs = { ...surface.attrs, variant: "unknown-surface" };
    initializeCourseDocumentFragment(document, { content: invalid });
    const fragment = document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT);
    const beforeJson = yXmlFragmentToProsemirrorJSON(fragment);
    const beforeUpdate = Y.encodeStateAsUpdate(document);

    const result = createAuthoringEditorCollaborationSetup({ document, editable: true });

    expect(result).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: "unknown_surface_variant" })],
    });
    expect("content" in result).toBe(false);
    expect("extensions" in result).toBe(false);
    expect(yXmlFragmentToProsemirrorJSON(fragment)).toEqual(beforeJson);
    expect(Y.encodeStateAsUpdate(document)).toEqual(beforeUpdate);
  });
});
