<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

define('MOODLE_INTERNAL', true);
define('CONTEXT_MODULE', 70);
define('DAYSECS', 86400);

class context {
    public int $contextlevel = CONTEXT_MODULE;
    public int $id = 21;
}

class pluginfile_sent extends Exception {
    public function __construct(public readonly int $lifetime) {
        parent::__construct();
    }
}

function require_login(stdClass $course, bool $autologinguest, stdClass $cm): void {
}

function has_capability(string $capability, context $context): bool {
    return true;
}

function get_file_storage(): object {
    return new class {
        public function get_file(...$args): object {
            return new stdClass();
        }
    };
}

function send_stored_file(
    object $file,
    int $lifetime,
    int $filter,
    bool $forcedownload,
    array $options,
): never {
    throw new pluginfile_sent($lifetime);
}

function fail_pluginfile_contract_test(string $message): never {
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

require_once(__DIR__ . '/../scaffold/lib.php');

$course = (object) ['id' => 2];
$cm = (object) ['instance' => 4];
$context = new context();

try {
    mod_scaffold_pluginfile($course, $cm, $context, 'media', [4, 'image.webp'], false);
    fail_pluginfile_contract_test('pluginfile should send the stored media file');
} catch (pluginfile_sent $sent) {
    if ($sent->lifetime !== DAYSECS) {
        fail_pluginfile_contract_test('pluginfile should use Moodle\'s one-day cache lifetime');
    }
} catch (Error $error) {
    fail_pluginfile_contract_test('pluginfile should use Moodle\'s DAYSECS constant: ' . $error->getMessage());
}

echo "pluginfile contract tests passed\n";
