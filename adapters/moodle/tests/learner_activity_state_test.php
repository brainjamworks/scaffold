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

if (!class_exists('dml_write_exception')) {
    class dml_write_exception extends Exception {
    }
}

function fail_learner_activity_state_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_learner_activity_state(bool $condition, string $message): void {
    if (!$condition) {
        fail_learner_activity_state_test($message);
    }
}

function expect_learner_activity_state_rejected(callable $operation, string $message): void {
    try {
        $operation();
        fail_learner_activity_state_test($message);
    } catch (invalid_parameter_exception) {
    }
}

function learner_activity_snapshot(string $artifactid, array $activities = []): array {
    return [
        'snapshotVersion' => 1,
        'artifactId' => $artifactid,
        'activities' => (object) $activities,
    ];
}

function learner_activity_record(string $kind, array $data, bool $completed): array {
    return [
        'activityKind' => $kind,
        'data' => (object) $data,
        'completed' => $completed,
    ];
}

class learner_activity_state_test_lock {
    public bool $released = false;

    public function release(): void {
        $this->released = true;
    }
}

class learner_activity_state_test_lock_factory {
    public array $resources = [];
    public array $locks = [];

    public function get_lock(string $resource, int $timeout): learner_activity_state_test_lock|false {
        $this->resources[] = [$resource, $timeout];
        $lock = new learner_activity_state_test_lock();
        $this->locks[] = $lock;
        return $lock;
    }
}

class learner_activity_state_test_transaction {
    public function __construct(private learner_activity_state_test_database $database) {
    }

    public function allow_commit(): void {
        $this->database->commit_transaction();
    }

    public function rollback(Throwable $exception): never {
        $this->database->rollback_transaction();
        throw $exception;
    }
}

class learner_activity_state_test_database {
    public int $transactions = 0;
    public int $commits = 0;
    public int $rollbacks = 0;
    public int $inserts = 0;
    public int $updates = 0;
    public int $deletes = 0;
    public bool $collideonnextinsert = false;
    public array $tables = [];
    private int $nextid = 1;
    private array $records = [];
    private ?array $transactionrecords = null;
    private ?stdClass $collisionrecord = null;

    public function seed(stdClass $record): void {
        $copy = clone $record;
        $copy->id ??= $this->nextid++;
        $this->nextid = max($this->nextid, ((int) $copy->id) + 1);
        $this->records[(int) $copy->id] = $copy;
    }

    public function start_delegated_transaction(): learner_activity_state_test_transaction {
        assert_learner_activity_state($this->transactionrecords === null, 'test database does not support nested transactions');
        $this->transactions++;
        $this->transactionrecords = $this->clone_records($this->records);
        return new learner_activity_state_test_transaction($this);
    }

    public function get_record(string $table, array $conditions): stdClass|false {
        $this->assert_table($table);
        foreach ($this->active_records() as $record) {
            if ($this->matches($record, $conditions)) {
                return clone $record;
            }
        }
        return false;
    }

    public function insert_record(string $table, stdClass $record): int {
        $this->assert_table($table);
        $this->inserts++;
        $copy = clone $record;
        $copy->id = $this->nextid++;
        if ($this->collideonnextinsert) {
            $this->collideonnextinsert = false;
            $this->collisionrecord = clone $copy;
            throw new dml_write_exception('simulated concurrent insert');
        }
        $this->transactionrecords[(int) $copy->id] = $copy;
        return (int) $copy->id;
    }

    public function update_record(string $table, stdClass $record): void {
        $this->assert_table($table);
        $this->updates++;
        $existing = $this->transactionrecords[(int) $record->id] ?? null;
        assert_learner_activity_state($existing instanceof stdClass, 'repository update must target an existing row');
        $this->transactionrecords[(int) $record->id] = (object) array_merge((array) $existing, (array) $record);
    }

    public function delete_records(string $table, array $conditions): void {
        $this->assert_table($table);
        $this->deletes++;
        foreach ($this->records as $id => $record) {
            if ($this->matches($record, $conditions)) {
                unset($this->records[$id]);
            }
        }
    }

