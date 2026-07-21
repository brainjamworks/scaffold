<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

define('MOODLE_INTERNAL', true);

if (!class_exists('invalid_parameter_exception')) {
    class invalid_parameter_exception extends Exception {
    }
}

function fail_learner_activity_contract_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function decode_learner_activity_fixture(string $json): mixed {
    return json_decode($json, false, 512, JSON_THROW_ON_ERROR);
}

function clone_learner_activity_fixture(mixed $value): mixed {
    return json_decode(json_encode($value, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
}

function expect_learner_activity_contract_rejected(
    string $definition,
    mixed $value,
    string $message,
): void {
    try {
        \mod_scaffold\local\learner_activity_validator::validate_definition($definition, $value);
        fail_learner_activity_contract_test($message);
    } catch (invalid_parameter_exception) {
    }
}

function expect_learner_activity_schema_resource_rejected(string $schemajson, string $message): void {
    $path = tempnam(sys_get_temp_dir(), 'scaffold-learner-activity-schema-');
    if ($path === false || file_put_contents($path, $schemajson) === false) {
        fail_learner_activity_contract_test('could not create temporary schema fixture');
    }
    try {
        new \mod_scaffold\local\json_schema_validator($path);
        fail_learner_activity_contract_test($message);
    } catch (invalid_parameter_exception) {
    } finally {
        unlink($path);
    }
}

$canonicalpath = __DIR__ . '/../../../packages/contracts/generated/learner-activity.schema.json';
$vendoredpath = __DIR__ . '/../scaffold/schemas/learner-activity.schema.json';
$canonicalbytes = file_get_contents($canonicalpath);
$vendoredbytes = is_file($vendoredpath) ? file_get_contents($vendoredpath) : false;

if ($canonicalbytes === false || $vendoredbytes === false || $vendoredbytes !== $canonicalbytes) {
    fail_learner_activity_contract_test('Moodle must vendor the exact canonical learner activity schema bytes');
}

$activitysyncsource = file_get_contents(__DIR__ . '/../scripts/sync-learner-activity-artifact.mjs') ?: '';
foreach (['Missing packaged learner activity schema', 'Modified packaged learner activity schema',
        'vp run @scaffold/adapter-moodle#sync:learner-activity-artifact'] as $diagnostic) {
    if (!str_contains($activitysyncsource, $diagnostic)) {
        fail_learner_activity_contract_test('learner activity artifact drift must report ' . $diagnostic);
    }
}
if (!is_file(__DIR__ . '/../scaffold/tests/learner_activity_service_test.php')) {
    fail_learner_activity_contract_test('the installed plugin must include learner activity native test source');
}

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/learner_activity_validator.php');

use mod_scaffold\local\json_schema_validator;
use mod_scaffold\local\learner_activity_validator;

$record = decode_learner_activity_fixture(<<<'JSON'
{
  "activityKind": "flashcard",
  "data": {
    "currentCardId": "card-2",
    "knownCardIds": ["card-1"],
    "confidence": {"card-1": 0.75},
    "reviewRequired": false,
    "nextCardId": null
  },
  "completed": false,
  "updatedAt": "2026-07-17T13:45:12.345+01:00"
}
JSON);
learner_activity_validator::validate_definition('LearnerActivityRecord', $record, '$.activities.flashcards');

$snapshot = decode_learner_activity_fixture(<<<'JSON'
{
  "snapshotVersion": 1,
  "artifactId": "scaffold-42",
  "activities": {
    "flashcards": {
      "activityKind": "flashcard",
      "data": {
        "currentCardId": "card-2",
        "knownCardIds": ["card-1"],
        "confidence": {"card-1": 0.75},
        "reviewRequired": false,
        "nextCardId": null
      },
      "completed": false,
      "updatedAt": "2026-07-17T12:45:12Z"
    },
    "checklist": {
      "activityKind": "checklist",
      "data": {"checkedItemIds": []},
      "completed": true,
      "updatedAt": null
    }
  }
}
JSON);
learner_activity_validator::validate_definition('LearnerActivitySnapshot', $snapshot);

foreach (['', '   '] as $blankidentity) {
    $invalidsnapshot = clone_learner_activity_fixture($snapshot);
    $invalidsnapshot->artifactId = $blankidentity;
    expect_learner_activity_contract_rejected(
        'LearnerActivitySnapshot',
        $invalidsnapshot,
        'learner activity snapshots must reject blank artifact identity',
    );

    $invalidrecord = clone_learner_activity_fixture($record);
    $invalidrecord->activityKind = $blankidentity;
    expect_learner_activity_contract_rejected(
        'LearnerActivityRecord',
        $invalidrecord,
        'learner activity records must reject blank activity kinds',
    );
}

$invalidsnapshot = clone_learner_activity_fixture($snapshot);
$invalidsnapshot->activities = (object) ['' => $record];
expect_learner_activity_contract_rejected(
    'LearnerActivitySnapshot',
    $invalidsnapshot,
    'learner activity snapshots must reject blank block ids',
);

$invalidsnapshot = clone_learner_activity_fixture($snapshot);
$invalidsnapshot->activities = (object) ['artifact:scaffold-42/block:flashcards' => $record];
expect_learner_activity_contract_rejected(
    'LearnerActivitySnapshot',
    $invalidsnapshot,
    'learner activity snapshots must reject composite runtime keys',
);

$invalidsnapshot = clone_learner_activity_fixture($snapshot);
$invalidsnapshot->snapshotVersion = 2;
expect_learner_activity_contract_rejected(
    'LearnerActivitySnapshot',
    $invalidsnapshot,
    'learner activity snapshots must reject future versions',
);

$invalidsnapshot = clone_learner_activity_fixture($snapshot);
unset($invalidsnapshot->activities);
expect_learner_activity_contract_rejected(
    'LearnerActivitySnapshot',
    $invalidsnapshot,
    'learner activity snapshots must reject malformed envelopes',
);

$invalidsnapshot = clone_learner_activity_fixture($snapshot);
$invalidsnapshot->assessment = (object) [];
expect_learner_activity_contract_rejected(
    'LearnerActivitySnapshot',
    $invalidsnapshot,
    'learner activity snapshots must reject extra fields',
);

$invalidrecord = clone_learner_activity_fixture($record);
$invalidrecord->attemptNumber = 1;
expect_learner_activity_contract_rejected(
    'LearnerActivityRecord',
    $invalidrecord,
    'learner activity records must reject assessment fields',
);

$invalidrecord = clone_learner_activity_fixture($record);
$invalidrecord->data = [];
expect_learner_activity_contract_rejected(
    'LearnerActivityRecord',
    $invalidrecord,
    'learner activity data must be an object at its root',
);

$invalidrecord = clone_learner_activity_fixture($record);
$invalidrecord->data->confidence->{'card-1'} = INF;
expect_learner_activity_contract_rejected(
    'LearnerActivityRecord',
    $invalidrecord,
    'learner activity data must reject non-finite recursive values',
);

foreach (['2026-07-17T12:45:12', '2026-02-30T12:45:12Z'] as $invalidtimestamp) {
    $invalidrecord = clone_learner_activity_fixture($record);
    $invalidrecord->updatedAt = $invalidtimestamp;
    expect_learner_activity_contract_rejected(
        'LearnerActivityRecord',
        $invalidrecord,
        'learner activity records must reject invalid timestamps',
    );
}

expect_learner_activity_schema_resource_rejected(
    '{"definitions":{"Invalid":{"oneOf":[]}}}',
    'schema loading must reject unsupported keywords',
);

$assessmentsnapshot = decode_learner_activity_fixture(
    '{"snapshotVersion":1,"artifactId":"scaffold-42","problems":{},"quizzes":{}}',
);
json_schema_validator::validate_plugin_definition('AssessmentLearnerSnapshot', $assessmentsnapshot);
expect_learner_activity_contract_rejected(
    'LearnerActivitySnapshot',
    $assessmentsnapshot,
    'the learner activity validator must reject assessment snapshots',
);

try {
    json_schema_validator::validate_plugin_definition('AssessmentLearnerSnapshot', $snapshot);
    fail_learner_activity_contract_test('the assessment validator must reject learner activity snapshots');
} catch (invalid_parameter_exception) {
}

try {
    json_schema_validator::validate_plugin_definition('LearnerActivitySnapshot', $snapshot);
    fail_learner_activity_contract_test('the assessment validator must not expose learner activity definitions');
} catch (invalid_parameter_exception) {
}

try {
    learner_activity_validator::validate_definition('AssessmentLearnerSnapshot', $assessmentsnapshot);
    fail_learner_activity_contract_test('the learner activity validator must not expose assessment definitions');
} catch (invalid_parameter_exception) {
}

echo "learner activity contract tests passed\n";
