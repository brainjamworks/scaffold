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

class core_text {
    public static function strtolower(string $value): string {
        return strtolower($value);
    }
}

require_once(__DIR__ . '/../scaffold/classes/local/json_schema_validator.php');
require_once(__DIR__ . '/../scaffold/classes/local/grader.php');

use mod_scaffold\local\grader;
use mod_scaffold\local\json_schema_validator;

function rich_feedback(string $text): array {
    return [
        'kind' => 'rich-text',
        'document' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => $text],
                    ],
                ],
            ],
        ],
    ];
}

function single_select_target(): array {
    return [
        'schemaVersion' => 1,
        'targetId' => 'mcq-1',
        'blockId' => 'mcq-1',
        'blockType' => 'mcq',
        'interaction' => [
            'kind' => 'single-select',
            'options' => [
                ['id' => 'a'],
                ['id' => 'b'],
            ],
        ],
        'assessment' => [
            'kind' => 'single-select',
            'correctOptionId' => 'b',
            'feedbackByOptionId' => ['b' => rich_feedback('Correct choice')],
            'summaryFeedback' => rich_feedback('Summary'),
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

function assert_same($expected, $actual, string $message): void {
    if ($expected !== $actual) {
        fwrite(STDERR, $message . PHP_EOL);
        fwrite(STDERR, 'Expected: ' . var_export($expected, true) . PHP_EOL);
        fwrite(STDERR, 'Actual:   ' . var_export($actual, true) . PHP_EOL);
        exit(1);
    }
}

function assert_result_rejected(stdClass $result, string $message): void {
    try {
        (new json_schema_validator())->validate_definition('AssessmentResult', $result, 'storedResult');
    } catch (invalid_parameter_exception) {
        return;
    }

    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

$single = grader::grade_assessment(single_select_target(), [
    'kind' => 'single-select',
    'optionId' => 'b',
]);

assert_same(true, $single['isCorrect'], 'single-select should be correct');
assert_same(1, $single['score'], 'single-select should score 1');
assert_same(1, $single['maxScore'], 'single-select maxScore should remain the normalized unit');
assert_same(rich_feedback('Summary'), $single['feedback'], 'summary feedback should be complete');
assert_same(true, $single['items']['b']['correct'], 'correct choice item should be marked correct');

$multi = grader::grade_assessment([
    'interaction' => [
        'kind' => 'multi-select',
        'options' => [['id' => 'a'], ['id' => 'b'], ['id' => 'c']],
    ],
    'assessment' => [
        'kind' => 'multi-select',
        'correctOptionIds' => ['a', 'b'],
    ],
], [
    'kind' => 'multi-select',
    'optionIds' => ['a', 'c'],
]);

assert_same(false, $multi['isCorrect'], 'partial multi-select should not be correct');
assert_same(0, $multi['score'], 'wrong pick should offset one correct pick');

$fill = grader::grade_assessment([
    'interaction' => [
        'kind' => 'fill-blanks',
        'blanks' => [['id' => 'blank-1']],
    ],
    'assessment' => [
        'kind' => 'fill-blanks',
        'blanks' => [
            [
                'blankId' => 'blank-1',
                'acceptedAnswers' => ['London'],
                'caseSensitive' => false,
                'trimWhitespace' => true,
            ],
        ],
    ],
], [
    'kind' => 'fill-blanks',
    'blanks' => [
        ['blankId' => 'blank-1', 'value' => ' london '],
    ],
]);

assert_same(true, $fill['isCorrect'], 'fill blank should normalise case and whitespace');
assert_same(1, $fill['score'], 'fill blank should score 1');

$empty = grader::grade_assessment(null, null);
assert_same(null, $empty['feedback'], 'empty result feedback should be explicit null');
assert_same(
    '{"isCorrect":false,"score":0,"maxScore":1,"feedback":null,"items":{}}',
    json_encode($empty, JSON_THROW_ON_ERROR),
    'empty result items should serialize as a JSON object',
);

$emptyfeedbacktarget = single_select_target();
$emptyfeedbacktarget['assessment']['summaryFeedback'] = [
    'kind' => 'rich-text',
    'document' => ['type' => 'doc', 'content' => []],
];
$emptyfeedback = grader::grade_assessment($emptyfeedbacktarget, [
    'kind' => 'single-select',
    'optionId' => 'b',
]);
assert_same(
    $emptyfeedbacktarget['assessment']['summaryFeedback'],
    $emptyfeedback['feedback'],
    'empty rich-text feedback content should not be omitted',
);

$quizfirsttarget = single_select_target();
$quizfirsttarget['settings']['points'] = 2;
$quizfirsttarget['settings']['isGraded'] = true;
$quizsecondtarget = single_select_target();
$quizsecondtarget['settings']['points'] = 8;
$quizsecondtarget['settings']['isGraded'] = false;
$quizresults = [
    grader::grade_assessment($quizfirsttarget, ['kind' => 'single-select', 'optionId' => 'b']),
    grader::grade_assessment($quizsecondtarget, ['kind' => 'single-select', 'optionId' => 'b']),
];
foreach ($quizresults as $quizresult) {
    assert_same(1, $quizresult['score'], 'Quiz per-target score should remain an unweighted unit');
    assert_same(1, $quizresult['maxScore'], 'Quiz per-target maxScore should remain an unweighted unit');
    assert_same(false, array_key_exists('points', $quizresult), 'authored points must stay outside results');
    assert_same(false, array_key_exists('isGraded', $quizresult), 'isGraded must stay outside results');
}

$storedresult = json_decode(json_encode($single, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);
(new json_schema_validator())->validate_definition('AssessmentResult', $storedresult, 'storedResult');
$malformedstoredresult = clone $storedresult;
unset($malformedstoredresult->maxScore);
assert_result_rejected($malformedstoredresult, 'stored results missing maxScore should be rejected');
$malformedstoredresult = clone $storedresult;
$malformedstoredresult->items = [];
assert_result_rejected($malformedstoredresult, 'stored result items encoded as a list should be rejected');

echo "grader tests passed\n";
