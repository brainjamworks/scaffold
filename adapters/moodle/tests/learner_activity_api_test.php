<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace core\lock {
    class lock_config {
        public static mixed $factory = null;

        public static function get_lock_factory(string $type): mixed {
            return self::$factory;
        }
    }
}

namespace mod_scaffold\local {
    class assessment_state_repository {
        public function get_or_create(int $scaffoldid, int $userid, string $artifactid): \stdClass {
            $stored = $GLOBALS['assessment_bootstrap_snapshot'] ?? null;
            if ($stored instanceof \stdClass) {
                return json_decode(
                    json_encode($stored, JSON_THROW_ON_ERROR),
                    false,
                    512,
                    JSON_THROW_ON_ERROR,
                );
            }
            return (object) [
                'snapshotVersion' => 1,
                'artifactId' => $artifactid,
                'problems' => (object) [],
                'quizzes' => (object) [],
            ];
        }
    }
}

namespace core_external {
    class external_api {
        public static function validate_context(\context_module $context): void {
            \external_api::validate_context($context);
        }
    }
}

namespace {
    define('MOODLE_INTERNAL', true);
    define('MUST_EXIST', 2);
    define('PARAM_INT', 'int');
    define('PARAM_RAW', 'raw');
    define('PARAM_BOOL', 'bool');
    define('PARAM_ALPHA', 'alpha');
    define('VALUE_REQUIRED', 1);
    define('VALUE_OPTIONAL', 2);

    class invalid_parameter_exception extends \Exception {
    }

    class moodle_exception extends \Exception {
        public function __construct(string $message = '', string $component = '') {
            parent::__construct($message);
        }
    }

    class required_capability_exception extends \Exception {
    }

    class dml_write_exception extends \Exception {
    }

    class external_value {
        public function __construct(
            public string $type,
            public string $description,
            public int $required = VALUE_REQUIRED,
        ) {
        }
    }

    class external_function_parameters {
        public function __construct(public array $definition) {
        }
    }

    class external_single_structure {
        public function __construct(public array $definition) {
        }
    }

    class external_api {
        public static function validate_parameters(external_function_parameters $description, array $params): array {
            return $params;
        }

        public static function validate_context(context_module $context): void {
            $GLOBALS['validated_contexts'][] = $context->id;
        }
    }

    class context_module {
        public static function instance(int $id): self {
            $context = new self();
            $context->id = $id;
            return $context;
        }

        public int $id;
    }

    class cm_info extends \stdClass {
        public function __construct(public int $id, public int $instance) {
        }
    }

    function fail_learner_activity_api_test(string $message): never {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }

    function assert_learner_activity_api(bool $condition, string $message): void {
        if (!$condition) {
            fail_learner_activity_api_test($message);
        }
    }

    function assert_learner_activity_api_same(mixed $expected, mixed $actual, string $message): void {
        if ($expected !== $actual) {
            fwrite(STDERR, $message . PHP_EOL);
            fwrite(STDERR, 'Expected: ' . var_export($expected, true) . PHP_EOL);
            fwrite(STDERR, 'Actual:   ' . var_export($actual, true) . PHP_EOL);
            exit(1);
        }
    }

    function decode_learner_activity_api_object(string $json, string $message): \stdClass {
        $decoded = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        assert_learner_activity_api($decoded instanceof \stdClass, $message);
        return $decoded;
    }

