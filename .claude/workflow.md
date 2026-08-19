# Workflow — Linear and GitHub stacked PRs

**Rule: no work without a Linear issue, and all GitHub workflow goes through `gh stack`.**

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
| 5 | Backend and frontend both, or a new aggregate. **Ships as a stack**, never one branch |
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

## GitHub stacked PRs

**All GitHub workflow goes through `gh stack`.** Do not `git push` a stack branch, do not
`gh pr create`, do not force-push or hand-rebase. The extension owns the branch topology
and the stack object on GitHub; hand-editing either desynchronizes the layers above.

GitHub's stacked pull requests are a **native feature, in public preview** since 30 July
2026. A stack is a real object on GitHub: each PR shows where it sits in the order, layers
rebase and retarget server-side as lower ones land, and a stack merges atomically.

```bash
gh extension install github/gh-stack   # once per machine
```

Merge-queue support was still rolling out when the preview opened. This repo does not use
a merge queue, so that does not apply here.

### Standard flow

```bash
gh stack sync                                  # fetch, rebase, push, sync PR state
gh stack init riccog25/fin-12-add-cycle-ref    # first layer, branched off main
git add -A && git commit -m "feat: add CycleRef value object"
gh stack add -Am "feat: derive cycle boundaries from the payday anchor" \
  riccog25/fin-13-derive-cycle-boundaries      # next layer, on top of the previous
gh stack submit                                # push all branches, open/update the stack
```

`init` only creates the branch — it takes no message and stages nothing, so commit the
first layer with plain `git`. `add` does all three: `-A` stages everything including
untracked files, `-m` is the commit message, and the branch is created on top of the
current layer.

Always pass the branch name explicitly. With `-m` and no branch name, `add` invents one
from the commit message, which loses the `fin-<n>` segment Linear needs to link the PR
(see the Linear loop above).

`gh stack submit` opens an editor to title and describe each new PR; `--auto` skips it and
creates drafts, `--auto --open` creates them ready for review.

Iterating after review:

```bash
gh stack down                  # move to the layer under review
git commit --amend             # or a follow-up commit
gh stack rebase                # cascade the change up through the layers above
gh stack submit                # push the updated stack
```

Useful: `gh stack view` for the stack, `gh stack up` / `gh stack down` to move,
`gh stack checkout` to jump to a stack by number, PR or branch, `gh stack modify` to
reorder or drop a layer, and `gh stack init <branch> <branch> ...` to adopt branches that
already exist.

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

### Merging

```bash
gh stack merge                 # the whole stack, atomically
gh stack merge 79              # everything up to that PR, atomically
```

The merge is **all-or-nothing**: if any layer cannot be merged, none of them are. That is
the one real difference from merging by hand — the whole stack can land in one operation
rather than bottom-up with a sync between each.

Merging only part of a stack is still fine, and is what rule 8 in `CLAUDE.md` is about:
every state of `main` must be coherent, so cut the partial merge at a layer that stands on
its own. The layers left open rebase and retarget themselves. Run `gh stack sync`
afterwards to bring the local stack back in line.

### Rules for the stack

- Keep PRs small. If a PR's diff needs scrolling to understand, it should have been two.
- Each PR carries **its own tests**. A stack whose tests all sit in the top PR defeats the
  point and cannot be reviewed incrementally.
- Each PR must be green on its own. Nothing checks that for you, so `pnpm check`
  before every `gh stack submit`.
- Never hand-rebase or force-push; use `gh stack rebase`.
- After anything lands, `gh stack sync`.
- If a branch stops being related to the stack, take it out with `gh stack modify`. Stacks
  are one context.

## Commits and PRs

Conventional commits, English, imperative mood:

```
feat: assign invoices to the cycle containing their due date
fix: resolve the payday anchor to the preceding business day
test: cover the short-month case in CycleRef
chore: raise the domain coverage threshold to 95%
```

Prefixes: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Subject lines say **why** when it is not obvious. PRs squash-merge into `main` with the PR
number appended, so the **PR title** is what survives in the log — make it count.

PR descriptions cover: the Linear issue (`FIN-12`), the use case (`UC-5.4`), what changed,
and how it was verified. Never open a PR whose pre-PR checklist in `.claude/linting.md`
has not passed.
