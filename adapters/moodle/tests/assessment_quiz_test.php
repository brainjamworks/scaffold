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

if (!class_exists('moodle_exception')) {
    class moodle_exception extends Exception {
        public function __construct(string $message = '', string $component = '') {
            parent::__construct($message);
        }
    }
}

function fail_assessment_quiz_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_assessment_quiz(bool $condition, string $message): void {
    if (!$condition) {
        fail_assessment_quiz_test($message);
    }
}

function assert_assessment_quiz_same(mixed $expected, mixed $actual, string $message): void {
    if ($expected !== $actual) {
        fail_assessment_quiz_test(
            $message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true),
        );
    }
}

function assert_assessment_quiz_no_item_outcomes(stdClass $result, string $message): void {
    assert_assessment_quiz_same(
        [],
        get_object_vars($result->items ?? (object) []),
        $message,
    );
}

function assessment_quiz_public_projection_tokens(string $source): array {
    $references = [];
    foreach (token_get_all($source) as $token) {
        if (
            !is_array($token)
            || in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true)
            || !str_contains(strtolower($token[1]), 'assessment_public_projection')
        ) {
            continue;
        }
        $references[] = $token;
    }
    return $references;
}

function assessment_quiz_feedback(string $text): array {
    return [
        'kind' => 'rich-text',
        'document' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'content' => [['type' => 'text', 'text' => $text]],
            ]],
        ],
    ];
}

function assessment_quiz_target(string $targetid): array {
    return [
        'schemaVersion' => 1,
        'targetId' => $targetid,
        'blockId' => $targetid,
        'blockType' => 'mcq',
        'interaction' => [
            'kind' => 'single-select',
            'options' => [['id' => 'option-a'], ['id' => 'option-b']],
        ],
        'assessment' => [
            'kind' => 'single-select',
            'correctOptionId' => 'option-b',
            'feedbackByOptionId' => [
                'option-a' => assessment_quiz_feedback('Quiz item feedback sentinel'),
            ],
            'summaryFeedback' => assessment_quiz_feedback('Quiz summary feedback sentinel'),
        ],
        'settings' => [
            'feedbackMode' => 'on_submit',
            'isGraded' => true,
            'showAnswer' => true,
            'points' => 1,
            'maxAttempts' => null,
        ],
    ];
}

function assessment_quiz_group(
    string $reviewtiming = 'after_each_answer',
    bool $isgraded = true,
    bool $timerenabled = false,
    string $reviewdetail = 'full_review',
    string $groupid = 'quiz-1',
    array $targetids = ['question-1', 'question-2'],
): array {
    return [
        'schemaVersion' => 1,
        'kind' => 'quiz',
        'groupId' => $groupid,
        'targetIds' => $targetids,
        'settings' => [
            'allowBacktracking' => false,
            'reviewTiming' => $reviewtiming,
            'reviewDetail' => $reviewdetail,
            'attemptsPerQuestion' => 2,
            'isGraded' => $isgraded,
            'timer' => [
                'enabled' => $timerenabled,
                'durationSeconds' => $timerenabled ? 60 : 0,
            ],
        ],
    ];
}

function assessment_quiz_snapshot(): stdClass {
    return (object) [
        'snapshotVersion' => 1,
        'artifactId' => 'moodle-cm-42',
        'problems' => (object) [],
        'quizzes' => (object) [],
    ];
}

