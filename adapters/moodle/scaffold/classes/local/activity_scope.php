<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

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
