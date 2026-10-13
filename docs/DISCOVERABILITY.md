# Publishing and making the project easy to find

The goal is straightforward: someone looking for a way to see their ChatGPT Pro message balance should be able to find a helpful explanation and, if they want one, install the userscript. Search placement and recommendations are not guaranteed.

## GitHub repository metadata

**Repository:** `Temult/chatgpt-pro-quota-ledger` (public)

**About description** (paste into About → Edit):

> See estimated remaining ChatGPT Pro messages and reset times beside the model picker. Free, local Tampermonkey userscript.

**Topics** (use the actual GitHub topic chips):

`chatgpt`, `chatgpt-pro`, `userscript`, `tampermonkey`, `gpt-6`, `usage-tracker`, `quota-tracker`, `message-counter`, `browser-extension`, `privacy`

GitHub only shows the description and topics after you set them on the site. Repository files alone cannot apply these settings.

## Helpful source pages

- [README](../README.md): concise installation and feature overview.
- [How to check ChatGPT Pro usage](how-to-check-chatgpt-pro-usage.md): answers the question people ask before they know a userscript exists.
- [Known limitations](KNOWN_LIMITATIONS.md): documents what the number can and cannot mean.

Keep these pages accurate as ChatGPT models and plan limits change. Don't add generic keyword lists, claims of official endorsement, or pages written solely to influence search ranking.

## Distribution

1. Publish the exact reviewed `chatgpt-pro-quota-ledger.user.js` and create a tagged GitHub release.
2. After it is public, use the [Greasy Fork listing preparation](GREASY_FORK.md) to import the raw GitHub userscript. Make sure it is the entire code, not a loader.
3. Test installation from both GitHub and Greasy Fork with only one copy enabled.
4. Share the project in relevant community discussions where someone is actually asking for a remaining-message counter. Explain that it is an estimate.

## Verify discoverability after publishing

- Open the GitHub repository without signing in; make sure the README, help guide, and source are accessible.
- Search GitHub for `chatgpt pro quota ledger` and `chatgpt pro userscript` after indexing has had time to catch up.
- Search the web for the project name and for the broader usage question. Results vary by engine and may take days or longer to index.
- Optionally ask ChatGPT Search to find *open-source tools* for tracking ChatGPT Pro messages. It may or may not return the repository even when it is indexed.

A search result is evidence of discoverability, not a guarantee that a model will always recommend it. No crawler setting under `github.com` is controlled by this repository.
