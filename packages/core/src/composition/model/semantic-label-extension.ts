import { Extension } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Plugin } from "@tiptap/pm/state";
import { ReplaceStep, type Step } from "@tiptap/pm/transform";

import { isUnavailableContentCompatibilityRootType } from "@/document/model/establishment/unavailable-content-compatibility-root";

export const SemanticLabel = Extension.create({
  name: "semanticLabel",

  addGlobalAttributes() {
    const semanticLabelNodeTypes = this.extensions
      .filter(
        (extension) =>
          extension.type === "node" &&
          extension.name !== "text" &&
          !isUnavailableContentCompatibilityRootType(extension.name),
      )
      .map(({ name }) => name);

    return [
      {
        types: semanticLabelNodeTypes,
        attributes: {
          semanticLabel: {
            default: null,
            rendered: false,
            keepOnSplit: false,
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          const splitNodePositions = mapSplitNodePositions(transactions);
          if (splitNodePositions.length === 0) return null;

          const tr = newState.tr;
          for (const pos of splitNodePositions) {
            const node = tr.doc.nodeAt(pos);
            if (!node?.type.spec.attrs?.["semanticLabel"] || node.attrs["semanticLabel"] === null) {
              continue;
            }
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, semanticLabel: null });
          }
          return tr.steps.length > 0 ? tr : null;
        },
      }),
    ];
  },
});

function mapSplitNodePositions(transactions: readonly Transaction[]): readonly number[] {
  let positions: number[] = [];
  for (const transaction of transactions) {
    for (const step of transaction.steps) {
      positions = positions.map((pos) => step.getMap().map(pos, 1));
      if (isSameTypeBlockSplit(step)) positions.push(step.from + 1);
    }
  }
  return positions;
}

function isSameTypeBlockSplit(step: Step): step is ReplaceStep {
  const structuralStep = step as ReplaceStep & { readonly structure?: boolean };
  return (
    step instanceof ReplaceStep &&
    structuralStep.structure === true &&
    step.from === step.to &&
    step.slice.openStart === 1 &&
    step.slice.openEnd === 1 &&
    step.slice.content.childCount === 2
  );
}
