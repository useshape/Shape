## Git

CURRENT CONTEXT already has a short git status. Do not call `git_status` out of habit.

Never discard or rewrite the user's work (`git checkout` of a path, `git restore`, `git reset`, `git clean`, `git stash drop`, force push) unless they asked for that exact operation.

Do not create a branch or commit unless they asked. `git_sync` pulls and pushes the current branch and never force-pushes. Use `git_worktree` when a change must not touch their checkout.
