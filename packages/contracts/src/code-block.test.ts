import { describe, expect, it } from "vite-plus/test";

import {
  CODE_BLOCK_LANGUAGE_LABELS,
  CodeBlockDataSchema,
  CodeBlockLanguageSchema,
  type CodeBlockData,
} from "./index";

const EXPECTED_LANGUAGES = [
  "plaintext",
  "arduino",
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "go",
  "graphql",
  "ini",
  "java",
  "javascript",
  "json",
  "kotlin",
  "less",
  "lua",
  "makefile",
  "markdown",
  "objectivec",
  "perl",
  "php",
  "php-template",
  "python",
  "python-repl",
  "r",
  "ruby",
  "rust",
  "scss",
  "shell",
  "sql",
  "swift",
  "typescript",
  "vbnet",
  "wasm",
  "xml",
  "yaml",
] as const;

const EXPECTED_LABELS = {
  plaintext: "Plain text",
  arduino: "Arduino",
  bash: "Bash",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  diff: "Diff",
  go: "Go",
  graphql: "GraphQL",
  ini: "INI",
  java: "Java",
  javascript: "JavaScript",
  json: "JSON",
  kotlin: "Kotlin",
  less: "Less",
  lua: "Lua",
  makefile: "Makefile",
  markdown: "Markdown",
  objectivec: "Objective-C",
  perl: "Perl",
  php: "PHP",
  "php-template": "PHP template",
  python: "Python",
  "python-repl": "Python REPL",
  r: "R",
  ruby: "Ruby",
  rust: "Rust",
  scss: "SCSS",
  shell: "Shell",
  sql: "SQL",
  swift: "Swift",
  typescript: "TypeScript",
  vbnet: "VB.NET",
  wasm: "WebAssembly",
  xml: "XML / HTML",
  yaml: "YAML",
} as const;

describe("code block content contract", () => {
  it("preserves language order and labels", () => {
    expect(CodeBlockLanguageSchema.options).toEqual(EXPECTED_LANGUAGES);
    expect(CODE_BLOCK_LANGUAGE_LABELS).toEqual(EXPECTED_LABELS);
  });

  it("preserves the canonical serialized data shape", () => {
    const data: CodeBlockData = {
      type: "code_block",
      language: "typescript",
      showCopyButton: false,
    };

    expect(CodeBlockDataSchema.parse(data)).toEqual(data);
  });

  it("preserves serialized defaults", () => {
    expect(CodeBlockDataSchema.parse({})).toEqual({
      type: "code_block",
      language: "plaintext",
      showCopyButton: true,
    });
  });

  it("preserves unknown-key stripping", () => {
    expect(
      CodeBlockDataSchema.parse({
        type: "code_block",
        language: "python",
        showCopyButton: false,
        highlightedHtml: "<span>pass</span>",
      }),
    ).toEqual({
      type: "code_block",
      language: "python",
      showCopyButton: false,
    });
  });

  it.each([{ type: "codeBlock" }, { language: "brainfuck" }, { showCopyButton: "yes" }])(
    "rejects invalid serialized values %#",
    (value) => {
      expect(CodeBlockDataSchema.safeParse(value).success).toBe(false);
    },
  );
});
