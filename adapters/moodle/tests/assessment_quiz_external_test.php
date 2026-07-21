<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local {
    class quiz_external_test_state {
        public static array $activitycalls = [];
        public static array $operationcalls = [];
        public static bool $deny = false;

        public static function attempt(string $operation, array $arguments): \stdClass {
            self::$operationcalls[] = [$operation, $arguments];
            return (object) [
                'attemptId' => 'attempt-1',
                'groupId' => 'quiz-1',
                'status' => $operation === 'start' ? 'in_progress' : 'completed',
            ];
        }
    }

    class activity_access {
        public static function require(int $cmid, string $capability): \stdClass {
            quiz_external_test_state::$activitycalls[] = [$cmid, $capability, (int) $GLOBALS['USER']->id];
            if (quiz_external_test_state::$deny) {
                throw new \required_capability_exception('Quiz submission denied');
            }
            return (object) [
                'course' => (object) ['id' => 3],
                'cm' => (object) ['id' => $cmid],
                'context' => (object) ['id' => $cmid],
                'instance' => (object) ['id' => 7],
                'actorid' => (int) $GLOBALS['USER']->id,
                'capability' => $capability,
            ];
        }
    }

    class assessment_service {
        public function start_quiz(\stdClass $scope, string $groupid): array {
            return self::canonical(quiz_external_test_state::attempt('start', [
                $scope->instance->id,
                $scope->cm->id,
                $scope->actorid,
                $groupid,
            ]));
        }

        public function submit_quiz_question(
            \stdClass $scope,
            string $attemptid,
            string $groupid,
            string $targetid,
            array $response,
            int $expectedattemptnumber,
        ): array {
            return self::canonical(quiz_external_test_state::attempt('submit', [
                $scope->instance->id,
                $scope->cm->id,
                $scope->actorid,
                $attemptid,
                $groupid,
                $targetid,
                json_encode($response, JSON_THROW_ON_ERROR),
                $expectedattemptnumber,
            ]));
        }

        public function finish_quiz(
            \stdClass $scope,
            string $attemptid,
            string $groupid,
            array $responses,
        ): array {
            return self::canonical(quiz_external_test_state::attempt('finish', [
                $scope->instance->id,
                $scope->cm->id,
                $scope->actorid,
                $attemptid,
                $groupid,
                json_encode($responses, JSON_THROW_ON_ERROR),
            ]));
        }

        public function reveal_quiz(\stdClass $scope, string $attemptid, string $groupid): array {
            return self::canonical(quiz_external_test_state::attempt('reveal', [
                $scope->instance->id,
                $scope->cm->id,
                $scope->actorid,
                $attemptid,
                $groupid,
            ]));
        }

        public function reveal_hint(
            \stdClass $scope,
            string $problemid,
            string $targetid,
            string $interactionkind,
            int $hintsshown,
        ): array {
            quiz_external_test_state::$operationcalls[] = ['hint', [
                $scope->instance->id,
                $scope->cm->id,
                $scope->actorid,
                $problemid,
                $targetid,
                $interactionkind,
                $hintsshown,
            ]];
            return [
                'outcome' => (object) [
                    'problem' => (object) [
                        'response' => null,
                        'submitted' => false,
                        'attemptNumber' => 0,
                        'hintsShown' => $hintsshown,
                        'checkResult' => null,
                        'submissionResult' => null,
                    ],
                ],
                'gradePublication' => null,
            ];
        }

        private static function canonical(\stdClass $attempt): array {
            return [
                'outcome' => (object) [
                    'quizAttempt' => $attempt,
                    'problemsByTargetId' => (object) [],
                ],
                'gradePublication' => null,
            ];
        }
    }

    class content_service {
        public static function read_json_object(string $raw, array $fallback): array {
            $value = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            return is_array($value) && !array_is_list($value) ? $value : $fallback;
        }
    }
}

namespace {
    define('MOODLE_INTERNAL', true);
    define('PARAM_INT', 'int');
    define('PARAM_RAW', 'raw');
    define('PARAM_ALPHANUMEXT', 'alphanumext');
    define('PARAM_BOOL', 'bool');

    class invalid_parameter_exception extends \Exception {
    }

