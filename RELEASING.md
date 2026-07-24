# Releasing Scaffold

This document is the maintainer source of truth for Scaffold releases. Update it
in the same change as any release-tooling or policy change.

## Adoption Status

Scaffold has no formal release tags or publishing workflow yet. The existing
Moodle `0.0.1` and XBlock `0.0.0` metadata predate this policy and must not be
treated as evidence of a coordinated published release.

Before the first formal release:

1. Establish whether the Moodle `0.0.1` package was distributed outside local
   development.
2. Preserve its history if it was distributed; otherwise fold the initial
   changelog into the chosen first coordinated release.
3. Choose the first Scaffold version and align the root product, Moodle, and
   XBlock metadata.
4. Add the adapter changelogs and `Unreleased` sections required by this policy.
5. Implement both adapter package commands, confirm the XBlock distribution
   name is available on PyPI, and configure trusted publishing.
6. Complete Moodle Marketplace provider onboarding and prepare the first
   `mod_scaffold` listing.
7. Implement the tag-driven draft release workflow described below.

Remove this transition section after those steps are complete.

## Release Model

Scaffold uses one coordinated project release stream with fixed versioning:

- `main` contains the latest accepted development work. It must remain green,
  but it can be ahead of the latest published release.
- Short-lived branches isolate unfinished work before it reaches `main`.
- A release is an immutable Git tag and GitHub Release created from a tested
  commit on `main`.
- Tagged releases, not branch archives, are the supported source snapshots.
- The Moodle and XBlock adapters share the Scaffold product version and are
  built and published together from the same tag.
- A change to either adapter or the shared core advances the whole fixed release
  group. An adapter-specific correction is a Scaffold patch release, not an
  independent adapter version.
- Moodle Marketplace is the normal Moodle discovery, installation, and update
  channel. PyPI is the normal XBlock installation channel.
- GitHub Releases provide the permanent release record, checksums, provenance,
  and fallback downloads for both adapters.

Do not create a permanent `develop` branch. Do not create stable maintenance
branches until Scaffold is maintaining an older, incompatible release line.
Changes limited to contributor or repository documentation do not require a
formal release unless they change documentation distributed inside an adapter.

## Release Identity

Scaffold uses Semantic Versioning in the form `MAJOR.MINOR.PATCH`.

While Scaffold is below `1.0`:

- increment `PATCH` for compatible fixes and packaging or documentation
  corrections that change a published artifact;
- increment `MINOR` for significant new functionality or an incompatible
  pre-`1.0` change;
- use `1.0.0` only when the public formats, APIs, and supported installation
  contracts are ready to be treated as stable.

The root `package.json` records the Scaffold product version. At a release tag,
it and every public release identifier must agree:

| Release item               | Format                                   |
| -------------------------- | ---------------------------------------- |
| Root product version       | `X.Y.Z`                                  |
| Git tag                    | `vX.Y.Z`                                 |
| GitHub Release title       | `Scaffold X.Y.Z`                         |
| Moodle human release       | `X.Y.Z`                                  |
| Moodle ZIP                 | `mod_scaffold-X.Y.Z.zip`                 |
| Moodle Marketplace release | `X.Y.Z`                                  |
| XBlock distribution        | `scaffold-xblock==X.Y.Z`                 |
| XBlock wheel               | `scaffold_xblock-X.Y.Z-py3-none-any.whl` |
| XBlock source distribution | `scaffold_xblock-X.Y.Z.tar.gz`           |

Versions in private leaf workspace `package.json` files are implementation
metadata, not independent public release authorities. If a workspace package is
published independently in the future, this policy must first define its
relationship to the Scaffold product version.

Never move a published release tag, replace a published asset in place, or
reuse a published version number.

## Development and Release Notes

Changes on `main` are unreleased until tagged. Record product-wide user-visible
changes in the root `CHANGELOG.md` and host-specific changes in the affected
adapter changelog under an `Unreleased` heading.

During release preparation:

1. Choose the next version from the changes since the previous tag.
2. Replace `Unreleased` with the version and release date in the root and both
   adapter changelogs.
3. Add a new empty `Unreleased` section when development resumes.
4. Use the curated changelog to write the GitHub Release notes.

Because both adapters are published on every formal release, an adapter with no
host-specific change should record that it was rebuilt against the coordinated
Scaffold release rather than inventing a feature entry.

