<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

define('MOODLE_INTERNAL', true);

const GRADE_UPDATE_OK = 0;
const GRADE_UPDATE_FAILED = 1;
const GRADE_UPDATE_MULTIPLE = 2;
const GRADE_UPDATE_ITEM_LOCKED = 4;

if (!class_exists('invalid_parameter_exception')) {
    class invalid_parameter_exception extends Exception {
    }
}

function fail_grade_publisher_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_grade_publisher(bool $condition, string $message): void {
    if (!$condition) {
        fail_grade_publisher_test($message);
    }
}

function assert_grade_publisher_same(mixed $expected, mixed $actual, string $message): void {
    if ($expected !== $actual) {
        fail_grade_publisher_test(
            $message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true),
        );
    }
}

final class grade_publisher_state_repository {
    public bool $locked = false;
    public int $locks = 0;
    public stdClass $state;

    public function __construct() {
        $this->state = (object) [
            'snapshot' => (object) [
                'snapshotVersion' => 1,
                'artifactId' => 'moodle-cm-42',
                'problems' => (object) [],
                'quizzes' => (object) [],
            ],
            'changedAt' => '2026-07-18T10:00:00.000000Z',
            'stateRevision' => 7,
            'changed' => false,
        ];
    }

    public function with_learner_lock(int $scaffoldid, int $userid, callable $operation): mixed {
        assert_grade_publisher_same(7, $scaffoldid, 'publisher lock must use current activity identity');
        assert_grade_publisher_same(11, $userid, 'publisher lock must use learner identity');
        $this->locks++;
        $this->locked = true;
        try {
            return $operation();
        } finally {
            $this->locked = false;
        }
    }

    public function find_states_for_activity(int $scaffoldid, string $artifactid, ?int $userid = null): array {
        assert_grade_publisher($this->locked, 'publisher must reload assessment state after acquiring the learner lock');
        assert_grade_publisher_same('moodle-cm-42', $artifactid, 'publisher must load the current artifact identity');
        return [11 => unserialize(serialize($this->state))];
    }
}

final class grade_publisher_publication_repository {
    public ?stdClass $row;
    public int $claims = 0;
    public bool $rejectstatus = false;

    public function __construct(int $staterevision = 7, int $definitionversion = 2, int $retrycount = 0) {
        $this->row = (object) [
            'id' => 1,
            'scaffoldid' => 7,
            'userid' => 11,
            'staterevision' => $staterevision,
            'definitionversion' => $definitionversion,
            'status' => 'pending',
            'failurecode' => null,
            'retrycount' => $retrycount,
            'retryafter' => null,
            'timecreated' => 1,
            'timemodified' => 1,
        ];
    }

    public function get(int $scaffoldid, int $userid): ?stdClass {
        return $this->row === null ? null : clone $this->row;
    }

    public function claim(
        int $scaffoldid,
        int $userid,
        int $expectedstaterevision,
        int $expecteddefinitionversion,
    ): ?stdClass {
        if (!$this->matches($expectedstaterevision, $expecteddefinitionversion)) {
            return null;
        }
        $this->claims++;
        $this->row->status = 'pending';
        $this->row->failurecode = null;
        $this->row->retrycount++;
        $this->row->retryafter = null;
        return clone $this->row;
    }

    public function record_status(
        int $scaffoldid,
        int $userid,
        int $expectedstaterevision,
        int $expecteddefinitionversion,
        string $status,
        ?string $failurecode = null,
        ?int $retryafter = null,
    ): bool {
        if ($this->rejectstatus || !$this->matches($expectedstaterevision, $expecteddefinitionversion)) {
            return false;
        }
        $this->row->status = $status;
        $this->row->failurecode = $failurecode;
        $this->row->retryafter = $retryafter;
        return true;
    }

    private function matches(int $staterevision, int $definitionversion): bool {
        return $this->row !== null
            && $this->row->staterevision === $staterevision
            && $this->row->definitionversion === $definitionversion;
    }
}

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_grade_projector.php');
require_once(__DIR__ . '/../scaffold/classes/local/content_service.php');
require_once(__DIR__ . '/../scaffold/classes/local/grade_publisher.php');

use mod_scaffold\local\grade_publisher;

function grade_publisher_projection(?float $score): stdClass {
    return (object) [
        'normalizedScore' => $score,
        'activityStatus' => $score === null ? 'not_started' : 'completed',
        'gradingStatus' => $score === null ? 'not_ready' : 'graded',
        'changedAt' => '2026-07-18T10:00:00.000000Z',
    ];
}

