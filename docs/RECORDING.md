# Recording the fallback video

The video is on the never-cut list. If the live demo fails on stage, this is
what plays instead. Kun is the only person who can narrate it, so it has to
exist **before Sep 2**, when he leaves for SEMICON.

Target: three minutes, one take, no editing.

## Before you press record

```bash
npm run preflight
```

Green means everything the demo depends on is working right now: the
deployment, the webhook signature both ways, LINE push quota, the model
account, every agent back at Level 0, and the business rules still reaching the
agents. Red tells you what to fix. Do not start a take on red.

Then:

```bash
npm run demo:reset
```

Three clean rehearsals promote an agent, and a promoted agent stops sending the
approval card. Reset before **every** take or the second act silently vanishes.

## Screen layout

Three things visible, in this order of importance:

1. **Your phone**, mirrored or in shot. This is where the approval card lands
   and where you tap. It is the whole point.
2. **The dashboard**, `/dashboard?key=…`, on the decision log. Refresh it after
   each approval.
3. **A terminal**, running the demo. Enlarge the font before you start.

Phone on 4G, never venue wifi, and the same on the day.

## The run

```bash
npm run demo
```

It fires each act and prints what to say before each one, then waits. So you
are reading, not remembering. The full script and the answers to the three
likely questions are in `docs/PITCH.md` — read that once before the first take.

Beat by beat: a customer messages on LINE and an agent quotes with real,
checkable numbers; you approve on your phone; two documents disagree and a
different agent catches it; a shipment slips and an agent writes to the
customer unprompted; close on the decision log.

## If a beat fails mid-take

Say so out loud and carry on to the next beat. Do not stop, do not debug, do
not restart. A recovered take is worth more than a fourth attempt, and how you
handle a failure is exactly what judges are watching for anyway.

If two beats fail, stop, run `npm run preflight`, fix, and start again.

## After the take

- Watch it back once, the whole way through.
- Check the audio. A silent video is not a fallback.
- Check the approval card is legible at the size it will be projected.
- Put the file somewhere Eric can reach it without you, and tell him where.
  He is the one who will have to play it if it comes to that.

## Optional fourth beat

If the three acts came in comfortably under three minutes, `npm run prove`
produces the memory comparison. Do not run it live, it takes several minutes.
Record its output separately, or show it as a still.
