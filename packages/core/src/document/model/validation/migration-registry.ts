import type { JSONContent } from "@tiptap/core";

export interface CourseDocumentMigrationStep {
  from: number;
  to: number;
  description: string;
  migrate: (document: JSONContent) => JSONContent;
}

export interface AppliedCourseDocumentMigration {
  from: number;
  to: number;
  description: string;
}

export type CourseDocumentMigrationStepResult =
  | {
      ok: true;
      document: JSONContent;
      applied: AppliedCourseDocumentMigration[];
    }
  | {
      ok: false;
      missingFromVersion: number;
    };

export function defineCourseDocumentMigration(
  step: CourseDocumentMigrationStep,
): CourseDocumentMigrationStep {
  assertSafeDocumentVersion(step.from, "migration.from");
  assertSafeDocumentVersion(step.to, "migration.to");
  if (step.to !== step.from + 1) {
    throw new Error(
      `Course document migration ${step.from}->${step.to} must advance exactly one version.`,
    );
  }
  if (!step.description.trim()) {
    throw new Error(`Course document migration ${step.from}->${step.to} needs a description.`);
  }

  return Object.freeze({ ...step });
}

export function validateCourseDocumentMigrationPlan(
  migrations: readonly CourseDocumentMigrationStep[],
  currentVersion: number,
): readonly CourseDocumentMigrationStep[] {
  assertSafeDocumentVersion(currentVersion, "currentVersion");

  const firstVersionedDocumentFormat = 1;
  for (let version = firstVersionedDocumentFormat; version < currentVersion; version += 1) {
    const index = version - firstVersionedDocumentFormat;
    const step = migrations[index];
    if (!step || step.from !== version || step.to !== version + 1) {
      throw new Error(
        `Course document migrations must be append-only: expected v${version}->v${version + 1} at index ${index}.`,
      );
    }
  }

  const expectedStepCount = currentVersion - firstVersionedDocumentFormat;
  if (migrations.length !== expectedStepCount) {
    throw new Error(
      `Course document migrations must stop at current v${currentVersion}; found ${migrations.length} step(s).`,
    );
  }

  return migrations;
}

export function runCourseDocumentMigrationSteps(args: {
  document: JSONContent;
  fromVersion: number;
  toVersion: number;
  migrations: readonly CourseDocumentMigrationStep[];
  onStep?: (step: CourseDocumentMigrationStep) => void;
}): CourseDocumentMigrationStepResult {
  assertSafeDocumentVersion(args.fromVersion, "fromVersion");
  assertSafeDocumentVersion(args.toVersion, "toVersion");
  if (args.fromVersion > args.toVersion) {
    throw new Error(
      `Cannot migrate Scaffold document from v${args.fromVersion} down to v${args.toVersion}.`,
    );
  }

  let document = args.document;
  let currentVersion = args.fromVersion;
  const applied: AppliedCourseDocumentMigration[] = [];

  while (currentVersion < args.toVersion) {
    const step = args.migrations.find((migration) => migration.from === currentVersion);
    if (!step) {
      return { ok: false, missingFromVersion: currentVersion };
    }

    document = step.migrate(document);
    args.onStep?.(step);
    applied.push({
      from: step.from,
      to: step.to,
      description: step.description,
    });
    currentVersion = step.to;
  }

  return { ok: true, document, applied };
}

function assertSafeDocumentVersion(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}
