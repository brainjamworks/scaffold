<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

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