    function assert_learner_activity_api_lossless_data(
        \stdClass $numericdata,
        \stdClass $structureddata,
        string $context,
    ): void {
        assert_learner_activity_api_same('zero', $numericdata->{'0'} ?? null, $context . ' must preserve numeric key 0');
        assert_learner_activity_api_same('one', $numericdata->{'1'} ?? null, $context . ' must preserve numeric key 1');
        assert_learner_activity_api_same(
            '{"0":"zero","1":"one"}',
            json_encode($numericdata, JSON_THROW_ON_ERROR),
            $context . ' must keep a numeric-keyed data root as a JSON object',
        );

        assert_learner_activity_api(
            ($structureddata->nestedNumericKeys ?? null) instanceof \stdClass,
            $context . ' must keep nested numeric keys as a JSON object',
        );
        $nestednumeric = $structureddata->nestedNumericKeys;
        assert_learner_activity_api(
            ($nestednumeric->{'0'} ?? null) instanceof \stdClass,
            $context . ' must keep deeply nested numeric keys as a JSON object',
        );
        assert_learner_activity_api_same(
            '{"0":"deep-zero","1":"deep-one"}',
            json_encode($nestednumeric->{'0'}, JSON_THROW_ON_ERROR),
            $context . ' must preserve deeply nested numeric-keyed values',
        );
        assert_learner_activity_api_same(
            'nested-one',
            $nestednumeric->{'1'} ?? null,
            $context . ' must preserve the sibling nested numeric-key value',
        );
        assert_learner_activity_api(
            isset($structureddata->genuineArray)
                && is_array($structureddata->genuineArray)
                && array_is_list($structureddata->genuineArray),
            $context . ' must keep genuine JSON arrays as PHP lists',
        );
        assert_learner_activity_api_same(
            'array-zero',
            $structureddata->genuineArray[0] ?? null,
            $context . ' must preserve genuine JSON array values',
        );
        assert_learner_activity_api(
            ($structureddata->genuineArray[1] ?? null) instanceof \stdClass,
            $context . ' must keep numeric-keyed objects inside arrays as objects',
        );
        assert_learner_activity_api_same(
            '{"0":"object-zero","1":"object-one"}',
            json_encode($structureddata->genuineArray[1], JSON_THROW_ON_ERROR),
            $context . ' must preserve numeric-keyed object values inside arrays',
        );
        assert_learner_activity_api(
            ($structureddata->emptyObject ?? null) instanceof \stdClass
                && get_object_vars($structureddata->emptyObject) === [],
            $context . ' must keep an empty JSON object as stdClass',
        );
    }

    function assert_learner_activity_api_lossless_snapshot(string $snapshotjson, string $context): void {
        $snapshot = decode_learner_activity_api_object($snapshotjson, $context . ' must be a JSON object');
        assert_learner_activity_api(
            ($snapshot->activities ?? null) instanceof \stdClass,
            $context . ' activities must be a JSON object',
        );
        $checklist = $snapshot->activities->{'checklist-1'} ?? null;
        $flashcard = $snapshot->activities->{'flashcard-1'} ?? null;
        assert_learner_activity_api(
            $checklist instanceof \stdClass && $checklist->data instanceof \stdClass,
            $context . ' checklist record and data must remain JSON objects',
        );
        assert_learner_activity_api(
            $flashcard instanceof \stdClass && $flashcard->data instanceof \stdClass,
            $context . ' flashcard record and data must remain JSON objects',
        );
        assert_learner_activity_api_lossless_data($checklist->data, $flashcard->data, $context);
    }

    function expect_learner_activity_api_rejected(
        callable $operation,
        string $exceptionclass,
        string $message,
    ): void {
        try {
            $operation();
            fail_learner_activity_api_test($message);
        } catch (\Throwable $exception) {
            if (!($exception instanceof $exceptionclass)) {
                throw $exception;
            }
        }
    }

    class learner_activity_api_test_lock {
        public bool $released = false;

        public function release(): void {
            $this->released = true;
        }
    }

    class learner_activity_api_test_lock_factory {
        public function get_lock(string $resource, int $timeout): learner_activity_api_test_lock {
            return new learner_activity_api_test_lock();
        }
    }

    class learner_activity_api_test_transaction {
        public function __construct(private learner_activity_api_test_database $database) {
        }

        public function allow_commit(): void {
            $this->database->commit_transaction();
        }

        public function rollback(\Throwable $exception): never {
            $this->database->rollback_transaction();
            throw $exception;
        }
    }

