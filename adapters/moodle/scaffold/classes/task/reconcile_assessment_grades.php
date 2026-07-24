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

namespace mod_scaffold\task;

use mod_scaffold\local\grade_reconciler;

defined('MOODLE_INTERNAL') || die();

class reconcile_assessment_grades extends \core\task\scheduled_task {
    private const BATCH_LIMIT = 100;

    #[\Override]
    public function get_name(): string {
        return get_string('taskreconcileassessmentgrades', 'scaffold');
    }

    #[\Override]
    public function execute(): void {
        $outcome = $this->create_reconciler()->reconcile_due($this->batch_limit());
        mtrace(sprintf(
            'Scaffold grade reconciliation items=%d itemfailures=%d learners=%d published=%d pending=%d failed=%d skipped=%d',
            $outcome->items,
            $outcome->itemFailures,
            $outcome->learners,
            $outcome->published,
            $outcome->pending,
            $outcome->failed,
            $outcome->skipped,
        ));
    }

    protected function create_reconciler(): grade_reconciler {
        return new grade_reconciler();
    }

    protected function batch_limit(): int {
        return self::BATCH_LIMIT;
    }
}
