import { defineConfig } from "vite-plus";

export default defineConfig({
  check: {
    fmt: false,
  },
  fmt: {},
  lint: {
    plugins: ["typescript"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "typescript/no-floating-promises": [
        "warn",
        {
          allowForKnownSafeCalls: [
            {
              from: "package",
              name: "test",
              package: "node:test",
            },
          ],
        },
      ],
    },
    overrides: [
      {
        files: ["packages/core/src/**/*.{ts,tsx}", "adapters/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
        plugins: ["typescript", "react"],
        rules: {
          "react/exhaustive-deps": "error",
        },
      },
      {
        files: ["packages/core/src/**/*.{ts,tsx}"],
        excludeFiles: [
          "packages/core/src/**/*.{test,spec}.{ts,tsx}",
          "packages/core/src/**/__tests__/**",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "@tiptap/pm/state",
                  importNames: ["AllSelection", "NodeSelection", "TextSelection"],
                  message:
                    "Raw ProseMirror selection classes belong to packages/core/src/editor/selection.",
                },
                {
                  name: "@phosphor-icons/react",
                  importNames: ["*"],
                  message: "Import Phosphor icons and types by name, not as a namespace.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["packages/core/src/editor/selection/**/*.{ts,tsx}"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "@phosphor-icons/react",
                  importNames: ["*"],
                  message: "Import Phosphor icons and types by name, not as a namespace.",
                },
              ],
            },
          ],
        },
      },
      {
        files: ["packages/core/src/editor/blocks/assessment/**/*.{ts,tsx}"],
        excludeFiles: [
          "packages/core/src/**/*.{test,spec}.{ts,tsx}",
          "packages/core/src/**/__tests__/**",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "@tiptap/pm/state",
                  importNames: ["AllSelection", "NodeSelection", "TextSelection"],
                  message:
                    "Raw ProseMirror selection classes belong to packages/core/src/editor/selection.",
                },
                {
                  name: "@phosphor-icons/react",
                  importNames: ["*"],
                  message: "Import Phosphor icons and types by name, not as a namespace.",
                },
                {
                  name: "@/host/providers/ScaffoldServicesProvider",
                  importNames: ["useAssessmentPort"],
                  message:
                    "Assessment blocks access the assessment port through the runtime facade.",
                },
              ],
              patterns: [
                {
                  group: ["@/runtime/assessment", "@/runtime/assessment/**"],
                  allowTypeImports: true,
                  message:
                    "Assessment block runtime values belong behind the shared assessment runtime bridge.",
                },
              ],
            },
          ],
        },
      },
      {
        files: [
          "packages/core/src/editor/blocks/assessment/shared/runtime/use-assessment-block-setup.ts",
          "packages/core/src/editor/blocks/assessment/shared/runtime/use-assessment-runtime.ts",
          "packages/core/src/editor/blocks/assessment/quiz/use-quiz-runtime-controller.ts",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              paths: [
                {
                  name: "@tiptap/pm/state",
                  importNames: ["AllSelection", "NodeSelection", "TextSelection"],
                  message:
                    "Raw ProseMirror selection classes belong to packages/core/src/editor/selection.",
                },
                {
                  name: "@phosphor-icons/react",
                  importNames: ["*"],
                  message: "Import Phosphor icons and types by name, not as a namespace.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  staged: {
    "*.{js,jsx,ts,tsx,mjs,cjs}": "vp check --fix",
  },
  run: {
    tasks: {
      doctor: {
        command: "vp exec -c 'vp --version && node --version && pnpm --version'",
        cache: false,
      },
      "verify:docs": "vp fmt '**/*.md' .github/ISSUE_TEMPLATE --check",
      "verify:fmt": "vp fmt --check",
      "verify:lint": {
        command: "vp lint",
        dependsOn: ["verify:build"],
      },
      "verify:types": {
        command:
          "mkdir -p .tmp && vp check --no-fmt --no-lint > .tmp/vp-verify-types.log && tail -n 1 .tmp/vp-verify-types.log",
        dependsOn: ["verify:build"],
      },
      "verify:static": {
        command:
          "vp run verify:fmt && vp run --ignore-depends-on verify:lint && vp run --ignore-depends-on verify:types",
        dependsOn: ["verify:build"],
      },
      "verify:architecture": {
        command:
          "vp exec depcruise --config .dependency-cruiser.cjs --output-type err-long packages/contracts/src packages/grading/src packages/core/src apps/playground/src adapters",
        cache: false,
      },
      "verify:artifacts":
        "vp run @scaffold/contracts#check:assessment-schema && vp run @scaffold/contracts#check:learner-activity-schema && vp run @scaffold/adapter-xblock#check:assessment-artifacts && vp run @scaffold/adapter-xblock#check:learner-activity-artifact && vp run @scaffold/adapter-moodle#check:assessment-artifacts && vp run @scaffold/adapter-moodle#check:learner-activity-artifact",
      "verify:tooling":
        "vp exec node --test scripts/dependency-cruiser.test.mjs scripts/repository-metadata.test.mjs scripts/create-block.test.mjs scripts/create-layout.test.mjs",
      "verify:unit": "vp run -r test",
      "verify:build": "vp run -r build",
      "verify:release": {
        command:
          "vp run verify:static && vp run verify:architecture && vp run verify:artifacts && vp run verify:tooling && vp run verify:unit && vp run verify:build",
        cache: false,
      },
      "dev:playground": {
        command: "vp dev apps/playground",
        cache: false,
      },
      "report:xblock:bundle": "vp exec node scripts/report-xblock-bundle.mjs",
      "report:xblock:css": "vp exec node scripts/report-xblock-css.mjs",
    },
  },
});
