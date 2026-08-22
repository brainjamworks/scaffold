import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { QuizNodeView } from "./Quiz";
import { quizBlockDefinition } from "./quiz-definition";
import { createQuizNode } from "./node";

import "./QuizAuthoringControls.css";

const QuizAuthoringNode = createQuizNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: quizBlockDefinition,
      view: { component: QuizNodeView },
    }),
});

export const QuizAuthoringExtension = Extension.create({
  name: "quiz_authoring_bundle",

  addExtensions() {
    return [QuizAuthoringNode];
  },
});
