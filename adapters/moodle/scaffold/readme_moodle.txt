Scaffold Moodle frontend third-party import
================================================

The installable plugin redistributes a tree-shaken, code-split Vite frontend
under public/. Source package versions are locked by the repository's
pnpm-lock.yaml. No third-party source is patched for Moodle; Vite compiles,
minifies, and combines package modules and assets into generated output.

To update the imported libraries:

1. Update the workspace dependencies and pnpm-lock.yaml in the Scaffold
   repository.
2. Run:

   vp run @scaffold/adapter-moodle#sync:third-party-libraries

   This performs an in-memory production build, traces the modules and emitted
   assets that survive tree-shaking to their package metadata, and regenerates
   thirdpartylibs.xml and THIRD_PARTY_NOTICES.md.
3. Run:

   vp run @scaffold/adapter-moodle#verify
   vp run @scaffold/adapter-moodle#package

4. Review and commit the dependency lock, generated public/ output,
   thirdpartylibs.xml, and THIRD_PARTY_NOTICES.md together.

The generated Moodle declaration uses public/assets when every contribution
from a package is emitted there, and public when a package also contributes a
root bundle or stylesheet. Multiple packages may share a declared location
because Vite combines their code into the same generated chunks.
