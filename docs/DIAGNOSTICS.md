# Diagnostics and safe bug reports

Diagnostics answer "what did the script observe?", not "what did OpenAI bill?" They are not a HAR file or packet recorder.

## Capture and export

Open **⚙ Settings → Diagnostics**. Capture starts off. Enable it before reproducing an issue, select **Preview report**, review the JSON, and then Copy or Download JSON. Copy/download use the exact previewed bytes. A summary-only report works with capture off. Disable capture when finished; Clear log removes old diagnostics without erasing quota history.

In Picker-only mode, choose **Full settings…** from the pill. This temporary view does not change placement; close × to return. `Alt+Shift+Q` is a separate recovery shortcut that deliberately saves Both.

The retained timeline is bounded to 150 events and seven days on reads, with physical cleanup during capture, preview and active-profile startup. Nothing runs to erase data while the browser is closed. Disabling capture stops future event recording, not ordinary quota accounting or previously stored records.

## Schema v1

See [diagnostic-schema-v1.json](diagnostic-schema-v1.json) and the generated synthetic [example report](diagnostic-example.json).

| Field | Meaning |
| --- | --- |
| `version`, `generated_at` | Runtime release and UTC snapshot time |
| `capture_enabled`, `retention` | Event-capture setting and configured bounds |
| `quota` | Configured cap, cap source, plan label, derived counts, block state and reset evidence |
| `display_mode` | Saved placement, not temporary view state |
| `synchronization` | Storage-access flag, stored event/status counts, checksum of ledger key names |
| `diagnostics` | Allowlisted chronological event scalars |

Event fields are `at`, `kind`, and optional `outcome`, `source`, `endpoint`, `model`, `plan`, `http_status`, `limit`. Endpoints are two fixed labels, not URLs. No arbitrary nested object is copied. Snapshot validation checks the emitted sample against the JSON schema; the Node privacy tests additionally exercise contaminated records, since schema validation alone cannot prove absence of secrets in every string.

**Known v0.3.4 reporting defect:** `sanitizedDiagnostic` accepts `httpStatus`, serializes it as `http_status`, then omits it on the second sanitization pass because it expects the original spelling. Capture may store the status, but preview/export drops it. `http_status` is optional in schema v1. A missing status is not evidence that no response arrived. The source remains unchanged in this documentation pass; the regression characterization and limitations document make this explicit.

## Comparing 37 and 38 in different tabs

Do not clear either ledger first. Ensure the same enabled script version and browser partition, verify the selected local profile and configured cap, then refresh both tabs. Note that the active profile is itself shared across same-origin tabs.

Generate fresh previews close together. Compare `quota.locally_observed`, `configured_limit`, `limit_source`, `currently_blocked`, `next_reset`, and `synchronization.event_records/status_records`. Counts may change while other runs complete or timestamps cross a boundary.

`ledger_checksum` is 32-bit FNV-1a over the sorted **event/status key names**. Different checksums suggest different key sets. **Matching checksums do not prove matching values, settings, clocks, or counts.** Key values may differ while names match, and collisions are possible. This corrects the earlier overly strong inference that an equal checksum necessarily means a rendering bug.

The `local_history_partial` flag records whether an elapsed reset boundary exists. It cannot prove all account use was observed. Likewise, `local_storage_accessible=false` means at least one operation failed during this tab's life; it is not a fresh comprehensive storage health test.

## Privacy boundaries

Reports omit prompt/reply content, profile names, raw message/conversation/account IDs, session tokens, cookies, URLs, DOM HTML and full payloads. They still expose usage times, recognized model/plan labels, counts and a correlatable checksum. Redaction is not anonymity. Review before public posting.

Never attach a HAR, console-wide dump, browser profile, cookies, entire localStorage export, diagnostic report from another account, or a real conversation URL. Reproduce bugs with synthetic values whenever possible. Sensitive security issues use the [security reporting process](../SECURITY.md), not a public issue with secrets.

## What capture cannot answer

It cannot recover events missed before capture, reconstruct other-device activity, confirm paid quota consumption, inspect final streamed answers, or repair the user's actual balance. Unrecognized large or non-string bodies may be labeled `not-pro` rather than a precise format-error reason. A diagnosis should cite observed evidence and retain uncertainty rather than automatically editing counts.
