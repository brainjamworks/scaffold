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

function fail_grade_projection_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_grade_projection(bool $condition, string $message): void {
    if (!$condition) {
        fail_grade_projection_test($message);
    }
}

function assert_grade_projection_same(mixed $expected, mixed $actual, string $message): void {
    if ($expected !== $actual) {
        fail_grade_projection_test(
            $message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true),
        );
    }
}

function expect_grade_projection_rejected(callable $operation, string $message): void {
    try {
        $operation();
        fail_grade_projection_test($message);
    } catch (invalid_parameter_exception) {
    }
}

function grade_projection_target(string $targetid, float $points, bool $isgraded = true): array {
    return [
        'targetId' => $targetid,
        'settings' => [
            'isGraded' => $isgraded,
            'points' => $points,
        ],
    ];
}

function grade_projection_result(float $score): stdClass {
    return (object) [
        'isCorrect' => $score === 1.0,
        'score' => $score,
        'maxScore' => 1,
        'feedback' => null,
        'items' => (object) [],
    ];
}

function grade_projection_problem(?float $score): stdClass {
    return (object) [
        'response' => null,
        'submitted' => $score !== null,
        'attemptNumber' => $score === null ? 0 : 1,
        'hintsShown' => 0,
        'checkResult' => null,
        'submissionResult' => $score === null ? null : grade_projection_result($score),
    ];
}

function grade_projection_snapshot(array $problems = [], array $quizzes = []): stdClass {
    return (object) [
        'snapshotVersion' => 1,
        'artifactId' => 'moodle-cm-42',
        'problems' => (object) $problems,
        'quizzes' => (object) $quizzes,
    ];
}

function grade_projection_quiz_group(bool $isgraded = true): array {
    return [
        'kind' => 'quiz',
        'groupId' => 'quiz-1',
        'targetIds' => ['target-a'],
        'settings' => ['isGraded' => $isgraded],
    ];
}

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_group_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_grade_projector.php');

use mod_scaffold\local\assessment_grade_projector;

$changedat = '2026-07-17T10:00:00.123456Z';
$targets = [
    grade_projection_target('target-a', 2),
    grade_projection_target('target-b', 3),
];
$projection = assessment_grade_projector::build(
    $targets,
    [],
    grade_projection_snapshot([
        'target-a' => grade_projection_problem(0.5),
        'target-b' => grade_projection_problem(1.0),
    ]),
    $changedat,
);
assert_grade_projection_same(0.8, $projection->normalizedScore, 'weighted points must produce neutral f=0.8');
assert_grade_projection_same('completed', $projection->activityStatus, 'resolved standalone activity must complete');
assert_grade_projection_same('graded', $projection->gradingStatus, 'numeric projection must be graded');
assert_grade_projection_same($changedat, $projection->changedAt, 'projection must retain its logical change time');
assert_grade_projection(count(get_object_vars($projection)) === 4, 'projection must contain only Contracts fields');
assert_grade_projection_same(16.0, assessment_grade_projector::to_raw_grade($projection, 20), 'M=20 must map f=0.8 to 16');
assert_grade_projection_same(16.0, assessment_grade_projector::to_raw_grade($projection, 20), 'same M must map stably');
assert_grade_projection_same(80.0, assessment_grade_projector::to_raw_grade($projection, 100), 'M must be independent of five authored points');

$standalonecases = [
    [grade_projection_snapshot(), 'not_started', 'not_ready', null],
    [grade_projection_snapshot(['target-a' => grade_projection_problem(null)]), 'in_progress', 'not_ready', null],
    [grade_projection_snapshot(['target-a' => grade_projection_problem(0.5)]), 'in_progress', 'graded', 0.2],
];
$inprogressnumeric = null;
foreach ($standalonecases as [$snapshot, $activitystatus, $gradingstatus, $score]) {
    $case = assessment_grade_projector::build($targets, [], $snapshot, $changedat);
    assert_grade_projection_same($activitystatus, $case->activityStatus, 'standalone activity transition must match policy');
    assert_grade_projection_same($gradingstatus, $case->gradingStatus, 'standalone grading transition must match policy');
    assert_grade_projection_same($score, $case->normalizedScore, 'missing result must retain the fixed denominator');
    if ($activitystatus === 'in_progress' && $gradingstatus === 'graded') {
        $inprogressnumeric = $case;
    }
}
assert_grade_projection(
    $inprogressnumeric instanceof stdClass,
    'status policy must expose an in-progress numeric projection',
);
assert_grade_projection_same(
    4.0,
    assessment_grade_projector::to_raw_grade($inprogressnumeric, 20),
    'in-progress numeric projections must retain provisional Moodle publication',
);

foreach (['in_progress' => 'in_progress', 'completed' => 'completed', 'expired' => 'completed'] as $status => $expected) {
    $quizscore = match ($status) {
        'in_progress' => 1.0,
        'completed' => 0.25,
        'expired' => 0.5,
    };
    $quiz = (object) [
        'status' => $status,
        'score' => $quizscore,
        'resultsByTargetId' => (object) [
            'target-a' => grade_projection_result($quizscore),
        ],
    ];
    $case = assessment_grade_projector::build(
        [grade_projection_target('target-a', 1)],
        [grade_projection_quiz_group()],
        grade_projection_snapshot(
            ['target-a' => grade_projection_problem(1.0)],
            ['quiz-1' => $quiz],
        ),
        $changedat,
    );
    assert_grade_projection_same($expected, $case->activityStatus, 'Quiz terminal policy must distinguish ' . $status);
    assert_grade_projection_same(
        $status === 'in_progress' ? null : $quizscore,
        $case->normalizedScore,
        'Quiz target result must come from a terminal Quiz attempt',
    );
}

