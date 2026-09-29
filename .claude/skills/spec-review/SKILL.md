---
name: spec-review
description: Review an SDD spec under specs/components/ — requirements.md, plan.md, validation.md — for completeness, ambiguity, unmade decisions, two-way requirement traceability, drift between documents, scope creep and missing edge cases. Use this whenever the user asks to review, check, audit, critique or sanity-check a spec, a requirements document, a plan or a validation document; whenever they ask "is this spec ready", "anything missing", or ask for approval of one; and before implementing from a spec for the first time. Also use it after amending an approved spec, since an amendment is the most common source of contradictions between the three documents. This reviews documents, not code — use code-review for a diff.
---

# Reviewing an SDD spec

A spec in this repository is the source of truth for behavior that does not
exist yet. Nothing compiles it, no test runs against it, and the only thing
standing between a wrong sentence and a wrong component is somebody reading
carefully. That is what this skill is for.

Read [specs/README.md](../../../specs/README.md) for the workflow these
documents live in and [specs/components/standards.md](../../../specs/components/standards.md)
for the rules they inherit. A finding that a spec omits something already
covered by `standards.md` or `CLAUDE.md` is not a finding — those are
referenced, deliberately, rather than restated.

## What you are looking for

The defects that actually reach approved specs are rarely missing sections.
They are sentences that look fine alone and contradict something three
documents away, examples that were right before a rule changed, and rules
that never anticipated the empty case. Read
[references/defect-patterns.md](references/defect-patterns.md) — it holds the
eleven patterns that have produced real findings in this repo, each with the
actual defect it came from. Read it before reviewing, not after; the patterns
are what make the difference between skimming and finding things.

## Process

### 1. Build the requirement index first

Before forming any opinion, extract every numbered requirement (`R1.1`,
`R12.3`, `R2.1a`, …) into a table with its one-line claim. Do the same for
every criterion in `validation.md` (`V3.2`, `V6.4a`, …) and every task group
in `plan.md`.

This is mechanical and worth doing with a script rather than by eye — the
whole point is not to miss one. Something like:

```bash
# A definition opens with the id and then the rule, so anchor on what follows
# it — a bare `^R3.3 ` also matches a sentence that happens to begin "R3.3
# makes the raw blank a space", and the duplicate it reports is not real.
grep -nE '^R[0-9]+\.[0-9]+[a-z]? \*\*' specs/components/<name>/requirements.md
grep -nE '^\| V[0-9]+\.[0-9]+[a-z]? \|' specs/components/<name>/validation.md
```

Then check every citation *points at the rule it describes*, not merely at a
rule that exists. Renumbering is what breaks this, and it breaks silently: a
criterion still cites `R4.10` while the rule it tests became `R4.11` when
something was inserted above it.

Everything below is checked against this index, so build it once and reuse it.

### 2. Trace in both directions

Two separate questions, and the second one is the one people forget:

- **Requirement → validation.** Every requirement that states observable
  behavior needs at least one criterion that would fail if it were violated.
  A requirement with no criterion is behavior nobody will check.
- **Validation → requirement.** Every criterion should cite a requirement
  that exists. A criterion citing `R3.4` when the document renumbered to
  `R3.7` is drift; a criterion citing nothing is a behavior somebody assumed
  but never wrote down.

Then the same both ways between requirements and `plan.md`. A requirement no
task group implements will not get built. A task group implementing something
no requirement asked for is scope creep, and it is easier to catch here than
in review of the finished code.

Report the numbers — "41 of 44 requirements have a criterion" — and then name
the gaps. Percentages without names are not actionable.

### 3. Recompute every worked example

Tables of examples are where specs lie most often, because an example is
written once and then a rule changes underneath it. And in this repo the
examples become test cases verbatim, so a wrong one propagates into a test
that enforces the wrong behavior.

Take each row of each table and derive it again from the rule as currently
written. Do not read the expected column first; produce your own answer, then
compare. When they differ, one of the two is wrong and you have a finding
either way.

### 4. Hunt for drift between the three documents

Any mechanism described in more than one place is a chance for two versions
of it to exist. Grep for the mechanism's distinctive words across all three
documents and read every hit together.

Amendments are the usual cause. When a rule was changed in `requirements.md`,
the restatement of it in `plan.md`, the criterion in `validation.md`, and any
example anywhere all had to change with it. They often did not.

### 5. Push on the degenerate cases

Most missing edge cases in this repo are not exotic — they are the
configuration where a quantity is zero, one, or all. For each rule, ask what
it does when the thing it operates on is empty, when every element is the
optional kind, when the previous value was null, when the collection has one
element, and when two rules that are individually fine apply in sequence.

`references/defect-patterns.md` §5 has the checklist this repo keeps hitting.

### 6. Check the decisions are actually made

Search for `[OPEN`, "TBD", "to be decided", and for hedging that smuggles an
undecided question past approval: "should probably", "may", "could either".
A spec that reaches implementation with an open decision gets that decision
made by whoever writes the code, silently.

Also check the reverse: a **Decisions** table claiming something is settled
while the body still describes both options.

## Report format

Lead with the verdict, then the findings ordered by severity. For each:

```
N. [P1|P2|P3] One-line statement of the defect — file:line

   What the document says now, quoted or paraphrased exactly.

   Why it is wrong: the concrete case where following it produces a wrong
   result. Name inputs and the output they produce.

   What to change, specifically.
```

Severity means consequence, not confidence:

- **P1** — following the spec produces wrong behavior, data loss, or an
  unimplementable contradiction.
- **P2** — ambiguity or a gap that will be resolved by whoever implements it,
  possibly wrongly; or drift that makes one document unreliable.
- **P3** — an example, a number, or a cross-reference that is wrong without
  changing what the rule means.

End with the traceability numbers and an explicit statement of what you did
**not** find problems with, so the absence of a finding is informative rather
than ambiguous.

## What makes a finding worth reporting

State the failing case concretely. "R6.1 is ambiguous about literals" is not
useful; "mask `00\000` pasted `"1203"` yields raw `"123 "` — the user's third
digit is deleted, because step 3 hands the `0` to the literal" is, because it
names inputs, the output, and the mechanism.

Verify before reporting. If a claim can be checked by running something —
what a Unicode conversion actually produces, what a regex actually matches,
what the existing code actually does — check it. A confidently wrong finding
costs more than a missed one, because it gets acted on.

Do not report style, wording, ordering or formatting unless it changes what a
reader would implement. The spec's job is to be unambiguous, not tidy.

Do not invent requirements. If the spec does not say what happens in some
case, the finding is "this case is unspecified" — not "it should do X".
Recommending X is fine and useful, but it is a recommendation, and it must be
labelled as one so the human makes the call.
