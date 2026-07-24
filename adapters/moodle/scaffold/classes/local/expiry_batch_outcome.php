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

/**
 * Summarises a batch of quiz expiry transitions.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class expiry_batch_outcome {
    /**
     * Creates a new expiry batch outcome instance.
     *
     * @param int $selected Number of selected records.
     * @param int $changed Number of changed records.
     * @param int $unchanged Number of unchanged records.
     * @param int $skipped Number of skipped records.
     * @param int $failed Number of failed records.
     * @param array $events Reconciliation event records.
     */
    public function __construct(
        /** @var int Number of selected records. */
        public int $selected,
        /** @var int Number of changed records. */
        public int $changed,
        /** @var int Number of unchanged records. */
        public int $unchanged,
        /** @var int Number of skipped records. */
        public int $skipped,
        /** @var int Number of failed records. */
        public int $failed,
        /** @var array Reconciliation event records. */
        public array $events,
    ) {
    }
}