    class required_capability_exception extends \Exception {
    }

    class external_value {
        public function __construct(public string $type, public string $description) {
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
        public static array $validated = [];

        public static function validate_parameters(external_function_parameters $description, array $params): array {
            if (array_keys($params) !== array_keys($description->definition)) {
                throw new invalid_parameter_exception('External parameters do not match the declaration');
            }
            foreach ($description->definition as $name => $value) {
                $actual = $params[$name];
                if (($value->type === PARAM_INT && !is_int($actual))
                    || (in_array($value->type, [PARAM_RAW, PARAM_ALPHANUMEXT], true)
                        && !is_string($actual))) {
                    throw new invalid_parameter_exception('External parameter has the wrong type: ' . $name);
                }
            }
            self::$validated[] = $params;
            return $params;
        }
    }

    function fail_assessment_quiz_external_test(string $message): never {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }

    function assert_assessment_quiz_external(bool $condition, string $message): void {
        if (!$condition) {
            fail_assessment_quiz_external_test($message);
        }
    }

    function assert_assessment_quiz_external_same(mixed $expected, mixed $actual, string $message): void {
        if ($expected !== $actual) {
            fail_assessment_quiz_external_test(
                $message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true),
            );
        }
    }

    function expect_assessment_quiz_external_rejected(callable $operation, string $exceptionclass, string $message): void {
        try {
            $operation();
            fail_assessment_quiz_external_test($message);
        } catch (\Throwable $exception) {
            if (!($exception instanceof $exceptionclass)) {
                throw $exception;
            }
        }
    }

    $externallibdir = sys_get_temp_dir() . '/scaffold-quiz-external-' . getmypid();
    if (!is_dir($externallibdir) && !mkdir($externallibdir, 0777, true) && !is_dir($externallibdir)) {
        fail_assessment_quiz_external_test('could not create temporary Moodle external fixture');
    }
    $externallibpath = $externallibdir . '/externallib.php';
    if (file_put_contents($externallibpath, "<?php\n") === false) {
        fail_assessment_quiz_external_test('could not create temporary Moodle externallib fixture');
    }

    $CFG = (object) ['libdir' => $externallibdir];
    $USER = (object) ['id' => 27];

    require_once(__DIR__ . '/../scaffold/classes/external/start_quiz_attempt.php');
    require_once(__DIR__ . '/../scaffold/classes/external/submit_quiz_question.php');
    require_once(__DIR__ . '/../scaffold/classes/external/finish_quiz_attempt.php');
    require_once(__DIR__ . '/../scaffold/classes/external/reveal_quiz_answers.php');
    require_once(__DIR__ . '/../scaffold/classes/external/reveal_hint.php');

    $operations = [
        [
            \mod_scaffold\external\start_quiz_attempt::class,
            ['cmid', 'groupid'],
            static fn(): array => \mod_scaffold\external\start_quiz_attempt::execute(42, 'quiz-1'),
        ],
        [
            \mod_scaffold\external\submit_quiz_question::class,
            ['cmid', 'attemptid', 'groupid', 'targetid', 'responsejson', 'expectedattemptnumber'],
            static fn(): array => \mod_scaffold\external\submit_quiz_question::execute(
                42,
                'attempt-1',
                'quiz-1',
                'question-1',
                '{"kind":"single-select","optionId":"option-b"}',
                0,
            ),
        ],
        [
            \mod_scaffold\external\finish_quiz_attempt::class,
            ['cmid', 'attemptid', 'groupid', 'responsesjson'],
            static fn(): array => \mod_scaffold\external\finish_quiz_attempt::execute(
                42,
                'attempt-1',
                'quiz-1',
                '{"question-1":{"kind":"single-select","optionId":"option-b"}}',
            ),
        ],
        [
            \mod_scaffold\external\reveal_quiz_answers::class,
            ['cmid', 'attemptid', 'groupid'],
            static fn(): array => \mod_scaffold\external\reveal_quiz_answers::execute(
                42,
                'attempt-1',
                'quiz-1',
            ),
        ],
    ];