    public function commit_transaction(): void {
        assert_learner_activity_state($this->transactionrecords !== null, 'commit requires an active transaction');
        $this->records = $this->clone_records($this->transactionrecords);
        $this->transactionrecords = null;
        $this->commits++;
    }

    public function rollback_transaction(): void {
        assert_learner_activity_state($this->transactionrecords !== null, 'rollback requires an active transaction');
        $this->transactionrecords = null;
        if ($this->collisionrecord) {
            $this->records[(int) $this->collisionrecord->id] = clone $this->collisionrecord;
            $this->collisionrecord = null;
        }
        $this->rollbacks++;
    }

    public function rows(): array {
        return $this->clone_records($this->records);
    }

    private function assert_table(string $table): void {
        $this->tables[] = $table;
        assert_learner_activity_state(
            $table === 'scaffold_learner_activity',
            'learner activity repository must use only its independent table',
        );
    }

    private function active_records(): array {
        return $this->transactionrecords ?? $this->records;
    }

    private function clone_records(array $records): array {
        return array_map(static fn(stdClass $record): stdClass => clone $record, $records);
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

$installxml = file_get_contents(__DIR__ . '/../scaffold/db/install.xml');
assert_learner_activity_state($installxml !== false, 'install.xml must be readable');
assert_learner_activity_state(
    str_contains($installxml, 'TABLE NAME="scaffold_learner_activity"'),
    'clean install must create independent learner activity storage',
);
foreach (['id', 'scaffoldid', 'userid', 'snapshotjson', 'timecreated', 'timemodified'] as $field) {
    assert_learner_activity_state(
        str_contains($installxml, 'FIELD NAME="' . $field . '"'),
        'clean install must define ' . $field,
    );
}
assert_learner_activity_state(
    str_contains($installxml, 'INDEX NAME="scaffolduser" UNIQUE="true" FIELDS="scaffoldid, userid"'),
    'clean install must enforce one learner activity row per activity and user',
);
assert_learner_activity_state(
    str_contains($installxml, 'INDEX NAME="userid" UNIQUE="false" FIELDS="userid"'),
    'clean install must index learner activity rows by user',
);

$libsource = file_get_contents(__DIR__ . '/../scaffold/lib.php');
assert_learner_activity_state($libsource !== false, 'lib.php must be readable');
$deletionsource = file_get_contents(__DIR__ . '/../scaffold/classes/local/activity_deletion_service.php');
assert_learner_activity_state($deletionsource !== false, 'activity deletion service must be readable');
assert_learner_activity_state(
    str_contains($libsource, 'activity_deletion_service')
        && str_contains($deletionsource, 'learner_activity_repository')
        && str_contains($deletionsource, '->delete_for_activity($scaffoldid)'),
    'normal activity deletion must invoke learner activity cleanup',
);

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/learner_activity_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/learner_activity_repository.php');

use mod_scaffold\local\learner_activity_repository;

$database = new learner_activity_state_test_database();
$locks = new learner_activity_state_test_lock_factory();
$repository = new learner_activity_repository($database, $locks);

$empty = $repository->load_or_empty(7, 11, 'moodle-cm-42');
assert_learner_activity_state($empty == learner_activity_snapshot('moodle-cm-42'), 'first load must return a strict empty snapshot');
assert_learner_activity_state($database->rows() === [], 'empty load must not treat process memory as persistence');

$checklistrecord = learner_activity_record('checklist', ['checkedItemIds' => ['item-1']], false);
$savedchecklist = $repository->save_record(
    7,
    11,
    'moodle-cm-42',
    'checklist-1',
    $checklistrecord,
    ['checklist-1' => 'checklist', 'flashcards-1' => 'flashcard'],
);
assert_learner_activity_state($savedchecklist['activityKind'] === 'checklist', 'save must return the accepted record kind');
assert_learner_activity_state($savedchecklist['data'] == $checklistrecord['data'], 'save must keep record data opaque');
assert_learner_activity_state($savedchecklist['completed'] === false, 'save must preserve completion');
assert_learner_activity_state(
    preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000000Z$/', $savedchecklist['updatedAt']) === 1,
    'save must assign an RFC3339 UTC host timestamp',
);
assert_learner_activity_state(count($database->rows()) === 1, 'first save must atomically create one row');
assert_learner_activity_state($database->commits === 1, 'first save must commit once');
assert_learner_activity_state(
    $locks->resources === [['activity:7:learner:11', 10]],
    'save must lock the activity and user identity',
);
assert_learner_activity_state($locks->locks[0]->released, 'save must release its lock');

$firstrow = array_values($database->rows())[0];
$flashcardrecord = learner_activity_record('flashcard', ['currentCardId' => 'card-2'], true);
$savedflashcard = $repository->save_record(
    7,
    11,
    'moodle-cm-42',
    'flashcards-1',
    $flashcardrecord,
    ['checklist-1' => 'checklist', 'flashcards-1' => 'flashcard'],
);
$loaded = $repository->load_or_empty(7, 11, 'moodle-cm-42');
assert_learner_activity_state(count(get_object_vars($loaded['activities'])) === 2, 'multiple block records must share one snapshot row');
assert_learner_activity_state(
    $loaded['activities']->{'checklist-1'}->data == $checklistrecord['data'],
    'saving another block must preserve unrelated record data',
);
assert_learner_activity_state(
    $loaded['activities']->{'checklist-1'}->updatedAt === $savedchecklist['updatedAt'],
    'saving another block must preserve unrelated record timestamps',
);
assert_learner_activity_state(
    $loaded['activities']->{'flashcards-1'}->updatedAt === $savedflashcard['updatedAt'],
    'load must return the authoritative saved record',
);
$updatedrow = array_values($database->rows())[0];
assert_learner_activity_state($updatedrow->timecreated === $firstrow->timecreated, 'updates must preserve row creation time');
assert_learner_activity_state($updatedrow->timemodified > $firstrow->timemodified, 'updates must advance host modification time');

$repository->save_record(7, 12, 'moodle-cm-42', 'checklist-1', $checklistrecord, ['checklist-1' => 'checklist']);
$repository->save_record(8, 11, 'moodle-cm-73', 'checklist-1', $checklistrecord, ['checklist-1' => 'checklist']);
assert_learner_activity_state(count($database->rows()) === 3, 'two users and two activities must have isolated rows');
assert_learner_activity_state(
    count(get_object_vars($repository->load_or_empty(7, 12, 'moodle-cm-42')['activities'])) === 1,
    'one user must not read another user\'s records',
);
assert_learner_activity_state(
    $repository->load_or_empty(8, 11, 'moodle-cm-73')['artifactId'] === 'moodle-cm-73',
    'one activity must not read another activity\'s artifact',
);

foreach ([
    '{bad json',
    json_encode(array_merge(learner_activity_snapshot('moodle-cm-42'), ['snapshotVersion' => 2]), JSON_THROW_ON_ERROR),
    json_encode(learner_activity_snapshot('moodle-cm-99'), JSON_THROW_ON_ERROR),
] as $index => $invalidjson) {
    $invaliddatabase = new learner_activity_state_test_database();
    $invaliddatabase->seed((object) [
        'scaffoldid' => 7,
        'userid' => 11,
        'snapshotjson' => $invalidjson,
        'timecreated' => 1,
        'timemodified' => 1,
    ]);
    $invalidrepository = new learner_activity_repository($invaliddatabase, new learner_activity_state_test_lock_factory());
    expect_learner_activity_state_rejected(
        static fn() => $invalidrepository->load_or_empty(7, 11, 'moodle-cm-42'),
        'strict read must reject malformed, future, or foreign snapshot case ' . $index,
    );
    expect_learner_activity_state_rejected(
        static fn() => $invalidrepository->save_record(
            7,
            11,
            'moodle-cm-42',
            'checklist-1',
            learner_activity_record('checklist', [], false),
            ['checklist-1' => 'checklist'],
        ),
        'strict write must reject malformed, future, or foreign snapshot case ' . $index,
    );
    assert_learner_activity_state($invaliddatabase->rollbacks === 1, 'invalid stored writes must roll back');
}

$rejectiondatabase = new learner_activity_state_test_database();
$rejectionrepository = new learner_activity_repository(
    $rejectiondatabase,
    new learner_activity_state_test_lock_factory(),
);
$rejectionrepository->save_record(
    7,
    11,
    'moodle-cm-42',
    'checklist-1',
    $checklistrecord,
    ['checklist-1' => 'checklist'],
);
$before = serialize($rejectiondatabase->rows());
foreach ([
    ['missing-block', learner_activity_record('checklist', [], false), ['checklist-1' => 'checklist']],
    ['checklist-1', learner_activity_record('flashcard', [], false), ['checklist-1' => 'checklist']],
    ['checklist-1', array_merge(learner_activity_record('checklist', [], false), ['updatedAt' => '2000-01-01T00:00:00Z']), ['checklist-1' => 'checklist']],
    ['checklist-1', learner_activity_record('checklist', [], false), ['' => 'checklist']],
] as $index => [$blockid, $record, $authorized]) {
    expect_learner_activity_state_rejected(
        static fn() => $rejectionrepository->save_record(
            7,
            11,
            'moodle-cm-42',
            $blockid,
            $record,
            $authorized,
        ),
        'save must reject unauthorized ids, kind mismatches, client timestamps, and invalid maps case ' . $index,
    );
    assert_learner_activity_state(
        serialize($rejectiondatabase->rows()) === $before,
        'rejected saves must preserve the complete stored snapshot',
    );
}
assert_learner_activity_state($rejectiondatabase->rollbacks === 4, 'each rejected save must roll back');

$collisiondatabase = new learner_activity_state_test_database();
$collisiondatabase->collideonnextinsert = true;
$collisionlocks = new learner_activity_state_test_lock_factory();
$collisionrepository = new learner_activity_repository($collisiondatabase, $collisionlocks);
$collisionrecord = $collisionrepository->save_record(
    7,
    11,
    'moodle-cm-42',
    'checklist-1',
    $checklistrecord,
    ['checklist-1' => 'checklist'],
);
assert_learner_activity_state($collisionrecord['activityKind'] === 'checklist', 'duplicate first save must accept the serialized winner');
assert_learner_activity_state($collisiondatabase->rollbacks === 1, 'duplicate insert must roll back its failed transaction');
assert_learner_activity_state($collisiondatabase->commits === 1, 'duplicate insert retry must commit once');
assert_learner_activity_state(count($collisiondatabase->rows()) === 1, 'duplicate insert handling must preserve one unique row');
assert_learner_activity_state($collisionlocks->locks[0]->released, 'duplicate insert handling must release its lock');

$deletiondatabase = new learner_activity_state_test_database();
$deletionrepository = new learner_activity_repository(
    $deletiondatabase,
    new learner_activity_state_test_lock_factory(),
);
$deletionrepository->save_record(7, 11, 'moodle-cm-42', 'checklist-1', $checklistrecord, ['checklist-1' => 'checklist']);
$deletionrepository->save_record(8, 11, 'moodle-cm-73', 'checklist-1', $checklistrecord, ['checklist-1' => 'checklist']);
$deletionrepository->delete_for_activity(7);
assert_learner_activity_state(count($deletiondatabase->rows()) === 1, 'deletion must remove all rows for only the named activity');
assert_learner_activity_state(
    array_values($deletiondatabase->rows())[0]->scaffoldid === 8,
    'deletion must preserve unrelated activity rows',
);
assert_learner_activity_state(
    array_unique($deletiondatabase->tables) === ['scaffold_learner_activity'],
    'repository reads, writes, and cleanup must remain in one independent storage domain',
);

echo "learner activity state tests passed\n";
