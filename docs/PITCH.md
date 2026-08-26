# The pitch

Three minutes on stage, then questions. Kun speaks, Eric drives.

Read this out loud on a timer. The point is not to memorise it, it is to know
what each beat is FOR, so you can survive the demo going sideways.

Judging is innovation, technical execution, product vision, real-world impact,
user experience, and use of sponsor tech. Impact is scored through evidence
shown, not market size claimed.

---

## Open (20 seconds)

> A freight forwarder in Taiwan runs on three or four people typing the same
> shipment into five different systems. Quoting, chasing suppliers, and
> answering "where is my cargo" at eleven at night.
>
> The only lever they have is hiring, and they do not want to use it.
>
> So we did not build them a tool to learn. We built them staff.

Do not say AGI. Do not say autonomous. Do not say "for any business".

---

## Demo (about 2 minutes) — Eric drives, you narrate

**Beat 1, the quote.**
> A customer messages the company on LINE. Not a portal anyone had to learn,
> the app they already have open.

*(routing appears, then the draft)*

> That went to quoting because our orchestrator read it and decided. Now look
> at the price. **A language model did not calculate that number.** It read
> what the customer asked for, our code picked the volume tier and applied the
> margin, and the model only wrote the Chinese around it. Landed cost, margin
> and exchange rate are all on the card, so the owner can check the arithmetic
> in one glance.
>
> And it has not gone anywhere. It is sitting on my phone.

*(approve on your phone, live)*

**Beat 2, the documents.**
> Same inbox, different problem: the invoice and the packing list disagree.
> This one went somewhere else entirely, to document intelligence, and it
> quotes both numbers back. A thousand on one, nine hundred and eighty on the
> other. That gap is what gets caught at a border, or does not.

*(approve)*

**Beat 3, unprompted.**
> Nobody asked for this one. The shipment slipped eight days at Kaohsiung, and
> the agent is writing to the customer before the complaint arrives.

**Close on the log.**
> Every one of those is on the record. Who did it, what they did, and why.
> Including what the agent knew at the time it decided.
>
> And these agents start out only allowed to draft. Approve enough times and
> one promotes itself and stops asking. Reject once and it goes back to
> asking. So you do not have to trust it on day one. It earns it, in public,
> and you can take it back.

---

## Close (25 seconds)

> There are one point seven million SMEs in Taiwan. Ninety-nine percent of
> companies here, eighty percent of the jobs. Seven percent have touched AI,
> and the reason most of them give is that they cannot see what they would use
> it for.
>
> They do not need another tool. They need the work done, in the app they
> already use, in their language, with their hand on the switch.
>
> Six capabilities. One industry, deep. Everything approved by a human until
> it has earned otherwise.

---

## The three questions, answered verbatim

Rehearse these until they are boring. They are the most likely questions, and
each has one good answer.

### "Anthropic already ships this. Claude for Small Business, free, with an approval gate. Why do you exist?"

> Right, and it is good. It connects QuickBooks and PayPal, and it lives in a
> browser dashboard in English.
>
> A Taiwanese SME owner does not use QuickBooks and is not sitting in a
> dashboard. He is in LINE. So our approval queue is inside LINE, the work is
> in 繁體中文, and it fits Taiwanese paperwork. And the government is already
> paying these companies to buy tools like this.
>
> We are not competing on the model. We are the last mile they are not going
> to build.

### "Is that demo real, or scripted?"

> It is real. Change something and we will run it again.
>
> *(hand them a phone, or ask for a number)*
>
> The signature on that webhook is verified, the approval is a row in a
> database, and the log is append-only. If you tap approve twice, the second
> tap does nothing, and there is a test that proves it.

### "How do you know the AI is not making things up?"

> For the numbers, it structurally cannot. Prices are computed in code from a
> real price list. The model never does arithmetic, because models are bad at
> arithmetic. We found that ourselves: it quoted eighteen dollars as fifteen,
> so we took the calculator away from it.
>
> For everything else, look at the missing field. When it does not know
> something it says so instead of inventing it. And every draft stores the
> exact context it was given, so you can go back and see what it knew.

---

## Questions with weaker answers, so know them

- **"What is your moat?"** Honest: the model is not it. The moat is the
  relationship history that accumulates, and being the one that fits LINE and
  Taiwanese paperwork. Do not claim a technical moat we do not have.
- **"How many real customers?"** None yet. Say it straight: the sourcing data
  in the demo is real, from a real import business one of us runs, and that is
  what we built it against. Do not imply pilots that do not exist.
- **"Does it work for other industries?"** Show the second config, do not
  argue. If it is not built, say "same six capabilities, different config,
  that is next" and move on.
- **"Why not let the agents talk to each other?"** They hand off through
  shared state instead. Same behaviour, and every hop is logged and cannot
  loop. A mesh is one LLM call per hop and nobody can reconstruct it after.

---

## If it breaks on stage

Say it out loud and keep moving. Judges have seen a hundred broken demos; what
they score is how you handle it.

> That is a live system on conference wifi, so let me show you the recording,
> and afterwards I will run it again on my own connection.

Eric has the video cued. Do not debug in front of the room.

---

## Rules

- **Run `npm run demo:reset` right before going on.** Three clean rehearsals
  promote the agents and the approval card silently stops appearing.
- Phones on 4G. Never venue wifi.
- Never say: AGI, fully autonomous, replaces your staff, works for any business.
- Every number you say either came out of the demo or has a source. No guesses.
