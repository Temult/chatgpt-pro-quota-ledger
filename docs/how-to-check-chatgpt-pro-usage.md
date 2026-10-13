# How to check your remaining ChatGPT Pro messages and reset time

ChatGPT's Pro models have usage limits. Depending on your subscription and the ChatGPT interface available to you, you may see a reset time when a limit is reached, but not a running count of messages remaining.

## Start with ChatGPT

1. Open **Settings → Usage**. Look for model or feature allowances if your account displays them. The Usage screen may show other quotas without showing a Pro-message counter.
2. Open the **model picker** in a regular ChatGPT conversation. If **Pro** is unavailable because you've reached a limit, ChatGPT may show when access will return.
3. If neither location displays a date, there may be no supported way to see the exact Pro reset time before it becomes available again. The subscription renewal date is not necessarily the usage reset date.

OpenAI's [model and usage guide](https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt) says reset information is displayed **when available**. ChatGPT Work and Codex have separate allowances, so their usage indicators shouldn't be used to infer your regular Chat quota.

## Want a counter while you're using Pro?

[ChatGPT Pro Quota Ledger](../README.md) is a free Tampermonkey userscript that shows an **estimated remaining-message count** beside the Pro setting in ChatGPT's model picker. It can also show an optional floating counter.

After installing it, you can:

- See your estimated remaining Pro messages without opening developer tools.
- Hover over the Pro counter for the next expected reset and an average daily-use budget.
- Choose Picker only, Floating only, or Both, directly in ChatGPT.
- Correct a missed message with `Ctrl+Shift+P` or `Alt+Shift+P`.

It watches supported Pro submissions in the same browser and saves local metadata. It does **not** send messages for you or query OpenAI for a secret usage balance. It cannot see activity from your phone, another browser profile, or a different computer.

## Common questions

### Does ChatGPT show an exact number of Pro messages left?

Not consistently. The script estimates remaining messages from submissions it observes and your configured allowance. **An estimated `38/50` is not a server-confirmed `38`**. The number may differ when a request fails, is retried, or is submitted elsewhere.

### When does GPT-6 Pro reset?

If ChatGPT reports a Pro restriction with a reset timestamp, the script displays that timestamp. Otherwise it labels the next date as an estimate or projection. It does not turn an estimated reset into a confirmed one.

### Is GPT-6 Pro the same allowance as GPT-5.6 Sol Pro?

On the **Pro $100** plan, OpenAI describes the two Pro models as sharing a weekly allowance. Higher-priced Pro plans can have different limits and rules. Check [OpenAI's Pro-tier information](https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers) for current plan details. The script's `50` preset is configurable, not a guaranteed live entitlement.

### Does selecting Pro use a message?

No. Changing the model picker alone is not a submission. The ledger counts recognized Pro requests after the browser receives a successful HTTP submission response.

### Why is the counter different on my phone or another computer?

The ledger stays in one browser storage profile. There is no cloud sync. Counts on different devices or browser profiles do not automatically match.

## Getting started

Follow the short [installation instructions](../README.md#install). For accuracy, supported models and troubleshooting, see [Known limitations](KNOWN_LIMITATIONS.md). This is an independent community project, not an official ChatGPT usage display.
