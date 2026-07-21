<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/moodleform_mod.php');

class mod_scaffold_mod_form extends moodleform_mod {
    public function definition(): void {
        $mform = $this->_form;

        $mform->addElement('header', 'general', get_string('general', 'form'));

        $mform->addElement('text', 'name', get_string('name'), ['size' => '64']);
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');

        $this->standard_intro_elements();

        $mform->addElement('text', 'grade', get_string('grade', 'scaffold'), ['size' => '8']);
        $mform->setType('grade', PARAM_FLOAT);
        $mform->setDefault('grade', 100);
        $mform->addHelpButton('grade', 'grade', 'scaffold');

        $this->standard_coursemodule_elements();
        $this->add_action_buttons();
    }

    public function data_postprocessing($data): void {
        parent::data_postprocessing($data);
        if (!empty($data->completionunlocked)) {
            $field = 'completionactivitystatus' . $this->get_suffix();
            if (empty($data->{$field})) {
                $data->{$field} = 0;
            }
        }
    }

    public function add_completion_rules(): array {
        $suffix = $this->get_suffix();
        $field = 'completionactivitystatus' . $suffix;
        $this->_form->addElement(
            'checkbox',
            $field,
            '',
            get_string('completionactivitystatus', 'scaffold'),
        );
        $this->_form->setDefault($field, 0);
        return [$field];
    }

    public function completion_rule_enabled($data): bool {
        return !empty($data['completionactivitystatus' . $this->get_suffix()]);
    }
}
