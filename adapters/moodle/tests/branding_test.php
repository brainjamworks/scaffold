<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

define('MOODLE_INTERNAL', true);

function fail_branding_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

$monologopath = __DIR__ . '/../scaffold/pix/monologo.svg';
if (!is_file($monologopath)) {
    fail_branding_test('Scaffold should provide Moodle with pix/monologo.svg');
}

$monologo = file_get_contents($monologopath);
if ($monologo === false || !str_contains($monologo, 'viewBox="0 0 64 64"')) {
    fail_branding_test('Scaffold monologo should use the canonical mark view box');
}

foreach (['#161D77', '#00BA92', '#F43A57'] as $brandcolour) {
    if (!str_contains($monologo, $brandcolour)) {
        fail_branding_test('Scaffold monologo should preserve brand colour ' . $brandcolour);
    }
}

require_once(__DIR__ . '/../scaffold/lib.php');

if (!function_exists('scaffold_is_branded') || scaffold_is_branded() !== true) {
    fail_branding_test('Scaffold should tell Moodle not to recolour its branded monologo');
}

echo "branding tests passed\n";
