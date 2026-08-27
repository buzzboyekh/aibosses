# Running the demo, for whoever is driving

Written for Eric, who is at the event all three days and is driving on stage
while Kun talks. Nothing here assumes Kun is available.

**Run it once yourself, alone, before Sep 1.** The first time you drive this
should not be in the room.

## Every single time, before you run

```bash
npm run preflight     # is everything actually working right now
npm run demo:reset    # put the agents back to Level 0
```

The reset matters more than it looks. After three clean approvals an agent
promotes itself and **stops sending the approval card** — no error, no warning,
the demo just has no second act. If the card does not appear, this is why.

## The run

```bash
npm run demo
```

It prints what Kun should be saying before each beat, then waits for you to
press enter. You control the pace: let him finish the sentence, then fire.

Two phones: one is the customer, one is Kun's, which receives the approval
cards. Both on 4G. Never venue wifi.

## What can go wrong, and what to do

| what you see | what it means | what to do |
|---|---|---|
| No approval card on the phone | An agent was promoted, or the push quota ran out | `npm run demo:reset` and re-run. If it happens twice, cue the video |
| "agent thinking" dots forever | The model call is slow or failed | Wait 60s. If nothing, move to the next beat and come back |
| Webhook returns anything but 200 | The deployment is unhealthy | `npm run preflight` tells you which part. If it is red, cue the video |
| A draft looks wrong or empty | The model produced something poor | Carry on. Kun can talk over it. Do not restart mid-demo |
| Two beats fail | Something is genuinely broken | Cue the video. Do not debug on stage |

**Cueing the video is not failure.** It is the plan. Have it open in a tab
before you go on, not on a drive somewhere.

## The screen judges look at

`/dashboard?key=…` — the approval queue and the decision log. Refresh after
each approval so the log grows while they watch. Get the key from Kun and put
it in a bookmark before the day; the page 404s without it, deliberately.

## What not to do

- Do not run `npm run demo:reset` while someone else is rehearsing; it clears
  their queue.
- Do not merge anything into the demo path on Sep 5 or 6 unless the demo is
  already broken without it.
- Do not run `npm run prove` live. It takes several minutes.
