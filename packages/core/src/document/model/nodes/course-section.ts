import { CourseSectionTitleSchema } from "@scaffold/contracts";
import { mergeAttributes, Node, type NodeConfig } from "@tiptap/core";

export const COURSE_SECTION_NODE_TYPE = "courseSection" as const;

export function createCourseSectionNode(
  input: {
    readonly addNodeView?: NodeConfig["addNodeView"];
  } = {},
) {
  return Node.create({
    name: COURSE_SECTION_NODE_TYPE,
    atom: true,
    content: "",
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        title: {
          default: null,
          parseHTML: (element: HTMLElement) =>
            parseCourseSectionTitle(element.getAttribute("data-course-section-title")),
          renderHTML: (attrs: { title?: unknown }) => {
            const title = parseCourseSectionTitle(attrs.title);
            return title === null ? {} : { "data-course-section-title": title };
          },
        },
      };
    },

    parseHTML() {
      return [{ tag: "div[data-course-section]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-course-section": "" })];
    },

    ...(input.addNodeView ? { addNodeView: input.addNodeView } : {}),
  });
}

function parseCourseSectionTitle(value: unknown): string | null {
  const parsed = CourseSectionTitleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
