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

function fail_assessment_contract_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

$packagejson = json_decode(
    file_get_contents(__DIR__ . '/../package.json') ?: '',
    true,
    512,
    JSON_THROW_ON_ERROR,
);
$scripts = is_array($packagejson['scripts'] ?? null) ? $packagejson['scripts'] : [];
foreach (['test', 'build'] as $scriptname) {
    if (!str_starts_with((string) ($scripts[$scriptname] ?? ''), 'vp run check:artifacts && ')) {
        fail_assessment_contract_test($scriptname . ' must check packaged artifacts before execution');
    }
}
$expectedartifactcheck = 'node scripts/sync-assessment-artifacts.mjs --check'
    . ' && node scripts/sync-learner-activity-artifact.mjs --check';
if (($scripts['check:artifacts'] ?? null) !== $expectedartifactcheck) {
    fail_assessment_contract_test('the packaged artifact check must cover both canonical schemas and grading corpus');
}
if (($scripts['verify'] ?? null) !==
        'vp run check:artifacts && vp run php:lint && vp run test:unchecked && vp run build:unchecked') {
    fail_assessment_contract_test('the adapter must expose one complete verification command');
}

$assessmentsyncsource = file_get_contents(__DIR__ . '/../scripts/sync-assessment-artifacts.mjs') ?: '';
foreach (['missing packaged', 'modified packaged',
        'vp run @scaffold/adapter-moodle#sync:assessment-artifacts'] as $diagnostic) {
    if (!str_contains($assessmentsyncsource, $diagnostic)) {
        fail_assessment_contract_test('assessment artifact drift must report ' . $diagnostic);
    }
}

foreach ([
    'activity_access_test.php',
    'activity_deletion_test.php',
    'assessment_definition_test.php',
    'assessment_service_test.php',
    'backup_scaffold_test.php',
    'content_service_test.php',
    'grade_item_publisher_test.php',
    'grade_publication_repository_test.php',
    'grade_publisher_test.php',
    'grade_reconciler_task_test.php',
    'grade_status_report_test.php',
    'learner_activity_service_test.php',
    'privacy_provider_test.php',
    'quiz_expiry_task_test.php',
    'quiz_expiry_test.php',
    'restore_scaffold_test.php',
] as $nativetestfile) {
    if (!is_file(__DIR__ . '/../scaffold/tests/' . $nativetestfile)) {
        fail_assessment_contract_test('native Moodle test source is missing: ' . $nativetestfile);
    }
}

$canonicalpath = __DIR__ . '/../../../packages/contracts/generated/assessment.schema.json';
$vendoredpath = __DIR__ . '/../scaffold/schemas/assessment.schema.json';
$canonicalbytes = file_get_contents($canonicalpath);
$vendoredbytes = is_file($vendoredpath) ? file_get_contents($vendoredpath) : false;

if ($canonicalbytes === false || $vendoredbytes === false || $vendoredbytes !== $canonicalbytes) {
    fail_assessment_contract_test('Moodle must vendor the exact canonical assessment schema bytes');
}

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_target_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_group_validator.php');

use mod_scaffold\local\assessment_group_validator;
use mod_scaffold\local\assessment_target_validator;
use mod_scaffold\local\json_schema_validator;

function decode_assessment_fixture(string $json): mixed {
    return json_decode($json, false, 512, JSON_THROW_ON_ERROR);
}

function expect_contract_rejected(
    json_schema_validator $validator,
    string $definition,
    mixed $value,
    string $message,
): void {
    try {
        $validator->validate_definition($definition, $value);
        fail_assessment_contract_test($message);
    } catch (invalid_parameter_exception) {
    }
}

