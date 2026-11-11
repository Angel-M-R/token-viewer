# Daily snapshot publisher failure recovery

Use this procedure only in the affected active machine's dedicated `master` checkout. Set `CHECKOUT`, `MACHINE`, and `LABEL` to that checkout, either `angel-mac` or `mac-m5`, and its installed launchd label. Never use `reset --hard`, `clean`, force-push, snapshot deletion, or edits to another machine's folder. Retired `old-mac` has no publisher checkout or `launchd` job; preserve its historical snapshots as read-only data. For a system-wide post-cutover failure, use the separate [cutover rollback drill](cutover-rollback.md).

## First response for every failure

1. Stop automatic retries while investigating:

   ```sh
   launchctl bootout "gui/$(id -u)/$LABEL"
   ```

2. Inspect only status, paths, and local logs; do not print snapshot contents or credentials:

   ```sh
   pnpm --dir "$CHECKOUT" --filter collector exec tsx src/cli.ts status
   git -C "$CHECKOUT" status --short
   git -C "$CHECKOUT" log --oneline origin/master..HEAD
   tail -n 200 "$HOME/Library/Logs/TokenViewer/$MACHINE.err.log"
   ```

3. Record the pending commit SHA reported by collector status or `git log`. If one exists, preserve it before intervention:

   ```sh
   git -C "$CHECKOUT" branch "recovery/$MACHINE-$(date -u +%Y%m%dT%H%M%SZ)" PENDING_COMMIT_SHA
   ```

4. Confirm every changed or pending path is under `snapshots/$MACHINE/`. Stop and escalate if another machine folder or any non-snapshot path appears.

## Partial or missing days

After updating and rebuilding the collector, preview a full historical repair in the affected machine's dedicated checkout:

```sh
pnpm --dir "$CHECKOUT" --filter collector... build
pnpm --dir "$CHECKOUT" --filter collector exec node dist/cli.js run --dry-run --repair-all \
  --out "$HOME/Library/Logs/TokenViewer/$MACHINE-repair-preview.json"
```

Review `writtenDates`, the per-day totals in `days`, `protectedClosedDates`, `warnings`, and `skippedRecords`. A normal run already repairs snapshots generated before their local day ended. `--repair-all` also recounts closed days previously generated after the day ended. Closed days with a lower recount, including reasoning tokens, remain unchanged because the available local sources may be incomplete. Records without a valid timestamp cannot be assigned to a day and are counted in `skippedRecords`.

Once the preview is checked, publish the repair with bounded SSH connection and idle waits:

```sh
GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=2' \
  pnpm --dir "$CHECKOUT" --filter collector exec node dist/cli.js run --publish --repair-all
```

Publication recovers any preserved unpublished commit before generating the repair, validates the complete snapshot set, and writes only the configured machine's folder. Repeat the procedure on each active machine using that machine's local logs. Keep `old-mac` read-only. After a successful publication, verify the pending commit range is empty and reload the scheduled job.

## Invalid snapshot data

Run whole-set and fixture validation without displaying file contents:

```sh
pnpm --dir "$CHECKOUT" validate:snapshots
pnpm --dir "$CHECKOUT" validate:snapshot-fixtures
```

- If invalid data is already on `origin/master`, leave the checkout untouched and have the owner of that machine publish an explicit reviewed repair.
- If invalid files are uncommitted, keep the job stopped. Fix the generator or source mapping through the normal development and review flow; do not hand-commit invalid output.
- After the fix reaches `master`, remove only the known uncommitted invalid files from this machine's folder, rerun generation, and require whole-set validation before publication. Never remove or repair the other machine's files.

## Git rebase conflict

```sh
git -C "$CHECKOUT" status
git -C "$CHECKOUT" diff --name-only --diff-filter=U
```

Keep the recovery branch created above. Do not choose a side automatically. If any conflicted path is outside `snapshots/$MACHINE/`, coordinate with the other owner and stop automation. A reviewer must reconcile the aggregate snapshot, continue the rebase, run `pnpm --dir "$CHECKOUT" validate:snapshots`, and push without force. If the conflict cannot be resolved safely, `git rebase --abort` returns to the preserved local commit for later intervention.

## Lost network

- Do not alter the checkout. If a commit was created, it remains pending locally and the next publisher run attempts it before generating new data.
- After connectivity returns, verify the remote without exposing credentials, then run the publisher once manually:

  ```sh
  git -C "$CHECKOUT" ls-remote --exit-code origin refs/heads/master
  pnpm --dir "$CHECKOUT" --filter collector publish
  ```

## Expired or rejected Git credentials

1. Confirm the failure with `git -C "$CHECKOUT" ls-remote --exit-code origin refs/heads/master`.
2. Renew the user's SSH agent, macOS Keychain, or Git credential-manager session outside TokenViewer. Never add a token to collector config, the remote URL, a plist, or a snapshot.
3. Repeat `ls-remote`, then recover the pending commit as described below.

## Preserved local commit

Before generating anything new, verify that the pending range contains only this machine's snapshot paths:

```sh
git -C "$CHECKOUT" fetch origin master
git -C "$CHECKOUT" log --oneline origin/master..HEAD
git -C "$CHECKOUT" diff --name-only origin/master..HEAD
pnpm --dir "$CHECKOUT" validate:snapshots
git -C "$CHECKOUT" pull --rebase origin master
pnpm --dir "$CHECKOUT" validate:snapshots
git -C "$CHECKOUT" push origin master
```

Stop on a conflict or validation failure. After a successful push, confirm `git log origin/master..HEAD` is empty, run collector status, and reinstall or reload the documented launchd job. Keep the recovery branch until the remote commit and the next normal daily run are verified.
