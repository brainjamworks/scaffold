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

function fail_grading_conformance_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function normalized_grading_json(mixed $value): string {
    if ($value instanceof stdClass) {
        $properties = get_object_vars($value);
        ksort($properties);
        $normalized = new stdClass();
        foreach ($properties as $key => $child) {
            $normalized->{$key} = json_decode(normalized_grading_json($child), false, 512, JSON_THROW_ON_ERROR);
        }
        return json_encode($normalized, JSON_THROW_ON_ERROR);
    }

    if (is_array($value)) {
        $normalized = array_map(
            static fn(mixed $child): mixed => json_decode(
                normalized_grading_json($child),
                false,
                512,
                JSON_THROW_ON_ERROR,
            ),
            $value,
        );
        return json_encode($normalized, JSON_THROW_ON_ERROR);
    }

    return json_encode($value, JSON_THROW_ON_ERROR);
}

$canonicalcorpuspath = __DIR__ . '/../../../packages/grading/fixtures/assessment-grading.json';
$corpuspath = __DIR__ . '/fixtures/assessment-grading.json';
$canonicalcorpusbytes = @file_get_contents($canonicalcorpuspath);
$corpusbytes = @file_get_contents($corpuspath);
if ($canonicalcorpusbytes === false || $corpusbytes === false) {
    fail_grading_conformance_test('Moodle assessment grading corpus is missing');
}
if ($corpusbytes !== $canonicalcorpusbytes) {
    fail_grading_conformance_test('Moodle must use the exact canonical assessment grading corpus bytes');
}

$corpus = json_decode($corpusbytes, false, 512, JSON_THROW_ON_ERROR);
if (!($corpus instanceof stdClass) || !is_array($corpus->cases ?? null) || count($corpus->cases) !== 21) {
    fail_grading_conformance_test('Moodle assessment grading corpus must contain all 21 canonical cases');
}

$validator = new json_schema_validator();
foreach ($corpus->cases as $case) {
    if (!($case instanceof stdClass) || !is_string($case->id ?? null)) {
        fail_grading_conformance_test('Canonical grading case is malformed');
    }

    $target = json_decode(json_encode($case->target, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    $response = json_decode(json_encode($case->response, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
    $actualarray = grader::grade_assessment($target, $response);
    $actual = json_decode(json_encode($actualarray, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR);

    $validator->validate_definition('AssessmentResult', $actual, 'case.' . $case->id . '.result');
    if (($actual->maxScore ?? null) !== 1) {
        fail_grading_conformance_test($case->id . ': maxScore must be the literal integer 1');
    }
    if (!is_int($actual->score) && !is_float($actual->score)) {
        fail_grading_conformance_test($case->id . ': score must be numeric');
    }
    if ($actual->score < 0 || $actual->score > 1) {
        fail_grading_conformance_test($case->id . ': score must remain normalized');
    }
    if (!($actual->items instanceof stdClass)) {
        fail_grading_conformance_test($case->id . ': serialized items must be a JSON object');
    }
    if (!($case->expected->items instanceof stdClass)) {
        fail_grading_conformance_test($case->id . ': canonical items must preserve JSON object fidelity');
    }

    $expectedjson = normalized_grading_json($case->expected);
    $actualjson = normalized_grading_json($actual);
    if ($actualjson !== $expectedjson) {
        fail_grading_conformance_test(
            $case->id . ': PHP result differs from canonical result' . PHP_EOL
            . 'Expected: ' . $expectedjson . PHP_EOL
            . 'Actual:   ' . $actualjson,
        );
    }
}

echo "grading conformance tests passed\n";