    class learner_activity_api_test_database {
        public int $learnerreads = 0;
        private array $scaffolds;
        private array $learnerrows = [];
        private ?array $transactionrows = null;
        private int $nextid = 1;

        public function __construct(array $scaffolds) {
            $this->scaffolds = $scaffolds;
        }

        public function get_record(string $table, array $conditions, string $fields = '*', int $strictness = 0): \stdClass|false {
            if ($table === 'scaffold') {
                $record = $this->scaffolds[(int) ($conditions['id'] ?? 0)] ?? null;
                if (!$record && $strictness === MUST_EXIST) {
                    throw new invalid_parameter_exception('Scaffold activity not found');
                }
                return $record ? clone $record : false;
            }

            assert_learner_activity_api($table === 'scaffold_learner_activity', 'API repository must use learner storage');
            $this->learnerreads++;
            $key = $this->learner_key($conditions);
            $record = ($this->transactionrows ?? $this->learnerrows)[$key] ?? null;
            return $record ? clone $record : false;
        }

        public function start_delegated_transaction(): learner_activity_api_test_transaction {
            $this->transactionrows = $this->clone_rows($this->learnerrows);
            return new learner_activity_api_test_transaction($this);
        }

        public function insert_record(string $table, \stdClass $record): int {
            assert_learner_activity_api($table === 'scaffold_learner_activity', 'API insert must use learner storage');
            $record = clone $record;
            $record->id = $this->nextid++;
            $this->transactionrows[$this->learner_key((array) $record)] = $record;
            return $record->id;
        }

        public function update_record(string $table, \stdClass $record): void {
            assert_learner_activity_api($table === 'scaffold_learner_activity', 'API update must use learner storage');
            foreach ($this->transactionrows as $key => $current) {
                if ((int) $current->id === (int) $record->id) {
                    $this->transactionrows[$key] = (object) array_merge((array) $current, (array) $record);
                    return;
                }
            }
            fail_learner_activity_api_test('API update must target an existing learner row');
        }

        public function commit_transaction(): void {
            $this->learnerrows = $this->clone_rows($this->transactionrows ?? []);
            $this->transactionrows = null;
        }

        public function rollback_transaction(): void {
            $this->transactionrows = null;
        }

        public function seed_learner_row(int $scaffoldid, int $userid, string $snapshotjson): void {
            $key = $scaffoldid . ':' . $userid;
            $this->learnerrows[$key] = (object) [
                'id' => $this->nextid++,
                'scaffoldid' => $scaffoldid,
                'userid' => $userid,
                'snapshotjson' => $snapshotjson,
                'timecreated' => 1,
                'timemodified' => 1,
            ];
        }

        public function learner_snapshot_json(int $scaffoldid, int $userid): string {
            $row = $this->learnerrows[$scaffoldid . ':' . $userid] ?? null;
            assert_learner_activity_api($row instanceof \stdClass, 'expected a persisted learner activity row');
            return (string) $row->snapshotjson;
        }

        private function learner_key(array $conditions): string {
            return (int) $conditions['scaffoldid'] . ':' . (int) $conditions['userid'];
        }

        private function clone_rows(array $rows): array {
            return array_map(static fn(\stdClass $record): \stdClass => clone $record, $rows);
        }
    }

    function get_course_and_cm_from_cmid(int $cmid, string $modulename): array {
        $cm = $GLOBALS['course_modules'][$cmid] ?? null;
        if (!$cm || $modulename !== 'scaffold') {
            throw new invalid_parameter_exception('Invalid course module id');
        }
        return [(object) ['id' => 1], clone $cm];
    }

    function require_capability(string $capability, context_module $context): void {
        $GLOBALS['capability_checks'][] = [$capability, $context->id, (int) $GLOBALS['USER']->id];
        if ($GLOBALS['deny_view_capability'] && $capability === 'mod/scaffold:view') {
            throw new required_capability_exception('Learner view denied');
        }
    }

