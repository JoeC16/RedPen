# Demo script (about 15 minutes)

For a first meeting with an education authority or trust. Three people's views, in this order: a teacher, a school leader, the authority. The story: **the teacher decides, the AI saves time, and the authority sees the quality evidence without seeing pupils.**

Everything on screen is invented demo data, marked "Demo data" in the header, and the AI runs in demo mode (a banner says so). Say this at the start rather than letting anyone discover it.

## Before the meeting

1. Reset the demo the same morning, so the six weeks of history end today:
   `npm run db:reset` (locally), or the deploy's reset command (see the deployment notes).
2. Open three browser windows (or profiles), and sign in to each. The password is `redpen-demo-2026` for every account.
   - Teacher: `a.byrne@northgate.test` (Aoife Byrne, Northgate High School)
   - School admin: `admin@northgate.test` (Sam Okafor)
   - Authority admin: `authority.admin@demo-authority.test` (Morgan Hale)
3. In the teacher window, open **My classes → 10M1 → Algebra and area**. It shows 30 pupils with typed work, none marked. Don't press anything yet.
4. Have the trust centre open in a fourth tab: `/trust`.

If the internet fails, nothing in the demo needs it: demo mode marks from built-in results.

## 1. The problem (1 minute)

Ask the room how long their teachers spend marking homework each week, and use their number. (Don't quote a national figure unless you have checked its source; see `docs/claims.md`.) "Red Pen does the first pass, so that time goes on feedback, and the teacher still decides."

## 2. Teacher: marking a class (5 minutes)

1. On **Algebra and area**, point out: Year 10, Maths, out of 7, 30 pupils with work. The mark scheme is the teacher's own, with M and A marks (open "Mark scheme" at the bottom).
2. Press **Run AI marking (30)**. Say: "Marking runs in the background. You can leave the page; nothing is lost on a refresh." It finishes in a few seconds in demo mode. The live AI is slower; we have not yet timed a class with it, so don't promise a number.
3. Refresh. The queue now sorts **flagged and low-confidence work to the top**. "It surfaces doubt first, so the teacher's time goes where it matters."
4. Open the first flagged pupil. Show, side by side:
   - the pupil's working;
   - each mark line with a **quote from the work as evidence** and a one-line reason;
   - the flag ("expansion slip after a correct equation; check whether you award the second M mark");
   - the draft feedback: one thing done well, one next step.
5. Change a mark (for example award the second M mark), edit a word of the feedback, and press **Approve … and go to next**. "One pupil at a time. There is no approve-all button, by design. Every change the teacher makes to an AI mark is recorded: that's our quality measure."
6. Approve one or two more quickly to show the pace. Then go back to the queue and point out the approved rows.
7. Optional, 30 seconds: **Export approved marks (CSV)** for the markbook, and **Feedback sheets (PDF)**.

Points to make:
- Pupils are codes. Names are shown to the teacher but **never sent to the AI**; they are removed from the work before sending.
- Nothing reaches a pupil until the teacher approves it, and pupils and parents have no access to the system at all.
- Essays get a feedback draft, not a grade (open an essay class if asked: Ciaran Doyle's or Orla McAleer's).

## 3. School leader (3 minutes)

Switch to the school admin window.

1. **Dashboard**: assignments and pupils marked, share approved, median time from upload to approval, flagged rate, and agreement with the AI by work type.
   - The work Aoife just approved counts already: this is live data from the database, not a mock-up.
2. Point at **agreement by work type**: high for maths and short answers; lower for essays, where teachers change the AI's band more often. "That's honest, and it's why essays are a feedback draft."
3. **Classes**: a leader can open any class's work read-only. Each view is logged. Pupil names are not shown to leaders, only codes.
4. **Audit log**: search for `submission.` to show approvals, then for `marking.` to show marking runs.

## 4. Authority (4 minutes)

Switch to the authority admin window.

1. **Dashboard**: all three schools side by side.
   - Riverside uses the AI most.
   - Hillcrest joined three weeks ago and marks more by hand so far: "adoption is visible week by week".
   - **Estimated teacher time saved**, with the assumption (minutes per script by work type) shown and editable in **Settings**. Change essay minutes to show it is the authority's own assumption, then change it back.
   - If model prices are configured, an **estimated AI cost per script** tile appears. On demo data the token counts are invented, so call it illustrative.
2. "**fewer than 5**" appears where a group is too small. No figure can single out a pupil or a teacher. Authority staff **cannot open any pupil's work**: that is enforced in the database, not just hidden in the screens.
3. **Settings → Retention**: the authority sets how long pupil work is kept after approval (30 days by default). A scheduled job deletes the work and photos and keeps the marks. The audit log shows each deletion run (search `retention.`).
4. **School data**: deleting everything for a school needs two different admins, one to request and another to confirm within 24 hours.

## 5. Trust (1 minute, then leave it with them)

Open `/trust`. It is public, so their data protection officer can read it before any contract. Walk down the headings: what goes to the AI and what does not, who sees what, retention, where data is stored, sub-processors. Then the documents: the data sheet, a pre-filled DPIA template, the DPA template, the sub-processor list and the accessibility statement.

**Be straight about what is still open:**
- Today's demo uses the direct Anthropic API, which processes data in the US or globally. Before any real pupil data, marking moves to an EU route (Claude on Amazon Bedrock). The trust centre says so.
- The UK guidance checks (DfE, ICO, the Department of Education NI circular) are listed as "still being checked" on the trust page until we have read them at source.
- The accessibility statement says "partially compliant" until an independent audit.

## 6. Close (1 minute)

Ask for a pilot: two or three schools, one or two departments each, for half a term. Their teachers use it with real homework, and the authority sees the agreement figures and time saved on this dashboard.

## If something goes wrong

- **A page shows "Something went wrong":** press **Try again**. Nothing saved or approved is lost.
- **Marking seems stuck:** refresh the queue. Jobs survive refreshes, and one failure never blocks the rest. A failed pupil shows the reason and can be re-run.
- **You approved the wrong pupil:** open them and use **Reopen marks** with a reason. It is audit-logged, which is worth showing anyway.
- **You need a clean slate:** reset the demo (see "Before the meeting"). It takes a few seconds.

## Questions you will be asked

- *"Does the AI learn from our pupils' work?"* No. The provider's terms do not allow training on our data. See the trust centre for the source and the date it was checked.
- *"Where is the data?"* Our database and storage: UK or EU (the provider is chosen at deployment). The AI: today US/global on the direct API; EU before real pupils. Say this plainly.
- *"How accurate is it?"* We publish agreement, not accuracy claims. The evaluation harness checks every prompt change against teacher-marked examples, and the dashboard shows how often real teachers keep the AI's marks. The demo examples are synthetic; real teacher-marked examples come with the pilot.
- *"What sign-in do teachers use?"* Email and password now; Google Workspace single sign-on is next, then Microsoft.