function make_grade_publisher(
    grade_publisher_state_repository $states,
    grade_publisher_publication_repository $publications,
    callable $gradewriter,
    callable $conflictchecker,
    ?float $score = 0.5,
): grade_publisher {
    return new grade_publisher(
        $states,
        $publications,
        static function(int $scaffoldid) use ($states): stdClass {
            assert_grade_publisher($states->locked, 'publisher must reload activity content after acquiring the learner lock');
            return (object) [
                'id' => $scaffoldid,
                'course' => 3,
                'coursemodule' => 42,
                'name' => 'Current activity',
                'grade' => 20,
                'assessmentdefinitionversion' => 2,
                'gradeitemversion' => 2,
                'gradeitemstatus' => 'published',
            ];
        },
        $gradewriter,
        $conflictchecker,
        static fn(): int => 100,
        static function(stdClass $activity, stdClass $state) use ($states, $score): stdClass {
            assert_grade_publisher($states->locked, 'neutral projection must be rebuilt under the learner lock');
            assert_grade_publisher_same(7, $state->stateRevision, 'projection must use current canonical revision');
            return grade_publisher_projection($score);
        },
    );
}

$passedactivity = (object) ['id' => 7, 'grade' => 999];
$states = new grade_publisher_state_repository();
$publications = new grade_publisher_publication_repository();
$gradecalls = [];
$publisher = make_grade_publisher(
    $states,
    $publications,
    static function(stdClass $activity, array $grade) use (&$gradecalls): int {
        $gradecalls[] = [$activity->grade, $grade];
        return GRADE_UPDATE_OK;
    },
    static fn(stdClass $activity, int $userid): ?string => null,
);
$snapshotbefore = serialize($states->state->snapshot);
$outcome = $publisher->publish_user($passedactivity, 11);
assert_grade_publisher_same('published', $outcome->status, 'GRADE_UPDATE_OK must publish the exact source');
assert_grade_publisher_same([[20, ['userid' => 11, 'rawgrade' => 10.0]]], $gradecalls, 'publisher must scale through current grade maximum');
assert_grade_publisher_same('published', $publications->row->status, 'success must persist normalized publication status');
assert_grade_publisher_same(1, $publications->claims, 'numeric publication must claim one host attempt');
assert_grade_publisher_same(1, $states->locks, 'publisher must use one shared learner lock');
assert_grade_publisher_same($snapshotbefore, serialize($states->state->snapshot), 'publisher must never mutate assessment state');
assert_grade_publisher(!property_exists($publications->row, 'rawgrade'), 'publication row must not store raw grade');

foreach ([
    [GRADE_UPDATE_FAILED, 'failed', 'grade_update_failed', true, 160],
    [GRADE_UPDATE_MULTIPLE, 'configuration_error', 'multiple_grade_items', null, null],
    [GRADE_UPDATE_ITEM_LOCKED, 'locked', 'grade_item_locked', null, null],
    [99, 'failed', 'unknown_grade_update_status', false, null],
] as [$returnstatus, $expectedstatus, $expectedcode, $expectedretryable, $expectedretryafter]) {
    $states = new grade_publisher_state_repository();
    $publications = new grade_publisher_publication_repository();
    $publisher = make_grade_publisher(
        $states,
        $publications,
        static fn(stdClass $activity, array $grade): int => $returnstatus,
        static fn(stdClass $activity, int $userid): ?string => null,
    );
    $outcome = $publisher->publish_user($passedactivity, 11);
    assert_grade_publisher_same($expectedstatus, $outcome->status, $expectedcode . ' outcome status must be exact');
    assert_grade_publisher_same($expectedcode, $outcome->code, $expectedcode . ' must use a stable code');
    assert_grade_publisher_same($expectedstatus, $publications->row->status, $expectedcode . ' must persist exact status');
    assert_grade_publisher_same($expectedcode, $publications->row->failurecode, $expectedcode . ' must persist stable code only');
    assert_grade_publisher_same($expectedretryafter, $publications->row->retryafter, $expectedcode . ' retry timing must be exact');
    if ($expectedretryable !== null) {
        assert_grade_publisher_same($expectedretryable, $outcome->retryable, $expectedcode . ' retryability must be exact');
    }
}

