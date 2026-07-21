<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\task;

use mod_scaffold\local\quiz_expiry_reconciler;

defined('MOODLE_INTERNAL') || die();

class reconcile_quiz_expiry extends \core\task\scheduled_task {
    private const BATCH_LIMIT = 100;

    public function get_name(): string {
        return get_string('taskreconcilequizexpiry', 'scaffold');
    }

    public function execute(): void {
        $outcome = $this->create_reconciler()->reconcile_due_batch($this->batch_limit());
        foreach ($outcome->events as $event) {
            mtrace(sprintf(
                'Scaffold Quiz expiry state=%d activity=%d user=%d status=%s',
                $event['stateId'],
                $event['scaffoldId'],
                $event['userId'],
                $event['status'],
            ));
        }
        mtrace(sprintf(
            'Scaffold Quiz expiry selected=%d changed=%d unchanged=%d skipped=%d failed=%d',
            $outcome->selected,
            $outcome->changed,
            $outcome->unchanged,
            $outcome->skipped,
            $outcome->failed,
        ));
    }

    protected function create_reconciler(): quiz_expiry_reconciler {
        return new quiz_expiry_reconciler();
    }

    protected function batch_limit(): int {
        return self::BATCH_LIMIT;
    }
}