$legacyquizproblem = assessment_grade_projector::build(
    [grade_projection_target('target-a', 1)],
    [grade_projection_quiz_group()],
    grade_projection_snapshot(['target-a' => grade_projection_problem(1.0)]),
    $changedat,
);
assert_grade_projection_same(
    null,
    $legacyquizproblem->normalizedScore,
    'legacy standalone Quiz target state must not produce grade credit',
);
assert_grade_projection_same(
    'in_progress',
    $legacyquizproblem->activityStatus,
    'legacy standalone Quiz target state must not complete the Quiz',
);

$ungraded = assessment_grade_projector::build(
    [grade_projection_target('practice', 5, false)],
    [],
    grade_projection_snapshot(['practice' => grade_projection_problem(1.0)]),
    $changedat,
);
assert_grade_projection_same(null, $ungraded->normalizedScore, 'ungraded-only activity must have no numeric grade');
assert_grade_projection_same('completed', $ungraded->activityStatus, 'terminal ungraded-only activity must complete');
assert_grade_projection_same('not_ready', $ungraded->gradingStatus, 'ungraded-only activity must remain not ready');
assert_grade_projection_same(null, assessment_grade_projector::to_raw_grade($ungraded, 20), 'no-grade projection must suppress updates');

$allauthoredinprogress = assessment_grade_projector::build(
    [
        grade_projection_target('graded', 2),
        grade_projection_target('practice', 5, false),
    ],
    [],
    grade_projection_snapshot(['graded' => grade_projection_problem(1.0)]),
    $changedat,
);
$allauthoredcompleted = assessment_grade_projector::build(
    [
        grade_projection_target('graded', 2),
        grade_projection_target('practice', 5, false),
    ],
    [],
    grade_projection_snapshot([
        'graded' => grade_projection_problem(1.0),
        'practice' => grade_projection_problem(0.0),
    ]),
    $changedat,
);
assert_grade_projection_same('in_progress', $allauthoredinprogress->activityStatus, 'all authored work must control completion');
assert_grade_projection_same(1.0, $allauthoredinprogress->normalizedScore, 'only graded work must contribute to scoring');
assert_grade_projection_same('completed', $allauthoredcompleted->activityStatus, 'activity must complete after all authored work is terminal');
assert_grade_projection_same(1.0, $allauthoredcompleted->normalizedScore, 'ungraded work must not change the numeric score');

$ungradedquiz = assessment_grade_projector::build(
    [grade_projection_target('target-a', 2, false)],
    [grade_projection_quiz_group(false)],
    grade_projection_snapshot(
        ['target-a' => grade_projection_problem(1.0)],
        ['quiz-1' => (object) [
            'status' => 'completed',
            'score' => 1.0,
            'resultsByTargetId' => (object) [
                'target-a' => grade_projection_result(1.0),
            ],
        ]],
    ),
    $changedat,
);
assert_grade_projection_same('completed', $ungradedquiz->activityStatus, 'terminal ungraded Quiz must complete activity');
assert_grade_projection_same(null, $ungradedquiz->normalizedScore, 'ungraded Quiz must not contribute a numeric score');
assert_grade_projection_same('not_ready', $ungradedquiz->gradingStatus, 'ungraded Quiz must not become graded');

$mixed = assessment_grade_projector::build(
    [
        grade_projection_target('target-a', 1),
        grade_projection_target('target-b', 3),
    ],
    [grade_projection_quiz_group()],
    grade_projection_snapshot(
        [
            'target-a' => grade_projection_problem(1.0),
            'target-b' => grade_projection_problem(0.5),
        ],
        ['quiz-1' => (object) [
            'status' => 'completed',
            'score' => 1.0,
            'resultsByTargetId' => (object) [
                'target-a' => grade_projection_result(1.0),
            ],
        ]],
    ),
    $changedat,
);
assert_grade_projection_same('completed', $mixed->activityStatus, 'mixed standalone and Quiz work must complete only when both are terminal');
assert_grade_projection_same(0.625, $mixed->normalizedScore, 'mixed standalone and Quiz work must share authored-point weighting');
assert_grade_projection_same('graded', $mixed->gradingStatus, 'mixed graded work must produce one neutral grade');

$nogradedtargets = assessment_grade_projector::build([], [], grade_projection_snapshot(), $changedat);
assert_grade_projection_same(null, $nogradedtargets->normalizedScore, 'no graded targets must produce no grade');
assert_grade_projection_same(null, assessment_grade_projector::to_raw_grade($projection, null), 'unset M must be an ungraded binding');
assert_grade_projection_same(null, assessment_grade_projector::to_raw_grade($projection, 0), 'zero M must be an ungraded binding');

foreach ([-1, INF, NAN, true, 'invalid'] as $maximum) {
    expect_grade_projection_rejected(
        static fn() => assessment_grade_projector::to_raw_grade($projection, $maximum),
        'invalid Moodle maximum must be rejected',
    );
}

expect_grade_projection_rejected(
    static fn() => assessment_grade_projector::build([], [], grade_projection_snapshot(), 'not-a-timestamp'),
    'build must validate the Contracts-owned projection',
);

echo "assessment grade projection tests passed\n";