    function learner_activity_api_scaffold(int $id, int $cmid, array $learnercontent): \stdClass {
        return (object) [
            'id' => $id,
            'name' => 'Scaffold activity ' . $id,
            'artifactjson' => json_encode([
                'id' => 'stale-id',
                'title' => 'Scaffold activity ' . $id,
                'mode' => 'page',
                'content' => ['type' => 'doc', 'content' => []],
            ], JSON_THROW_ON_ERROR),
            'learnercontentjson' => json_encode($learnercontent, JSON_THROW_ON_ERROR),
            'assessmenttargetsjson' => json_encode([[
                'schemaVersion' => 1,
                'targetId' => 'mcq-1',
                'blockId' => 'mcq-1',
                'blockType' => 'mcq',
                'interaction' => [
                    'kind' => 'single-select',
                    'options' => [['id' => 'a'], ['id' => 'b']],
                ],
                'assessment' => [
                    'kind' => 'single-select',
                    'correctOptionId' => 'b',
                    'feedbackByOptionId' => (object) [],
                ],
                'settings' => [
                    'feedbackMode' => 'on_submit',
                    'isGraded' => true,
                    'showAnswer' => false,
                    'points' => 1,
                    'maxAttempts' => null,
                ],
            ]], JSON_THROW_ON_ERROR),
            'assessmentgroupsjson' => '[]',
        ];
    }