foreach ([
    'require' => "<?php require_once(__DIR__ . '/assessment_public_projection.php');",
    'import' => "<?php use mod_scaffold\\local\\assessment_public_projection;",
    'name' => "<?php \$projection = assessment_public_projection::class;",
    'call' => "<?php assessment_public_projection::snapshot(\$snapshot, []);",
] as $kind => $source) {
    assert_assessment_quiz(
        assessment_quiz_public_projection_tokens($source) !== [],
        'Quiz dependency guard must detect a forbidden public-projection ' . $kind,
    );
}
assert_assessment_quiz_same(
    [],
    assessment_quiz_public_projection_tokens("<?php // assessment_public_projection\n"),
    'Quiz dependency guard must ignore comments',
);
$quizsource = file_get_contents(__DIR__ . '/../scaffold/classes/local/assessment_quiz.php');
assert_assessment_quiz(is_string($quizsource), 'Quiz source must be readable for dependency enforcement');
assert_assessment_quiz_same(
    [],
    assessment_quiz_public_projection_tokens((string) $quizsource),
    'assessment_quiz must not depend on assessment_public_projection',
);

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/grader.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_grade_projector.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_group_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_result_projection.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_quiz.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_public_projection.php');

use mod_scaffold\local\assessment_quiz;
use mod_scaffold\local\assessment_result_projection;

$binaryresult = (object) [
    'isCorrect' => false,
    'score' => 0,
    'maxScore' => 1,
    'feedback' => assessment_quiz_feedback('Binary summary feedback'),
    'items' => (object) [
        'multi-select-option' => (object) [
            'correct' => false,
            'expected' => true,
            'given' => false,
        ],
        'hotspot-region' => (object) [
            'correct' => true,
            'expected' => true,
            'given' => true,
        ],
    ],
];
assert_assessment_quiz_no_item_outcomes(
    assessment_result_projection::result($binaryresult),
    'result-only projection must not expose outcomes that reconstruct binary option or hotspot answers',
);
assert_assessment_quiz_same(
    null,
    assessment_result_projection::result($binaryresult)->feedback,
    'result-only projection must redact authored summary feedback by default',
);
assert_assessment_quiz_same(
    $binaryresult->feedback,
    assessment_result_projection::result($binaryresult, true)->feedback,
    'authorized result projection must preserve authored summary feedback',
);

$targets = [assessment_quiz_target('question-1'), assessment_quiz_target('question-2')];
$groups = [assessment_quiz_group()];
$snapshot = assessment_quiz_snapshot();
$times = [
    '2026-07-17T10:00:00.000000Z',
    '2026-07-17T10:00:01.000000Z',
    '2026-07-17T10:00:02.000000Z',
    '2026-07-17T10:00:03.000000Z',
];
$gradecalls = 0;
$quiz = new assessment_quiz(
    static function() use (&$times): string {
        return array_shift($times) ?? '2026-07-17T10:00:04.000000Z';
    },
    static fn(string $groupid): string => 'attempt-1',
    static function(array $target, array $response) use (&$gradecalls): array {
        $gradecalls++;
        return \mod_scaffold\local\grader::grade_assessment($target, $response);
    },
);
foreach (['start', 'submit_question', 'finish', 'reveal'] as $repositorymethod) {
    assert_assessment_quiz(
        !method_exists($quiz, $repositorymethod),
        'assessment_quiz must expose only caller-owned state transitions, not repository method ' . $repositorymethod,
    );
}

$attempt = $quiz->start_state($snapshot, $targets, $groups, 'quiz-1');
assert_assessment_quiz_same('in_progress', $attempt->status, 'Quiz start must create an in-progress attempt');
assert_assessment_quiz_same('question-1', $attempt->currentTargetId, 'Quiz start must use stored target order');
assert_assessment_quiz(!property_exists($snapshot->quizzes->{'quiz-1'}, 'groupId'), 'snapshot Quiz value must remain identity-free');