    foreach ($operations as [$class, $parameterkeys, $execute]) {
        assert_assessment_quiz_external_same(
            $parameterkeys,
            array_keys($class::execute_parameters()->definition),
            $class . ' must expose the strict operation parameters',
        );
        assert_assessment_quiz_external_same(
            ['success', 'outcomeJson', 'gradePublicationJson'],
            array_keys($class::execute_returns()->definition),
            $class . ' must expose the strict Quiz result shape',
        );
        $result = $execute();
        assert_assessment_quiz_external_same(true, $result['success'], $class . ' must report success');
        $outcome = json_decode($result['outcomeJson'], false, 512, JSON_THROW_ON_ERROR);
        $attempt = $outcome->quizAttempt;
        assert_assessment_quiz_external_same('attempt-1', $attempt->attemptId, $class . ' must return the API attempt');
        assert_assessment_quiz_external_same(
            [],
            get_object_vars($outcome->problemsByTargetId),
            $class . ' must return the canonical problem map',
        );
    }

    assert_assessment_quiz_external_same(
        ['cmid', 'problemid', 'targetid', 'interactionkind', 'hintsshown'],
        array_keys(\mod_scaffold\external\reveal_hint::execute_parameters()->definition),
        'hint reveal must expose only the canonical port request fields',
    );
    assert_assessment_quiz_external_same(
        ['success', 'outcomeJson', 'gradePublicationJson'],
        array_keys(\mod_scaffold\external\reveal_hint::execute_returns()->definition),
        'hint reveal must expose canonical state separately from grade publication',
    );
    $hintresult = \mod_scaffold\external\reveal_hint::execute(
        42,
        'artifact:moodle-cm-42/block:question-1',
        'question-1',
        'single-select',
        1,
    );
    assert_assessment_quiz_external_same(true, $hintresult['success'], 'hint reveal must report success');
    $hintoutcome = json_decode($hintresult['outcomeJson'], false, 512, JSON_THROW_ON_ERROR);
    assert_assessment_quiz_external_same(
        1,
        $hintoutcome->problem->hintsShown,
        'hint reveal must route the authoritative canonical problem',
    );
    assert_assessment_quiz_external_same(
        null,
        json_decode($hintresult['gradePublicationJson'], false, 512, JSON_THROW_ON_ERROR),
        'hint reveal must keep grade publication separate and empty',
    );

    assert_assessment_quiz_external_same(
        array_fill(0, 5, [42, 'mod/scaffold:submit', 27]),
        \mod_scaffold\local\quiz_external_test_state::$activitycalls,
        'every Quiz external method must resolve context and submit capability for the current user',
    );
    assert_assessment_quiz_external_same(
        ['start', 'submit', 'finish', 'reveal', 'hint'],
        array_column(\mod_scaffold\local\quiz_external_test_state::$operationcalls, 0),
        'every Quiz external method must route exactly one matching operation',
    );
    foreach (\mod_scaffold\local\quiz_external_test_state::$operationcalls as [, $arguments]) {
        assert_assessment_quiz_external(
            in_array(27, $arguments, true),
            'every Quiz external operation must use the current learner identity',
        );
    }

    expect_assessment_quiz_external_rejected(
        static fn() => external_api::validate_parameters(
            \mod_scaffold\external\start_quiz_attempt::execute_parameters(),
            ['cmid' => '42', 'groupid' => 'quiz-1'],
        ),
        invalid_parameter_exception::class,
        'Quiz parameter validation must reject the wrong declared type',
    );
    \mod_scaffold\local\quiz_external_test_state::$deny = true;
    expect_assessment_quiz_external_rejected(
        static fn() => \mod_scaffold\external\start_quiz_attempt::execute(42, 'quiz-1'),
        required_capability_exception::class,
        'Quiz external execution must preserve context or capability rejection',
    );
    expect_assessment_quiz_external_rejected(
        static fn() => \mod_scaffold\external\reveal_hint::execute(
            42,
            'artifact:moodle-cm-42/block:question-1',
            'question-1',
            'single-select',
            1,
        ),
        required_capability_exception::class,
        'hint reveal must preserve context or submit-capability rejection',
    );

    unlink($externallibpath);
    rmdir($externallibdir);

    echo "assessment Quiz external tests passed\n";
}
