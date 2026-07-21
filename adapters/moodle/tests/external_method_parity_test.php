<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

define('MOODLE_INTERNAL', true);

function fail_external_method_parity_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function external_method_parity_same(array $expected, array $actual, string $message): void {
    sort($expected);
    sort($actual);
    if ($expected !== $actual) {
        fwrite(STDERR, $message . PHP_EOL);
        fwrite(STDERR, 'Expected: ' . implode(', ', $expected) . PHP_EOL);
        fwrite(STDERR, 'Actual:   ' . implode(', ', $actual) . PHP_EOL);
        exit(1);
    }
}

require(__DIR__ . '/../scaffold/db/services.php');

$registeredajax = [];
foreach ($functions as $method => $definition) {
    if (($definition['ajax'] ?? false) === true) {
        $registeredajax[] = $method;
    }
}

$protocolsource = file_get_contents(__DIR__ . '/../frontend/src/bridge/protocol.ts');
if ($protocolsource === false
    || preg_match('/MOODLE_AJAX_METHODS\s*=\s*\[(.*?)\]\s*as const/s', $protocolsource, $allowlistmatch) !== 1) {
    fail_external_method_parity_test('Could not read the Moodle bridge allowlist');
}
preg_match_all('/"(mod_scaffold_[a-z_]+)"/', $allowlistmatch[1], $allowlistmethods);
$allowlist = array_values(array_unique($allowlistmethods[1]));

$browserused = [];
foreach ([
    __DIR__ . '/../frontend/src/MoodleApp.tsx',
    __DIR__ . '/../frontend/src/authoring-ports.ts',
    __DIR__ . '/../frontend/src/ports.ts',
    __DIR__ . '/../frontend/src/learner-activity-port.ts',
] as $sourcepath) {
    $source = file_get_contents($sourcepath);
    if ($source === false) {
        fail_external_method_parity_test('Could not read browser method source ' . $sourcepath);
    }
    preg_match_all('/mod_scaffold_[a-z_]+/', $source, $sourcemethods);
    $browserused = array_merge($browserused, $sourcemethods[0]);
}
$browserused = array_values(array_unique($browserused));

external_method_parity_same(
    $registeredajax,
    $browserused,
    'Every browser-used Moodle method must be an intentionally registered AJAX function',
);
external_method_parity_same(
    $registeredajax,
    $allowlist,
    'The bridge allowlist must exactly match registered browser AJAX functions',
);

$savecontentsource = file_get_contents(__DIR__ . '/../scaffold/classes/external/save_content.php');
if ($savecontentsource === false
    || substr_count($savecontentsource, "'gradeItemPublication'") < 2) {
    fail_external_method_parity_test(
        'Content save must expose grade-item publication status in its value and return contract',
    );
}

echo "external method parity tests passed\n";
