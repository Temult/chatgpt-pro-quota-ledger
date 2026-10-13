# Prepare and publish a release

Intended repository: `Temult/chatgpt-pro-quota-ledger`. Nothing in this source archive creates a repository, pushes a commit, grants permissions, or publishes a release. The first proposed release is **v0.3.4, prerelease**. The userscript version stays 0.3.4 because this preparation does not change runtime behavior or its metadata header.

## 1. Inspect the prepared repository

Use the root containing `README.md`, `package.json`, the userscript and `.github/`. The source archive intentionally omits private screenshots, old executable archives, earlier ad hoc logs, local runtime directories and any Git history. The original source/install hashes are recorded in `docs/provenance.json`.

Run `npm run check` and `python scripts/run_browser_tests.py --include-origin-storage`, then `python scripts/package_release.py`. Compare the two resulting ZIP hashes with a second packaging run. Read [known limitations](KNOWN_LIMITATIONS.md) and the [draft release notes](releases/v0.3.4.md). Decide whether the prerelease scope and limitations are acceptable before publishing.

## 2. Establish the repository without overwriting existing work

Choose Public, description **"Local Pro-message estimates and reset visibility for the ChatGPT web interface."** Suggested topics: `chatgpt`, `tampermonkey`, `userscript`, `quota`, `privacy`.

For a **new empty repository only**, create it without an automatic README/license, then run these commands from the reviewed source root:

```sh
git init -b main
git add .
git diff --cached --stat
git diff --cached --check
git commit -m "Prepare initial public prerelease of Pro Quota Ledger"
git remote add origin https://github.com/Temult/chatgpt-pro-quota-ledger.git
git push -u origin main
```

Review the staged filenames before committing. Do not add personal author details you do not intend to publish. The commands use your normal Git authentication; never put a token in a remote URL or paste it into chat.

For an **existing repository**, clone it first, make a preparation branch, and copy the reviewed source tree into that working copy while preserving `.git`. Review the diff, push the branch and open a PR. Do not use force-push, reinitialize over existing history, or overwrite unseen work. A placeholder README can be replaced intentionally after inspecting it. Hidden `.github` files must be copied too.

The repository was not accessible at its proposed path during preparation. That 404 could mean absent or not visible to the connection; it is not proof that no such private repository exists. Resolve this in the owning GitHub account before following the empty-repository route.

## 3. Configure and run checks

The included CI workflow runs Node checks on Linux/Windows and Chromium/schema checks on Linux. It has read-only contents permission, pinned actions, no project secrets, no automatic publisher, and no privileged pull-request trigger. Wait for a real Actions run before presenting a green build status.

Enable Issues and private vulnerability reporting. Choose branch rules appropriate for a small maintainer-led project. Add required checks only after their names appear in a real successful run. These settings are not applied by copying the files. Dependency update configuration proposes reviewable changes; it does not merge them.

## 4. Publish the first prerelease

After reviewing the exact commit and successful CI, tag that commit `v0.3.4` and create a GitHub release marked **prerelease**. Do not move an existing tag. Paste `docs/releases/v0.3.4.md` as the release description and attach:

- `dist/ChatGPT-Pro-Quota-Ledger-v0.3.4-Install.zip`
- `dist/ChatGPT-Pro-Quota-Ledger-v0.3.4-Source.zip`
- `dist/ChatGPT-Pro-Quota-Ledger-v0.3.4-SHA256SUMS.txt`

The installation archive includes the userscript, `INSTALL.md` instructions and privacy notice, project license, provenance snapshot and upstream attribution. The source archive includes tests, documentation and publication tooling. Checksums bind bytes, not a cryptographic author signature.

Download the assets back from GitHub and compare their hashes. Verify the README links and installation flow from a clean browser profile. Only then announce the release. Release publishing is a deliberate human action; CI cannot do it on its own.

## 5. Make the published project discoverable

After the repository is public, set the **GitHub About description and topics** from [Discoverability](DISCOVERABILITY.md). GitHub does not apply those settings from README content.

When the exact userscript has passed its release checks, publish the same script to Greasy Fork using the [prepared listing and import instructions](GREASY_FORK.md). The first Greasy Fork upload requires a signed-in account; it is not performed by the GitHub release or its CI. Verify what Greasy Fork displays and install-test one enabled copy before sharing it.

The [usage guide](how-to-check-chatgpt-pro-usage.md) is the standalone page to link when someone asks how to see the Pro quota. Keep it accurate rather than repeating search phrases across the repository.

## 6. Later releases and updates

Increment `@version`, runtime `VERSION`, package version, changelog and release notes for an intentional runtime change. Update the provenance/reconstruction check through review rather than masking a mismatch. Run the full suite and explicitly retest affected live UI paths. Never silently change storage namespaces.

This build contains no new `@updateURL` or `@downloadURL`. Initial users install manually. Add stable update metadata only as a separately tested release once the repository and release policy exist. That would add userscript-manager update traffic and needs accurate documentation; it is not part of the current runtime's no-extra-network promise.

Reference: [GitHub workflow security guidance](https://docs.github.com/en/actions/reference/security/secure-use), [Tampermonkey metadata documentation](https://www.tampermonkey.net/documentation.php), and [OpenAI's current Pro help](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers). These describe external products, not guarantees of this script's compatibility or numeric presets.