$wrong = $quiz->submit_question_state(
    $snapshot,
    $targets,
    $groups,
    'attempt-1',
    'quiz-1',
    'question-1',
    ['kind' => 'single-select', 'optionId' => 'option-a'],
    0,
);
assert_assessment_quiz_same('question-1', $wrong->currentTargetId, 'retryable wrong answer must remain current');
assert_assessment_quiz_same(1, $snapshot->problems->{'question-1'}->attemptNumber, 'question submit must consume one canonical problem attempt');
$wrongstate = serialize($snapshot);
$stalewrong = $quiz->submit_question_state(
    $snapshot,
    $targets,
    $groups,
    'attempt-1',
    'quiz-1',
    'question-1',
    ['kind' => 'single-select', 'optionId' => 'option-b'],
    0,
);
assert_assessment_quiz_same(
    json_encode($wrong, JSON_THROW_ON_ERROR),
    json_encode($stalewrong, JSON_THROW_ON_ERROR),
    'stale retry must return the current canonical Quiz attempt',
);
assert_assessment_quiz_same(
    $wrongstate,
    serialize($snapshot),
    'stale retry must preserve problem attempts and Quiz state',
);
assert_assessment_quiz_same(1, $gradecalls, 'stale retry must not invoke the grader');
try {
    $quiz->submit_question_state(
        $snapshot,
        $targets,
        $groups,
        'attempt-1',
        'quiz-1',
        'question-1',
        ['kind' => 'single-select', 'optionId' => 'option-b'],
        2,
    );
    fail_assessment_quiz_test('future question sequence must reject');
} catch (invalid_parameter_exception) {
}
assert_assessment_quiz_same(1, $gradecalls, 'future sequence rejection must not invoke the grader');

$correct = $quiz->submit_question_state(
    $snapshot,
    $targets,
    $groups,
    'attempt-1',
    'quiz-1',
    'question-1',
    ['kind' => 'single-select', 'optionId' => 'option-b'],
    1,
);
assert_assessment_quiz_same('question-2', $correct->currentTargetId, 'correct answer must advance stored Quiz order');
assert_assessment_quiz_same(['question-1'], $correct->submittedTargetIds, 'accepted question must become terminal in the attempt');

$completed = $quiz->submit_question_state(
    $snapshot,
    $targets,
    $groups,
    'attempt-1',
    'quiz-1',
    'question-2',
    ['kind' => 'single-select', 'optionId' => 'option-b'],
    0,
);
assert_assessment_quiz_same('completed', $completed->status, 'last accepted question must complete the Quiz');
assert_assessment_quiz_same(2.0, $completed->score, 'Quiz score must aggregate canonical normalized target units');
assert_assessment_quiz_same(2.0, $completed->maxScore, 'Quiz maximum must count stored Quiz targets');
assert_assessment_quiz_same(null, $completed->currentTargetId, 'completed Quiz must have no current target');
assert_assessment_quiz($completed->answerReviewAuthorized, 'accepted after-each-answer results must authorize configured review');

$revealed = $quiz->reveal_state($snapshot, $groups, 'attempt-1', 'quiz-1');
assert_assessment_quiz($revealed->answerReviewAuthorized, 'full-review completed Quiz must authorize answer review');

