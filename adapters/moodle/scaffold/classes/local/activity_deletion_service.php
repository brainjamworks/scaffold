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

final class activity_deletion_service {
    public function delete_owned_state(int $scaffoldid, \context_module $context): void {
        (new grade_publication_repository())->delete_for_activity($scaffoldid);
        (new assessment_state_repository())->delete_for_activity($scaffoldid);
        (new learner_activity_repository())->delete_for_activity($scaffoldid);
        get_file_storage()->delete_area_files($context->id, 'mod_scaffold');
    }
}
