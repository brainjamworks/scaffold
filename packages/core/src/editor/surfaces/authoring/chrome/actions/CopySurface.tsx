import { ClipboardIcon as Clipboard } from "@phosphor-icons/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/react";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";

interface CopySurfaceProps {
  editor: Editor;
  label?: string;
  surfaceId?: string | null;
}

export function CopySurface({ editor, label = "Copy surface", surfaceId }: CopySurfaceProps) {
  const copyable = surfaceId ? resolveCopyableSurface(editor, surfaceId) : null;

  return (
    <MenuIconButton
      icon={Clipboard}
      label={label}
      disabled={!copyable}
      onClick={() => {
        const current = surfaceId ? resolveCopyableSurface(editor, surfaceId) : null;
        if (!current) return;
        editor.commands.copyStructuralRoot({
          node: current.node,
          rootKind: "surface",
          readableText: `Surface: ${current.title}`,
        });
      }}
    />
  );
}

function resolveCopyableSurface(editor: Editor, surfaceId: string) {
  if (!EmbeddedNodeIdSchema.safeParse(surfaceId).success) return null;

  const courseDocument = editor.state.doc.firstChild;
  if (
    !courseDocument ||
    courseDocument.type.name !== "courseDocument" ||
    courseDocument.attrs["mode"] !== "slideshow"
  ) {
    return null;
  }

  try {
    const capabilities = getScaffoldCapabilitiesForEditor(editor);
    const registry = capabilities.surfaces.registry;
    for (let index = 0; index < courseDocument.childCount; index += 1) {
      const node = courseDocument.child(index);
      if (node.type.name !== "surface" || node.attrs["id"] !== surfaceId) continue;
      const variant = node.attrs["variant"];
      const definition = typeof variant === "string" ? registry.get(variant) : undefined;
      if (!definition?.modes.includes("slideshow")) return null;
      return { node, title: definition.title };
    }
  } catch {
    return null;
  }

  return null;
}
