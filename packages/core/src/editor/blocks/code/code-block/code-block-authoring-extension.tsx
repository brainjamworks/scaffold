import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { CodeBlockAuthoringView } from "./CodeBlock";
import { codeBlockDefinition } from "./code-block-definition";
import { createCodeBlockBodyNode, createCodeBlockNode } from "./node";

const AuthoringCodeBlockBodyNode = createCodeBlockBodyNode();

const CodeBlockAuthoringRootNode = createCodeBlockNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-code-block",
      definition: codeBlockDefinition,
      view: { component: CodeBlockAuthoringView },
    }),
});

export const CodeBlockAuthoringExtension = Extension.create({
  name: "code_block_authoring_bundle",

  addExtensions() {
    return [AuthoringCodeBlockBodyNode, CodeBlockAuthoringRootNode];
  },
});
