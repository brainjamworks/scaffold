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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

/**
 * Represents an authorised Scaffold activity scope.
 *
 * Carries the resolved course, module, context, and activity instance.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class activity_scope {
    /**
     * Creates a new activity scope instance.
     *
     * @param \stdClass $course Moodle course record.
     * @param \cm_info $cm Moodle course module.
     * @param \context_module $context Moodle module context.
     * @param \stdClass $instance Scaffold activity record.
     * @param int $actorid Acting user ID.
     * @param string $capability Required Moodle capability.
     */
    public function __construct(
        /** @var \stdClass Moodle course record. */
        public readonly \stdClass $course,
        /** @var \cm_info Moodle course module. */
        public readonly \cm_info $cm,
        /** @var \context_module Moodle module context. */
        public readonly \context_module $context,
        /** @var \stdClass Scaffold activity record. */
        public readonly \stdClass $instance,
        /** @var int Acting user ID. */
        public readonly int $actorid,
        /** @var string Required Moodle capability. */
        public readonly string $capability,
    ) {
    }
}
