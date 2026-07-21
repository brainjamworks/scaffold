<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace {
    define('MOODLE_INTERNAL', true);
    define('MUST_EXIST', 2);
    define('COMPLETION_INCOMPLETE', 0);
    define('COMPLETION_COMPLETE', 1);
    define('COMPLETION_TRACKING_AUTOMATIC', 2);

    class invalid_parameter_exception extends \Exception {
    }

    class moodle_exception extends \Exception {
    }

    class coding_exception extends \Exception {
    }

    function get_string(string $identifier, string $component): string {
        return $component . ':' . $identifier;
    }

    function fail_custom_completion_test(string $message): never {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }

    function assert_custom_completion(bool $condition, string $message): void {
        if (!$condition) {
            fail_custom_completion_test($message);
        }
    }

    function assert_custom_completion_same(mixed $expected, mixed $actual, string $message): void {
        if ($expected !== $actual) {
            fail_custom_completion_test(
                $message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true),
            );
        }
    }

    class custom_completion_test_database {
        public array $states = [];
        public int $writes = 0;

        public function __construct(private readonly \stdClass $scaffold) {
        }

        public function get_record(string $table, array $conditions, string $fields = '*', int $strictness = 0): mixed {
            if ($table === 'scaffold' && (int) ($conditions['id'] ?? 0) === (int) $this->scaffold->id) {
                return clone $this->scaffold;
            }
            if ($strictness === MUST_EXIST) {
                throw new moodle_exception('record not found');
            }
            return false;
        }

        public function get_records(string $table, array $conditions): array {
            if ($table !== 'scaffold_assessment_state') {
                return [];
            }
            return array_values(array_filter(
                $this->states,
                static fn(\stdClass $record): bool => (int) $record->scaffoldid === (int) $conditions['scaffoldid']
                    && (!isset($conditions['userid']) || (int) $record->userid === (int) $conditions['userid']),
            ));
        }

        public function insert_record(string $table, \stdClass $record): int {
            $this->writes++;
            throw new \RuntimeException('completion evaluation must be read-only');
        }

        public function update_record(string $table, \stdClass $record): bool {
            $this->writes++;
            throw new \RuntimeException('completion evaluation must be read-only');
        }
    }

    function custom_completion_target(): array {
        return [
            'schemaVersion' => 1,
            'targetId' => 'question-1',
            'blockId' => 'block-question-1',
            'blockType' => 'mcq',
            'interaction' => [
                'kind' => 'single-select',
                'options' => [['id' => 'option-a'], ['id' => 'option-b']],
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
                'maxAttempts' => 1,
            ],
        ];
    }

    function custom_completion_snapshot(?float $score): \stdClass {
        $result = $score === null ? null : (object) [
            'isCorrect' => $score === 1.0,
            'score' => $score,
            'maxScore' => 1,
            'feedback' => null,
            'items' => (object) [],
        ];
        return (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-42',
            'problems' => (object) [
                'question-1' => (object) [
                    'response' => null,
                    'submitted' => $score !== null,
                    'attemptNumber' => $score === null ? 0 : 1,
                    'hintsShown' => 0,
                    'checkResult' => null,
                    'submissionResult' => $result,
                ],
            ],
            'quizzes' => (object) [],
        ];
    }
}

namespace core_course {
    class cm_info {
        public int $id;
        public int $instance;
        public int $course;
        public int $completion;
        public array $customdata;
    }
}

namespace core_completion {
    abstract class activity_custom_completion {
        protected \core_course\cm_info $cm;
        protected int $userid;

        public function __construct(\core_course\cm_info $cm, int $userid, ?array $completionstate = null) {
            $this->cm = $cm;
            $this->userid = $userid;
        }

        protected function validate_rule(string $rule): void {
            if (!in_array($rule, static::get_defined_custom_rules(), true)) {
                throw new \coding_exception('undefined completion rule');
            }
            if (empty($this->cm->customdata['customcompletionrules'][$rule])) {
                throw new \moodle_exception('completion rule is not enabled');
            }
        }

        abstract public function get_state(string $rule): int;
        abstract public static function get_defined_custom_rules(): array;
        abstract public function get_custom_rule_descriptions(): array;
        abstract public function get_sort_order(): array;
    }
}

namespace {
    require_once(__DIR__ . '/../scaffold/classes/local/assessment_target_validator.php');
    require_once(__DIR__ . '/../scaffold/classes/local/assessment_group_validator.php');
    require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
    require_once(__DIR__ . '/../scaffold/classes/local/artifact_identity.php');
    require_once(__DIR__ . '/../scaffold/classes/local/assessment_projection.php');
    require_once(__DIR__ . '/../scaffold/classes/local/assessment_state_repository.php');
    require_once(__DIR__ . '/../scaffold/classes/local/assessment_grade_projector.php');
    require_once(__DIR__ . '/../scaffold/classes/completion/custom_completion.php');

