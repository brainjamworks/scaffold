# This file is part of Scaffold - https://scaffold.ac/
#
# Scaffold is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Scaffold is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Moodle.  If not, see <https://www.gnu.org/licenses/>.
#
# @package    mod_scaffold
# @copyright  2026 Rizvan Ali
# @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later

@mod @mod_scaffold @mod_scaffold_smoke @javascript
Feature: Scaffold developer-debug smoke test
  In order to detect installed plugin warnings and runtime errors
  As an editing teacher
  I need to open the Scaffold authoring interface in a real browser

  Background:
    Given the following "courses" exist:
      | fullname              | shortname | category |
      | Scaffold smoke course | C1        | 0        |
    And the following "users" exist:
      | username | firstname | lastname | email                |
      | teacher1 | Teacher   | One      | teacher1@example.com |
    And the following "course enrolments" exist:
      | user     | course | role           |
      | teacher1 | C1     | editingteacher |
    And the following "activities" exist:
      | activity | course | name                | idnumber       |
      | scaffold | C1     | Scaffold smoke test | scaffold-smoke |

  Scenario: Open the packaged Scaffold authoring interface
    When I am on the "Scaffold smoke test" "scaffold activity" page logged in as "teacher1"
    And I switch to "sc-moodle-isolated-frame" class iframe
    Then I should see "Back to activity"
