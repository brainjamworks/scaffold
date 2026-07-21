import type { Node as PMNode } from "@tiptap/pm/model";

function hasMeaningfulContent(node: PMNode): boolean {
  if (node.isText) {
    return Boolean(node.text?.trim());
  }

  if (node.isLeaf) {
    return node.type.name !== "hardBreak";
  }

  let found = false;
  node.forEach((child) => {
    if (!found && hasMeaningfulContent(child)) {
      found = true;
    }
  });
  return found;
}

export function isFieldContentEmpty(node: PMNode): boolean {
  return !hasMeaningfulContent(node);
}
