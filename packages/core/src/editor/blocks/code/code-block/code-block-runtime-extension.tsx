import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { CodeBlockLanguageLabel, CodeBlockSurface, parseCodeBlockData } from "./CodeBlockSurface";
import { codeBlockDefinition } from "./code-block-definition";
import { createCodeBlockBodyNode, createCodeBlockNode } from "./node";

function CodeBlockRuntimeView(props: NodeViewProps) {
  const data = parseCodeBlockData(props.node.attrs["data"]);

  return (
    <CodeBlockSurface
      data={data}
      code={props.node.textContent}
      languageControl={<CodeBlockLanguageLabel data={data} />}
    >
      <NodeViewContent />
    </CodeBlockSurface>
  );
}

const RuntimeCodeBlockBodyNode = createCodeBlockBodyNode({
  keyboardShortcuts: false,
});

const CodeBlockRuntimeRootNode = createCodeBlockNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-code-block",
      definition: codeBlockDefinition,
      view: { component: CodeBlockRuntimeView },
    }),
});

export const CodeBlockRuntimeExtension = Extension.create({
  name: "code_block_runtime_bundle",

  addExtensions() {
    return [RuntimeCodeBlockBodyNode, CodeBlockRuntimeRootNode];
  },
});