$snapshot = assessment_quiz_snapshot();
$expirytimes = [
    '2026-07-17T10:00:00.000000Z',
    '2026-07-17T10:02:00.000000Z',
    '2026-07-17T10:02:01.000000Z',
];
$lategradecalls = 0;
$quiz = new assessment_quiz(
    static function() use (&$expirytimes): string {
        return array_shift($expirytimes) ?? '2026-07-17T10:02:02.000000Z';
    },
    static fn(string $groupid): string => 'attempt-expired',
    static function(array $target, array $response) use (&$lategradecalls): array {
        $lategradecalls++;
        return \mod_scaffold\local\grader::grade_assessment($target, $response);
    },
);
$afterquizgroups = [assessment_quiz_group('after_quiz', true, true)];
$quiz->start_state($snapshot, $targets, $afterquizgroups, 'quiz-1');
$expired = $quiz->finish_state(
    $snapshot,
    $targets,
    $afterquizgroups,
    'attempt-expired',
    'quiz-1',
    ['question-1' => ['kind' => 'single-select', 'optionId' => 'option-b']],
);
assert_assessment_quiz_same('expired', $expired->status, 'timer-expired Quiz finish must persist expiry');
assert_assessment_quiz_same(0.0, $expired->score, 'expired Quiz must ignore the late submitted result');
assert_assessment_quiz_same(2.0, $expired->maxScore, 'expired Quiz denominator must retain every stored target');
assert_assessment_quiz_same(0, $lategradecalls, 'expired after-Quiz finish must not invoke the grader');
assert_assessment_quiz_same(
    [],
    get_object_vars($snapshot->quizzes->{'quiz-1'}->resultsByTargetId),
    'expired after-Quiz finish must not retain late results',
);
assert_assessment_quiz(
    !property_exists($snapshot->problems, 'question-1'),
    'expired after-Quiz finish must not create a late problem entry',
);
$expiredstate = serialize($snapshot);
$duplicateexpired = $quiz->finish_state(
    $snapshot,
    $targets,
    $afterquizgroups,
    'attempt-expired',
    'quiz-1',
    ['unknown-target' => ['not' => 'a response']],
);
assert_assessment_quiz_same(
    json_encode($expired, JSON_THROW_ON_ERROR),
    json_encode($duplicateexpired, JSON_THROW_ON_ERROR),
    'duplicate expired finish must return the canonical expired attempt',
);
assert_assessment_quiz_same(
    $expiredstate,
    serialize($snapshot),
    'duplicate expired finish must preserve snapshot and attempts',
);
assert_assessment_quiz_same(0, $lategradecalls, 'duplicate expired finish must ignore its payload');

foreach (['none' => false, 'result_only' => true, 'full_review' => true] as $reviewdetail => $authorized) {
    $snapshot = assessment_quiz_snapshot();
    $quiz = new assessment_quiz(
        static fn(): string => '2026-07-17T11:00:00.000000Z',
        static fn(string $groupid): string => 'attempt-after-each-' . $reviewdetail,
    );
    $reviewgroups = [assessment_quiz_group('after_each_answer', true, false, $reviewdetail)];
    $attempt = $quiz->start_state($snapshot, $targets, $reviewgroups, 'quiz-1');
    $reviewed = $quiz->submit_question_state(
        $snapshot,
        $targets,
        $reviewgroups,
        $attempt->attemptId,
        'quiz-1',
        'question-1',
        ['kind' => 'single-select', 'optionId' => 'option-a'],
        0,
    );
    assert_assessment_quiz_same(
        $authorized,
        $reviewed->answerReviewAuthorized,
        'after-each-answer ' . $reviewdetail . ' policy must authorize exactly its permitted detail',
    );
    $publicjson = json_encode($reviewed, JSON_THROW_ON_ERROR);
    $publicproblems = assessment_quiz::public_problems_by_target_id(
        $snapshot->problems,
        ['question-1'],
        $reviewgroups[0],
        $snapshot->quizzes->{'quiz-1'},
    );
    $publicproblemjson = json_encode($publicproblems, JSON_THROW_ON_ERROR);
    $storedjson = json_encode(
        $snapshot->quizzes->{'quiz-1'}->resultsByTargetId,
        JSON_THROW_ON_ERROR,
    );
    assert_assessment_quiz(
        str_contains($storedjson, '"expected"')
            && str_contains($storedjson, 'Quiz item feedback sentinel')
            && str_contains($storedjson, 'Quiz summary feedback sentinel'),
        'after-each-answer ' . $reviewdetail . ' storage must retain full grading detail',
    );
    if ($reviewdetail === 'none') {
        assert_assessment_quiz_same(
            [],
            get_object_vars($reviewed->resultsByTargetId),
            'none review must omit learner-facing question results',
        );
        assert_assessment_quiz(
            property_exists($publicproblems, 'question-1')
                && $publicproblems->{'question-1'}->attemptNumber === 1
                && $publicproblems->{'question-1'}->submitted === false
                && $publicproblems->{'question-1'}->checkResult === null
                && $publicproblems->{'question-1'}->submissionResult === null,
            'none review must preserve counters in a result-free learner problem snapshot',
        );
    } else {
        assert_assessment_quiz(
            property_exists($reviewed->resultsByTargetId, 'question-1'),
            $reviewdetail . ' review must preserve the submitted learner result shape',
        );
        assert_assessment_quiz(
            property_exists($publicproblems, 'question-1'),
            $reviewdetail . ' review must preserve the submitted learner problem shape',
        );
    }
    assert_assessment_quiz(
        !str_contains($publicjson, '"expected"')
            && !str_contains($publicjson, 'Quiz item feedback sentinel')
            && !str_contains($publicjson, 'Quiz summary feedback sentinel')
            && !str_contains($publicproblemjson, '"expected"')
            && !str_contains($publicproblemjson, 'Quiz item feedback sentinel')
            && !str_contains($publicproblemjson, 'Quiz summary feedback sentinel'),
        'in-progress ' . $reviewdetail . ' review must not expose answer or feedback material',
    );
}