Release notes should emphasize behavior, compatibility, upgrade actions, and
security fixes. Routine dependency, formatting, and CI-only changes need not be
listed unless they affect users or the release artifact.

## Moodle Version Metadata

`adapters/moodle/scaffold/version.php` is authoritative for Moodle installation
and upgrade metadata.

- `$plugin->release` must equal the Git tag without the leading `v`.
- `$plugin->version` must be a monotonically increasing `YYYYMMDDXX` integer.
  Increase it for every published Moodle ZIP, even when only bundled frontend
  code or documentation changed.
- `$plugin->requires` changes only when the minimum Moodle version changes.
- `$plugin->supported` may be added only for an inclusive Moodle branch range
  covered by the release test matrix.
- `$plugin->maturity` must describe the release honestly. Alpha releases must
  also be marked as pre-releases on GitHub.

If a release changes installed database structures, update `db/install.xml` for
new installations and add the required idempotent steps to `db/upgrade.php` for
existing installations. The new Moodle version number must be greater than
every version that could already be installed.

## XBlock Version Metadata

Before the first formal release, XBlock distribution metadata must be
modernized into `adapters/xblock/pyproject.toml`. The root product version is the
release authority; the XBlock distribution version must mirror it and equal the
Git tag without the leading `v`.

The public distribution name and runtime entry point are stable contracts:

- administrators install `scaffold-xblock==X.Y.Z`;
- Open edX discovers `scaffold = scaffold_xblock:ScaffoldXBlock` through the
  `xblock.v1` entry-point group;
- the course advanced-module identifier is `scaffold`.

Declare supported Python and XBlock dependency ranges from the tested Open edX
host matrix rather than from the development environment alone. Record changes
to those ranges and any administrator upgrade action in the XBlock changelog
and GitHub Release notes.

## Release Prerequisites

A release candidate must satisfy all of the following:

- the selected commit is on `main`, has passed required CI, and contains no
  unrelated working-tree changes;
- version metadata and changelogs agree with the proposed tag;
- generated and vendored artifacts are current;
- required runtime assets are built from the selected commit;
- installation and upgrade behavior has been tested on the declared supported
  host versions;
- bundled dependencies and their licenses are suitable for distribution;
- Moodle Marketplace listing metadata and compatibility declarations are ready
  for the release.

Run the complete repository gate before creating a release commit:

```sh
vp run verify:release
```

Passing the source gate does not by itself prove that a packaged adapter is
installable. Release verification must test the exact distributions that will
be published.

## Moodle Package Contract

The Moodle release asset must be a reproducible ZIP with exactly one
top-level `scaffold/` directory. It must include the plugin source plus the
generated runtime directories `public/` and `amd/build/`.

The package process must:

1. Build and verify the Moodle adapter from the tagged source.
2. Stage the payload in a clean temporary directory.
3. Validate the component, version, changelog, archive root, runtime assets,
   file permissions, and excluded development files.
4. Produce `mod_scaffold-X.Y.Z.zip` and a SHA-256 checksum.
5. Inspect and smoke-install that exact ZIP rather than a second local copy.

GitHub's automatically generated source archives are not Moodle packages and
must not be presented as installable downloads.

Attach the tested ZIP to the GitHub Release and submit that exact file to Moodle
Marketplace; do not rebuild it between destinations. While the first
Marketplace listing or a new compatible release is under review, the versioned
GitHub Release asset is the temporary official Moodle download. After approval,
Marketplace becomes the primary Moodle channel and GitHub remains the verified
fallback.

The intended package interface is:

```sh
vp run @scaffold/adapter-moodle#package
```

This command and its exact-archive installation checks must be implemented
before the first formal release. Until then, Moodle packaging is a release
blocker, not a manual fallback.

## XBlock Package Contract

The XBlock release consists of a Python wheel and source distribution. Both must
contain the XBlock Python package, the stable loaders in `static/`, the generated
frontend in `public/`, and the validation schemas and fixtures required at
runtime.

The package process must:

1. Build and verify the XBlock adapter from the tagged source.
2. Synchronize and check generated validation artifacts.
3. Build the wheel and source distribution in a clean environment with
   `python -m build`.
4. Validate the distribution name, version, metadata, entry point, runtime
   files, permissions, and excluded development files.
5. Run `twine check` and produce SHA-256 checksums.
6. Install the exact wheel into a clean environment, load the `scaffold`
   `xblock.v1` entry point, and smoke-test it on the supported Open edX matrix.