$states = new grade_publisher_state_repository();
$publications = new grade_publisher_publication_repository();
$publisher = make_grade_publisher(
    $states,
    $publications,
    static function(): never {
        throw new RuntimeException('sensitive gradebook detail');
    },
    static fn(stdClass $activity, int $userid): ?string => null,
);
$outcome = $publisher->publish_user($passedactivity, 11);
assert_grade_publisher_same('failed', $outcome->status, 'Gradebook exception must be a failed publication');
assert_grade_publisher_same('grade_update_exception', $publications->row->failurecode, 'exception must store stable code');
assert_grade_publisher_same(160, $publications->row->retryafter, 'exception must remain automatically retryable');
assert_grade_publisher(
    !str_contains(json_encode($publications->row, JSON_THROW_ON_ERROR), 'sensitive'),
    'publication state must not persist exception or response detail',
);

foreach ([
    ['grade_item_locked', 'locked', 'grade_item_locked'],
    ['learner_grade_locked', 'locked', 'learner_grade_locked'],
    ['instructor_override', 'locked', 'instructor_override'],
    ['unexpected_conflict', 'configuration_error', 'gradebook_conflict'],
] as [$conflict, $expectedstatus, $expectedcode]) {
    $states = new grade_publisher_state_repository();
    $publications = new grade_publisher_publication_repository();
    $gradecalls = 0;
    $publisher = make_grade_publisher(
        $states,
        $publications,
        static function() use (&$gradecalls): int {
            $gradecalls++;
            return GRADE_UPDATE_OK;
        },
        static fn(stdClass $activity, int $userid): ?string => $conflict,
    );
    $outcome = $publisher->publish_user($passedactivity, 11);
    assert_grade_publisher_same(0, $gradecalls, $conflict . ' must prevent automatic overwrite');
    assert_grade_publisher_same($expectedstatus, $outcome->status, $conflict . ' outcome must require operator action');
    assert_grade_publisher_same($expectedcode, $publications->row->failurecode, $conflict . ' must store stable code');
}

$states = new grade_publisher_state_repository();
$publications = new grade_publisher_publication_repository();
$gradecalls = 0;
$publisher = make_grade_publisher(
    $states,
    $publications,
    static function() use (&$gradecalls): int {
        $gradecalls++;
        return GRADE_UPDATE_OK;
    },
    static fn(stdClass $activity, int $userid): ?string => null,
    null,
);
$outcome = $publisher->publish_user($passedactivity, 11);
assert_grade_publisher_same('not_applicable', $outcome->status, 'null projection must be a derived no-update outcome');
assert_grade_publisher_same(0, $gradecalls, 'null projection must never send a numeric update');
assert_grade_publisher_same(0, $publications->claims, 'null projection must not count as a host attempt');
assert_grade_publisher_same('published', $publications->row->status, 'null projection must leave no pending synchronized work');

foreach ([[6, 2], [7, 1]] as [$rowrevision, $rowversion]) {
    $states = new grade_publisher_state_repository();
    $publications = new grade_publisher_publication_repository($rowrevision, $rowversion);
    $gradecalls = 0;
    $publisher = make_grade_publisher(
        $states,
        $publications,
        static function() use (&$gradecalls): int {
            $gradecalls++;
            return GRADE_UPDATE_OK;
        },
        static fn(stdClass $activity, int $userid): ?string => null,
    );
    $outcome = $publisher->publish_user($passedactivity, 11);
    assert_grade_publisher_same('pending', $outcome->status, 'stale source identity must remain pending');
    assert_grade_publisher_same(0, $gradecalls, 'stale source identity must not reach Moodle');
}

$states = new grade_publisher_state_repository();
$publications = new grade_publisher_publication_repository();
$publications->rejectstatus = true;
$publisher = make_grade_publisher(
    $states,
    $publications,
    static fn(stdClass $activity, array $grade): int => GRADE_UPDATE_OK,
    static fn(stdClass $activity, int $userid): ?string => null,
);
$outcome = $publisher->publish_user($passedactivity, 11);
assert_grade_publisher_same('pending', $outcome->status, 'late success must not overwrite changed source identity');
assert_grade_publisher_same('pending', $publications->row->status, 'process death or rejected persistence must remain recoverable');

$states = new grade_publisher_state_repository();
$publications = new grade_publisher_publication_repository(7, 2, 2);
$publisher = make_grade_publisher(
    $states,
    $publications,
    static fn(stdClass $activity, array $grade): int => GRADE_UPDATE_FAILED,
    static fn(stdClass $activity, int $userid): ?string => null,
);
$outcome = $publisher->publish_user($passedactivity, 11);
assert_grade_publisher_same(340, $outcome->retryAfter, 'ordinary failures must use bounded exponential backoff');

fwrite(STDOUT, "grade publisher tests passed\n");
