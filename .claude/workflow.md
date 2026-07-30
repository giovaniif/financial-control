# Workflow — Linear and Graphite

**Rule: no work without a Linear issue, and all GitHub workflow goes through Graphite.**

## Linear

Workspace `giovaniif`, team **Financial Control**, issue prefix **`FIN-`**.
<https://linear.app/giovaniif/team/FIN/overview>

Statuses: `Backlog → Todo → In Progress → In Review → Done` (plus `Canceled`, `Duplicate`).

### The loop

1. **Find or create the issue before writing code.** If the user asks for something with
   no issue, create it first: title, a short spec of expected behaviour, and acceptance
   criteria. A bug discovered mid-task gets its own issue — never a silent extra commit
   on the current branch.
2. **Every issue carries an estimate.** No exceptions. An unestimated issue has not been
   thought through far enough to know whether it is a stack or a single PR.
3. **Link the issue to its use case.** Reference the `UC-x.y` id from `docs/USE_CASES.md`
   in the description. An issue that maps to no use case needs justifying; a use case
   with no issue is unbuilt work.
4. **Move it to In Progress** when you start.
5. **Use the branch name Linear generates** (`gitBranchName`, e.g.
   `riccog25/fin-12-add-cycle-ref-value-object`). That is what auto-links branch, PR and
   issue. If you shorten it, keep the `fin-<n>` segment so the link still resolves.
6. **Reference the issue in the PR description** (`FIN-12`) so Linear moves it to In Review.
7. **Done follows the merge**, not the push.

### Estimates

Linear's Fibonacci scale, calibrated for this codebase:

| Points | Shape of the work |
|---|---|
| 1 | One file, no new tests beyond a case or two. Config, constant, copy change |
| 2 | One layer end to end with its tests. A value object, one repository method, one component |
| 3 | One vertical slice within one app: use case + its port + tests, or one FSD slice. Typically one PR |
| 5 | Backend and frontend both, or a new aggregate. **Ships as a Graphite stack**, never one branch |
| 8 | Touches the Prisma schema or the calculation chain, or spans three or more layers. Split it |

- **5 or more means split.** Break it into issues of 3 or less, in the stack order below.
  The parent stays as the tracking issue.
- Estimate the whole cost — tests, lint, review — not just the typing.
- If an issue turns out to be twice its estimate mid-flight, split the remainder into a new
  issue rather than silently continuing.
- Re-estimating is expected. Leaving it blank is not.

When creating issues in bulk, set estimates at creation time.

### Splitting issues

One issue = one reviewable unit of behaviour. Work here usually has a backend half and a
frontend half; make them two issues. That is what lets the work ship as a stack.

## Graphite — stacked PRs

**All GitHub workflow goes through Graphite.** Do not `git push`, do not `gh pr create`,
do not force-push a branch by hand. `gt` owns the branch topology and hand-editing it
desynchronizes the stack's children.

The repo must be `gt init`-ed against `main` before the first stack.

### Standard flow

```bash
gt sync                                   # pull main, restack, clean merged branches
gt create -m "feat: add CycleRef value object"
# ... next change, stacked on the previous ...
gt create -m "feat: derive cycle boundaries from the payday anchor"
gt submit --stack                         # open/update the whole stack as linked PRs
```

Iterating after review:

```bash
gt modify                      # amend the current branch's commit
gt modify --commit -m "..."    # or add a follow-up commit
gt restack                     # propagate up the stack
gt submit --stack              # push the updated stack
```

Useful: `gt log` for the stack, `gt up` / `gt down` to move, `gt track` to adopt an
existing branch.

### How to slice a stack

Bottom to top. Each PR independently reviewable, each one green on its own:

1. Prisma schema + migration
2. Domain — entities, value objects, invariants (pure, no I/O)
3. Application — use-case interactors + ports
4. Infrastructure — Prisma repositories, adapters
5. Interface — HTTP controllers, routes, DTOs
6. Web — `shared` / `entities` additions
7. Web — `features` / `widgets` / `pages`

Not every change needs seven PRs. But **the seam between backend and frontend is always a
stack boundary**, and so is the seam between the domain and everything that depends on it.

### Rules for the stack

- Keep PRs small. If a PR's diff needs scrolling to understand, it should have been two.
- Each PR carries **its own tests**. A stack whose tests all sit in the top PR defeats the
  point and cannot be reviewed incrementally.
- Each PR must be green on its own — CI runs per PR, not per stack.
- Never hand-rebase or force-push; use `gt restack`.
- Merge bottom-up, `gt sync` after each merge.
- If a branch stops being related to the stack, take it out. Stacks are one context.

## Commits and PRs

Conventional commits, English, imperative mood:

```
feat: assign invoices to the cycle containing their due date
fix: resolve the payday anchor to the preceding business day
test: cover the short-month case in CycleRef
chore: raise the domain coverage threshold to 95%
ci: run turbo test with coverage on pull requests
```

Prefixes: `feat`, `fix`, `chore`, `ci`, `docs`, `refactor`, `test`.

Subject lines say **why** when it is not obvious. PRs squash-merge into `main` with the PR
number appended, so the **PR title** is what survives in the log — make it count.

PR descriptions cover: the Linear issue (`FIN-12`), the use case (`UC-5.4`), what changed,
and how it was verified. Never open a PR whose pre-PR checklist in `.claude/linting.md`
has not passed.
