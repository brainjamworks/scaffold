<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

define('MOODLE_INTERNAL', true);
define('GRADE_UPDATE_OK', 0);
define('GRADE_UPDATE_FAILED', 1);
define('GRADE_UPDATE_MULTIPLE', 2);
define('GRADE_UPDATE_ITEM_LOCKED', 4);
define('MUST_EXIST', 2);

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

if (!class_exists('dml_write_exception')) {
    class dml_write_exception extends Exception {
    }
}

function fail_assessment_state_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_assessment_state(bool $condition, string $message): void {
    if (!$condition) {
        fail_assessment_state_test($message);
    }
}

function expect_assessment_state_rejected(callable $operation, string $message): void {
    try {
        $operation();
        fail_assessment_state_test($message);
    } catch (invalid_parameter_exception) {
    }
}

function assessment_state_snapshot(string $artifactid): stdClass {
    return json_decode(json_encode([
        'snapshotVersion' => 1,
        'artifactId' => $artifactid,
        'problems' => (object) [],
        'quizzes' => (object) [],
    ], JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
}

class assessment_state_test_lock {
    public bool $released = false;

    public function release(): void {
        $this->released = true;
    }
}

class assessment_state_test_lock_factory {
    public array $resources = [];
    public array $locks = [];

    public function get_lock(string $resource, int $timeout): assessment_state_test_lock|false {
        $this->resources[] = [$resource, $timeout];
        $lock = new assessment_state_test_lock();
        $this->locks[] = $lock;
        return $lock;
    }
}

class assessment_state_test_transaction {
    public function __construct(private assessment_state_test_database $database) {
    }

    public function allow_commit(): void {
        $this->database->commit_transaction();
    }

    public function rollback(Throwable $exception): never {
        $this->database->rollback_transaction();
        throw $exception;
    }
}

class assessment_state_test_database {
    public int $transactions = 0;
    public int $commits = 0;
    public int $rollbacks = 0;
    public int $inserts = 0;
    public int $updates = 0;
    public bool $collideonnextinsert = false;
    private int $nextid = 1;
    private array $records = [
        'scaffold_assessment_state' => [],
        'scaffold_grade_publications' => [],
    ];
    private ?array $transactionrecords = null;
    private ?stdClass $collisionrecord = null;

    public function seed(stdClass $record): void {
        $copy = clone $record;
        $copy->id ??= $this->nextid++;
        $this->nextid = max($this->nextid, ((int) $copy->id) + 1);
        $this->records['scaffold_assessment_state'][(int) $copy->id] = $copy;
    }

    public function start_delegated_transaction(): assessment_state_test_transaction {
        assert_assessment_state($this->transactionrecords === null, 'test database does not support nested transactions');
        $this->transactions++;
        $this->transactionrecords = $this->clone_records($this->records);
        return new assessment_state_test_transaction($this);
    }

    public function get_record(string $table, array $conditions): stdClass|false {
        if ($table === 'scaffold') {
            global $scaffold, $quizscaffold;
            foreach ([$scaffold ?? null, $quizscaffold ?? null] as $activity) {
                if ($activity instanceof stdClass && $this->matches($activity, $conditions)) {
                    return clone $activity;
                }
            }
            return false;
        }
        assert_assessment_state(
            in_array($table, ['scaffold_assessment_state', 'scaffold_grade_publications'], true),
            'repository must use owned learner-state tables',
        );
        foreach ($this->active_records()[$table] ?? [] as $record) {
            if ($this->matches($record, $conditions)) {
                return clone $record;
            }
        }
        return false;
    }

    public function get_records(string $table, array $conditions): array {
        assert_assessment_state(
            in_array($table, ['scaffold_assessment_state', 'scaffold_grade_publications'], true),
            'repository list must use owned learner-state tables',
        );
        $found = [];
        foreach ($this->active_records()[$table] ?? [] as $record) {
            if ($this->matches($record, $conditions)) {
                $found[(int) $record->id] = clone $record;
            }
        }
        return $found;
    }

    public function insert_record(string $table, stdClass $record): int {
        assert_assessment_state(
            in_array($table, ['scaffold_assessment_state', 'scaffold_grade_publications'], true),
            'repository insert must use owned learner-state tables',
        );
        $this->inserts++;
        $copy = clone $record;
        $copy->id = $this->nextid++;
        if ($table === 'scaffold_assessment_state' && $this->collideonnextinsert) {
            $this->collideonnextinsert = false;
            $this->collisionrecord = clone $copy;
            throw new dml_write_exception('simulated concurrent insert');
        }
        $this->transactionrecords[$table][(int) $copy->id] = $copy;
        return (int) $copy->id;
    }

    public function update_record(string $table, stdClass $record): void {
        assert_assessment_state(
            in_array($table, ['scaffold_assessment_state', 'scaffold_grade_publications'], true),
            'repository update must use owned learner-state tables',
        );
        $this->updates++;
        $target = $this->transactionrecords === null ? $this->records : $this->transactionrecords;
        $existing = $target[$table][(int) $record->id] ?? null;
        assert_assessment_state($existing instanceof stdClass, 'repository update must target an existing row');
        $target[$table][(int) $record->id] = (object) array_merge(
            (array) $existing,
            (array) $record,
        );
        if ($this->transactionrecords === null) {
            $this->records = $target;
        } else {
            $this->transactionrecords = $target;
        }
    }

    public function set_field(string $table, string $field, mixed $value, array $conditions): bool {
        assert_assessment_state($table === 'scaffold_assessment_state', 'repository field update must use the assessment-state table');
        foreach ($this->records[$table] as $id => $record) {
            if ($this->matches($record, $conditions)) {
                $copy = clone $record;
                $copy->{$field} = $value;
                $this->records[$table][$id] = $copy;
                return true;
            }
        }
        return false;
    }

    public function commit_transaction(): void {
        assert_assessment_state($this->transactionrecords !== null, 'commit requires an active transaction');
        $this->records = $this->clone_records($this->transactionrecords);
        $this->transactionrecords = null;
        $this->commits++;
    }

    public function rollback_transaction(): void {
        assert_assessment_state($this->transactionrecords !== null, 'rollback requires an active transaction');
        $this->transactionrecords = null;
        if ($this->collisionrecord) {
            $this->records['scaffold_assessment_state'][(int) $this->collisionrecord->id] =
                clone $this->collisionrecord;
            $this->collisionrecord = null;
        }
        $this->rollbacks++;
    }

    public function rows(): array {
        return $this->clone_records($this->records['scaffold_assessment_state']);
    }

    public function publication_rows(): array {
        return $this->clone_records($this->records['scaffold_grade_publications']);
    }

    public function get_field(string $table, string $field, array $conditions, int $strictness = 0): mixed {
        if ($table === 'scaffold' && $field === 'assessmentdefinitionversion') {
            return 1;
        }
        $record = $this->get_record($table, $conditions);
        return $record ? $record->{$field} : false;
    }

    public function is_in_transaction(): bool {
        return $this->transactionrecords !== null;
    }

    private function active_records(): array {
        return $this->transactionrecords ?? $this->records;
    }

    private function clone_records(array $records): array {
        $cloned = [];
        foreach ($records as $key => $value) {
            $cloned[$key] = $value instanceof stdClass ? clone $value : $this->clone_records($value);
        }
        return $cloned;
    }

    private function matches(stdClass $record, array $conditions): bool {
        foreach ($conditions as $field => $value) {
            if (($record->{$field} ?? null) != $value) {
                return false;
            }
        }
        return true;
    }
}

class assessment_state_test_publications {
    public array $staged = [];
    public bool $fail = false;

    public function __construct(private assessment_state_test_database $database) {
    }

    public function upsert_pending(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
    ): stdClass {
        assert_assessment_state(
            $this->database->is_in_transaction(),
            'publication staging must share the assessment-state DML transaction',
        );
        if ($this->fail) {
            throw new RuntimeException('simulated publication staging failure');
        }
        $this->staged[] = [$scaffoldid, $userid, $staterevision, $definitionversion];
        return (object) ['status' => 'pending'];
    }
}

$installxml = file_get_contents(__DIR__ . '/../scaffold/db/install.xml');
assert_assessment_state($installxml !== false, 'install.xml must be readable');
assert_assessment_state(str_contains($installxml, 'TABLE NAME="scaffold_assessment_state"'), 'clean install must create assessment state');
assert_assessment_state(!str_contains($installxml, 'scaffold_responses'), 'clean install must omit obsolete response rows');
foreach (['snapshotjson', 'staterevision', 'nextquizexpiry', 'timecreated', 'timemodified'] as $field) {
    assert_assessment_state(str_contains($installxml, 'FIELD NAME="' . $field . '"'), 'clean install must define ' . $field);
}
assert_assessment_state(
    !str_contains($installxml, 'FIELD NAME="grade' . 'deliveryjson"'),
    'clean install must omit embedded grade publication state',
);
assert_assessment_state(
    str_contains($installxml, 'INDEX NAME="scaffolduser" UNIQUE="true" FIELDS="scaffoldid, userid"'),
    'clean install must enforce one assessment-state row per activity and learner',
);
assert_assessment_state(
    str_contains($installxml, 'INDEX NAME="nextquizexpiry" UNIQUE="false" FIELDS="nextquizexpiry"'),
    'clean install must index the next Quiz expiry',
);
assert_assessment_state(
    str_contains($installxml, 'TABLE NAME="scaffold_grade_publications"'),
    'clean install must create normalized grade publication state',
);
foreach ([
    'assessmentdefinitionversion',
    'gradeitemversion',
    'gradeitemstatus',
    'gradeitemfailurecode',
    'gradeitemretrycount',
    'gradeitemretryafter',
    'gradeitemtimemodified',
] as $field) {
    assert_assessment_state(
        str_contains($installxml, 'FIELD NAME="' . $field . '"'),
        'clean install must define activity grade metadata field ' . $field,
    );
}
assert_assessment_state(
    !str_contains($installxml, 'FIELD NAME="rawgrade"'),
    'publication state must not store authoritative raw grade',
);

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/grade_publication_repository.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_state_repository.php');

use mod_scaffold\local\assessment_state_repository;

$database = new assessment_state_test_database();
$locks = new assessment_state_test_lock_factory();
$repository = new assessment_state_repository($database, $locks);

$emptystate = $repository->get_or_create_state(7, 11, 'moodle-cm-42');
$empty = $emptystate->snapshot;
assert_assessment_state($empty == assessment_state_snapshot('moodle-cm-42'), 'first read must return a strict empty snapshot');
assert_assessment_state($emptystate->stateRevision === 0, 'newly hydrated state must begin at revision zero');
assert_assessment_state($emptystate->changed === false, 'hydration must not count as a logical state change');
assert_assessment_state(count($database->rows()) === 1, 'first read must create exactly one row');
$emptyrow = array_values($database->rows())[0];
assert_assessment_state($emptyrow->staterevision === 0, 'new row must persist revision zero');
assert_assessment_state($emptyrow->nextquizexpiry === null, 'empty state must not project a Quiz deadline');
assert_assessment_state($database->commits === 1, 'first read must commit atomically');
assert_assessment_state($locks->resources === [['activity:7:learner:11', 10]], 'repository must lock the activity and learner identity');
assert_assessment_state($locks->locks[0]->released, 'repository must release the lock after a successful read');

$same = $repository->get_or_create(7, 11, 'moodle-cm-42');
assert_assessment_state($same == $empty, 'existing v1 read must preserve the canonical snapshot');
assert_assessment_state(count($database->rows()) === 1, 'repeated read must not insert a duplicate row');

$repository->get_or_create(7, 12, 'moodle-cm-42');
$repository->get_or_create(8, 11, 'moodle-cm-73');
assert_assessment_state(count($database->rows()) === 3, 'two users and two activities must have independent rows');

$existingdatabase = new assessment_state_test_database();
$existing = assessment_state_snapshot('moodle-cm-42');
$existing->problems->{'target-one'} = (object) [
    'response' => (object) ['kind' => 'single-select', 'optionId' => 'option-a'],
    'submitted' => true,
    'attemptNumber' => 1,
    'hintsShown' => 2,
    'checkResult' => null,
    'submissionResult' => (object) [
        'isCorrect' => true,
        'score' => 1,
        'maxScore' => 1,
        'feedback' => null,
        'items' => (object) [],
    ],
];
$existingdatabase->seed((object) [
    'scaffoldid' => 7,
    'userid' => 11,
    'snapshotjson' => json_encode($existing, JSON_THROW_ON_ERROR),
    'timecreated' => 1,
    'timemodified' => 1,
]);
$existingrepository = new assessment_state_repository($existingdatabase, new assessment_state_test_lock_factory());
assert_assessment_state($existingrepository->get_or_create(7, 11, 'moodle-cm-42') == $existing, 'existing valid v1 state must round-trip');

foreach ([
    '{bad json',
    json_encode((object) array_merge((array) assessment_state_snapshot('moodle-cm-42'), ['snapshotVersion' => 2]), JSON_THROW_ON_ERROR),
    json_encode(assessment_state_snapshot('moodle-cm-99'), JSON_THROW_ON_ERROR),
] as $index => $invalidjson) {
    $invaliddatabase = new assessment_state_test_database();
    $invaliddatabase->seed((object) [
        'scaffoldid' => 7,
        'userid' => 11,
        'snapshotjson' => $invalidjson,
        'timecreated' => 1,
        'timemodified' => 1,
    ]);
    $invalidrepository = new assessment_state_repository($invaliddatabase, new assessment_state_test_lock_factory());
    expect_assessment_state_rejected(
        static fn() => $invalidrepository->get_or_create(7, 11, 'moodle-cm-42'),
        'strict read must reject malformed, future, or foreign snapshot case ' . $index,
    );
}

$collisiondatabase = new assessment_state_test_database();
$collisiondatabase->collideonnextinsert = true;
$collisionlocks = new assessment_state_test_lock_factory();
$collisionrepository = new assessment_state_repository($collisiondatabase, $collisionlocks);
$collision = $collisionrepository->get_or_create(7, 11, 'moodle-cm-42');
assert_assessment_state($collision == assessment_state_snapshot('moodle-cm-42'), 'concurrent insert retry must return the winning valid row');
assert_assessment_state($collisiondatabase->rollbacks === 1, 'concurrent insert failure must roll back its transaction');
assert_assessment_state($collisiondatabase->commits === 1, 'concurrent insert retry must commit a fresh transaction');
assert_assessment_state(count($collisiondatabase->rows()) === 1, 'concurrent insert retry must preserve one unique row');
assert_assessment_state($collisionlocks->locks[0]->released, 'concurrent insert retry must release its lock');

$mutationdatabase = new assessment_state_test_database();
$mutationlocks = new assessment_state_test_lock_factory();
$mutationrepository = new assessment_state_repository($mutationdatabase, $mutationlocks);
$mutationrepository->get_or_create(7, 11, 'moodle-cm-42');
$before = serialize($mutationdatabase->rows());
try {
    $mutationrepository->mutate(7, 11, 'moodle-cm-42', static function(stdClass $snapshot): stdClass {
        $snapshot->problems->{'target-one'} = (object) ['revealedAnswer' => (object) []];
        throw new RuntimeException('simulated mutation failure');
    });
    fail_assessment_state_test('failed mutation must escape the repository');
} catch (RuntimeException $exception) {
    assert_assessment_state($exception->getMessage() === 'simulated mutation failure', 'mutation must preserve the original failure');
}
assert_assessment_state(serialize($mutationdatabase->rows()) === $before, 'failed mutation must not partially update the snapshot');
assert_assessment_state($mutationdatabase->rollbacks === 1, 'failed mutation must roll back');
assert_assessment_state($mutationlocks->locks[1]->released, 'failed mutation must release its lock');

expect_assessment_state_rejected(
    static fn() => $mutationrepository->mutate(7, 11, 'moodle-cm-42', static function(stdClass $snapshot): stdClass {
        $snapshot->problems->{'target-one'} = (object) [
            'response' => null,
            'submitted' => false,
            'attemptNumber' => 0,
            'hintsShown' => 0,
            'checkResult' => null,
            'submissionResult' => null,
            'revealedAnswer' => (object) [],
        ];
        return $snapshot;
    }),
    'strict snapshot writes must reject revealed-answer persistence',
);
assert_assessment_state(serialize($mutationdatabase->rows()) === $before, 'revealed-answer rejection must preserve stored state');

expect_assessment_state_rejected(
    static fn() => $mutationrepository->mutate(7, 11, 'moodle-cm-42', static function(stdClass $snapshot): stdClass {
        $snapshot->quizzes->{'quiz-one'} = (object) [
            'attemptId' => 'attempt-one',
            'groupId' => 'quiz-one',
            'status' => 'in_progress',
            'currentTargetId' => null,
            'submittedTargetIds' => [],
            'startedAt' => null,
            'finishedAt' => null,
            'expiresAt' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
            'score' => null,
            'maxScore' => null,
        ];
        return $snapshot;
    }),
    'Quiz snapshot identity must come from its record key and reject nested groupId',
);
assert_assessment_state(serialize($mutationdatabase->rows()) === $before, 'invalid Quiz mutation must not change stored state');

$orderedchangedatabase = new assessment_state_test_database();
$orderedchangedatabase->seed((object) [
    'scaffoldid' => 90,
    'userid' => 91,
    'snapshotjson' => json_encode(assessment_state_snapshot('moodle-cm-92'), JSON_THROW_ON_ERROR),
    'timecreated' => 4102444800,
    'timemodified' => 4102444800,
]);
$orderedrepository = new assessment_state_repository(
    $orderedchangedatabase,
    new assessment_state_test_lock_factory(),
);
$changedats = [];
for ($index = 0; $index < 2; $index++) {
    $orderedrepository->mutate(
        90,
        91,
        'moodle-cm-92',
        static function(stdClass $snapshot, string $changedat) use (&$changedats, $index): stdClass {
            $changedats[] = $changedat;
            $snapshot->problems->{'target-' . $index} = (object) [
                'response' => null,
                'submitted' => false,
                'attemptNumber' => 0,
                'hintsShown' => 0,
                'checkResult' => null,
                'submissionResult' => null,
            ];
            return $snapshot;
        },
    );
}
assert_assessment_state(
    $changedats === ['2100-01-01T00:00:01.000000Z', '2100-01-01T00:00:02.000000Z'],
    'successive logical projections must receive strictly ordered row modification times',
);
$orderedrow = array_values($orderedchangedatabase->rows())[0];
assert_assessment_state(
    $orderedrow->timemodified === 4102444802,
    'repository must persist the strictly advanced modification time used by changedAt',
);
$orderedbefore = serialize($orderedchangedatabase->rows());
$noopchangedat = null;
$orderedrepository->mutate(
    90,
    91,
    'moodle-cm-92',
    static function(stdClass $snapshot, string $changedat) use (&$noopchangedat): stdClass {
        $noopchangedat = $changedat;
        return $snapshot;
    },
);
assert_assessment_state(
    serialize($orderedchangedatabase->rows()) === $orderedbefore,
    'logically unchanged mutations must not rewrite the snapshot or advance its projection identity',
);
assert_assessment_state(
    $noopchangedat === '2100-01-01T00:00:03.000000Z',
    'mutation callbacks may inspect a candidate change time without committing it',
);
$orderedstate = $orderedrepository->get_or_create_state(90, 91, 'moodle-cm-92');
assert_assessment_state($orderedstate->stateRevision === 3, 'each logical mutation must advance one revision');
assert_assessment_state($orderedstate->changed === false, 'read state must report no logical change');

$deadlinechange = $orderedrepository->mutate_state(
    90,
    91,
    'moodle-cm-92',
    static function(stdClass $snapshot): stdClass {
        $snapshot->quizzes->{'quiz-one'} = (object) [
            'attemptId' => 'attempt-one',
            'status' => 'in_progress',
            'currentTargetId' => null,
            'submittedTargetIds' => [],
            'startedAt' => '2100-01-01T00:00:00.000Z',
            'finishedAt' => null,
            'expiresAt' => '2100-01-01T00:10:00.000Z',
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
            'score' => null,
            'maxScore' => null,
        ];
        $snapshot->quizzes->{'quiz-later'} = (object) [
            'attemptId' => 'attempt-later',
            'status' => 'in_progress',
            'currentTargetId' => null,
            'submittedTargetIds' => [],
            'startedAt' => '2100-01-01T00:00:00.000Z',
            'finishedAt' => null,
            'expiresAt' => '2100-01-01T00:20:00.000Z',
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
            'score' => null,
            'maxScore' => null,
        ];
        return $snapshot;
    },
);
assert_assessment_state($deadlinechange->changed === true, 'deadline mutation must report a logical change');
assert_assessment_state($deadlinechange->stateRevision === 4, 'deadline mutation must advance one revision');
$deadlinerow = array_values($orderedchangedatabase->rows())[0];
assert_assessment_state($deadlinerow->nextquizexpiry === 4102445400, 'repository must project the earliest Quiz deadline');

$nodeadlinechange = $orderedrepository->mutate_state(
    90,
    91,
    'moodle-cm-92',
    static function(stdClass $snapshot): stdClass {
        $snapshot->quizzes->{'quiz-one'}->status = 'expired';
        $snapshot->quizzes->{'quiz-one'}->finishedAt = '2100-01-01T00:10:00.000Z';
        $snapshot->quizzes->{'quiz-later'}->status = 'completed';
        $snapshot->quizzes->{'quiz-later'}->finishedAt = '2100-01-01T00:11:00.000Z';
        return $snapshot;
    },
);
assert_assessment_state($nodeadlinechange->changed === true, 'terminal Quiz mutation must report a logical change');
$nodeadlinerow = array_values($orderedchangedatabase->rows())[0];
assert_assessment_state($nodeadlinerow->nextquizexpiry === null, 'terminal Quizzes must clear the projected deadline');

$invaliddeadlinebefore = serialize($orderedchangedatabase->rows());
expect_assessment_state_rejected(
    static fn() => $orderedrepository->mutate_state(
        90,
        91,
        'moodle-cm-92',
        static function(stdClass $snapshot): stdClass {
            $snapshot->quizzes->{'quiz-one'}->status = 'in_progress';
            $snapshot->quizzes->{'quiz-one'}->finishedAt = null;
            $snapshot->quizzes->{'quiz-one'}->expiresAt = 'not-a-deadline';
            return $snapshot;
        },
    ),
    'invalid stored Quiz deadline must be rejected',
);
assert_assessment_state(
    serialize($orderedchangedatabase->rows()) === $invaliddeadlinebefore,
    'invalid deadline mutation must roll back without changing revision or grade identity',
);

$atomicdatabase = new assessment_state_test_database();
$atomicpublications = new assessment_state_test_publications($atomicdatabase);
$atomicrepository = new assessment_state_repository(
    $atomicdatabase,
    new assessment_state_test_lock_factory(),
    $atomicpublications,
    static fn(int $scaffoldid): int => 4,
);
$atomicstate = $atomicrepository->mutate_with_grade_publication_state(
    7,
    11,
    'moodle-cm-42',
    static function(stdClass $snapshot): stdClass {
        $snapshot->problems->{'target-one'} = (object) [
            'response' => null,
            'submitted' => false,
            'attemptNumber' => 0,
            'hintsShown' => 0,
            'checkResult' => null,
            'submissionResult' => null,
        ];
        return $snapshot;
    },
);
assert_assessment_state($atomicstate->stateRevision === 1, 'graded mutation must advance source revision');
assert_assessment_state(
    $atomicpublications->staged === [[7, 11, 1, 4]],
    'graded mutation must stage current revision and definition identity',
);
$atomicbefore = serialize($atomicdatabase->rows());
$atomicpublications->fail = true;
try {
    $atomicrepository->mutate_with_grade_publication_state(
        7,
        11,
        'moodle-cm-42',
        static function(stdClass $snapshot): stdClass {
            $snapshot->problems->{'target-two'} = (object) [
                'response' => null,
                'submitted' => false,
                'attemptNumber' => 0,
                'hintsShown' => 0,
                'checkResult' => null,
                'submissionResult' => null,
            ];
            return $snapshot;
        },
    );
    fail_assessment_state_test('publication staging failure must escape the transaction');
} catch (RuntimeException $exception) {
    assert_assessment_state(
        $exception->getMessage() === 'simulated publication staging failure',
        'publication staging failure must remain visible',
    );
}
assert_assessment_state(
    serialize($atomicdatabase->rows()) === $atomicbefore,
    'publication staging failure must roll back the assessment change',
);

if (!class_exists('core\\lock\\lock_config')) {
    eval(<<<'PHP'
namespace core\lock;
class lock_config {
    public static $factory;
    public static function get_lock_factory(string $type) {
        if ($type !== 'mod_scaffold_assessment_state') {
            throw new \RuntimeException('unexpected lock type');
        }
        return self::$factory;
    }
}
PHP);
}
if (!class_exists('core_course\\cm_info')) {
    eval(<<<'PHP'
namespace core_course;
class cm_info {
    public int $id;
}
PHP);
}
if (!class_exists('cm_info')) {
    class_alias(\core_course\cm_info::class, 'cm_info');
}
if (!class_exists('context_module')) {
    class context_module {
    }
}

function assessment_state_target(string $targetid = 'question-1', float $points = 1.0): array {
    return [
        'schemaVersion' => 1,
        'targetId' => $targetid,
        'blockId' => 'block-' . $targetid,
        'blockType' => 'mcq',
        'interaction' => [
            'kind' => 'single-select',
            'options' => [['id' => 'option-a'], ['id' => 'option-b']],
        ],
        'assessment' => [
            'kind' => 'single-select',
            'correctOptionId' => 'option-b',
            'feedbackByOptionId' => [
                'option-a' => assessment_state_feedback('Service item feedback sentinel'),
            ],
            'summaryFeedback' => assessment_state_feedback('Service summary feedback sentinel'),
        ],
        'settings' => [
            'feedbackMode' => 'on_submit',
            'isGraded' => true,
            'showAnswer' => true,
            'points' => $points,
            'maxAttempts' => 1,
        ],
    ];
}

function assessment_state_feedback(string $text): array {
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

function assessment_state_quiz_group(
    string $reviewtiming,
    string $reviewdetail = 'full_review',
): array {
    return [
        'schemaVersion' => 1,
        'kind' => 'quiz',
        'groupId' => 'quiz-1',
        'targetIds' => ['question-1'],
        'settings' => [
            'allowBacktracking' => false,
            'reviewTiming' => $reviewtiming,
            'reviewDetail' => $reviewdetail,
            'attemptsPerQuestion' => 1,
            'isGraded' => true,
            'timer' => [
                'enabled' => false,
                'durationSeconds' => 0,
            ],
        ],
    ];
}

function assessment_state_learner_content(string $targetid, int $hintcount): string {
    $hints = [];
    for ($index = 0; $index < $hintcount; $index++) {
        $hints[] = [
            'type' => 'assessment_hint',
            'content' => [['type' => 'paragraph']],
        ];
    }
    return json_encode([
        'type' => 'doc',
        'content' => [[
            'type' => 'courseDocument',
            'content' => [[
                'type' => 'surface',
                'content' => [[
                    'type' => 'mcq',
                    'attrs' => ['id' => $targetid],
                    'content' => [[
                        'type' => 'assessment_actions_group',
                        'content' => [[
                            'type' => 'assessment_hints_group',
                            'content' => $hints,
                        ]],
                    ]],
                ]],
            ]],
        ]],
    ], JSON_THROW_ON_ERROR);
}

$plugindir = sys_get_temp_dir() . '/scaffold-assessment-state-' . getmypid();
$pluginlibdir = $plugindir . '/mod/scaffold';
if (!is_dir($pluginlibdir) && !mkdir($pluginlibdir, 0777, true) && !is_dir($pluginlibdir)) {
    fail_assessment_state_test('could not create temporary Moodle plugin fixture');
}
$pluginlib = <<<'PHP'
<?php
function scaffold_grade_item_update(stdClass $scaffold, $grades = null): int {
    global $DB, $assessment_state_grade_calls;
    if ($DB->is_in_transaction()) {
        throw new RuntimeException('Gradebook call occurred inside learner-state transaction');
    }
    $assessment_state_grade_calls[] = $grades;
    return 0;
}
function scaffold_grade_publication_conflict(stdClass $scaffold, int $userid): ?string {
    return null;
}
function scaffold_update_completion(stdClass $scaffold, \core_course\cm_info $cm, int $userid): void {
    global $DB, $assessment_state_completion_calls;
    if ($DB->is_in_transaction()) {
        throw new RuntimeException('Completion update occurred inside learner-state transaction');
    }
    $assessment_state_completion_calls[] = [$scaffold->id, $cm->id, $userid];
    throw new RuntimeException('simulated Moodle completion failure');
}
PHP;
if (file_put_contents($pluginlibdir . '/lib.php', $pluginlib) === false) {
    fail_assessment_state_test('could not create temporary Moodle plugin library fixture');
}

$CFG = (object) ['dirroot' => $plugindir];
$assessment_state_grade_calls = [];
$assessment_state_completion_calls = [];
$DB = new assessment_state_test_database();
$requestlocks = new assessment_state_test_lock_factory();
\core\lock\lock_config::$factory = $requestlocks;

require_once(__DIR__ . '/../scaffold/classes/local/assessment_target_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_group_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/activity_scope.php');
require_once(__DIR__ . '/../scaffold/classes/local/artifact_identity.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_projection.php');
require_once(__DIR__ . '/../scaffold/classes/local/grader.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_grade_projector.php');
require_once(__DIR__ . '/../scaffold/classes/local/grade_publisher.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_quiz.php');
require_once(__DIR__ . '/../scaffold/classes/local/content_service.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_service.php');

function assessment_state_scope(stdClass $scaffold, \core_course\cm_info $cm, int $userid): \mod_scaffold\local\activity_scope {
    return new \mod_scaffold\local\activity_scope(
        (object) ['id' => $scaffold->course],
        $cm,
        new context_module(),
        $scaffold,
        $userid,
        'mod/scaffold:submit',
    );
}

function assessment_state_view_scope(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
): \mod_scaffold\local\activity_scope {
    return new \mod_scaffold\local\activity_scope(
        (object) ['id' => $scaffold->course],
        $cm,
        new context_module(),
        $scaffold,
        $userid,
        'mod/scaffold:view',
    );
}

function assessment_state_current_attempt(stdClass $scaffold, int $cmid, int $userid, string $targetid): int {
    $states = (new \mod_scaffold\local\assessment_state_repository())->find_states_for_activity(
        (int) $scaffold->id,
        \mod_scaffold\local\artifact_identity::for_course_module($cmid),
        $userid,
    );
    $problem = isset($states[$userid]) && property_exists($states[$userid]->snapshot->problems, $targetid)
        ? $states[$userid]->snapshot->problems->{$targetid}
        : null;
    return $problem instanceof stdClass ? (int) $problem->attemptNumber : 0;
}

function assessment_state_reveal_answer(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $problemid,
    string $targetid,
    string $interactionkind,
): array {
    return (new \mod_scaffold\local\assessment_service())->reveal_answer(
        assessment_state_view_scope($scaffold, $cm, $userid),
        $problemid,
        $targetid,
        $interactionkind,
    );
}

function assessment_state_reveal_hint(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $problemid,
    string $targetid,
    string $interactionkind,
    int $hintsshown,
): int {
    $result = (new \mod_scaffold\local\assessment_service())->reveal_hint(
        assessment_state_scope($scaffold, $cm, $userid),
        $problemid,
        $targetid,
        $interactionkind,
        $hintsshown,
    );
    return (int) $result['outcome']->problem->hintsShown;
}

function assessment_state_load_snapshot(stdClass $scaffold, int $cmid, int $userid): stdClass {
    return (new \mod_scaffold\local\assessment_state_repository())->get_or_create(
        (int) $scaffold->id,
        $userid,
        \mod_scaffold\local\artifact_identity::for_course_module($cmid),
    );
}

function assessment_state_grade_request(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $problemid,
    string $targetid,
    string $interactionkind,
    string $responsejson,
    string $action,
    ?int $expectedattemptnumber = null,
): array {
    $problem = assessment_state_problem_request(
        $scaffold,
        $cm,
        $userid,
        $problemid,
        $targetid,
        $interactionkind,
        $responsejson,
        $action,
        $expectedattemptnumber,
    );
    $canonicalresult = $action === 'check' ? $problem->checkResult : $problem->submissionResult;
    return $canonicalresult instanceof stdClass ? get_object_vars($canonicalresult) : [];
}

function assessment_state_problem_request(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $problemid,
    string $targetid,
    string $interactionkind,
    string $responsejson,
    string $action,
    ?int $expectedattemptnumber = null,
): stdClass {
    $expectedattemptnumber ??= assessment_state_current_attempt($scaffold, (int) $cm->id, $userid, $targetid);
    $service = new \mod_scaffold\local\assessment_service();
    $response = \mod_scaffold\local\content_service::read_json_object($responsejson, []);
    $result = $action === 'check'
        ? $service->check(
            assessment_state_scope($scaffold, $cm, $userid),
            $problemid,
            $targetid,
            $interactionkind,
            $response,
            $expectedattemptnumber,
        )
        : $service->submit(
            assessment_state_scope($scaffold, $cm, $userid),
            $problemid,
            $targetid,
            $interactionkind,
            $response,
            $expectedattemptnumber,
        );
    return $result['outcome']->problem;
}

function assessment_state_start_quiz(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $groupid,
): stdClass {
    return assessment_state_start_quiz_result($scaffold, $cm, $userid, $groupid)['outcome']->quizAttempt;
}

function assessment_state_start_quiz_result(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $groupid,
): array {
    return (new \mod_scaffold\local\assessment_service())
        ->start_quiz(assessment_state_scope($scaffold, $cm, $userid), $groupid);
}

function assessment_state_submit_quiz_question(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $attemptid,
    string $groupid,
    string $targetid,
    string $responsejson,
    ?int $expectedattemptnumber = null,
): stdClass {
    $expectedattemptnumber ??= assessment_state_current_attempt($scaffold, (int) $cm->id, $userid, $targetid);
    return assessment_state_submit_quiz_question_result(
        $scaffold,
        $cm,
        $userid,
        $attemptid,
        $groupid,
        $targetid,
        $responsejson,
        $expectedattemptnumber,
    )['outcome']->quizAttempt;
}

function assessment_state_submit_quiz_question_result(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $attemptid,
    string $groupid,
    string $targetid,
    string $responsejson,
    int $expectedattemptnumber,
): array {
    return (new \mod_scaffold\local\assessment_service())->submit_quiz_question(
        assessment_state_scope($scaffold, $cm, $userid),
        $attemptid,
        $groupid,
        $targetid,
        \mod_scaffold\local\content_service::read_json_object($responsejson, []),
        $expectedattemptnumber,
    );
}

function assessment_state_finish_quiz(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $attemptid,
    string $groupid,
    string $responsesjson,
): stdClass {
    return assessment_state_finish_quiz_outcome(
        $scaffold,
        $cm,
        $userid,
        $attemptid,
        $groupid,
        $responsesjson,
    )->quizAttempt;
}

function assessment_state_finish_quiz_outcome(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $attemptid,
    string $groupid,
    string $responsesjson,
): stdClass {
    return assessment_state_finish_quiz_result(
        $scaffold,
        $cm,
        $userid,
        $attemptid,
        $groupid,
        $responsesjson,
    )['outcome'];
}

function assessment_state_finish_quiz_result(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $attemptid,
    string $groupid,
    string $responsesjson,
): array {
    return (new \mod_scaffold\local\assessment_service())->finish_quiz(
        assessment_state_scope($scaffold, $cm, $userid),
        $attemptid,
        $groupid,
        \mod_scaffold\local\content_service::read_json_object($responsesjson, []),
    );
}

function assessment_state_reveal_quiz(
    stdClass $scaffold,
    \core_course\cm_info $cm,
    int $userid,
    string $attemptid,
    string $groupid,
): stdClass {
    return (new \mod_scaffold\local\assessment_service())->reveal_quiz(
        assessment_state_scope($scaffold, $cm, $userid),
        $attemptid,
        $groupid,
    )['outcome']->quizAttempt;
}

$target = assessment_state_target();
$scaffold = (object) [
    'id' => 7,
    'coursemodule' => 42,
    'course' => 3,
    'name' => 'Assessment state activity',
    'grade' => 20,
    'assessmentdefinitionversion' => 1,
    'gradeitemversion' => 1,
    'gradeitemstatus' => 'published',
    'completionactivitystatus' => 1,
    'learnercontentjson' => assessment_state_learner_content('question-1', 2),
    'assessmenttargetsjson' => json_encode([$target], JSON_THROW_ON_ERROR),
    'assessmentgroupsjson' => '[]',
];
$cm = new \core_course\cm_info();
$cm->id = 42;
try {
    assessment_state_reveal_answer(
        $scaffold,
        $cm,
        10,
        'artifact:moodle-cm-42/block:question-1',
        'question-1',
        'single-select',
    );
    fail_assessment_state_test('pre-attempt answer reveal must be rejected');
} catch (moodle_exception) {
}
assert_assessment_state(count($DB->rows()) === 0, 'pre-attempt answer reveal must not create learner state');
assessment_state_grade_request(
    $scaffold,
    $cm,
    12,
    'artifact:moodle-cm-42/block:question-1',
    'question-1',
    'single-select',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-b'], JSON_THROW_ON_ERROR),
    'submit',
);
try {
    assessment_state_reveal_answer(
        $scaffold,
        $cm,
        12,
        'artifact:moodle-cm-42/block:question-1',
        'question-1',
        'single-select',
    );
    fail_assessment_state_test('correct submitted answer reveal must be rejected');
} catch (moodle_exception) {
}
assessment_state_grade_request(
    $scaffold,
    $cm,
    10,
    'artifact:moodle-cm-42/block:question-1',
    'question-1',
    'single-select',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-a'], JSON_THROW_ON_ERROR),
    'submit',
);
$revealedanswer = assessment_state_reveal_answer(
    $scaffold,
    $cm,
    10,
    'artifact:moodle-cm-42/block:question-1',
    'question-1',
    'single-select',
);
assert_assessment_state(
    ($revealedanswer['answerKey']['correctOptionId'] ?? null) === 'option-b',
    'answer reveal must return the stored target answer after an incorrect submission',
);
$DB = new assessment_state_test_database();
$requestlocks = new assessment_state_test_lock_factory();
\core\lock\lock_config::$factory = $requestlocks;
$assessment_state_grade_calls = [];
$assessment_state_completion_calls = [];

$firsthint = assessment_state_reveal_hint(
    $scaffold,
    $cm,
    11,
    'artifact:moodle-cm-42/block:question-1',
    'question-1',
    'single-select',
    1,
);
assert_assessment_state($firsthint === 1, 'hint reveal must return the authoritative stored count');
assert_assessment_state($DB->transactions === 1 && $DB->commits === 1, 'hint reveal must commit transactionally');
assert_assessment_state(
    $requestlocks->resources[0] === ['activity:7:learner:11', 10]
        && $requestlocks->locks[0]->released,
    'hint reveal must hold and release the learner-scoped assessment lock',
);
$hintrow = serialize(array_values($DB->rows())[0]);
$duplicatehint = assessment_state_reveal_hint(
    $scaffold,
    $cm,
    11,
    'artifact:moodle-cm-42/block:question-1',
    'question-1',
    'single-select',
    1,
);
assert_assessment_state($duplicatehint === 1, 'duplicate hint reveal must be idempotent');
assert_assessment_state(
    serialize(array_values($DB->rows())[0]) === $hintrow,
    'duplicate hint reveal must not rewrite the learner snapshot',
);
assert_assessment_state(
    assessment_state_load_snapshot($scaffold, 42, 11)->problems->{'question-1'}->hintsShown === 1,
    'learner reload must preserve the committed hint count',
);
assert_assessment_state(
    assessment_state_reveal_hint(
        $scaffold,
        $cm,
        11,
        'artifact:moodle-cm-42/block:question-1',
        'question-1',
        'single-select',
        2,
    ) === 2,
    'the next sequential hint reveal must persist',
);
try {
    assessment_state_reveal_hint(
        $scaffold,
        $cm,
        11,
        'artifact:moodle-cm-42/block:question-1',
        'question-1',
        'single-select',
        3,
    );
    fail_assessment_state_test('hint reveal beyond the authored limit must be rejected');
} catch (moodle_exception) {
}
$commitsbeforesubmit = $DB->commits;
$rollbacksbeforesubmit = $DB->rollbacks;
$submitlockindex = count($requestlocks->locks);
$result = assessment_state_grade_request(
    $scaffold,
    $cm,
    11,
    'artifact:moodle-cm-42/block:question-1',
    'question-1',
    'single-select',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-b'], JSON_THROW_ON_ERROR),
    'submit',
);
assert_assessment_state(($result['score'] ?? null) === 1, 'submit must return the authoritative canonical result');
$publicresultjson = json_encode($result, JSON_THROW_ON_ERROR);
assert_assessment_state(
    !str_contains($publicresultjson, '"expected"')
        && !str_contains($publicresultjson, 'Service item feedback sentinel')
        && str_contains($publicresultjson, 'Service summary feedback sentinel'),
    'showAnswer-enabled standalone results must retain summary feedback without exposing item outcomes',
);
assert_assessment_state(
    get_object_vars($result['items'] ?? (object) []) === [],
    'standalone submit must not expose item correctness that can reconstruct the answer key',
);
assert_assessment_state(count($DB->rows()) === 1, 'submit must persist one aggregate learner snapshot');
$storedrecord = array_values($DB->rows())[0];
$storedsnapshot = json_decode($storedrecord->snapshotjson, false, 512, JSON_THROW_ON_ERROR);
assert_assessment_state($storedsnapshot->problems->{'question-1'}->attemptNumber === 1, 'submit must increment attempts inside the snapshot');
assert_assessment_state($storedsnapshot->problems->{'question-1'}->submitted === true, 'submit must mark the canonical problem submitted');
assert_assessment_state($storedsnapshot->problems->{'question-1'}->submissionResult->score === 1, 'submit must persist the canonical result');
assert_assessment_state($storedsnapshot->problems->{'question-1'}->hintsShown === 2, 'submit must preserve durable hint reveals');
assert_assessment_state(!property_exists($storedsnapshot->problems->{'question-1'}, 'targetId'), 'snapshot must not duplicate authored target metadata');
assert_assessment_state(!property_exists($storedsnapshot->problems->{'question-1'}, 'revealedAnswer'), 'snapshot must not persist revealed answers');
assert_assessment_state($assessment_state_grade_calls === [[
    'userid' => 11,
    'rawgrade' => 20.0,
]], 'submit must calculate the current grade from the committed snapshot before the external Gradebook effect');
assert_assessment_state($DB->commits === $commitsbeforesubmit + 1, 'submit mutation must commit once');
assert_assessment_state($DB->rollbacks === $rollbacksbeforesubmit, 'successful submit mutation must not roll back');
assert_assessment_state($requestlocks->locks[$submitlockindex]->released, 'submit mutation must release its learner lock');
assert_assessment_state(
    $assessment_state_completion_calls === [[7, 42, 11]],
    'submit must notify completion after commit without propagating a completion failure',
);
$stalerow = serialize(array_values($DB->rows())[0]);
$staleresult = assessment_state_grade_request(
    $scaffold,
    $cm,
    11,
    'artifact:moodle-cm-42/block:question-1',
    'question-1',
    'single-select',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-a'], JSON_THROW_ON_ERROR),
    'submit',
    0,
);
assert_assessment_state(($staleresult['score'] ?? null) === 1, 'stale retry must return the stored canonical result');
assert_assessment_state(
    get_object_vars($staleresult['items'] ?? (object) []) === [],
    'stale retry must not expose reconstructable item outcomes',
);
assert_assessment_state(serialize(array_values($DB->rows())[0]) === $stalerow, 'stale retry must preserve all row identities');
assert_assessment_state(count($assessment_state_grade_calls) === 1, 'stale retry must not republish a grade');
assert_assessment_state(
    count($assessment_state_completion_calls) === 1,
    'stale retry must not recalculate completion',
);
try {
    assessment_state_grade_request(
        $scaffold,
        $cm,
        11,
        'artifact:moodle-cm-42/block:question-1',
        'question-1',
        'single-select',
        json_encode(['kind' => 'single-select', 'optionId' => 'option-a'], JSON_THROW_ON_ERROR),
        'submit',
        2,
    );
    fail_assessment_state_test('future attempt sequence must be rejected');
} catch (invalid_parameter_exception) {
}
$rebuildbatch = \mod_scaffold\local\assessment_projection::for_activity_users($scaffold, 11);
assert_assessment_state(
    $rebuildbatch['artifactId'] === 'moodle-cm-42',
    'grade rebuild must retain the activity-scoped artifact identity',
);
assert_assessment_state(
    array_keys($rebuildbatch['projections']) === [11]
        && $rebuildbatch['projections'][11]->normalizedScore === 1.0,
    'single-user grade rebuild must derive the current neutral projection from stored state',
);

$rollbacksbeforesubmissionrejection = $DB->rollbacks;
try {
    assessment_state_grade_request(
        $scaffold,
        $cm,
        11,
        'artifact:moodle-cm-42/block:question-1',
        'question-1',
        'single-select',
        json_encode(['kind' => 'single-select', 'optionId' => 'option-a'], JSON_THROW_ON_ERROR),
        'submit',
    );
    fail_assessment_state_test('serialized submit must enforce the stored maximum attempt count');
} catch (moodle_exception) {
}
assert_assessment_state(
    $DB->rollbacks === $rollbacksbeforesubmissionrejection + 1,
    'rejected serialized mutation must roll back',
);
assert_assessment_state(count($assessment_state_grade_calls) === 1, 'rejected mutation must not call Gradebook');
assert_assessment_state(
    count($assessment_state_completion_calls) === 1,
    'rejected mutation must not notify Moodle completion',
);
assert_assessment_state(
    json_decode(array_values($DB->rows())[0]->snapshotjson, false, 512, JSON_THROW_ON_ERROR)
        ->problems->{'question-1'}->attemptNumber === 1,
    'rejected mutation must not partially consume an attempt',
);

$checktarget = assessment_state_target('question-check');
$checktarget['settings']['feedbackMode'] = 'immediate';
$checktarget['settings']['isGraded'] = false;
$checktarget['settings']['maxAttempts'] = null;
$checkscaffold = (object) [
    'id' => 8,
    'course' => 3,
    'name' => 'Immediate check activity',
    'grade' => 20,
    'completionactivitystatus' => 1,
    'learnercontentjson' => assessment_state_learner_content('question-check', 1),
    'assessmenttargetsjson' => json_encode([$checktarget], JSON_THROW_ON_ERROR),
    'assessmentgroupsjson' => '[]',
];
$checkcm = new \core_course\cm_info();
$checkcm->id = 43;
assessment_state_reveal_hint(
    $checkscaffold,
    $checkcm,
    12,
    'artifact:moodle-cm-43/block:question-check',
    'question-check',
    'single-select',
    1,
);
assessment_state_grade_request(
    $checkscaffold,
    $checkcm,
    12,
    'artifact:moodle-cm-43/block:question-check',
    'question-check',
    'single-select',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-a'], JSON_THROW_ON_ERROR),
    'check',
);
$checkrecord = null;
foreach ($DB->rows() as $record) {
    if ((int) $record->scaffoldid === 8 && (int) $record->userid === 12) {
        $checkrecord = $record;
    }
}
assert_assessment_state($checkrecord instanceof stdClass, 'check must persist the learner/activity aggregate row');
$checksnapshot = json_decode($checkrecord->snapshotjson, false, 512, JSON_THROW_ON_ERROR);
$checkproblem = $checksnapshot->problems->{'question-check'};
assert_assessment_state($checkproblem->submitted === false, 'check must not mark a response submitted');
assert_assessment_state($checkproblem->submissionResult === null, 'check must not create a submission result');
assert_assessment_state($checkproblem->checkResult->score === 0, 'check must persist its canonical check result');
assert_assessment_state($checkproblem->attemptNumber === 1, 'check must atomically increment its attempt');
assert_assessment_state($checkproblem->hintsShown === 1, 'check must preserve the durable hint count');
assert_assessment_state(count($assessment_state_grade_calls) === 1, 'ungraded check must not call Gradebook');
assert_assessment_state(
    $assessment_state_completion_calls === [[7, 42, 11], [8, 43, 12]],
    'ungraded assessment changes must also refresh the enabled completion rule',
);

$redactiontarget = assessment_state_target('question-redacted');
$redactiontarget['settings']['feedbackMode'] = 'immediate';
$redactiontarget['settings']['isGraded'] = false;
$redactiontarget['settings']['showAnswer'] = false;
$redactiontarget['settings']['maxAttempts'] = null;
$redactionscaffold = (object) [
    'id' => 10,
    'course' => 3,
    'name' => 'Redacted standalone activity',
    'grade' => 20,
    'completionactivitystatus' => 0,
    'learnercontentjson' => assessment_state_learner_content('question-redacted', 0),
    'assessmenttargetsjson' => json_encode([$redactiontarget], JSON_THROW_ON_ERROR),
    'assessmentgroupsjson' => '[]',
];
$redactioncm = new \core_course\cm_info();
$redactioncm->id = 45;
$redactioncheck = assessment_state_problem_request(
    $redactionscaffold,
    $redactioncm,
    15,
    'artifact:moodle-cm-45/block:question-redacted',
    'question-redacted',
    'single-select',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-a'], JSON_THROW_ON_ERROR),
    'check',
);
$redactionsubmit = assessment_state_problem_request(
    $redactionscaffold,
    $redactioncm,
    15,
    'artifact:moodle-cm-45/block:question-redacted',
    'question-redacted',
    'single-select',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-a'], JSON_THROW_ON_ERROR),
    'submit',
);
foreach (['check' => $redactioncheck, 'submit' => $redactionsubmit] as $action => $publicproblem) {
    $publicjson = json_encode($publicproblem, JSON_THROW_ON_ERROR);
    assert_assessment_state(
        !str_contains($publicjson, '"expected"')
            && !str_contains($publicjson, 'Service item feedback sentinel')
            && !str_contains($publicjson, 'Service summary feedback sentinel'),
        'standalone ' . $action . ' must redact answer material when showAnswer is disabled',
    );
    foreach (['checkResult', 'submissionResult'] as $resultfield) {
        $publicresult = $publicproblem->{$resultfield} ?? null;
        if ($publicresult instanceof stdClass) {
            assert_assessment_state(
                get_object_vars($publicresult->items ?? (object) []) === [],
                'standalone ' . $action . ' must not expose reconstructable item outcomes',
            );
        }
    }
}
$redactionstored = assessment_state_load_snapshot($redactionscaffold, 45, 15);
$redactionstoredjson = json_encode($redactionstored, JSON_THROW_ON_ERROR);
assert_assessment_state(
    str_contains($redactionstoredjson, '"expected"')
        && str_contains($redactionstoredjson, 'Service item feedback sentinel')
        && str_contains($redactionstoredjson, 'Service summary feedback sentinel'),
    'standalone public redaction must retain full grader detail in canonical storage',
);

$quizgroup = assessment_state_quiz_group('after_each_answer');
$quizscaffold = (object) [
    'id' => 9,
    'coursemodule' => 44,
    'course' => 3,
    'name' => 'Quiz activity',
    'grade' => 20,
    'assessmentdefinitionversion' => 1,
    'gradeitemversion' => 1,
    'gradeitemstatus' => 'published',
    'completionactivitystatus' => 1,
    'learnercontentjson' => assessment_state_learner_content('question-1', 1),
    'assessmenttargetsjson' => json_encode([$target], JSON_THROW_ON_ERROR),
    'assessmentgroupsjson' => json_encode([$quizgroup], JSON_THROW_ON_ERROR),
];
$quizcm = new \core_course\cm_info();
$quizcm->id = 44;
$quizstandaloneoperations = [
    'check' => static fn(): array => assessment_state_grade_request(
        $quizscaffold,
        $quizcm,
        13,
        'artifact:moodle-cm-44/block:question-1',
        'question-1',
        'single-select',
        json_encode(['kind' => 'single-select', 'optionId' => 'option-b'], JSON_THROW_ON_ERROR),
        'check',
        0,
    ),
    'submit' => static fn(): array => assessment_state_grade_request(
        $quizscaffold,
        $quizcm,
        13,
        'artifact:moodle-cm-44/block:question-1',
        'question-1',
        'single-select',
        json_encode(['kind' => 'single-select', 'optionId' => 'option-b'], JSON_THROW_ON_ERROR),
        'submit',
        0,
    ),
    'reveal_hint' => static fn(): int => assessment_state_reveal_hint(
        $quizscaffold,
        $quizcm,
        13,
        'artifact:moodle-cm-44/block:question-1',
        'question-1',
        'single-select',
        1,
    ),
    'reveal_answer' => static fn(): array => assessment_state_reveal_answer(
        $quizscaffold,
        $quizcm,
        13,
        'artifact:moodle-cm-44/block:question-1',
        'question-1',
        'single-select',
    ),
];
$quizrowsbeforestandalonerejection = count($DB->rows());
$quiztransactionsbeforestandalonerejection = $DB->transactions;
$quizcommitsbeforestandalonerejection = $DB->commits;
$quizgradecallsbeforestandalonerejection = count($assessment_state_grade_calls);
$quizcompletioncallsbeforestandalonerejection = count($assessment_state_completion_calls);
foreach ($quizstandaloneoperations as $operation => $command) {
    try {
        $command();
        fail_assessment_state_test('standalone ' . $operation . ' must reject Quiz-owned targets');
    } catch (moodle_exception $exception) {
        assert_assessment_state(
            $exception->getMessage() === 'quiztargetrequiresquizattempt',
            'standalone ' . $operation . ' must fail at the Quiz ownership boundary',
        );
    }
    assert_assessment_state(
        count($DB->rows()) === $quizrowsbeforestandalonerejection,
        'standalone Quiz target rejection must not create learner or publication state',
    );
    assert_assessment_state(
        $DB->transactions === $quiztransactionsbeforestandalonerejection
            && $DB->commits === $quizcommitsbeforestandalonerejection,
        'standalone Quiz target rejection must not open a learner-state transaction',
    );
    assert_assessment_state(
        count($assessment_state_grade_calls) === $quizgradecallsbeforestandalonerejection,
        'standalone Quiz target rejection must not publish a grade',
    );
    assert_assessment_state(
        count($assessment_state_completion_calls) === $quizcompletioncallsbeforestandalonerejection,
        'standalone Quiz target rejection must not update completion',
    );
}
$quizgradecallsbeforestart = count($assessment_state_grade_calls);
$quizstartresult = assessment_state_start_quiz_result($quizscaffold, $quizcm, 13, 'quiz-1');
$quizattempt = $quizstartresult['outcome']->quizAttempt;
assert_assessment_state($quizattempt->status === 'in_progress', 'Quiz API start must return the canonical in-progress attempt');
assert_assessment_state(
    ($quizstartresult['gradePublication']->status ?? null) === 'not_applicable',
    'graded Quiz start must settle its staged neutral projection without publishing a numeric grade',
);
$quizstartpublications = array_values(array_filter(
    $DB->publication_rows(),
    static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
));
assert_assessment_state(
    count($quizstartpublications) === 1
        && $quizstartpublications[0]->status === 'published'
        && (int) $quizstartpublications[0]->staterevision === 1,
    'Quiz service start must stage and settle the publication row for canonical revision one',
);
assert_assessment_state(
    count($assessment_state_grade_calls) === $quizgradecallsbeforestart,
    'graded Quiz start must not write a null grade to Moodle',
);
$quizstartrecord = serialize(array_values(array_filter(
    $DB->rows(),
    static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
))[0]);
$duplicatequizattempt = assessment_state_start_quiz($quizscaffold, $quizcm, 13, 'quiz-1');
assert_assessment_state($duplicatequizattempt == $quizattempt, 'duplicate Quiz start must return the current attempt');
assert_assessment_state(
    serialize(array_values(array_filter(
        $DB->rows(),
        static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
    ))[0]) === $quizstartrecord,
    'duplicate Quiz start must preserve snapshot, changedAt, and delivery identity',
);
try {
    assessment_state_submit_quiz_question(
        $quizscaffold,
        $quizcm,
        13,
        'stale-attempt',
        'quiz-1',
        'question-1',
        json_encode(['kind' => 'single-select', 'optionId' => 'option-b'], JSON_THROW_ON_ERROR),
    );
    fail_assessment_state_test('stale Quiz attempt identity must be rejected');
} catch (moodle_exception) {
}
try {
    assessment_state_submit_quiz_question(
        $quizscaffold,
        $quizcm,
        13,
        $quizattempt->attemptId,
        'quiz-1',
        'question-1',
        json_encode(['kind' => 'multi-select', 'optionIds' => ['option-b']], JSON_THROW_ON_ERROR),
    );
    fail_assessment_state_test('Quiz response kind mismatch must be rejected');
} catch (invalid_parameter_exception) {
}
assert_assessment_state(
    serialize(array_values(array_filter(
        $DB->rows(),
        static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
    ))[0]) === $quizstartrecord,
    'stale identity and wrong response kind must preserve canonical Quiz state and delivery identity',
);
$quizsubmitresult = assessment_state_submit_quiz_question_result(
    $quizscaffold,
    $quizcm,
    13,
    $quizattempt->attemptId,
    'quiz-1',
    'question-1',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-b'], JSON_THROW_ON_ERROR),
    0,
);
$quizattempt = $quizsubmitresult['outcome']->quizAttempt;
assert_assessment_state($quizattempt->status === 'completed', 'Quiz API question submit must complete the final target');
assert_assessment_state(
    ($quizsubmitresult['gradePublication']->status ?? null) === 'published'
        && property_exists($quizsubmitresult['outcome']->problemsByTargetId, 'question-1'),
    'Quiz question submit must return the committed problem and terminal publication outcome',
);
$quizsnapshot = assessment_state_load_snapshot($quizscaffold, 44, 13);
assert_assessment_state(
    $quizsnapshot->problems->{'question-1'}->hintsShown === 0,
    'Quiz question submission must create canonical problem state without a standalone hint mutation',
);
$quizterminalrecord = serialize(array_values(array_filter(
    $DB->rows(),
    static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
))[0]);
$duplicatequizattempt = assessment_state_submit_quiz_question(
    $quizscaffold,
    $quizcm,
    13,
    $quizattempt->attemptId,
    'quiz-1',
    'question-1',
    json_encode(['kind' => 'single-select', 'optionId' => 'option-b'], JSON_THROW_ON_ERROR),
);
assert_assessment_state(
    json_encode($duplicatequizattempt, JSON_THROW_ON_ERROR)
        === json_encode($quizattempt, JSON_THROW_ON_ERROR),
    'duplicate terminal submit must return the accepted attempt',
);
assert_assessment_state(
    serialize(array_values(array_filter(
        $DB->rows(),
        static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
    ))[0]) === $quizterminalrecord,
    'duplicate terminal submit must preserve snapshot, attempts, changedAt, and delivery identity',
);
$quizattempt = assessment_state_reveal_quiz(
    $quizscaffold,
    $quizcm,
    13,
    $quizattempt->attemptId,
    'quiz-1',
);
assert_assessment_state($quizattempt->answerReviewAuthorized, 'Quiz API reveal must return authorized full review');
$quizrevealrecord = serialize(array_values(array_filter(
    $DB->rows(),
    static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
))[0]);
$duplicatequizattempt = assessment_state_reveal_quiz(
    $quizscaffold,
    $quizcm,
    13,
    $quizattempt->attemptId,
    'quiz-1',
);
assert_assessment_state($duplicatequizattempt == $quizattempt, 'duplicate reveal must return the authorized attempt');
assert_assessment_state(
    serialize(array_values(array_filter(
        $DB->rows(),
        static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 13,
    ))[0]) === $quizrevealrecord,
    'duplicate reveal must not advance the canonical snapshot identity',
);

$quizgroup = assessment_state_quiz_group('after_quiz', 'result_only');
$quizscaffold->assessmentgroupsjson = json_encode([$quizgroup], JSON_THROW_ON_ERROR);
$finishedattempt = assessment_state_start_quiz($quizscaffold, $quizcm, 14, 'quiz-1');
$finishedresult = assessment_state_finish_quiz_result(
    $quizscaffold,
    $quizcm,
    14,
    $finishedattempt->attemptId,
    'quiz-1',
    json_encode([
        'question-1' => ['kind' => 'single-select', 'optionId' => 'option-b'],
    ], JSON_THROW_ON_ERROR),
);
$finishedoutcome = $finishedresult['outcome'];
$finishedattempt = $finishedoutcome->quizAttempt;
assert_assessment_state($finishedattempt->status === 'completed', 'Quiz API finish must grade and complete after-Quiz review');
assert_assessment_state(
    ($finishedresult['gradePublication']->status ?? null) === 'published',
    'Quiz finish must return the terminal grade publication outcome after commit',
);
$finishedjson = json_encode($finishedoutcome, JSON_THROW_ON_ERROR);
assert_assessment_state(
    property_exists($finishedoutcome->problemsByTargetId, 'question-1'),
    'result-only Quiz finish must preserve the canonical problem response shape',
);
assert_assessment_state(
    !str_contains($finishedjson, '"expected"')
        && !str_contains($finishedjson, 'Service item feedback sentinel')
        && !str_contains($finishedjson, 'Service summary feedback sentinel'),
    'result-only Quiz finish must redact attempt and problem answer material at the service boundary',
);
assert_assessment_state(
    get_object_vars($finishedattempt->resultsByTargetId->{'question-1'}->items ?? (object) []) === []
        && get_object_vars(
            $finishedoutcome->problemsByTargetId->{'question-1'}->submissionResult->items ?? (object) [],
        ) === [],
    'result-only Quiz finish must not expose reconstructable item outcomes in attempt or problem results',
);
$finishedsnapshot = assessment_state_load_snapshot($quizscaffold, 44, 14);
$storedfinishedjson = json_encode($finishedsnapshot, JSON_THROW_ON_ERROR);
assert_assessment_state(
    str_contains($storedfinishedjson, '"expected"')
        && str_contains($storedfinishedjson, 'Service summary feedback sentinel'),
    'result-only Quiz finish must retain full grading detail in stored learner state',
);
$quizfinishrecord = serialize(array_values(array_filter(
    $DB->rows(),
    static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 14,
))[0]);
$duplicatefinishedattempt = assessment_state_finish_quiz(
    $quizscaffold,
    $quizcm,
    14,
    $finishedattempt->attemptId,
    'quiz-1',
    json_encode([
        'question-1' => ['kind' => 'single-select', 'optionId' => 'option-b'],
    ], JSON_THROW_ON_ERROR),
);
assert_assessment_state(
    json_encode($duplicatefinishedattempt, JSON_THROW_ON_ERROR)
        === json_encode($finishedattempt, JSON_THROW_ON_ERROR),
    'duplicate finish must return the accepted attempt',
);
assert_assessment_state(
    get_object_vars($duplicatefinishedattempt->resultsByTargetId->{'question-1'}->items ?? (object) []) === [],
    'duplicate result-only finish must not expose reconstructable item outcomes',
);
assert_assessment_state(
    serialize(array_values(array_filter(
        $DB->rows(),
        static fn(stdClass $record): bool => (int) $record->scaffoldid === 9 && (int) $record->userid === 14,
    ))[0]) === $quizfinishrecord,
    'duplicate finish must preserve snapshot, attempts, changedAt, and delivery identity',
);

$quizrows = array_values(array_filter(
    $DB->rows(),
    static fn(stdClass $record): bool => (int) $record->scaffoldid === 9,
));
assert_assessment_state(count($quizrows) === 2, 'Quiz lifecycle must persist one aggregate row per learner');
foreach ($quizrows as $quizrow) {
    $quizsnapshot = json_decode($quizrow->snapshotjson, false, 512, JSON_THROW_ON_ERROR);
    assert_assessment_state(
        !property_exists($quizsnapshot->quizzes->{'quiz-1'}, 'groupId'),
        'persisted Quiz attempt must use its record key as identity',
    );
}
assert_assessment_state(
    count($assessment_state_grade_calls) === 3,
    'graded Quiz starts must publish no null grade and each terminal attempt must publish once',
);
assert_assessment_state(
    array_slice($assessment_state_completion_calls, -4) === [
        [9, 44, 13],
        [9, 44, 13],
        [9, 44, 14],
        [9, 44, 14],
    ],
    'only logical Quiz changes may refresh completion after the canonical commit',
);

$racegroup = assessment_state_quiz_group('after_quiz', 'result_only');
$racegroup['settings']['timer'] = ['enabled' => true, 'durationSeconds' => 60];
$quizscaffold->assessmentgroupsjson = json_encode([$racegroup], JSON_THROW_ON_ERROR);
$racerepository = new assessment_state_repository();
$racequiztimes = [
    '2026-07-18T10:00:00.000000Z',
    '2026-07-18T10:01:00.000000Z',
    '2026-07-18T10:01:01.000000Z',
];
$racegradecalls = 0;
$racequiz = new \mod_scaffold\local\assessment_quiz(
    static function() use (&$racequiztimes): string {
        return array_shift($racequiztimes) ?? '2026-07-18T10:01:02.000000Z';
    },
    static fn(string $groupid): string => 'attempt-expiry-race',
    static function(array $target, array $response) use (&$racegradecalls): array {
        $racegradecalls++;
        return \mod_scaffold\local\grader::grade_assessment($target, $response);
    },
);
$racereconciletimes = [
    '2026-07-18T09:59:59.000000Z',
    '2026-07-18T10:00:59.000000Z',
];
$racereconcilepublicationcalls = 0;
$racereconcilecompletioncalls = 0;
$racereconciler = new \mod_scaffold\local\quiz_expiry_reconciler(
    $racerepository,
    null,
    static function() use (&$racereconciletimes): string {
        return array_shift($racereconciletimes) ?? '2026-07-18T10:00:59.000000Z';
    },
    static function(
        stdClass $scaffold,
        int $userid,
        string $artifactid,
    ) use (&$racereconcilepublicationcalls): stdClass {
        $racereconcilepublicationcalls++;
        return (object) ['status' => 'observed'];
    },
    static function(
        stdClass $scaffold,
        \core_course\cm_info $cm,
        int $userid,
    ) use (&$racereconcilecompletioncalls): void {
        $racereconcilecompletioncalls++;
    },
);
$raceservicepublicationcalls = 0;
$raceservicecompletioncalls = 0;
$raceservice = new \mod_scaffold\local\assessment_service(
    $racerepository,
    null,
    static function(
        stdClass $scaffold,
        int $userid,
        string $artifactid,
    ) use (&$raceservicepublicationcalls): stdClass {
        $raceservicepublicationcalls++;
        return (object) ['status' => 'observed'];
    },
    static function(
        stdClass $scaffold,
        \core_course\cm_info $cm,
        int $userid,
    ) use (&$raceservicecompletioncalls): void {
        $raceservicecompletioncalls++;
    },
    $racequiz,
    $racereconciler,
);
$raceattempt = $raceservice->start_quiz(
    assessment_state_scope($quizscaffold, $quizcm, 16),
    'quiz-1',
)['outcome']->quizAttempt;
assert_assessment_state(
    $raceservicepublicationcalls === 1 && $raceservicecompletioncalls === 1,
    'timed Quiz start must apply one logical-change side effect set',
);
$raceoutcome = $raceservice->finish_quiz(
    assessment_state_scope($quizscaffold, $quizcm, 16),
    $raceattempt->attemptId,
    'quiz-1',
    ['question-1' => ['kind' => 'single-select', 'optionId' => 'option-b']],
)['outcome'];
assert_assessment_state(
    $raceoutcome->quizAttempt->status === 'expired' && $raceoutcome->quizAttempt->score === 0.0,
    'locked Quiz finish must expire an attempt whose deadline passed after pre-reconciliation',
);
assert_assessment_state(
    get_object_vars($raceoutcome->problemsByTargetId) === [],
    'locked expired Quiz finish must return no late problem result',
);
assert_assessment_state($racegradecalls === 0, 'locked expired Quiz finish must not grade the late payload');
assert_assessment_state(
    $racereconciletimes === []
        && $racereconcilepublicationcalls === 0
        && $racereconcilecompletioncalls === 0,
    'pre-reconciliation must observe the attempt before its deadline without applying expiry effects',
);
assert_assessment_state(
    $raceservicepublicationcalls === 2 && $raceservicecompletioncalls === 2,
    'locked expiry must apply exactly one additional logical-change side effect set',
);
$racesnapshot = assessment_state_load_snapshot($quizscaffold, 44, 16);
assert_assessment_state(
    !property_exists($racesnapshot->problems, 'question-1')
        && get_object_vars($racesnapshot->quizzes->{'quiz-1'}->resultsByTargetId) === [],
    'locked expired Quiz finish must persist no late response or result',
);

unlink($pluginlibdir . '/lib.php');
rmdir($pluginlibdir);
rmdir(dirname($pluginlibdir));
rmdir($plugindir);

echo "assessment state tests passed\n";
