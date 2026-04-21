# Git Commit Conventions

This is a public portfolio piece. Commit history matters as much as the code.

## Format

```
type(scope): subject

Optional body explaining WHY, not what. Wrap at 72 chars.
```

## Types

| Type | When to use |
|------|-------------|
| `feat` | New feature visible to users |
| `fix` | Bug fix |
| `refactor` | Code change that doesn't add features or fix bugs |
| `perf` | Performance improvement |
| `style` | Visual / CSS / typography only, no logic |
| `docs` | README, comments, schema docs |
| `chore` | Build, deploy, dependencies, tooling |

## Scopes

Match the tab or feature area:

| Scope | Covers |
|-------|--------|
| `home` | Home tab, readiness, streaks, home cards |
| `gym` | Gym Mode / checklist tab, set logging, session clock |
| `program` | Program tab, programs manager, day/exercise view |
| `weight` | Weight tab, charts, measurements |
| `warroom` | War Room tab, AI builder, AI coach |
| `settings` | Settings tab, modules, display prefs |
| `auth` | Sign in / sign up / session / profile wizard |
| `sync` | Supabase / cloud save / conflict resolution |
| `ui` | Design system, shared components, modals, nav |
| `ai` | Claude API calls, prompts, PDF parsing |
| `pwa` | Manifest, icons, service worker, offline |
| `nudge` | Onboarding nudge system, dismissal logic |

## Subject line rules

- Imperative mood: "add" not "added", "fix" not "fixed"
- Lowercase, no period at end
- Under 60 characters
- Specific — not "fix bug", but "fix sign-in button not registering taps"

## Examples (good)

```
feat(gym): add first-time personalization nudge in gym mode

Shows once when user is on default starter with 0 sessions logged.
Offers PDF upload, AI generation, or permanent dismiss. Logs events
via logEvent() with action tracking.
```

```
fix(program): redirect pdf save confirmation to program tab

Was opening retired modal instead of navigating to the new tab view.
```

```
style(ui): replace all emoji with svg icons across the app

Removes 📄 ⚡ 🔥 💪 🏆 etc. Adds i-file, i-muscle, i-crown to
sprite. Updates ach-icon and home-activity-icon CSS for svg layout.
```

```
chore(sync): push to origin/main after every commit
```

## Examples (bad — never do these)

```
update                          ← useless
fix stuff                       ← which stuff?
Added new feature for programs  ← past tense + vague
WIP                             ← never commit WIP to main
```

## When to commit

- One logical change = one commit, even if it touches many lines
- Never batch unrelated changes into one commit
- Never commit broken code to main
- Push to `origin/main` immediately after every commit

## Branching

Solo project — `main` is source of truth. For risky multi-step
refactors, branch with `git checkout -b refactor/description`,
merge back when stable. No PRs against your own repo unless needed.
