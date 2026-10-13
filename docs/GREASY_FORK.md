# Greasy Fork publication

After the GitHub repository and its first release are public, publish the same `.user.js` to [Greasy Fork](https://greasyfork.org/en). This is a distribution listing, not another build of the code.

## Listing details

**Script name:** `ChatGPT Pro Quota Ledger (Local)`

**Short description:** `See estimated remaining ChatGPT Pro messages and reset times inside the model picker. Optional floating counter; no API key or telemetry.`

**Long description** (suitable for the Greasy Fork description editor):

> ChatGPT Pro Quota Ledger adds a small estimated message counter beside the Pro setting in ChatGPT's model picker. It tracks recognized Pro submissions in your browser and can show an optional floating widget, next expected reset date, and daily-use budget. Choose where the counter appears without opening Tampermonkey.
>
> It's a local estimate, **not** an official count from OpenAI. Other computers, phones and browser profiles don't sync, and some failed requests can produce discrepancies. The script does not read your prompt content into storage, need an API key, send telemetry or make its own usage requests. Diagnostics are optional and off by default.
>
> Full source, tests and documentation: https://github.com/Temult/chatgpt-pro-quota-ledger

**Language:** English. **License:** MIT. **Supported site:** `chatgpt.com`. **Script type:** ordinary userscript, not library.

## Import it from GitHub

1. Sign in to Greasy Fork and choose **Publish a script you've written** or its GitHub import option (wording can change).
2. Use the **raw** source URL, not the GitHub HTML page:

   `https://raw.githubusercontent.com/Temult/chatgpt-pro-quota-ledger/main/chatgpt-pro-quota-ledger.user.js`

3. Review the detected `@name`, `@namespace`, `@version`, `@description`, `@license` and `@match` values. Keep name and namespace consistent with existing installations.
4. Start with **manual synchronization** if available so new GitHub commits can't change the Greasy Fork listing before you review them. Consider automatic sync later, once the release process is tested.
5. Preview the Greasy Fork page, confirm its source contains the full script, and verify that installation works in a clean browser profile.

Greasy Fork rewrites download/update URLs for scripts installed through its site. A user switching from a local Tampermonkey installation should keep **only one enabled copy**. Do not advertise automatic cross-channel updates until they've actually been tested.

## Checks before publishing

- No external code loading, remote telemetry or prohibited `@match` sites.
- The script is readable, not minified or obfuscated.
- The description explains the local estimate instead of promising an official balance.
- The source retains the MIT license and third-party attribution in the GitHub repository.
- Avoid unrelated keyword tags and reposting an identical script under multiple names.

Relevant rules: [Greasy Fork script rules](https://greasyfork.org/en/help/code-rules), [metadata keys](https://greasyfork.org/en/help/meta-keys), and [how posted scripts are rewritten](https://greasyfork.org/en/help/rewriting).
