<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

define('MOODLE_INTERNAL', true);

if (!class_exists('moodle_exception')) {
    class moodle_exception extends Exception {
    }
}

require_once(__DIR__ . '/../scaffold/classes/local/artifact_identity.php');
require_once(__DIR__ . '/../scaffold/classes/local/content_service.php');

use mod_scaffold\local\content_service;

function assert_payload_same($expected, $actual, string $message): void {
    if ($expected !== $actual) {
        fwrite(STDERR, $message . PHP_EOL);
        fwrite(STDERR, 'Expected: ' . var_export($expected, true) . PHP_EOL);
        fwrite(STDERR, 'Actual:   ' . var_export($actual, true) . PHP_EOL);
        exit(1);
    }
}

$initialized = (object) [
    'name' => 'Projected activity',
    'artifactjson' => json_encode([
        'id' => 'stale-id',
        'title' => 'Stale title',
        'mode' => 'page',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'surface',
                    'attrs' => [
                        'id' => 'surface-1',
                        'variant' => 'page-default',
                        'settings' => (object) [],
                    ],
                    'content' => [
                        ['type' => 'paragraph', 'attrs' => ['textAlign' => null]],
                    ],
                ],
            ],
        ],
    ]),
    'learnercontentjson' => json_encode([
        'type' => 'doc',
        'content' => [
            ['type' => 'paragraph'],
        ],
    ]),
];

assert_payload_same(
    json_encode([
        'id' => 'moodle-cm-42',
        'title' => 'Projected activity',
        'mode' => 'page',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'surface',
                    'attrs' => [
                        'id' => 'surface-1',
                        'variant' => 'page-default',
                        'settings' => (object) [],
                    ],
                    'content' => [
                        ['type' => 'paragraph', 'attrs' => ['textAlign' => null]],
                    ],
                ],
            ],
        ],
    ]),
    json_encode((new content_service())->project_artifact($initialized, 42, true)),
    'authoring payload should preserve author content and use canonical metadata',
);

assert_payload_same(
    '{}',
    json_encode((new content_service())->project_artifact($initialized, 42, true)['content']['content'][0]['attrs']['settings']),
    'authoring payload should preserve nested empty JSON objects',
);

assert_payload_same(
    [
        'id' => 'moodle-cm-42',
        'title' => 'Projected activity',
        'mode' => 'page',
        'content' => [
            'type' => 'doc',
            'content' => [
                ['type' => 'paragraph'],
            ],
        ],
    ],
    (new content_service())->project_artifact($initialized, 42, false),
    'learner payload should replace author content with the learner-safe projection',
);

$uninitialized = (object) [
    'name' => 'Uninitialized activity',
    'artifactjson' => json_encode([
        'id' => '',
        'title' => 'Scaffold',
        'mode' => 'slideshow',
        'content' => null,
    ]),
    'learnercontentjson' => 'null',
];

assert_payload_same(
    [
        'id' => 'moodle-cm-73',
        'title' => 'Uninitialized activity',
        'mode' => 'slideshow',
        'content' => null,
    ],
    (new content_service())->project_artifact($uninitialized, 73, true),
    'uninitialized authoring payload should retain null content',
);

$contentservicesource = file_get_contents(__DIR__ . '/../scaffold/classes/local/content_service.php');
assert_payload_same(false, $contentservicesource === false, 'content_service source should be readable');
assert_payload_same(
    1,
    substr_count($contentservicesource, '(new learner_activity_service())->load($scope)'),
    'learner content payload should have exactly one canonical learner activity bootstrap source',
);
assert_payload_same(
    true,
    str_contains($contentservicesource, "if (!\$authoring) {")
        && str_contains($contentservicesource, "\$payload['learnerActivitySnapshotJson']"),
    'content_service should add learner activity bootstrap only to learner payloads',
);
assert_payload_same(
    true,
    str_contains($contentservicesource, 'reconcile_user_and_apply_effects(')
        && strpos($contentservicesource, 'reconcile_user_and_apply_effects(')
            < strpos($contentservicesource, '(new assessment_state_repository())->get_or_create('),
    'learner payload should reconcile due Quiz state before composing the assessment snapshot',
);
assert_payload_same(
    true,
    str_contains($contentservicesource, "'assessmentSnapshotJson'")
        && str_contains($contentservicesource, "'learnerActivitySnapshotJson'"),
    'assessment and learner activity snapshots should remain sibling payload fields',
);
assert_payload_same(
    false,
    str_contains($contentservicesource, 'learnerStateJson'),
    'content_service should not create a combined learner-state envelope',
);

$getpayloadsource = file_get_contents(__DIR__ . '/../scaffold/classes/external/get_payload.php');
assert_payload_same(false, $getpayloadsource === false, 'get_payload source should be readable');
assert_payload_same(
    true,
    str_contains($getpayloadsource, 'new content_service()')
        && str_contains($getpayloadsource, '->payload('),
    'get_payload should delegate projection to content_service',
);

$packagejson = file_get_contents(__DIR__ . '/../package.json');
assert_payload_same(false, $packagejson === false, 'Moodle package metadata should be readable');
assert_payload_same(
    true,
    str_contains($packagejson, 'php tests/learner_activity_api_test.php'),
    'Moodle package tests should execute the learner activity API boundary',
);

echo "payload tests passed\n";
