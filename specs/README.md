# Specs

Spec-Driven Development (SDD) for this repository. Specs are the source of
truth for **new** component behavior; the existing components
(`InputNumber`, `InputDate`, `InputTime`, `InputDateTime`, `InputTag`) are
references for established conventions, not specs themselves.

## Structure

```
specs/
├── README.md                     # this file — workflow and layout
└── components/
    ├── standards.md              # reusable rules across React input components
    └── <component-kebab-name>/
        ├── requirements.md       # WHAT the component must do
        ├── plan.md               # numbered implementation task groups
        └── validation.md         # Definition of Done
```

One directory per component, named in kebab-case to match its
`docs/app/components/<name>/` page and its `package.json` subpath export
(`input-mask` ↔ `./input-mask`).

Nothing else belongs here: no per-session notes, no task logs, no review
output.

## Relationship to existing artifact locations

| Location | What it holds | Lifetime |
| --- | --- | --- |
| `specs/` (this directory) | Component specs — committed, reviewed, long-lived | Permanent |
| `.superpowers/sdd/` | Superpowers execution scratch: task briefs, run logs, review diffs | Ephemeral, **gitignored** (`*`) |
| `CLAUDE.md` | Architecture and rationale for code that already exists | Permanent |
| `../.ai/` (monorepo root repo) | Per-topic plans/reviews/research for `frontend/`, `backend/`, `docs/` | Permanent, **different git repo** |

`specs/` lives inside this repository because `components/` is a separate git
repo with its own remote: a spec must version and review alongside the code it
governs. The monorepo's `.ai/plans/` convention is not used here for that
reason — see the open question in the handover notes if that should change.

Once a component ships, its durable architecture rationale moves into
`CLAUDE.md`; the spec stays as the record of what was agreed and why.

## Workflow

```
Component idea
  → requirement clarification (ask; do not invent product requirements)
  → requirements.md
  → HUMAN APPROVAL
  → existing-code analysis (what to reuse)
  → plan.md + validation.md
  → HUMAN APPROVAL
  → implementation → tests → review → fix
  → final validation against validation.md
  → merge

  ↑ at any point, behavior differs from the approved spec:
      amend requirements.md + validation.md → approve the delta → resume
```

Rules:

- Do not implement before the spec is approved.
- Every important requirement in `requirements.md` has a matching criterion in
  `validation.md`.
- `plan.md` names existing components, hooks, utilities and dependencies to
  reuse before it proposes anything new.
- Keep these documents short. If a rule applies to more than one component it
  belongs in `standards.md`, not in a component's spec.

### When approved behavior has to change

Implementation, tests and review routinely turn up behavior that the approved
spec got wrong, under-specified or made impossible. That is expected. What is
not allowed is the code quietly becoming the answer — a spec the
implementation has drifted past is no longer a source of truth, it is a
stale document that makes every later review unreliable.

So when a change would alter behavior `requirements.md` states, or would fail
a criterion in `validation.md`:

1. **Stop before writing the code.** A discovery mid-implementation is a spec
   change, not an implementation detail.
2. **Amend `requirements.md` and `validation.md` together**, in the same
   commit, so a requirement never outlives the criterion that checks it — or
   the reverse. Amend `plan.md` too if the task groups no longer describe the
   work.
3. **Ask for approval of the delta only** — what changed, and why the approved
   version could not stand. Not a re-approval of the whole document.
4. **Then continue implementing.**

Two things fall outside this and need no re-approval: anything the spec left
genuinely unstated (fill it in and say so in the handover), and changes that
only affect *how* something is built with no behavioral consequence — which is
`plan.md`'s business, not `requirements.md`'s.

The same loop applies after merge. A behavior change to a shipped component
amends its spec first; durable architectural rationale then moves into
`CLAUDE.md` as usual.