foreach (['none' => false, 'result_only' => true, 'full_review' => true] as $reviewdetail => $authorized) {
    $snapshot = assessment_quiz_snapshot();
    $quiz = new assessment_quiz(
        static fn(): string => '2026-07-17T12:00:00.000000Z',
        static fn(string $groupid): string => 'attempt-after-quiz-' . $reviewdetail,
    );
    $reviewgroups = [assessment_quiz_group('after_quiz', true, false, $reviewdetail)];
    $attempt = $quiz->start_state($snapshot, $targets, $reviewgroups, 'quiz-1');
    $reviewed = $quiz->finish_state(
        $snapshot,
        $targets,
        $reviewgroups,
        $attempt->attemptId,
        'quiz-1',
        [
            'question-1' => ['kind' => 'single-select', 'optionId' => 'option-b'],
            'question-2' => ['kind' => 'single-select', 'optionId' => 'option-a'],
        ],
    );
    assert_assessment_quiz_same(
        $authorized,
        $reviewed->answerReviewAuthorized,
        'after-Quiz ' . $reviewdetail . ' policy must authorize exactly its permitted detail',
    );
    $publicjson = json_encode($reviewed, JSON_THROW_ON_ERROR);
    $publicproblems = assessment_quiz::public_problems_by_target_id(
        $snapshot->problems,
        ['question-1', 'question-2'],
        $reviewgroups[0],
        $snapshot->quizzes->{'quiz-1'},
    );
    $publicproblemjson = json_encode($publicproblems, JSON_THROW_ON_ERROR);
    $storedjson = json_encode(
        $snapshot->quizzes->{'quiz-1'}->resultsByTargetId,
        JSON_THROW_ON_ERROR,
    );
    assert_assessment_quiz(
        str_contains($storedjson, '"expected"')
            && str_contains($storedjson, 'Quiz item feedback sentinel')
            && str_contains($storedjson, 'Quiz summary feedback sentinel'),
        'after-Quiz ' . $reviewdetail . ' storage must retain full grading detail',
    );
    if ($reviewdetail === 'none') {
        assert_assessment_quiz_same(
            [],
            get_object_vars($reviewed->resultsByTargetId),
            'none terminal review must omit learner-facing question results',
        );
        assert_assessment_quiz(
            property_exists($publicproblems, 'question-1')
                && $publicproblems->{'question-1'}->submitted === false
                && $publicproblems->{'question-1'}->checkResult === null
                && $publicproblems->{'question-1'}->submissionResult === null,
            'none terminal review must preserve a result-free learner problem snapshot',
        );
    } elseif ($reviewdetail === 'result_only') {
        foreach (get_object_vars($reviewed->resultsByTargetId) as $result) {
            assert_assessment_quiz_no_item_outcomes(
                $result,
                'result-only terminal attempt must not expose reconstructable item outcomes',
            );
        }
        foreach (get_object_vars($publicproblems) as $problem) {
            if ($problem->submissionResult instanceof stdClass) {
                assert_assessment_quiz_no_item_outcomes(
                    $problem->submissionResult,
                    'result-only terminal problem must not expose reconstructable item outcomes',
                );
            }
        }
        assert_assessment_quiz(
            !str_contains($publicjson, '"expected"')
                && !str_contains($publicjson, 'Quiz item feedback sentinel')
                && !str_contains($publicjson, 'Quiz summary feedback sentinel')
                && !str_contains($publicproblemjson, '"expected"')
                && !str_contains($publicproblemjson, 'Quiz item feedback sentinel')
                && !str_contains($publicproblemjson, 'Quiz summary feedback sentinel'),
            'result-only terminal review must not expose answer or feedback material',
        );
    } else {
        assert_assessment_quiz(
            str_contains($publicjson, '"expected"')
                && str_contains($publicjson, 'Quiz item feedback sentinel')
                && str_contains($publicjson, 'Quiz summary feedback sentinel')
                && str_contains($publicproblemjson, '"expected"')
                && str_contains($publicproblemjson, 'Quiz item feedback sentinel')
                && str_contains($publicproblemjson, 'Quiz summary feedback sentinel'),
            'authorized full terminal review must expose full grading detail',
        );
    }
    $reviewstate = serialize($snapshot);
    if ($reviewdetail === 'full_review') {
        $revealed = $quiz->reveal_state(
            $snapshot,
            $reviewgroups,
            $attempt->attemptId,
            'quiz-1',
        );
        assert_assessment_quiz($revealed->answerReviewAuthorized, 'full review reveal must remain authorized');
    } else {
        try {
            $quiz->reveal_state(
                $snapshot,
                $reviewgroups,
                $attempt->attemptId,
                'quiz-1',
            );
            fail_assessment_quiz_test($reviewdetail . ' reveal must reject answer-key review');
        } catch (moodle_exception) {
        }
    }
    assert_assessment_quiz_same(
        $reviewstate,
        serialize($snapshot),
        $reviewdetail . ' reveal must not create a new Quiz projection',
    );
}

