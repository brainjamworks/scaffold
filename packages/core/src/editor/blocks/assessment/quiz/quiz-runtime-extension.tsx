import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { QuizRuntimeView } from "./QuizRuntimeView";
import { quizBlockDefinition } from "./quiz-definition";
import { createQuizNode } from "./node";

const QuizRuntimeNode = createQuizNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: quizBlockDefinition,
      view: { component: QuizRuntimeView },
    }),
});

export const QuizRuntimeExtension = Extension.create({
  name: "quiz_runtime_bundle",

  addExtensions() {
    return [QuizRuntimeNode];
  },
});
