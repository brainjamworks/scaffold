# Scaffold for Moodle

Scaffold is a Moodle activity module for creating and delivering interactive
learning content. It integrates with Moodle courses, completion tracking,
Gradebook, backup and restore, and Moodle's privacy API.

This is an alpha release. Test it in a non-production environment before
deploying it to a live site.

## Requirements

- Moodle 4.5 or later
- A working Moodle cron process

The plugin component is `mod_scaffold`, and its installation directory must be
`mod/scaffold`.

## Installation

For `0.1.2`, use the versioned
[Scaffold Moodle ZIP](https://github.com/brainjamworks/scaffold/releases/download/v0.1.2/mod_scaffold-0.1.2.zip)
from the GitHub Release. This is the temporary official installation route
while the first Moodle Plugins directory listing is under review.

Do not use GitHub's automatically generated **Source code** archives. They are
repository snapshots, not installable Moodle plugin packages.

1. Sign in to Moodle as a site administrator.
2. Open **Site administration → Plugins → Install plugins**.
3. Upload the Scaffold Moodle ZIP and review Moodle's validation report.
4. Continue through the database upgrade when validation succeeds.

For a manual installation, extract the package as `mod/scaffold` in the Moodle
codebase, then visit **Site administration → Notifications** or run:

```sh
php admin/cli/upgrade.php --non-interactive
```

## Verify the Installation

Open **Site administration → Plugins → Plugins overview**, find
`Scaffold (mod_scaffold)`, and confirm that the release is `0.1.2`. Moodle's
Plugins overview displays the installed plugin version and release.

The immutable
[Scaffold 0.1.2 release record](https://github.com/brainjamworks/scaffold/releases/tag/v0.1.2)
contains checksums, provenance, and the Moodle host version used for the release
smoke test. Confirm those results before installing the alpha release on a live
site.

## Configuration

Scaffold currently has no site-wide settings. Each activity provides Moodle
settings for its name, description, maximum grade, and activity completion.
Editing teachers and managers can create activities and edit Scaffold content
by default.

The module defines these capabilities for role customization:

- `mod/scaffold:addinstance`
- `mod/scaffold:view`
- `mod/scaffold:editcontent`
- `mod/scaffold:submit`
- `mod/scaffold:viewgradestatus`

## Scheduled Tasks

Scaffold uses Moodle cron to reconcile expired quizzes and retry pending grade
publication. Both scheduled tasks are configured to run every five minutes.
No separate Scaffold service is required.

## Upgrading

1. Back up the Moodle database and dataroot.
2. Review [CHANGES.md](./CHANGES.md) for release-specific notes.
3. Install the new Scaffold Moodle release ZIP over the existing plugin.
4. Complete Moodle's database upgrade.
5. Confirm that Moodle cron is running normally.

Do not rename the `scaffold` directory between releases.

## Backup, Privacy, and Removal

Moodle course backup and restore include Scaffold activity content, managed
media, and learner state according to the backup's user-data setting. Scaffold
also implements Moodle's privacy provider for personal learner data.

Before uninstalling the plugin, make any required course and site backups.
Uninstall it through Moodle's plugin administration interface before removing
the `mod/scaffold` directory.

## Support and Security

For installation help, email [support@scaffold.ac](mailto:support@scaffold.ac)
or open a [GitHub issue](https://github.com/brainjamworks/scaffold/issues).
Do not put learner data, credentials, or security vulnerabilities in a public
issue.

Report security concerns privately to
[support@scaffold.ac](mailto:support@scaffold.ac) with the subject
`Security report: Scaffold`.

## License

The Scaffold Moodle plugin is distributed under the GNU General Public
License v3.0 or later. The wider Scaffold repository remains available under
the GNU Affero General Public License v3.0 only.
The release ZIP includes `LICENSE` and `THIRD_PARTY_NOTICES.md`.
