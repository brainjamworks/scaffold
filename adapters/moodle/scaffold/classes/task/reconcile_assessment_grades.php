<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\task;

use mod_scaffold\local\grade_reconciler;

defined('MOODLE_INTERNAL') || die();

class reconcile_assessment_grades extends \core\task\scheduled_task {
    private const BATCH_LIMIT = 100;

    public function get_name(): string {
        return get_string('taskreconcileassessmentgrades', 'scaffold');
    }

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
