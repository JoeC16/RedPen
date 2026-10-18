# Evaluation cases

One JSON file per pupil script, in the folder for its work type (`short/`, `maths/`, `essay/`), listed in `cases.ts`.

| Field | Meaning |
| --- | --- |
| `provenance` | Where the case came from. Say plainly if the reference marks are not a teacher's. |
| `schemeText`, `totalMarks`, `criteria` | The scheme exactly as a teacher would enter it. The `criteria` maxima must add up to `totalMarks`. |
| `pupilWork` | The pupil's work. Invented or fully anonymised, with no real names. |
| `reference.marks` | The mark per criterion, in order: what the AI is scored against. |
| `reference.markedBy` | Who gave the reference marks. Use a teacher's role, never their name. |
| `demoResult` | What demo mode returns for this pupil. It is never used to score the real AI. |

## The current eight cases are synthetic

They cover the three prototype schemes (Year 9 science, Year 10 maths, Year 8 descriptive writing). Claude wrote them, and the reference marks are Claude's own judgement, not a teacher's. Treat agreement figures from them as a development check only.

## Next

Collect 30 teacher-marked scripts per work type, with consent, anonymised, and with the marking teacher's role recorded. Replace or re-mark these cases. Then run `npm run eval -- --update-baseline` against the live AI and record the date and prompt version in `docs/progress.md`.
