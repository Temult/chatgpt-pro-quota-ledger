# Install ChatGPT Pro Quota Ledger v0.3.4

This is an unofficial Tampermonkey userscript for ordinary ChatGPT web chats.
It estimates Pro-message usage locally. It does not bypass limits or supply an
official server balance.

## New installation

1. Install Tampermonkey from its official website or your browser's extension store.
2. Extract this archive. In Tampermonkey, open **Dashboard → Utilities → Import from file**.
3. Select `chatgpt-pro-quota-ledger.user.js` and review the installation prompt.
4. Ensure only one copy is enabled, then refresh each open ChatGPT tab.
5. Select **Pro** and open the Power picker to see the pill. The floating tray is also available by default.

Use **Settings** to set the weekly allowance. Auto has a built-in `prolite=50`
preset and can use observed limit metadata, but it is not a live subscription
policy lookup. Use a manual allowance when it does not match your account.

Click the pill for display placement or **Full settings…**. Full settings opens
temporarily and closing it returns to your chosen display. **Alt+Shift+Q**
restores Both displays and opens Settings if the picker becomes unavailable.

## Already using v0.3.4?

There is **no runtime change in this documented build**, so reinstalling is not
necessary. Source comments and repository documentation were added. Earlier
v0.2/v0.3 records use the same keys; keep the existing browser profile and do
not clear site storage while upgrading. Old tabs must be refreshed after an
actual script update. Disable duplicates rather than running two versions.

## Privacy and limits

The script itself makes no extra network requests and stores no prompt text
or raw conversation/message IDs in its v2 ledger. It temporarily parses the
page's relevant JSON and records metadata in origin-local storage. That
storage is not secret or tamper-proof. The retained v0.1 rollback record may
contain raw IDs. Other devices and browser profiles are not synchronized.

Diagnostics are off by default. **Settings → Diagnostics → Preview report**
lets you inspect a minimized summary before sharing; enable Capture only to
collect the bounded event timeline. Reports omit prompts and credentials but
still reveal usage timings and plan labels. Do not post a HAR, cookies, raw
storage, or an entire network response in a public issue.

HTTP success does not prove a completed or charged Pro reply. Remaining
messages, retry matching, and projected weekly resets are estimates. Full
technical limitations, security guidance and test results are included in
the separate source package. This prerelease has no automatic publisher,
no project-controlled update URL, and no independent security certification.

No Node.js, Python, API key or GitHub account is needed to use the script.
This archive contains only the app and notices. See `LICENSE` and
`THIRD_PARTY_NOTICES.md` for licensing and attribution.
