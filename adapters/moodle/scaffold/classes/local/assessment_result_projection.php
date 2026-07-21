<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

final class assessment_result_projection {
    public static function result(
        \stdClass $result,
        bool $includeauthoredfeedback = false,
    ): \stdClass {
        // Item outcomes stay exclusive to explicit reveal and authorized full-review paths.
        return (object) [
            'isCorrect' => (bool) ($result->isCorrect ?? false),
            'score' => $result->score ?? 0,
            'maxScore' => $result->maxScore ?? 1,
            'feedback' => $includeauthoredfeedback ? ($result->feedback ?? null) : null,
            'items' => (object) [],
        ];
    }
}
