# Attribution and provenance

The project was developed for its maintainer with AI assistance. The current single-file implementation evolved from the conversation's v0.1 prototype through the accepted v0.3.4 behavior. The authenticated predecessor archive and source hashes are in [docs/provenance.json](docs/provenance.json).

**BlueSkyXN's ChatGPT Quota Helper**, in [BlueSkyXN/CPA-Panel-LTS](https://github.com/BlueSkyXN/CPA-Panel-LTS/blob/main/scripts/chatgpt-quota-helper.js), informed the technique of observing the site's already-occurring `conversation/init` response for restriction and reset metadata. Please retain that credit.

The project is not distributed as a fork or bundled copy of that helper. Its event ledger, manual reconciliation, UI and tests are maintained here. This is a provenance description based on the available development record, not a legal conclusion that every generated line is uniquely original or an exhaustive third-party code-similarity audit.

The upstream repository's MIT LICENSE was read during preparation; its Git blob SHA was `82cc6a2bdcb93479d9b9cc5f852a49cbf5229b01`. A complete copy is preserved in [LICENSES/BlueSkyXN-CPA-Panel-LTS-MIT.txt](LICENSES/BlueSkyXN-CPA-Panel-LTS-MIT.txt), including `Copyright (c) 2026 Router-For.ME`. Keeping that notice is conservative attribution, not a claim that the upstream author wrote or endorsed this project.

The project itself retains its [MIT license](LICENSE). Future borrowed code must retain applicable notices; do not assume public GitHub visibility alone permits relicensing. Development tools and GitHub Actions are obtained separately and are not bundled into the userscript.

OpenAI, ChatGPT and Tampermonkey names identify compatibility only. No affiliation, endorsement or trademark ownership is claimed.
