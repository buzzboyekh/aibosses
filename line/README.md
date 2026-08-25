# LINE layer

The owner's interface. Agents draft, the owner taps Approve or Reject on his
phone, and only then does anything leave the building.

## Files

| File | What it does |
|---|---|
| `verify.ts` | Webhook signature check + postback encode/decode |
| `client.ts` | Push and reply calls to the Messaging API |
| `templates.ts` | The approval card with Approve/Reject buttons |
| `handlers.ts` | What happens on a tap, and on an inbound message |
| `../app/api/line/webhook/route.ts` | The endpoint itself |

## Three rules the code enforces

1. **Verify the signature over the raw body**, before parsing. Otherwise anyone
   who learns the URL can post fake approvals. The route uses `req.text()`, not
   `req.json()`, because re-serialising the body changes the bytes and breaks
   the signature (there is a test for exactly this).
2. **Return 200 immediately.** LINE retries any non-200, which would process
   the same approval twice. Agent work happens after the response.
3. **Push, not reply tokens.** A reply token is single-use and expires in about
   a minute; our LLM chain can outlast it.

Double taps are safe: `decide()` is guarded in the database, so the second tap
transitions nothing and the owner is told "already handled" rather than the
message being sent twice.

## Environment

```
LINE_CHANNEL_SECRET=        # Basic settings
LINE_CHANNEL_ACCESS_TOKEN=  # Messaging API tab, issue a long-lived token
LINE_OWNER_USER_ID=         # see below
```

`LINE_OWNER_USER_ID` is not shown anywhere in the console. Add the OA as a
friend, send it any message, and the bot replies with the id (and logs it).
Paste that into the env and redeploy. Only that user's taps are accepted.

## Tests

```bash
./test/build-mjs.sh && node test/line.test.mjs
```

## Setup checklist

- [ ] LINE Developers console → provider → **Messaging API** channel
- [ ] Messaging API tab → issue channel access token
- [ ] Webhook URL = `https://<deployment>/api/line/webhook` → Verify → Use webhook ON
- [ ] Auto-reply messages OFF (they fight the bot's own replies)
- [ ] Add the OA as a friend, send "hi", copy the returned user id into env
- [ ] Send "ping" → expect "pong — webhook is live"

## Serverless trap (cost us a debugging round, 2026-08-25)

On Vercel the function is **frozen the moment the response returns**. A bare
fire-and-forget promise never runs: the webhook logs a clean 200, and the
approval sits pending forever with no error anywhere.

The route hands background work to `waitUntil()` from `@vercel/functions`
instead, which keeps the instance alive until the work settles while the 200
still goes out immediately. Outside Vercel `waitUntil` is unavailable, so the
route falls back to awaiting.

If approvals ever stop applying, check this first: a 200 with no handler log
lines after it is the tell.
