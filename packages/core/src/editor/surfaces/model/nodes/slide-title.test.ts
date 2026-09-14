// @vitest-environment happy-dom

import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import {
  DOMParser as ProseMirrorDOMParser,
  DOMSerializer as ProseMirrorDOMSerializer,
} from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { resolveEditorPlaceholder } from "@/editor/prosemirror/placeholder/resolve-editor-placeholder";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const coreRuntimeComposition = createCoreScaffoldRuntimeComposition();

describe("SlideTitleNode", () => {
  it("is registered in the shared authoring and runtime schemas", () => {
    const authoringSchema = getSchema(
      createCourseDocumentAuthoringExtensions({
        composition: coreAuthoringComposition,
        editable: true,
      }),
    );
    const runtimeSchema = getSchema(
      createCourseDocumentRuntimeExtensions({ composition: coreRuntimeComposition }),
    );

    expect(authoringSchema.nodes["slide_title"]).toBeDefined();
    expect(runtimeSchema.nodes["slide_title"]).toBeDefined();
  });

  it.each([
    [
      "authoring",
      () =>
        createCourseDocumentAuthoringExtensions({
          composition: coreAuthoringComposition,
          editable: true,
        }),
    ],
    [
      "runtime",
      () => createCourseDocumentRuntimeExtensions({ composition: coreRuntimeComposition }),
    ],
  ])("installs Left-default semantic alignment in the %s schema", (_name, createExtensions) => {
    const schema = getSchema(createExtensions());
    const slideTitle = schema.nodes["slide_title"];
    if (!slideTitle) throw new Error("slide_title schema node missing");

    expect(slideTitle.create().attrs["textAlign"]).toBe("left");

    const container = document.createElement("div");
    container.append(
      ProseMirrorDOMSerializer.fromSchema(schema).serializeNode(
        slideTitle.create({ textAlign: "right" }, schema.text("Aligned title")),
      ),
    );
    expect(container.innerHTML).toBe(
      '<h1 data-text-align="right" style="text-align: right;" data-slot="slide-title">Aligned title</h1>',
    );
  });

  it.each([
    [
      "authoring",
      () =>
        createCourseDocumentAuthoringExtensions({
          composition: coreAuthoringComposition,
          editable: true,
        }),
    ],
    [
      "runtime",
      () => createCourseDocumentRuntimeExtensions({ composition: coreRuntimeComposition }),
    ],
  ])("imports semantic slide titles through the %s composition", (_name, createExtensions) => {
    const element = document.createElement("div");
    element.innerHTML = `
      <section data-course-document data-course-mode="slideshow">
        <section
          data-surface
          data-id="surface-slide-title"
          data-surface-variant="slide-content"
        >
          <h1 data-slot="slide-title">Imported title</h1>
        </section>
      </section>
    `;

    const parsed = ProseMirrorDOMParser.fromSchema(getSchema(createExtensions())).parse(element);
    const title = parsed.firstChild?.firstChild?.firstChild;

    expect(title?.type.name).toBe("slide_title");
    expect(title?.textContent).toBe("Imported title");
  });

  it("round-trips inline authored content as a semantic level-one heading without attrs", () => {
    const extensions = [StarterKit.configure({ heading: false }), SlideTitleNode];
    const editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          {
            type: "slide_title",
            content: [
              { type: "text", marks: [{ type: "bold" }], text: "Planning" },
              { type: "text", text: " ahead" },
            ],
          },
        ],
      },
    });

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "slide_title",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: "Planning" },
            { type: "text", text: " ahead" },
          ],
        },
      ],
    });

    const html = editor.getHTML();
    expect(html).toBe('<h1 data-slot="slide-title"><strong>Planning</strong> ahead</h1>');

    const parsedEditor = new Editor({ extensions, content: html });
    expect(parsedEditor.getJSON()).toEqual(editor.getJSON());

    parsedEditor.destroy();
    editor.destroy();
  });

  it("uses the dedicated empty slide title placeholder", () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ heading: false }),
        SlideTitleNode,
        Placeholder.configure({ placeholder: resolveEditorPlaceholder }),
      ],
      content: {
        type: "doc",
        content: [{ type: "slide_title" }],
      },
    });
    document.body.append(editor.view.dom);

    expect(editor.view.dom.querySelector('h1[data-placeholder="Slide title"]')).not.toBeNull();

    editor.destroy();
  });

  it("preserves supplied slide title content through the explicit initialization schema", () => {
    const content: JSONContent = {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            id: createEmbeddedNodeId(),
            mode: "slideshow",
            schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          },
          content: [
            {
              type: "courseSection",
              attrs: { id: createEmbeddedNodeId(), title: "Introduction" },
            },
            {
              type: "surface",
              attrs: { id: createEmbeddedNodeId(), variant: "slide-content" },
              content: [
                {
                  type: "slide_title",
                  content: [
                    {
                      type: "text",
                      marks: [{ type: "highlight", attrs: { color: "#fff4cc" } }],
                      text: "A collaborative title",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({
        composition: coreAuthoringComposition,
        editable: true,
      }),
      content,
    });
    const initialized = editor.getJSON();
    const courseDocument = initialized.content?.[0] as JSONContent | undefined;
    const surface = courseDocument?.content?.find((node) => node.type === "surface");
    expect(surface?.content?.[0]).toMatchObject({
      type: "slide_title",
      content: [
        {
          type: "text",
          marks: [{ type: "highlight", attrs: { color: "#fff4cc" } }],
          text: "A collaborative title",
        },
      ],
    });
    editor.destroy();
  });
});