7. Confirm that the source distribution can build an equivalent installable
   wheel without relying on repository files outside the distribution.

The intended package interface is:

```sh
vp run @scaffold/adapter-xblock#package
```

GitHub's automatically generated source archives are not Python distribution
packages and must not be presented as XBlock downloads. Attach the tested wheel
and source distribution to the GitHub Release and publish those exact files to
PyPI as `scaffold-xblock`; do not rebuild them between destinations.

The package command, exact-distribution installation checks, PyPI name
availability, and trusted-publishing configuration must be in place before the
first formal release. Until then, XBlock packaging and publication are release
blockers, not manual fallbacks.

## Public Installation Documentation

Do not present an installation channel as official until its release is
available there. The first-release rollout is not complete until the following
public documentation identifies the verified installation and upgrade paths:

- the root `README.md`;
- the packaged Moodle administrator guide at
  `adapters/moodle/scaffold/README.md`;
- the XBlock administrator guide and PyPI project description derived from
  `adapters/xblock/README.md`;
- the installation pages on `scaffold.ac`;
- the GitHub Release notes.

The instructions must identify the supported Moodle and Open edX versions, show
how to find the installed Scaffold version, and distinguish the normal channels
from versioned GitHub fallback downloads. XBlock instructions must cover a
pinned PyPI install, persistent Tutor or Open edX deployment, service restart,
and enabling the `scaffold` advanced module.

Immediately after the first GitHub and PyPI publication, update the public docs
to use those live destinations and label the GitHub Moodle ZIP as the temporary
official source while Marketplace review is pending. After Marketplace
approval, verify the listing from an administrator-facing path and update the
docs so Marketplace is the primary Moodle route. Check every published link and
command against the released version before declaring the rollout complete.

## Release Procedure

1. Select a green commit on `main` and review all changes since the previous
   release tag.
2. Choose the next SemVer and update the root product version, Moodle metadata,
   XBlock metadata, and all release changelogs together.
3. Run `vp run verify:release`.
4. Run both adapter package tasks locally to validate the release candidate.
5. Commit the release preparation to `main`.
6. Create an annotated tag named `vX.Y.Z`; sign it when release signing is
   configured.
7. Push the commit and tag. The release workflow must build both adapters from
   the tag, validate the fixed-version mapping, test the exact outputs on the
   supported host matrix, and create a draft GitHub Release.
8. Confirm that the draft contains the expected notes, Moodle ZIP, XBlock wheel
   and source distribution, checksums, and provenance.
9. Publish the GitHub Release and upload the same approved XBlock distributions
   to PyPI through the protected publishing workflow.
10. Submit the approved Moodle ZIP to Marketplace or add it to the existing
    listing with the tested compatibility declarations.
11. Update and verify the public installation documentation against the
    destinations that are live, including the temporary Marketplace-review
    state when applicable.
12. After Marketplace approval, verify installation and update discovery within
    a Moodle administrator session, make Marketplace the primary documented
    route, and confirm all channels identify the coordinated release correctly.

Release automation must use pinned dependencies, minimal token permissions,
an immutable tagged source commit, and PyPI trusted publishing rather than a
long-lived upload token. It must never publish from an uncommitted working tree,
a moving branch reference, or a second unverified artifact build.

The tag-driven draft GitHub Release workflow is not implemented yet. It is a
release blocker alongside both adapter package commands and the PyPI publishing
configuration. Marketplace provider and submission readiness are also required
before starting the first formal release.

## Failed and Superseded Releases

Do not force-move a pushed release tag. If a tagged candidate is defective,
fix the problem and use a new version.

After publication:

- do not delete or replace the affected asset silently;
- add a clear warning to the release when users must not install it;
- yank an unsafe PyPI release rather than deleting and recreating it;
- update the Marketplace listing and public installation docs with the same
  warning;
- publish a coordinated corrected patch release for both adapters;
- follow `SECURITY.md` for vulnerabilities and delay public details when
  coordinated disclosure requires it.

Record any required administrator action in both the adapter changelog and
GitHub Release notes.

## Maintenance Branches

Tags are sufficient while Scaffold supports one active development line.
Create a stable maintenance branch only when `main` has become incompatible
with a released line that still receives fixes. Name the branch for the
Scaffold release line, such as `release/0.3`, and document its Moodle and Open
edX support matrix, backport rules, and version ordering before publishing from
it.
