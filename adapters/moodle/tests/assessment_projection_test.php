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
        public function __construct(string $message = '') {
            parent::__construct($message);
        }
    }
}

if (!class_exists('cm_info')) {
    class cm_info {
        public function __construct(public int $id) {
        }
    }
}

if (!class_exists('context_module')) {
    class context_module {
    }
}

function fail_assessment_projection_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function assert_projection_test(bool $condition, string $message): void {
    if (!$condition) {
        fail_assessment_projection_test($message);
    }
}

assert_projection_test(
    is_file(__DIR__ . '/../scaffold/classes/local/artifact_identity.php'),
    'artifact identity must have a focused owner',
);
assert_projection_test(
    is_file(__DIR__ . '/../scaffold/classes/local/assessment_projection.php'),
    'assessment projection must have a focused owner',
);

function expect_projection_rejected(callable $operation, string $message): void {
    try {
        $operation();
        fail_assessment_projection_test($message);
    } catch (invalid_parameter_exception) {
    }
}

function projection_test_target(string $targetid = 'question-1'): array {
    return [
        'schemaVersion' => 1,
        'targetId' => $targetid,
        'blockId' => 'block-' . $targetid,
        'blockType' => 'mcq',
        'interaction' => [
            'kind' => 'single-select',
            'options' => [
                ['id' => 'option-a'],
                ['id' => 'option-b'],
            ],
        ],
        'assessment' => [
            'kind' => 'single-select',
            'correctOptionId' => 'option-b',
            'feedbackByOptionId' => (object) [],
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

function projection_test_group(array $targetids = ['question-1']): array {
    return [
        'schemaVersion' => 1,
        'kind' => 'quiz',
        'groupId' => 'quiz-1',
        'targetIds' => $targetids,
        'settings' => [
            'allowBacktracking' => true,
            'reviewTiming' => 'after_quiz',
            'reviewDetail' => 'result_only',
            'attemptsPerQuestion' => 1,
            'isGraded' => true,
            'timer' => ['enabled' => false, 'durationSeconds' => 0],
        ],
    ];
}

function projection_test_course_document(): array {
    return [
        'type' => 'doc',
        'content' => [[
            'type' => 'courseDocument',
            'attrs' => ['mode' => 'page'],
            'content' => [],
        ]],
    ];
}

function projection_test_activity(array $targets = [], array $groups = []): stdClass {
    return (object) [
        'id' => 7,
        'course' => 3,
        'name' => 'Existing lesson',
        'artifactjson' => json_encode([
            'id' => 'moodle-cm-42',
            'title' => 'Existing lesson',
            'mode' => 'page',
            'content' => projection_test_course_document(),
        ], JSON_THROW_ON_ERROR),
        'learnercontentjson' => json_encode(projection_test_course_document(), JSON_THROW_ON_ERROR),
        'assessmenttargetsjson' => json_encode($targets, JSON_THROW_ON_ERROR),
        'assessmentgroupsjson' => json_encode($groups, JSON_THROW_ON_ERROR),
        'grade' => 100.0,
        'assessmentdefinitionversion' => 1,
        'gradeitemversion' => 1,
        'gradeitemstatus' => 'published',
        'gradeitemfailurecode' => null,
        'gradeitemretrycount' => 0,
        'gradeitemretryafter' => null,
        'gradeitemtimemodified' => 1,
        'timemodified' => 1,
    ];
}

function projection_test_save_arguments(array $targets, array $groups): array {
    $content = projection_test_course_document();

    return [
        json_encode([
            'id' => 'moodle-cm-42',
            'title' => 'Saved lesson',
            'mode' => 'page',
            'content' => $content,
        ], JSON_THROW_ON_ERROR),
        json_encode($content, JSON_THROW_ON_ERROR),
        json_encode($targets, JSON_THROW_ON_ERROR),
        json_encode($groups, JSON_THROW_ON_ERROR),
    ];
}

function projection_test_save(
    stdClass $scaffold,
    int $cmid,
    string $artifactjson,
    string $learnercontentjson,
    string $assessmenttargetsjson,
    string $assessmentgroupsjson,
): stdClass {
    $scope = new \mod_scaffold\local\activity_scope(
        (object) ['id' => $scaffold->course],
        new cm_info($cmid),
        new context_module(),
        $scaffold,
        11,
        'mod/scaffold:editcontent',
    );
    return (new \mod_scaffold\local\content_service())->save(
        $scope,
        $artifactjson,
        $learnercontentjson,
        $assessmenttargetsjson,
        $assessmentgroupsjson,
    )['content'];
}

class projection_test_transaction {
    public function __construct(private projection_test_database $database) {
    }

    public function allow_commit(): void {
        $this->database->commit_transaction();
    }

    public function rollback(Throwable $exception): never {
        $this->database->rollback_transaction();
        throw $exception;
    }
}

class projection_test_database {
    public stdClass $record;
    public int $transactions = 0;
    public int $commits = 0;
    public int $rollbacks = 0;
    public int $updates = 0;
    public bool $failupdate = false;
    private ?stdClass $stagedrecord = null;
    private bool $intransaction = false;

    public function __construct(stdClass $record) {
        $this->record = clone $record;
    }

    public function start_delegated_transaction(): projection_test_transaction {
        $this->transactions++;
        $this->intransaction = true;
        $this->stagedrecord = clone $this->record;
        return new projection_test_transaction($this);
    }

    public function update_record(string $table, stdClass $record): void {
        assert_projection_test($table === 'scaffold', 'save must update only the scaffold activity row');
        $this->updates++;
        if ($this->failupdate) {
            throw new RuntimeException('simulated activity update failure');
        }

        if ($this->intransaction) {
            $this->stagedrecord = clone $record;
            return;
        }

        $this->record = clone $record;
    }

    public function get_records(string $table, array $conditions, string $sort = '', string $fields = '*'): array {
        return [];
    }

    public function commit_transaction(): void {
        assert_projection_test($this->intransaction, 'save must commit an active transaction');
        $this->record = clone $this->stagedrecord;
        $this->stagedrecord = null;
        $this->intransaction = false;
        $this->commits++;
    }

    public function rollback_transaction(): void {
        assert_projection_test($this->intransaction, 'save must roll back an active transaction');
        $this->stagedrecord = null;
        $this->intransaction = false;
        $this->rollbacks++;
    }
}

$plugindir = sys_get_temp_dir() . '/scaffold-assessment-projection-' . getmypid();
$pluginlibdir = $plugindir . '/mod/scaffold';
if (!is_dir($pluginlibdir) && !mkdir($pluginlibdir, 0777, true) && !is_dir($pluginlibdir)) {
    fail_assessment_projection_test('could not create temporary Moodle plugin fixture');
}
$pluginlib = <<<'PHP'
<?php
function scaffold_grade_item_update(stdClass $scaffold): int {
    global $projection_test_grade_failure;
    if ($projection_test_grade_failure) {
        throw new RuntimeException('simulated grade item refresh failure');
    }
    return 0;
}
PHP;
if (file_put_contents($pluginlibdir . '/lib.php', $pluginlib) === false) {
    fail_assessment_projection_test('could not create temporary Moodle plugin library fixture');
}

$CFG = (object) ['dirroot' => $plugindir];
$projection_test_grade_failure = false;

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_target_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_group_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/activity_scope.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_definition.php');
require_once(__DIR__ . '/../scaffold/classes/local/artifact_identity.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_grade_projector.php');
require_once(__DIR__ . '/../scaffold/classes/local/assessment_projection.php');
require_once(__DIR__ . '/../scaffold/classes/local/content_service.php');

use mod_scaffold\local\activity_scope;
use mod_scaffold\local\assessment_projection;
use mod_scaffold\local\content_service;

$emptybundle = assessment_projection::for_activity(projection_test_activity());
assert_projection_test(
    $emptybundle === ['targets' => [], 'groups' => []],
    'strict projection reads must preserve the valid empty bundle',
);

$target = projection_test_target();
$group = projection_test_group();
$populatedbundle = assessment_projection::for_activity(projection_test_activity([$target], [$group]));
assert_projection_test(
    json_encode($populatedbundle, JSON_THROW_ON_ERROR) === json_encode([
        'targets' => [$target],
        'groups' => [$group],
    ], JSON_THROW_ON_ERROR),
    'strict projection reads must preserve a valid populated bundle',
);

$invalidstoredactivities = [];
$invalidstoredactivities[] = (object) array_merge(
    (array) projection_test_activity(),
    ['assessmenttargetsjson' => '{bad json'],
);
$oldtarget = $target;
unset($oldtarget['schemaVersion']);
$invalidstoredactivities[] = projection_test_activity([$oldtarget], []);
$futuretarget = $target;
$futuretarget['schemaVersion'] = 2;
$invalidstoredactivities[] = projection_test_activity([$futuretarget], []);
$invalidstoredactivities[] = (object) array_merge(
    (array) projection_test_activity([$target], []),
    ['assessmentgroupsjson' => '{bad json'],
);
$oldgroup = $group;
unset($oldgroup['schemaVersion']);
$invalidstoredactivities[] = projection_test_activity([$target], [$oldgroup]);
$futuregroup = $group;
$futuregroup['schemaVersion'] = 2;
$invalidstoredactivities[] = projection_test_activity([$target], [$futuregroup]);
$invalidstoredactivities[] = projection_test_activity([$target], [projection_test_group(['missing-target'])]);
$duplicatecanonicalgroup = projection_test_group();
$duplicategroup = projection_test_group();
$duplicategroup['targetIds'] = ['question-1'];
$invalidstoredactivities[] = projection_test_activity(
    [$target],
    [$duplicatecanonicalgroup, $duplicategroup],
);

foreach ($invalidstoredactivities as $index => $invalidactivity) {
    expect_projection_rejected(
        static fn() => assessment_projection::for_activity($invalidactivity),
        'strict projection read must reject invalid stored bundle case ' . $index,
    );
}

$DB = new projection_test_database(projection_test_activity([$target], [projection_test_group(['missing-target'])]));
expect_projection_rejected(
    static fn() => assessment_projection::raw_grade_for_user(clone $DB->record, 11),
    'every trusted target read must validate the complete stored target/group bundle',
);

$existing = projection_test_activity();
$DB = new projection_test_database($existing);
$activity = clone $existing;
$invalidgroup = projection_test_group(['missing-target']);
[$artifactjson, $learnercontentjson, $targetsjson, $groupsjson] = projection_test_save_arguments(
    [$target],
    [$invalidgroup],
);
$beforeactivity = serialize($activity);
expect_projection_rejected(
    static fn() => projection_test_save(
        $activity,
        42,
        $artifactjson,
        $learnercontentjson,
        $targetsjson,
        $groupsjson,
    ),
    'author save must reject invalid target/group membership',
);
assert_projection_test(serialize($activity) === $beforeactivity, 'validation failure must not mutate activity fields');
assert_projection_test($DB->updates === 0, 'validation failure must not write the activity row');
assert_projection_test($DB->transactions === 0, 'validation failure must occur before starting the save transaction');

[$artifactjson, $learnercontentjson, $targetsjson, $groupsjson] = projection_test_save_arguments(
    [$target],
    [$group, $group],
);
expect_projection_rejected(
    static fn() => projection_test_save(
        clone $existing,
        42,
        $artifactjson,
        $learnercontentjson,
        $targetsjson,
        $groupsjson,
    ),
    'author save must reject duplicate group identities before persistence',
);
assert_projection_test($DB->updates === 0, 'duplicate group validation must not write the activity row');
assert_projection_test($DB->transactions === 0, 'duplicate group validation must precede the save transaction');

[$artifactjson, $learnercontentjson, $targetsjson, $groupsjson] = projection_test_save_arguments(
    [$target],
    [$group],
);

$DB = new projection_test_database($existing);
$DB->failupdate = true;
try {
    projection_test_save(
        clone $existing,
        42,
        $artifactjson,
        $learnercontentjson,
        $targetsjson,
        $groupsjson,
    );
    fail_assessment_projection_test('activity update failure must escape the save boundary');
} catch (RuntimeException $exception) {
    assert_projection_test($exception->getMessage() === 'simulated activity update failure', 'save must preserve update failure');
}
assert_projection_test($DB->rollbacks === 1, 'activity update failure must roll back the save transaction');
assert_projection_test($DB->record->name === 'Existing lesson', 'activity update failure must preserve stored activity fields');
assert_projection_test($DB->record->assessmenttargetsjson === '[]', 'activity update failure must preserve stored targets');
assert_projection_test($DB->record->assessmentgroupsjson === '[]', 'activity update failure must preserve stored groups');
assert_projection_test(
    $DB->record->assessmentdefinitionversion === 1,
    'activity update failure must roll back the definition version',
);

$DB = new projection_test_database($existing);
$projection_test_grade_failure = true;
$savedaftergradefailure = projection_test_save(
    clone $existing,
    42,
    $artifactjson,
    $learnercontentjson,
    $targetsjson,
    $groupsjson,
);
$projection_test_grade_failure = false;
assert_projection_test($DB->commits === 1, 'content must commit before grade item refresh');
assert_projection_test($DB->rollbacks === 0, 'grade item refresh failure must not roll back committed content');
assert_projection_test($savedaftergradefailure->name === 'Saved lesson', 'grade item failure must preserve confirmation');
assert_projection_test($DB->record->name === 'Saved lesson', 'grade item failure must preserve saved activity fields');
assert_projection_test(
    $DB->record->assessmenttargetsjson === json_encode([$target], JSON_THROW_ON_ERROR),
    'grade item failure must preserve saved targets',
);
assert_projection_test(
    $DB->record->assessmentgroupsjson === json_encode([$group], JSON_THROW_ON_ERROR),
    'grade item failure must preserve saved groups',
);
assert_projection_test(
    $DB->record->assessmentdefinitionversion === 2,
    'grade-relevant content must advance the definition version once',
);
assert_projection_test($DB->record->gradeitemstatus === 'pending', 'definition change must mark the item pending');

$DB = new projection_test_database($existing);
$diagnostic = null;
$scope = new activity_scope(
    (object) ['id' => 3],
    new cm_info(42),
    new context_module(),
    clone $existing,
    11,
    'mod/scaffold:editcontent',
);
$service = new content_service(
    static function(stdClass $saved): void {
        throw new RuntimeException('simulated grade item refresh failure');
    },
    static function(Throwable $exception, stdClass $saved) use (&$diagnostic): void {
        $diagnostic = [
            'message' => $exception->getMessage(),
            'activityid' => $saved->id,
        ];
    },
);
$resultaftergradefailure = $service->save(
    $scope,
    $artifactjson,
    $learnercontentjson,
    $targetsjson,
    $groupsjson,
);
assert_projection_test(
    $resultaftergradefailure['content']->name === 'Saved lesson',
    'content confirmation must remain available when grade item publication fails',
);
assert_projection_test(
    $resultaftergradefailure['gradeItemPublication'] === 'failed',
    'grade item failure must return an explicit host-effect outcome',
);
assert_projection_test(
    $diagnostic === [
        'message' => 'simulated grade item refresh failure',
        'activityid' => 7,
    ],
    'grade item failure must retain its native diagnostic cause server-side',
);

$DB = new projection_test_database($existing);
$saved = projection_test_save(
    clone $existing,
    42,
    $artifactjson,
    $learnercontentjson,
    $targetsjson,
    $groupsjson,
);
assert_projection_test($DB->transactions === 1, 'valid author save must use one transaction');
assert_projection_test($DB->commits === 1, 'valid author save must commit once');
assert_projection_test($DB->rollbacks === 0, 'valid author save must not roll back');
assert_projection_test($DB->updates === 1, 'valid author save must update the activity row once');
assert_projection_test($saved->name === 'Saved lesson', 'valid author save must return the saved activity');
assert_projection_test(
    $DB->record->assessmenttargetsjson === json_encode([$target], JSON_THROW_ON_ERROR),
    'valid author save must persist the complete strict target projection',
);
assert_projection_test(
    $DB->record->assessmentgroupsjson === json_encode([$group], JSON_THROW_ON_ERROR),
    'valid author save must persist the complete strict group projection in the same row update',
);
assert_projection_test(
    $DB->record->assessmentdefinitionversion === 2,
    'one content transaction must advance the definition version exactly once',
);

$titleonly = projection_test_activity();
$DB = new projection_test_database($titleonly);
[$titleartifact, $titlelearner, $emptytargets, $emptygroups] = projection_test_save_arguments([], []);
projection_test_save(clone $titleonly, 42, $titleartifact, $titlelearner, $emptytargets, $emptygroups);
assert_projection_test(
    $DB->record->assessmentdefinitionversion === 1,
    'title-only content save must not invalidate learner grade projections',
);
assert_projection_test($DB->record->gradeitemstatus === 'pending', 'title-only save must refresh item metadata');
assert_projection_test($DB->updates === 1, 'author save must not write learner publication rows synchronously');

unlink($pluginlibdir . '/lib.php');
rmdir($pluginlibdir);
rmdir(dirname($pluginlibdir));
rmdir($plugindir);

echo "assessment projection tests passed\n";
