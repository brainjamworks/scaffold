import {
  CODE_BLOCK_LANGUAGE_LABELS,
  CodeBlockLanguageSchema,
  type CodeBlockLanguage,
} from "@scaffold/contracts";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { Combobox } from "@/ui/components/app/Combobox/Combobox";
import { authoringMovementSnapshotChromeAttributes } from "@/editor/movement/view/authoring-movement-presentation";

import { CodeBlockSurface, normalizeCodeBlockData, parseCodeBlockData } from "./CodeBlockSurface";

import "./CodeBlockAuthoringControls.css";

const LANGUAGE_OPTIONS = CodeBlockLanguageSchema.options.map((value) => ({
  value,
  label: CODE_BLOCK_LANGUAGE_LABELS[value],
}));

export function CodeBlockAuthoringView(props: NodeViewProps) {
  const data = parseCodeBlockData(props.node.attrs["data"]);

  const updateLanguage = (language: CodeBlockLanguage) => {
    props.updateAttributes({
      data: normalizeCodeBlockData({ ...data, language }),
    });
  };

  return (
    <CodeBlockSurface
      data={data}
      code={props.node.textContent}
      languageControl={
        <div
          {...authoringMovementSnapshotChromeAttributes()}
          className="sc-app-code-block__language-control"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <Combobox
            aria-label="Code language"
            value={data.language}
            onChange={(value) => updateLanguage(value as CodeBlockLanguage)}
            options={LANGUAGE_OPTIONS}
            searchPlaceholder="Search languages"
            className="sc-app-code-block__language-trigger"
          />
        </div>
      }
    >
      <NodeViewContent />
    </CodeBlockSurface>
  );
}
