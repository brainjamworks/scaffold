# Moodle Marketplace listing worksheet

This is the copy-ready submission worksheet for Scaffold `mod_scaffold`
release `0.1.1`. It is kept outside the installable plugin directory so that
listing administration does not change the verified release package.

The values below were updated on 27 July 2026 against:

- `scaffold/version.php`;
- the packaged plugin `README.md`, `LICENSE`, `thirdpartylibs.xml`, and
  `THIRD_PARTY_NOTICES.md`;
- the repository's required CI and release workflow definitions; and
- the official Moodle Marketplace submission guidelines linked from the
  [Moodle plugin contribution checklist](https://moodledev.io/general/community/plugincontribution/checklist).

The exact `0.1.1` source commit, Required CI run, package digest, and installed
host smoke result are release-closing evidence. Do not submit the listing until
that evidence, the maintainer confirmation, and the release hold near the end
of this worksheet are complete.

## Plugin identity

| Field                    | Value                                    |
| ------------------------ | ---------------------------------------- |
| Name                     | Scaffold                                 |
| Plugin type              | Activity module                          |
| Component                | `mod_scaffold`                           |
| Release                  | `0.1.1`                                  |
| Maturity                 | Alpha                                    |
| Licence                  | GNU General Public License v3.0 or later |
| Marketplace offering     | Free                                     |
| Minimum Moodle version   | Moodle 4.5                               |
| Declared Moodle versions | Moodle 4.5, 5.0, 5.1, and 5.2            |

The compatibility declaration means Moodle 4.5 through 5.2 inclusive. Required
CI is configured to exercise the endpoints: Moodle 4.5 with PHP 8.1 and MySQL
8.0, and Moodle 5.2 with PHP 8.3 and PostgreSQL 16. The exact `0.1.1` candidate
ZIP must also pass the Moodle-native Behat smoke scenario with
`DEBUG_DEVELOPER` enabled before submission.

Do not add Moodle 5.3 until it has been released and verified.

## Short description

Create interactive pages, slideshows, and assessments as a native Moodle
activity, with completion, Gradebook, backup, and privacy integration.

## Full description

Scaffold is a native Moodle activity module for creating and delivering rich,
interactive learning content. Teachers can build long-form pages or
slide-based experiences from text, media, layouts, structured content, and
assessments. Learners open the finished activity inside their Moodle course
without receiving authoring controls or assessment answer keys.

Built-in content includes grids and layouts; images, audio, charts, embeds, and
PDFs; callouts, comparisons, timelines, flashcards, galleries, glossaries,
tables, and checklists. Assessment content includes multiple-choice,
multi-select, matching, categorisation, sequencing, fill-in-the-blank,
dropdown, image-hotspot, and grouped quiz activities.

Scaffold integrates with Moodle activity completion and Gradebook. Moodle cron
reconciles expired quizzes and retries pending grade publication. Course
backup and restore include Scaffold content, managed media, and learner state,
and the plugin implements Moodle's Privacy API for personal learner data.

This `0.1.1` release is alpha software. Evaluate it in a non-production Moodle
site before deploying it to a live site. It requires Moodle 4.5 or later and a
working Moodle cron process. It has no site-wide settings and no required
third-party Moodle plugin dependency.

Scaffold does not require a paid feature, subscription, separate Scaffold
service, external account, API key, credential, or demo access. Authors may
choose to add externally hosted media or embeds; those optional resources are
subject to the selected provider's terms and the Moodle site's own policies.

## Public links

| Marketplace field             | Public URL                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Documentation                 | https://github.com/brainjamworks/scaffold/blob/main/adapters/moodle/scaffold/README.md |
| Source code                   | https://github.com/brainjamworks/scaffold/tree/main/adapters/moodle/scaffold           |
| Issue tracker                 | https://github.com/brainjamworks/scaffold/issues                                       |
| Project website, if requested | https://scaffold.ac/                                                                   |

All four URLs returned HTTP 200 on 25 July 2026. The plugin-specific README is
the documentation authority; a second documentation system is not required
for the first submission.

Support requests may also be sent to
[support@scaffold.ac](mailto:support@scaffold.ac). Security reports must use
that private channel rather than the public issue tracker.

## Licence and service declaration

Use the following answers in the listing:

- **Licence:** GNU General Public License v3.0 or later
  (`GPL-3.0-or-later`).
- **Paid features or payment:** None.
- **Required subscription or external service:** None.
- **Required external account:** None.
- **Required API key or other credential:** None.
- **Required demo credentials for review:** None. Reviewers use ordinary
  Moodle administrator, teacher, and learner accounts.
- **Required third-party Moodle plugins:** None.
- **Non-standard post-install steps:** None. Install the release ZIP through
  Moodle's plugin installer and ensure the normal Moodle cron process runs.
- **External data transfer:** The plugin does not require a Scaffold service
  and does not send plugin data to one. Optional author-selected external
  media or embeds may contact their selected provider.

The plugin package and its Moodle-facing source are GPL-3.0-or-later. The
wider monorepo is AGPL-3.0-only; that separate repository licence does not
change the licence of the packaged Moodle plugin. Bundled third-party
components and their compatible licences are declared in `thirdpartylibs.xml`
and `THIRD_PARTY_NOTICES.md`.

### Commercial classification

List `0.1.1` as **free**. Moodle classifies the functionality and services
offered by the submitted release, so a possible paid AI feature in a future
release does not make this release paid.

Before a future release charges for AI functionality, a Scaffold-operated
service, a subscription, a paid tier, or a premium upgrade, add the applicable
paid price option or paid listing and complete Moodle's paid-listing
requirements. This applies even if Scaffold keeps a free download or free
tier. If a future feature instead uses an unrelated third-party service that
the customer pays directly, with no payment to Scaffold, reassess it under the
then-current rule; Moodle currently permits that arrangement in a free
listing.

Do not configure a paid listing now for hypothetical functionality. Recheck
Moodle's current
[free and paid classification](https://moodle.atlassian.net/wiki/external/MzFlM2RkYjM3ZDVhNDgyMGJmYjA2ZjIyMzQ1NDRlYmY)
and
[sales requirements](https://moodle.atlassian.net/wiki/external/MDY5MDE4OGYwMzNmNDYzNjlhNGM3NmJmMzc2ZGJlN2U)
when a commercial feature is designed.

## Repository naming exception

Moodle recommends a repository named
`moodle-{plugintype}_{pluginname}`, which would be
`moodle-mod_scaffold` here. Scaffold deliberately uses the existing public
`brainjamworks/scaffold` monorepo instead.

This is a documented, non-blocking repository-name exception:

- the plugin source has a stable public subtree at
  `adapters/moodle/scaffold`;
- the installable ZIP still has the required single `scaffold/` root and the
  correct `mod_scaffold` component;
- issues are handled in the public repository issue tracker; and
- retaining the monorepo preserves coordinated source, build, test, licence,
  and release provenance without maintaining a duplicate repository.

If a Marketplace reviewer specifically requires a conventional mirror, create
one as a release mirror at that point. Do not split or duplicate the repository
pre-emptively.

## Screenshot set

Use these three current 1920 × 1080 PNG files for the initial Marketplace
listing:

1. [`block-library.png`](../../.github/readme/block-library.png) — Scaffold
   authoring a course page with an assessment and the block library open.
2. [`page-authoring.png`](../../.github/readme/page-authoring.png) — A long-form
   Scaffold page containing a timeline and flashcards.
3. [`slideshow-authoring.png`](../../.github/readme/slideshow-authoring.png) — A
   Scaffold slideshow with a large cover composition.

These images represent the current shared Scaffold interface. Use the captions
above and do not describe them as captures of Moodle's surrounding interface.

## Maintainer confirmation during final submission

The maintainer has stated that Scaffold is their own code, and the repository
identifies Rizvan Ali as the plugin copyright holder. The Marketplace account
holder must still personally complete the Marketplace declarations because
they are provider attestations, not repository facts.

- [ ] Sign in with the Marketplace account intended to remain the listing's
      lead maintainer.
- [ ] Choose a free plugin listing for `0.1.1` and upload the exact approved
      GitHub Release ZIP.
- [ ] Accept the Marketplace intellectual-property declaration for original
      Scaffold work and the declared, authorised third-party components.
- [ ] Confirm the right to use the Scaffold name, logo, and submitted
      screenshots.
- [ ] Select the truthful no-payment/no-subscription answers reflected above.
- [ ] Do not claim Moodle Certified Service Provider status, Moodle
      endorsement, or another unverified integration or trademark right.

## Submission hold

The listing copy, links, compatibility, licence, service declaration, and
repository exception are ready. Submission remains on hold until:

- the release-closing criteria produce the immutable public `v0.1.1` release
  ZIP that will be uploaded to Marketplace; and
- the maintainer completes the account actions and declarations above in the
  final submission session.