function clone_assessment_fixture(mixed $value): mixed {
    return json_decode(json_encode($value, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
}

function expect_schema_resource_rejected(string $schemajson, string $message): void {
    $path = tempnam(sys_get_temp_dir(), 'scaffold-assessment-schema-');
    if ($path === false || file_put_contents($path, $schemajson) === false) {
        fail_assessment_contract_test('could not create temporary schema fixture');
    }
    try {
        new json_schema_validator($path);
        fail_assessment_contract_test($message);
    } catch (invalid_parameter_exception) {
    } finally {
        unlink($path);
    }
}

$validator = new json_schema_validator();
$target = decode_assessment_fixture(<<<'JSON'
{
  "schemaVersion": 1,
  "targetId": "question-1",
  "blockId": "block-1",
  "blockType": "mcq",
  "interaction": {
    "kind": "single-select",
    "options": [{"id": "option-a"}, {"id": "option-b"}]
  },
  "assessment": {
    "kind": "single-select",
    "correctOptionId": "option-b",
    "feedbackByOptionId": {}
  },
  "settings": {
    "feedbackMode": "on_submit",
    "isGraded": true,
    "showAnswer": true,
    "points": 1,
    "maxAttempts": null
  }
}
JSON);

$validator->validate_definition('AssessmentTargetContract', $target);
$targetwithremovedsetting = clone_assessment_fixture($target);
$removedsettingname = implode('', ['is', 'Required']);
$targetwithremovedsetting->settings->{$removedsettingname} = true;
expect_contract_rejected(
    $validator,
    'AssessmentTargetContract',
    $targetwithremovedsetting,
    'schema validation must reject the removed assessment setting',
);
$targetwithunknownfield = clone_assessment_fixture($target);
$targetwithunknownfield->hostMaximum = 100;
expect_contract_rejected(
    $validator,
    'AssessmentTargetContract',
    $targetwithunknownfield,
    'schema validation must reject unknown target fields',
);
$interactionwithunknownfield = clone_assessment_fixture($target);
$interactionwithunknownfield->interaction->provider = 'host';
expect_contract_rejected(
    $validator,
    'AssessmentTargetContract',
    $interactionwithunknownfield,
    'schema validation must reject unknown interaction fields',
);
$optionwithunknownfield = clone_assessment_fixture($target);
$optionwithunknownfield->interaction->options[0]->providerPayload = new stdClass();
expect_contract_rejected(
    $validator,
    'AssessmentTargetContract',
    $optionwithunknownfield,
    'schema validation must reject unknown option fields',
);
$answerkeywithunknownfield = clone_assessment_fixture($target);
$answerkeywithunknownfield->assessment->hostItemId = 'item-1';
expect_contract_rejected(
    $validator,
    'AssessmentTargetContract',
    $answerkeywithunknownfield,
    'schema validation must reject unknown answer-key fields',
);
$invalidtarget = clone $target;
$invalidtarget->assessment = clone $target->assessment;
$invalidtarget->assessment->kind = 'multi-select';
expect_contract_rejected(
    $validator,
    'AssessmentTargetContract',
    $invalidtarget,
    'schema validation must reject target interaction and answer disagreement',
);

$group = decode_assessment_fixture(<<<'JSON'
{
  "schemaVersion": 1,
  "kind": "quiz",
  "groupId": "quiz-1",
  "targetIds": ["question-1", "question-2"],
  "settings": {
    "allowBacktracking": true,
    "reviewTiming": "after_quiz",
    "reviewDetail": "result_only",
    "attemptsPerQuestion": 1,
    "isGraded": true,
    "timer": {"enabled": false, "durationSeconds": 0}
  }
}
JSON);
$validator->validate_definition('AssessmentGroupContract', $group);
$duplicategroup = clone_assessment_fixture($group);
$duplicategroup->targetIds = ['question-1', 'question-1'];
expect_contract_rejected(
    $validator,
    'AssessmentGroupContract',
    $duplicategroup,
    'schema validation must reject duplicate group target ids',
);

$response = decode_assessment_fixture('{"kind":"single-select","optionId":"option-a"}');
$validator->validate_definition('AssessmentResponseValue', $response);
expect_contract_rejected(
    $validator,
    'AssessmentResponseValue',
    [],
    'schema validation must reject a list where a response object is required',
);

$result = decode_assessment_fixture(
    '{"isCorrect":true,"score":1,"maxScore":1,"feedback":null,"items":{}}',
);
$validator->validate_definition('AssessmentResult', $result);
foreach ([INF, NAN] as $nonfinitescore) {
    $invalidresult = clone $result;
    $invalidresult->score = $nonfinitescore;
    expect_contract_rejected(
        $validator,
        'AssessmentResult',
        $invalidresult,
        'schema validation must reject non-finite result scores',
    );
}

$gradedprojection = decode_assessment_fixture(<<<'JSON'
{
  "normalizedScore": 0.75,
  "activityStatus": "completed",
  "gradingStatus": "graded",
  "changedAt": "2026-07-15T11:00:00.456+01:00"
}
JSON);
$validator->validate_definition('AssessmentGradeProjection', $gradedprojection);
$invalidprojection = clone_assessment_fixture($gradedprojection);
$invalidprojection->normalizedScore = null;
expect_contract_rejected(
    $validator,
    'AssessmentGradeProjection',
    $invalidprojection,
    'schema validation must couple graded status to a normalized score',
);
$invalidprojection = clone_assessment_fixture($gradedprojection);
$invalidprojection->changedAt = '2026-07-15T11:00:00Z';
expect_contract_rejected(
    $validator,
    'AssessmentGradeProjection',
    $invalidprojection,
    'schema validation must reject non-canonical grade timestamps',
);

$emptyproblem = decode_assessment_fixture(<<<'JSON'
{
  "response": null,
  "submitted": false,
  "attemptNumber": 0,
  "hintsShown": 0,
  "checkResult": null,
  "submissionResult": null
}
JSON);
$validator->validate_definition('AssessmentProblemSnapshot', $emptyproblem);
$invalidproblem = clone_assessment_fixture($emptyproblem);
$invalidproblem->submitted = true;
expect_contract_rejected(
    $validator,
    'AssessmentProblemSnapshot',
    $invalidproblem,
    'schema validation must couple submitted problems to submission results',
);

$quizsnapshot = decode_assessment_fixture(<<<'JSON'
{
  "attemptId": "attempt-1",
  "status": "in_progress",
  "currentTargetId": "question-1",
  "submittedTargetIds": [],
  "startedAt": "2026-07-15T12:00:00Z",
  "finishedAt": null,
  "expiresAt": null,
  "score": null,
  "maxScore": null,
  "resultsByTargetId": {},
  "answerReviewAuthorized": false
}
JSON);
$validator->validate_definition('QuizAttemptSnapshot', $quizsnapshot);
$invalidquiz = clone_assessment_fixture($quizsnapshot);
$invalidquiz->score = 1;
expect_contract_rejected(
    $validator,
    'QuizAttemptSnapshot',
    $invalidquiz,
    'schema validation must couple Quiz score and max score',
);
$invalidquiz = clone_assessment_fixture($quizsnapshot);
$invalidquiz->submittedTargetIds = ['question-1', 'question-1'];
expect_contract_rejected(
    $validator,
    'QuizAttemptSnapshot',
    $invalidquiz,
    'schema validation must reject duplicate submitted target ids',
);

$snapshot = decode_assessment_fixture(<<<'JSON'
{
  "snapshotVersion": 1,
  "artifactId": "artifact-1",
  "problems": {
    "question-1": {
      "response": null,
      "submitted": false,
      "attemptNumber": 0,
      "hintsShown": 0,
      "checkResult": null,
      "submissionResult": null
    }
  },
  "quizzes": {"quiz-1": {
    "attemptId": "attempt-1",
    "status": "in_progress",
    "currentTargetId": "question-1",
    "submittedTargetIds": [],
    "startedAt": "2026-07-15T12:00:00Z",
    "finishedAt": null,
    "expiresAt": null,
    "score": null,
    "maxScore": null,
    "resultsByTargetId": {},
    "answerReviewAuthorized": false
  }}
}
JSON);
$validator->validate_definition('AssessmentLearnerSnapshot', $snapshot);
$invalidsnapshot = clone_assessment_fixture($snapshot);
$invalidsnapshot->problems = (object) [
    'artifact:artifact-1/block:question-1' => $emptyproblem,
];
expect_contract_rejected(
    $validator,
    'AssessmentLearnerSnapshot',
    $invalidsnapshot,
    'schema validation must reject composite runtime problem keys',
);
$invalidsnapshot = clone_assessment_fixture($snapshot);
$invalidsnapshot->quizzes->{'quiz-1'}->groupId = 'quiz-1';
expect_contract_rejected(
    $validator,
    'AssessmentLearnerSnapshot',
    $invalidsnapshot,
    'schema validation must keep Quiz snapshots identity-free',
);

expect_schema_resource_rejected(
    '{"definitions":{"Invalid":{"oneOf":[]}}}',
    'schema loading must reject unsupported keywords',
);
expect_schema_resource_rejected('{', 'schema loading must reject invalid JSON');

set_error_handler(
    static function (int $severity, string $message): bool {
        if ((error_reporting() & $severity) === 0) {
            return false;
        }
        throw new ErrorException($message, 0, $severity);
    },
);
try {
    new json_schema_validator(sys_get_temp_dir() . '/scaffold-missing-assessment-schema.json');
    fail_assessment_contract_test('schema loading must reject a missing resource');
} catch (invalid_parameter_exception) {
} catch (Throwable $exception) {
    fail_assessment_contract_test(
        'schema loading must fail closed without leaking a PHP warning: ' . $exception::class,
    );
} finally {
    restore_error_handler();
}

try {
    $validator->validate_definition('MissingDefinition', null);
    fail_assessment_contract_test('schema validation must reject unknown definitions');
} catch (invalid_parameter_exception) {
}

$secondtarget = clone_assessment_fixture($target);
$secondtarget->targetId = 'question-2';
$secondtarget->blockId = 'block-2';
$validatedtargets = assessment_target_validator::validate_targets([$target, $secondtarget]);
if ($validatedtargets !== [$target, $secondtarget]) {
    fail_assessment_contract_test('target boundary validation must preserve valid target values');
}
$duplicatetarget = clone_assessment_fixture($target);
$duplicatetarget->blockId = 'duplicate-block';
try {
    assessment_target_validator::validate_targets([$target, $duplicatetarget]);
    fail_assessment_contract_test('target boundary validation must reject duplicate targetId values');
} catch (invalid_parameter_exception) {
}
$validatedgroups = assessment_group_validator::validate_groups([$group], $validatedtargets);
if ($validatedgroups !== [$group]) {
    fail_assessment_contract_test('group boundary validation must preserve valid group values');
}
$secondgroup = clone_assessment_fixture($group);
$secondgroup->targetIds = ['question-2'];
try {
    assessment_group_validator::validate_groups([$group, $secondgroup], $validatedtargets);
    fail_assessment_contract_test('group boundary validation must reject duplicate groupId values');
} catch (invalid_parameter_exception) {
}
$missingtargetgroup = clone_assessment_fixture($group);
$missingtargetgroup->targetIds = ['question-1', 'missing-target'];
try {
    assessment_group_validator::validate_groups([$missingtargetgroup], $validatedtargets);
    fail_assessment_contract_test('group validation must reject references to unstored targets');
} catch (invalid_parameter_exception) {
}
$overlappinggroup = clone_assessment_fixture($group);
$overlappinggroup->groupId = 'quiz-2';
$overlappinggroup->targetIds = ['question-1'];
try {
    assessment_group_validator::validate_groups([$group, $overlappinggroup], $validatedtargets);
    fail_assessment_contract_test('group validation must reject targets owned by multiple Quiz groups');
} catch (invalid_parameter_exception) {
}

echo "assessment contract tests passed\n";
