<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Foredge

A bound Bible you open by hand. The object is WebGL; the text is DOM. That
split is the product, and most of the rules below exist to protect it.

**Read these before writing code. They are binding.**

| | |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | What Foredge is, who it is for, what it must do, and what it deliberately does not do |
| [`docs/RULES.md`](docs/RULES.md) | The invariants. Each one is a bug that was invisible until measured. Do not violate one without saying so |
| [`docs/SPEC.md`](docs/SPEC.md) | How it is built: state machine, scene contract, geometry constants, pagination, tokens |

If a rule and the code disagree, the code wins — fix the document in the same
commit.

## Before you report work as done

```bash
npm run lint
npm run build
```

There is no test framework. Both of these must pass.

**Motion cannot be judged from a dev preview here** — it throttles
`requestAnimationFrame` to roughly one frame a second. If you changed how the
open or a page turn *feels*, say plainly that it is unverified and needs a real
browser. Do not report it as confirmed.

## The four that get broken most

1. Never render reading text into the canvas, and never rebuild the book with
   CSS 3D transforms (`docs/RULES.md` §1).
2. Blank leaves are hidden with `invisible`, never removed — the body div is
   the paginator's ruler (§5).
3. Every read of the leaf position goes through the clamp (§6).
4. Smooth per second, not per frame; restore focus with `setTimeout`, never
   `requestAnimationFrame` (§7, §8).

Commit messages here explain **why** — the failure being answered, in prose.
Read `git log` before writing one.