    $scaffold = (object) [
        'id' => 7,
        'course' => 3,
        'name' => 'Completion activity',
        'assessmenttargetsjson' => json_encode([custom_completion_target()], JSON_THROW_ON_ERROR),
        'assessmentgroupsjson' => '[]',
    ];
    $DB = new custom_completion_test_database($scaffold);
    $cm = new \core_course\cm_info();
    $cm->id = 42;
    $cm->instance = 7;
    $cm->course = 3;
    $cm->completion = COMPLETION_TRACKING_AUTOMATIC;
    $cm->customdata = ['customcompletionrules' => ['completionactivitystatus' => 1]];
    $completion = new \mod_scaffold\completion\custom_completion($cm, 11);

    assert_custom_completion_same(
        ['completionactivitystatus'],
        \mod_scaffold\completion\custom_completion::get_defined_custom_rules(),
        'Scaffold must define one activity-status completion rule',
    );
    assert_custom_completion_same(
        ['completionactivitystatus' => 'scaffold:completiondetail:activitystatus'],
        $completion->get_custom_rule_descriptions(),
        'completion rule must expose its learner-facing description',
    );
    assert_custom_completion_same(
        ['completionview', 'completionactivitystatus', 'completionusegrade', 'completionpassgrade'],
        $completion->get_sort_order(),
        'activity status must be ordered with Moodle core completion rules',
    );
    assert_custom_completion_same(
        COMPLETION_INCOMPLETE,
        $completion->get_state('completionactivitystatus'),
        'a learner without accepted assessment state must remain incomplete',
    );
    assert_custom_completion_same(0, $DB->writes, 'completion reads must not create learner assessment state');

    $DB->states = [(object) [
        'scaffoldid' => 7,
        'userid' => 11,
        'snapshotjson' => json_encode(custom_completion_snapshot(null), JSON_THROW_ON_ERROR),
        'timemodified' => 1752746400,
    ]];
    assert_custom_completion_same(
        COMPLETION_INCOMPLETE,
        $completion->get_state('completionactivitystatus'),
        'in-progress activity status must remain incomplete',
    );

    $DB->states[0]->snapshotjson = json_encode(custom_completion_snapshot(1.0), JSON_THROW_ON_ERROR);
    assert_custom_completion_same(
        COMPLETION_COMPLETE,
        $completion->get_state('completionactivitystatus'),
        'completed activity status must satisfy Moodle completion',
    );

    try {
        $completion->get_state('unknownrule');
        fail_custom_completion_test('unknown completion rules must be rejected');
    } catch (coding_exception) {
    }

    $installxml = file_get_contents(__DIR__ . '/../scaffold/db/install.xml');
    $libsource = file_get_contents(__DIR__ . '/../scaffold/lib.php');
    $formsource = file_get_contents(__DIR__ . '/../scaffold/mod_form.php');
    assert_custom_completion($installxml !== false, 'install schema must be readable');
    assert_custom_completion($libsource !== false, 'module callbacks must be readable');
    assert_custom_completion($formsource !== false, 'module form must be readable');
    assert_custom_completion(
        str_contains($installxml, 'FIELD NAME="completionactivitystatus"'),
        'clean installs must persist the completion rule flag',
    );
    assert_custom_completion(
        str_contains($libsource, 'FEATURE_COMPLETION_HAS_RULES => true'),
        'Scaffold must advertise custom completion support',
    );
    assert_custom_completion(
        str_contains($libsource, "['customcompletionrules']['completionactivitystatus']"),
        'cm_info must expose whether the activity-status rule is enabled',
    );
    $reconcilersource = file_get_contents(
        __DIR__ . '/../scaffold/classes/local/quiz_expiry_reconciler.php',
    );
    assert_custom_completion($reconcilersource !== false, 'Quiz expiry reconciler must be readable');
    assert_custom_completion(
        str_contains($reconcilersource, 'reconcile_user_and_apply_effects(')
            && str_contains($reconcilersource, 'scaffold_update_completion('),
        'committed Quiz expiry must request completion through the neutral activity-status callback',
    );
    assert_custom_completion(
        str_contains($formsource, "'completionactivitystatus' . \$suffix"),
        'the completion form field must use Moodle suffixing',
    );
    assert_custom_completion(
        str_contains($formsource, 'function data_postprocessing'),
        'the completion form must persist an unchecked rule as disabled',
    );

    echo "custom completion tests passed\n";
}
