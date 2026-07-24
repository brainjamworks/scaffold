<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Scaffold is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Scaffold. If not, see <https://www.gnu.org/licenses/>.

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