$publicsnapshot = \mod_scaffold\local\assessment_public_projection::snapshot(
    $snapshot,
    ['targets' => $targets, 'groups' => $reviewgroups],
);
assert_assessment_quiz(
    !property_exists($publicsnapshot->quizzes->{'quiz-1'}, 'groupId'),
    'learner bootstrap Quiz snapshots must remain identity-free',
);
\mod_scaffold\local\json_schema_validator::validate_plugin_definition(
    'AssessmentLearnerSnapshot',
    $publicsnapshot,
    'publicAssessmentSnapshot',
);

$snapshot->quizzes->{'quiz-1'}->answerReviewAuthorized = false;
$legacyreviewstate = serialize($snapshot);
$legacyrevealed = $quiz->reveal_state(
    $snapshot,
    $reviewgroups,
    $attempt->attemptId,
    'quiz-1',
);
$legacyrevealedjson = json_encode($legacyrevealed, JSON_THROW_ON_ERROR);
assert_assessment_quiz(
    $legacyrevealed->answerReviewAuthorized
        && str_contains($legacyrevealedjson, '"expected"')
        && str_contains($legacyrevealedjson, 'Quiz item feedback sentinel'),
    'successful full-review reveal must authorize the public response for a terminal legacy attempt',
);
assert_assessment_quiz_same(
    $legacyreviewstate,
    serialize($snapshot),
    'state-only full-review reveal must not mutate stored authorization or grading detail',
);

