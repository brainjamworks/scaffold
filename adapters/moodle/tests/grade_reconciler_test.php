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

function fail_grade_reconciler_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_grade_reconciler(mixed $expected, mixed $actual, string $message): void {
    if ($expected !== $actual) {
        fail_grade_reconciler_test($message . ': expected ' . var_export($expected, true)
            . ', got ' . var_export($actual, true));
    }
}

final class grade_reconciler_repository {
    public array $calls = [];
    public array $staged = [];

    public function find_due_item_ids(int $limit, int $now, int $maxretries): array {
        $this->calls[] = ['items', $limit, $now, $maxretries];
        return [7];
    }

    public function find_due_sources(int $limit, int $now, int $maxretries): array {
        $this->calls[] = ['learners', $limit, $now, $maxretries];
        return [
            (object) ['scaffoldid' => 7, 'userid' => 11, 'staterevision' => 4, 'definitionversion' => 2],
            (object) ['scaffoldid' => 7, 'userid' => 12, 'staterevision' => 5, 'definitionversion' => 2],
        ];
    }

    public function upsert_pending(int $scaffoldid, int $userid, int $revision, int $version): stdClass {
        $this->staged[] = [$scaffoldid, $userid, $revision, $version];
        return (object) [];
    }
}

final class grade_reconciler_selector_database {
    private \PDO $database;

    public function __construct(array $activities) {
        $this->database = new \PDO('sqlite::memory:');
        $this->database->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
        $this->database->exec(
            'CREATE TABLE scaffold (
                id INTEGER PRIMARY KEY,
                assessmentdefinitionversion INTEGER NOT NULL,
                gradeitemversion INTEGER NOT NULL,
                gradeitemstatus TEXT NOT NULL,
                gradeitemretrycount INTEGER NOT NULL,
                gradeitemretryafter INTEGER NULL
            )',
        );
        $insert = $this->database->prepare(
            'INSERT INTO scaffold (
                id,
                assessmentdefinitionversion,
                gradeitemversion,
                gradeitemstatus,
                gradeitemretrycount,
                gradeitemretryafter
            ) VALUES (:id, :definitionversion, :itemversion, :status, :retrycount, :retryafter)',
        );
        foreach ($activities as $activity) {
            $insert->execute([
                'id' => $activity[0],
                'definitionversion' => $activity[1],
                'itemversion' => $activity[2],
                'status' => $activity[3],
                'retrycount' => $activity[4],
                'retryafter' => $activity[5],
            ]);
        }
    }

    public function get_fieldset_sql(
        string $sql,
        array $params,
        int $limitfrom,
        int $limitnum,
    ): array {
        $statement = $this->database->prepare(
            str_replace('{scaffold}', 'scaffold', $sql)
                . ' LIMIT ' . $limitnum . ' OFFSET ' . $limitfrom,
        );
        foreach ($params as $name => $value) {
            $statement->bindValue(
                ':' . $name,
                $value,
                is_int($value) ? \PDO::PARAM_INT : \PDO::PARAM_STR,
            );
        }
        $statement->execute();
        return $statement->fetchAll(\PDO::FETCH_COLUMN);
    }
}

require_once(__DIR__ . '/../scaffold/classes/local/grade_publication_repository.php');
require_once(__DIR__ . '/../scaffold/classes/local/grade_reconciler.php');

use mod_scaffold\local\grade_publication_repository;
use mod_scaffold\local\grade_reconciler;

$selector = new grade_publication_repository(new grade_reconciler_selector_database([
    [1, 2, 2, 'pending', 0, null],
    [2, 2, 1, 'published', 0, null],
    [3, 2, 2, 'published', 0, null],
    [4, 2, 1, 'failed', 1, 90],
    [5, 2, 1, 'failed', 1, 110],
    [6, 2, 1, 'failed', 1, null],
    [7, 2, 1, 'failed', 5, 90],
    [8, 2, 1, 'locked', 1, null],
    [9, 2, 1, 'configuration_error', 1, null],
    [10, 2, 1, 'unexpected_terminal_status', 1, null],
]), static fn(): int => 100);
assert_grade_reconciler(
    [1, 2, 4],
    $selector->find_due_item_ids(20, 100, 5),
    'grade item selector must honor status, stale published definitions, retry timing, and exhaustion',
);

$repository = new grade_reconciler_repository();
$events = [];
$reconciler = new grade_reconciler(
    $repository,
    new class($events) {
        public function __construct(private array &$events) {
        }
        public function publish(stdClass $activity): stdClass {
            $this->events[] = 'item:' . $activity->id;
            return (object) ['status' => 'published'];
        }
    },
    new class($events) {
        public function __construct(private array &$events) {
        }
        public function publish_user(stdClass $activity, int $userid): stdClass {
            $this->events[] = 'learner:' . $userid;
            return (object) ['status' => $userid === 11 ? 'published' : 'pending'];
        }
    },
    static fn(int $id): stdClass => (object) [
        'id' => $id,
        'grade' => 100,
        'assessmentdefinitionversion' => 2,
        'gradeitemversion' => 2,
        'gradeitemstatus' => 'published',
    ],
    static fn(): int => 100,
);

$outcome = $reconciler->reconcile_due(2);
assert_grade_reconciler(
    [['items', 2, 100, 5], ['learners', 2, 100, 5]],
    $repository->calls,
    'reconciler must use bounded due selectors with retry exhaustion',
);
assert_grade_reconciler(
    ['item:7', 'item:7', 'learner:11', 'learner:12'],
    $events,
    'grade item must be current before every learner batch',
);
assert_grade_reconciler(
    [[7, 11, 4, 2], [7, 12, 5, 2]],
    $repository->staged,
    'reconciler must stage current source identity rather than stored grade data',
);
assert_grade_reconciler(1, $outcome->items, 'item summary must be aggregate');
assert_grade_reconciler(2, $outcome->learners, 'learner summary must be aggregate');
assert_grade_reconciler(1, $outcome->published, 'published summary must be aggregate');
assert_grade_reconciler(1, $outcome->pending, 'pending summary must be aggregate');
assert_grade_reconciler(false, property_exists($outcome, 'events'), 'summary must not expose learner identities');

fwrite(STDOUT, "grade reconciler tests passed\n");
