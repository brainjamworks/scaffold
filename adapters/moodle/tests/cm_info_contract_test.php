<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace core_course {
    class cm_info {
        public int $id = 5;
    }
}

namespace {
    define('MOODLE_INTERNAL', true);

    class context_module {
    }

    class invalid_parameter_exception extends \Exception {
    }

    class moodle_exception extends \Exception {
        public function __construct(string $errorcode, string $component = '') {
            parent::__construct($errorcode);
        }
    }

    if (!class_exists('cm_info')) {
        class_alias(\core_course\cm_info::class, 'cm_info');
    }

    require_once(__DIR__ . '/../scaffold/classes/local/media_service.php');
    require_once(__DIR__ . '/../scaffold/classes/local/activity_scope.php');

    use mod_scaffold\local\activity_scope;
    use mod_scaffold\local\media_service;

    function fail_cm_info_contract_test(string $message): never {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }

    $activityscopesource = file_get_contents(__DIR__ . '/../scaffold/classes/local/activity_scope.php');
    if ($activityscopesource === false) {
        fail_cm_info_contract_test('activity_scope source must be readable');
    }
    if (preg_match('/\breadonly\s+class\s+activity_scope\b/', $activityscopesource) === 1) {
        fail_cm_info_contract_test('activity_scope must use PHP 8.1-compatible readonly properties');
    }

    $activityscope = new \ReflectionClass(activity_scope::class);
    foreach (['course', 'cm', 'context', 'instance', 'actorid', 'capability'] as $propertyname) {
        if (!$activityscope->getProperty($propertyname)->isReadOnly()) {
            fail_cm_info_contract_test('activity_scope authorization evidence must remain immutable');
        }
    }

    $scaffold = (object) [
        'assessmenttargetsjson' => '[]',
        'assessmentgroupsjson' => '[]',
    ];
    $cm = new \core_course\cm_info();
    $problemid = 'artifact:moodle-cm-5/block:target';

    try {
        media_service::upload_media(
            $scaffold,
            $cm,
            new \context_module(),
            'unsupported',
            'sample.bin',
            'application/octet-stream',
            'data:application/octet-stream;base64,',
        );
        fail_cm_info_contract_test('upload should reject an unsupported media type');
    } catch (\TypeError $exception) {
        fail_cm_info_contract_test('upload should accept core_course\\cm_info: ' . $exception->getMessage());
    } catch (\invalid_parameter_exception) {
    }

    try {
        new activity_scope(
            (object) ['id' => 3],
            $cm,
            new \context_module(),
            $scaffold,
            2,
            'mod/scaffold:submit',
        );
    } catch (\TypeError $exception) {
        fail_cm_info_contract_test('activity_scope should accept core_course\\cm_info: ' . $exception->getMessage());
    }

    echo "cm_info contract tests passed\n";
}
