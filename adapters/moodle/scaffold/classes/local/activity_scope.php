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

final class activity_scope {
    public function __construct(
        public readonly \stdClass $course,
        public readonly \cm_info $cm,
        public readonly \context_module $context,
        public readonly \stdClass $instance,
        public readonly int $actorid,
        public readonly string $capability,
    ) {
    }
}