    function learner_activity_api_content(): array {
        return [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'content' => [[
                    'type' => 'surface',
                    'content' => [
                        [
                            'type' => 'checklist',
                            'attrs' => [
                                'id' => 'checklist-1',
                                'data' => [
                                    'content' => [[
                                        'type' => 'flashcard',
                                        'attrs' => ['id' => 'hidden-in-data'],
                                    ]],
                                ],
                            ],
                        ],
                        [
                            'type' => 'layout',
                            'content' => [[
                                'type' => 'flashcard',
                                'attrs' => ['id' => 'flashcard-1'],
                            ]],
                        ],
                    ],
                ]],
            ]],
        ];
    }

    $GLOBALS['course_modules'] = [
        42 => new cm_info(42, 7),
        73 => new cm_info(73, 8),
    ];
    $GLOBALS['deny_view_capability'] = false;
    $GLOBALS['validated_contexts'] = [];
    $GLOBALS['capability_checks'] = [];
    $GLOBALS['USER'] = (object) ['id' => 11];
    $GLOBALS['assessment_bootstrap_snapshot'] = null;
    $scaffolds = [
        7 => learner_activity_api_scaffold(7, 42, learner_activity_api_content()),
        8 => learner_activity_api_scaffold(8, 73, learner_activity_api_content()),
    ];
    $GLOBALS['DB'] = new learner_activity_api_test_database($scaffolds);
    \core\lock\lock_config::$factory = new learner_activity_api_test_lock_factory();

    $externallibdir = sys_get_temp_dir() . '/scaffold-moodle-api-test';
    if (!is_dir($externallibdir)) {
        mkdir($externallibdir, 0777, true);
    }
    file_put_contents($externallibdir . '/externallib.php', "<?php\n");
    $GLOBALS['CFG'] = (object) ['libdir' => $externallibdir];

    require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
    require_once(__DIR__ . '/../scaffold/classes/local/learner_activity_validator.php');
    require_once(__DIR__ . '/../scaffold/classes/local/learner_activity_repository.php');
    require_once(__DIR__ . '/../scaffold/classes/local/activity_scope.php');
    require_once(__DIR__ . '/../scaffold/classes/local/activity_access.php');
    require_once(__DIR__ . '/../scaffold/classes/local/artifact_identity.php');
    require_once(__DIR__ . '/../scaffold/classes/local/assessment_target_validator.php');
    require_once(__DIR__ . '/../scaffold/classes/local/assessment_group_validator.php');
    require_once(__DIR__ . '/../scaffold/classes/local/content_service.php');
    require_once(__DIR__ . '/../scaffold/classes/local/learner_activity_service.php');
    require_once(__DIR__ . '/../scaffold/classes/external/load_learner_activity.php');
    require_once(__DIR__ . '/../scaffold/classes/external/save_learner_activity.php');
    require_once(__DIR__ . '/../scaffold/classes/external/get_payload.php');

    $loadclass = \mod_scaffold\external\load_learner_activity::class;
    $saveclass = \mod_scaffold\external\save_learner_activity::class;
    assert_learner_activity_api_same(
        ['cmid', 'artifactid'],
        array_keys($loadclass::execute_parameters()->definition),
        'load must expose only cmid and artifactid',
    );
    assert_learner_activity_api_same(
        ['success', 'snapshotJson'],
        array_keys($loadclass::execute_returns()->definition),
        'load must return the complete snapshot JSON field',
    );
    assert_learner_activity_api_same(
        ['cmid', 'artifactid', 'blockid', 'recordjson'],
        array_keys($saveclass::execute_parameters()->definition),
        'save must expose the exact timestamp-free operation parameters',
    );
    assert_learner_activity_api_same(
        ['success', 'recordJson'],
        array_keys($saveclass::execute_returns()->definition),
        'save must return the authoritative record JSON field',
    );

    $authorizedmap = \mod_scaffold\local\learner_activity_service::activity_map($scaffolds[7]);
    assert_learner_activity_api_same(
        ['checklist-1' => 'checklist', 'flashcard-1' => 'flashcard'],
        $authorizedmap,
        'stored learner content must recursively authorize checklist and flashcard blocks only',
    );

    $emptyload = $loadclass::execute(42, 'moodle-cm-42');
    assert_learner_activity_api_same(true, $emptyload['success'], 'load must report success');
    assert_learner_activity_api_same(
        ['snapshotVersion' => 1, 'artifactId' => 'moodle-cm-42', 'activities' => []],
        json_decode($emptyload['snapshotJson'], true, 512, JSON_THROW_ON_ERROR),
        'first load must return the complete strict empty current-user snapshot',
    );

    $checklistrecord = json_encode([
        'activityKind' => 'checklist',
        'data' => ['checkedItemIds' => ['item-1']],
        'completed' => false,
    ], JSON_THROW_ON_ERROR);
    $savedchecklist = json_decode(
        $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', $checklistrecord)['recordJson'],
        true,
        512,
        JSON_THROW_ON_ERROR,
    );
    assert_learner_activity_api_same('checklist', $savedchecklist['activityKind'], 'save must preserve activity kind');
    assert_learner_activity_api_same(
        ['checkedItemIds' => ['item-1']],
        $savedchecklist['data'],
        'save must preserve opaque learner data',
    );
    assert_learner_activity_api_same(false, $savedchecklist['completed'], 'save must preserve completion');
    assert_learner_activity_api(
        preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000000Z$/', $savedchecklist['updatedAt']) === 1,
        'save must return Moodle\'s authoritative timestamp',
    );

    $flashcardrecord = json_encode([
        'activityKind' => 'flashcard',
        'data' => ['currentCardId' => 'card-2'],
        'completed' => true,
    ], JSON_THROW_ON_ERROR);
    $savedflashcard = json_decode(
        $saveclass::execute(42, 'moodle-cm-42', 'flashcard-1', $flashcardrecord)['recordJson'],
        true,
        512,
        JSON_THROW_ON_ERROR,
    );
    $fullload = json_decode($loadclass::execute(42, 'moodle-cm-42')['snapshotJson'], true, 512, JSON_THROW_ON_ERROR);
    assert_learner_activity_api_same($savedchecklist, $fullload['activities']['checklist-1'], 'load must retain checklist state');
    assert_learner_activity_api_same($savedflashcard, $fullload['activities']['flashcard-1'], 'load must retain flashcard state');

    $originaldatabase = $GLOBALS['DB'];
    $losslessdatabase = new learner_activity_api_test_database($scaffolds);
    $GLOBALS['DB'] = $losslessdatabase;
    $numericrecordjson = '{"activityKind":"checklist","data":{"0":"zero","1":"one"},"completed":false}';
    $structuredrecordjson = '{"activityKind":"flashcard","data":{'
        . '"nestedNumericKeys":{"0":{"0":"deep-zero","1":"deep-one"},"1":"nested-one"},'
        . '"genuineArray":["array-zero",{"0":"object-zero","1":"object-one"}],'
        . '"emptyObject":{}},"completed":true}';
    $numericresponse = decode_learner_activity_api_object(
        $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', $numericrecordjson)['recordJson'],
        'numeric-key save response must be a JSON object',
    );
    $structuredresponse = decode_learner_activity_api_object(
        $saveclass::execute(42, 'moodle-cm-42', 'flashcard-1', $structuredrecordjson)['recordJson'],
        'structured save response must be a JSON object',
    );
    assert_learner_activity_api(
        $numericresponse->data instanceof \stdClass && $structuredresponse->data instanceof \stdClass,
        'save responses must preserve learner data object identity',
    );
    assert_learner_activity_api_lossless_data(
        $numericresponse->data,
        $structuredresponse->data,
        'save response',
    );
    assert_learner_activity_api_lossless_snapshot(
        $losslessdatabase->learner_snapshot_json(7, 11),
        'persisted snapshot',
    );
    assert_learner_activity_api_lossless_snapshot(
        $loadclass::execute(42, 'moodle-cm-42')['snapshotJson'],
        'subsequent load response',
    );
    assert_learner_activity_api_lossless_snapshot(
        \mod_scaffold\external\get_payload::execute(42, 'learner')['learnerActivitySnapshotJson'],
        'learner bootstrap response',
    );
    $GLOBALS['DB'] = $originaldatabase;

    $GLOBALS['USER']->id = 12;
    $otheruser = json_decode($loadclass::execute(42, 'moodle-cm-42')['snapshotJson'], true, 512, JSON_THROW_ON_ERROR);
    assert_learner_activity_api_same([], $otheruser['activities'], 'load must isolate another current user');
    $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', $checklistrecord);
    $GLOBALS['USER']->id = 11;
    $otheractivity = json_decode($loadclass::execute(73, 'moodle-cm-73')['snapshotJson'], true, 512, JSON_THROW_ON_ERROR);
    assert_learner_activity_api_same([], $otheractivity['activities'], 'load must isolate another Moodle activity');
    $saveclass::execute(73, 'moodle-cm-73', 'flashcard-1', $flashcardrecord);

    $GLOBALS['deny_view_capability'] = true;
    expect_learner_activity_api_rejected(
        static fn() => $loadclass::execute(42, 'moodle-cm-42'),
        required_capability_exception::class,
        'load must require mod/scaffold:view',
    );
    expect_learner_activity_api_rejected(
        static fn() => $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', $checklistrecord),
        required_capability_exception::class,
        'save must require mod/scaffold:view',
    );
    $GLOBALS['deny_view_capability'] = false;

    foreach ([
        [static fn() => $loadclass::execute(999, 'moodle-cm-999'), 'invalid cmid'],
        [static fn() => $loadclass::execute(42, 'moodle-cm-73'), 'foreign artifactid'],
        [static fn() => $saveclass::execute(42, 'moodle-cm-42', '', $checklistrecord), 'blank blockid'],
        [static fn() => $saveclass::execute(42, 'moodle-cm-42', 'missing-block', $checklistrecord), 'unknown blockid'],
        [static fn() => $saveclass::execute(42, 'moodle-cm-42', 'hidden-in-data', $flashcardrecord), 'data-nested blockid'],
        [static fn() => $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', $flashcardrecord), 'mismatched activityKind'],
        [static fn() => $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', '{bad json'), 'malformed JSON'],
        [
            static fn() => $saveclass::execute(
                42,
                'moodle-cm-42',
                'checklist-1',
                json_encode([
                    'activityKind' => 'checklist',
                    'data' => [],
                    'completed' => false,
                    'updatedAt' => null,
                ], JSON_THROW_ON_ERROR),
            ),
            'client timestamp',
        ],
        [
            static fn() => $saveclass::execute(
                42,
                'moodle-cm-42',
                'checklist-1',
                '{"activityKind":"checklist","data":{},"completed":false,"unexpected":true}',
            ),
            'extra record field',
        ],
        [
            static fn() => $saveclass::execute(
                42,
                'moodle-cm-42',
                'checklist-1',
                json_encode([
                    'activityKind' => '   ',
                    'data' => (object) [],
                    'completed' => false,
                ], JSON_THROW_ON_ERROR),
            ),
            'blank activityKind',
        ],
        [
            static fn() => $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', str_repeat('x', 262145)),
            'oversized recordjson',
        ],
    ] as [$operation, $case]) {
        expect_learner_activity_api_rejected(
            $operation,
            invalid_parameter_exception::class,
            'strict operation must reject ' . $case,
        );
    }

    foreach ([
        ['{bad json', 'malformed'],
        [json_encode(['snapshotVersion' => 2, 'artifactId' => 'moodle-cm-42', 'activities' => []]), 'future'],
        [json_encode(['snapshotVersion' => 1, 'artifactId' => 'moodle-cm-73', 'activities' => []]), 'foreign'],
    ] as [$storedjson, $case]) {
        $invaliddatabase = new learner_activity_api_test_database($scaffolds);
        $invaliddatabase->seed_learner_row(7, 11, $storedjson);
        $GLOBALS['DB'] = $invaliddatabase;
        expect_learner_activity_api_rejected(
            static fn() => $loadclass::execute(42, 'moodle-cm-42'),
            invalid_parameter_exception::class,
            $case . ' stored snapshots must fail without fallback',
        );
    }
    $GLOBALS['DB'] = $database = new learner_activity_api_test_database($scaffolds);
    $saveclass::execute(42, 'moodle-cm-42', 'checklist-1', $checklistrecord);

    foreach ([
        learner_activity_api_scaffold(9, 90, [
            'type' => 'doc',
            'content' => [['type' => 'checklist', 'attrs' => ['id' => '   ']]],
        ]),
        learner_activity_api_scaffold(10, 91, [
            'type' => 'doc',
            'content' => [
                ['type' => 'checklist', 'attrs' => ['id' => 'shared-id']],
                ['type' => 'flashcard', 'attrs' => ['id' => 'shared-id']],
            ],
        ]),
    ] as $invalidcontent) {
        expect_learner_activity_api_rejected(
            static fn() => \mod_scaffold\local\learner_activity_service::activity_map($invalidcontent),
            invalid_parameter_exception::class,
            'stored content must reject blank ids and conflicting duplicate activity ids',
        );
    }

    $beforepayloadreads = $database->learnerreads;
    $GLOBALS['assessment_bootstrap_snapshot'] = (object) [
        'snapshotVersion' => 1,
        'artifactId' => 'moodle-cm-42',
        'problems' => (object) [
            'mcq-1' => (object) [
                'response' => (object) ['kind' => 'single-select', 'optionId' => 'a'],
                'submitted' => true,
                'attemptNumber' => 1,
                'hintsShown' => 0,
                'checkResult' => null,
                'submissionResult' => (object) [
                    'isCorrect' => false,
                    'score' => 0,
                    'maxScore' => 1,
                    'feedback' => (object) ['sentinel' => 'Bootstrap summary feedback sentinel'],
                    'items' => (object) [
                        'a' => (object) [
                            'correct' => false,
                            'expected' => false,
                            'given' => true,
                            'feedback' => (object) ['sentinel' => 'Bootstrap item feedback sentinel'],
                        ],
                        'b' => (object) [
                            'correct' => false,
                            'expected' => true,
                            'given' => false,
                        ],
                    ],
                ],
            ],
        ],
        'quizzes' => (object) [],
    ];
    $learnerpayload = \mod_scaffold\external\get_payload::execute(42, 'learner');
    assert_learner_activity_api(
        array_key_exists('learnerActivitySnapshotJson', $learnerpayload),
        'learner payload must include activity bootstrap',
    );
    assert_learner_activity_api(
        array_key_exists('assessmentSnapshotJson', $learnerpayload),
        'learner payload must retain assessment bootstrap',
    );
    assert_learner_activity_api_same(
        'moodle-cm-42',
        json_decode($learnerpayload['learnerActivitySnapshotJson'], true, 512, JSON_THROW_ON_ERROR)['artifactId'],
        'learner activity bootstrap must be a separate strict snapshot',
    );
    assert_learner_activity_api_same(
        'moodle-cm-42',
        json_decode($learnerpayload['assessmentSnapshotJson'], true, 512, JSON_THROW_ON_ERROR)['artifactId'],
        'assessment bootstrap must coexist independently beside learner activity',
    );
    $assessmentbootstrapjson = $learnerpayload['assessmentSnapshotJson'];
    $assessmentbootstrap = json_decode($assessmentbootstrapjson, false, 512, JSON_THROW_ON_ERROR);
    assert_learner_activity_api(
        !str_contains($assessmentbootstrapjson, '"expected"')
            && !str_contains($assessmentbootstrapjson, 'Bootstrap summary feedback sentinel')
            && !str_contains($assessmentbootstrapjson, 'Bootstrap item feedback sentinel'),
        'learner assessment bootstrap must redact standalone answer material when showAnswer is disabled',
    );
    assert_learner_activity_api_same(
        [],
        get_object_vars($assessmentbootstrap->problems->{'mcq-1'}->submissionResult->items ?? (object) []),
        'learner assessment bootstrap must not expose reconstructable item outcomes',
    );
    assert_learner_activity_api_same(
        $beforepayloadreads + 1,
        $database->learnerreads,
        'initial Moodle payload must read exactly one learner activity bootstrap source',
    );

    $beforeauthorreads = $database->learnerreads;
    $authoringpayload = \mod_scaffold\external\get_payload::execute(42, 'authoring');
    assert_learner_activity_api(
        !array_key_exists('learnerActivitySnapshotJson', $authoringpayload),
        'authoring payload must omit learner activity bootstrap',
    );
    assert_learner_activity_api_same(
        $beforeauthorreads,
        $database->learnerreads,
        'authoring payload must not load learner activity state',
    );

    $servicessource = file_get_contents(__DIR__ . '/../scaffold/db/services.php');
    assert_learner_activity_api($servicessource !== false, 'services.php must be readable');
    assert_learner_activity_api(
        str_contains($servicessource, "'mod_scaffold_load_learner_activity'")
            && str_contains($servicessource, "'mod_scaffold_save_learner_activity'"),
        'learner activity load and save operations must be independently registered',
    );
    foreach ([
        __DIR__ . '/../scaffold/classes/external/load_learner_activity.php',
        __DIR__ . '/../scaffold/classes/external/save_learner_activity.php',
    ] as $endpointpath) {
        $source = file_get_contents($endpointpath);
        assert_learner_activity_api($source !== false, 'learner activity endpoint source must be readable');
        assert_learner_activity_api(
            preg_match('/assessment_state_repository|scaffold_assessment_state|grade/i', $source) !== 1,
            'learner activity endpoints must not depend on assessment or Gradebook code',
        );
        assert_learner_activity_api(
            str_contains($source, 'new learner_activity_service()')
                && !str_contains($source, 'load_legacy(')
                && !str_contains($source, 'save_legacy('),
            'learner activity endpoints must delegate directly to learner_activity_service',
        );
    }

    echo "learner activity API tests passed\n";
}