$expiryquiz = new assessment_quiz(
    static fn(): string => '2026-07-17T13:00:00.000000Z',
);
$expirysnapshot = (object) [
    'snapshotVersion' => 1,
    'artifactId' => 'moodle-cm-42',
    'problems' => (object) [],
    'quizzes' => (object) [
        'quiz-due-one' => (object) [
            'attemptId' => 'attempt-due-one',
            'status' => 'in_progress',
            'currentTargetId' => 'question-1',
            'submittedTargetIds' => [],
            'startedAt' => '2026-07-17T12:00:00.000000Z',
            'finishedAt' => null,
            'expiresAt' => '2026-07-17T12:59:59.000000Z',
            'score' => null,
            'maxScore' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
        ],
        'quiz-due-two' => (object) [
            'attemptId' => 'attempt-due-two',
            'status' => 'in_progress',
            'currentTargetId' => 'question-2',
            'submittedTargetIds' => [],
            'startedAt' => '2026-07-17T12:00:00.000000Z',
            'finishedAt' => null,
            'expiresAt' => '2026-07-17T13:00:00.000000Z',
            'score' => null,
            'maxScore' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
        ],
        'quiz-future' => (object) [
            'attemptId' => 'attempt-future',
            'status' => 'in_progress',
            'currentTargetId' => 'question-1',
            'submittedTargetIds' => [],
            'startedAt' => '2026-07-17T12:00:00.000000Z',
            'finishedAt' => null,
            'expiresAt' => '2026-07-17T13:10:00.000000Z',
            'score' => null,
            'maxScore' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
        ],
    ],
];
$expirygroups = [
    assessment_quiz_group('after_each_answer', true, true, 'full_review', 'quiz-due-one'),
    assessment_quiz_group('after_quiz', false, true, 'result_only', 'quiz-due-two'),
    assessment_quiz_group('after_quiz', true, true, 'none', 'quiz-future'),
];
$expiredgroups = $expiryquiz->expire_due_state(
    $expirysnapshot,
    $expirygroups,
    '2026-07-17T13:00:00.000000Z',
);
assert_assessment_quiz_same(
    ['quiz-due-one', 'quiz-due-two'],
    $expiredgroups,
    'one expiry transition must finalize every due Quiz group',
);
assert_assessment_quiz_same('expired', $expirysnapshot->quizzes->{'quiz-due-one'}->status, 'first due Quiz must expire');
assert_assessment_quiz_same('expired', $expirysnapshot->quizzes->{'quiz-due-two'}->status, 'second due Quiz must expire');
assert_assessment_quiz_same('in_progress', $expirysnapshot->quizzes->{'quiz-future'}->status, 'future Quiz must remain active');
assert_assessment_quiz_same(
    '2026-07-17T13:00:00.000000Z',
    $expirysnapshot->quizzes->{'quiz-due-one'}->finishedAt,
    'server reconciliation time must own the terminal timestamp',
);
assert_assessment_quiz_same(
    [],
    $expiryquiz->expire_due_state($expirysnapshot, $expirygroups, '2026-07-17T13:00:01.000000Z'),
    'repeating expiry must be idempotent',
);
$expirysnapshot->quizzes->{'quiz-future'}->expiresAt = 'not-a-deadline';
try {
    $expiryquiz->expire_due_state($expirysnapshot, $expirygroups, '2026-07-17T13:00:01.000000Z');
    fail_assessment_quiz_test('invalid stored Quiz deadline must be rejected');
} catch (invalid_parameter_exception) {
}

$servicessource = file_get_contents(__DIR__ . '/../scaffold/db/services.php');
$portsource = file_get_contents(__DIR__ . '/../frontend/src/ports.ts');
foreach ([
    'mod_scaffold_start_quiz_attempt',
    'mod_scaffold_submit_quiz_question',
    'mod_scaffold_finish_quiz_attempt',
    'mod_scaffold_reveal_quiz_answers',
] as $operation) {
    assert_assessment_quiz(
        str_contains((string) $servicessource, $operation),
        'Moodle external service registry must expose ' . $operation,
    );
}
assert_assessment_quiz(
    str_contains((string) $portsource, 'quiz: {')
        && str_contains((string) $portsource, 'AssessmentQuizCommandOutcomeSchema.parse'),
    'Moodle frontend must implement and validate the Core Quiz port',
);

echo "assessment Quiz tests passed\n";
