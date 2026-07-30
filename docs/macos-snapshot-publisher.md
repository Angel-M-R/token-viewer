# macOS snapshot publisher

The daily publisher is limited to the active identities `angel-mac` and `mac-m5`. Each active Mac must use its own dedicated checkout on `master`, and that checkout must never be used for development. Do not install or activate either job until the migration branch has passed normal review and has been integrated. The retired `old-mac` identity remains valid only for reading its historical snapshots.

Before setup, confirm that the checkout points to the expected repository and that the owner credentials used by both authorized publisher machines have ordinary write access to protected `master`. Use a credential-free SSH or HTTPS remote URL; credentials remain in the user's existing Git configuration and macOS Keychain, never in TokenViewer config or the plist.

## `angel-mac`

Use these values on the Angel Mac:

```sh
export CHECKOUT="$HOME/TokenViewer-ops/angel-mac"
export EXPECTED_REMOTE="git@github.com:OWNER/tokenViewer.git"
export LABEL="com.tokenviewer.collector.angel-mac"
```

### Install

Create a fresh operational checkout directly on `master`, then install dependencies and collector config:

```sh
git clone --branch master --single-branch "$EXPECTED_REMOTE" "$CHECKOUT"
pnpm --dir "$CHECKOUT" install --frozen-lockfile
pnpm --dir "$CHECKOUT" build
pnpm --dir "$CHECKOUT" --filter collector exec tsx src/cli.ts init \
  --machine-name angel-mac \
  --checkout-path "$CHECKOUT" \
  --expected-remote-url "$EXPECTED_REMOTE"
```

Review the rendered plist without writing or loading it, then install the daily 09:00 local-time job:

```sh
node "$CHECKOUT/ops/macos/install-launchd.mjs" \
  --machine angel-mac --checkout "$CHECKOUT" --hour 9 --minute 0 --dry-run
node "$CHECKOUT/ops/macos/install-launchd.mjs" \
  --machine angel-mac --checkout "$CHECKOUT" --hour 9 --minute 0
```

The installer refuses a non-`master`, dirty, nested, wrong-origin, or mismatched collector checkout.
Each daily run pulls and rebases `master`, rebuilds the collector and its compiled workspace dependencies, and only then starts snapshot publication.

### Status and logs

```sh
pnpm --dir "$CHECKOUT" --filter collector exec tsx src/cli.ts status
launchctl print "gui/$(id -u)/$LABEL"
tail -n 200 "$HOME/Library/Logs/TokenViewer/angel-mac.out.log"
tail -n 200 "$HOME/Library/Logs/TokenViewer/angel-mac.err.log"
```

### Manual run

Run the same publisher command directly when interactive output is desired, or ask `launchd` to start the installed job immediately:

```sh
pnpm --dir "$CHECKOUT" --filter collector publish
launchctl kickstart -k "gui/$(id -u)/$LABEL"
```

### Disable

```sh
launchctl disable "gui/$(id -u)/$LABEL"
launchctl bootout "gui/$(id -u)/$LABEL"
```

This leaves the plist, checkout, snapshots, config, and logs in place.

### Uninstall

```sh
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm "$HOME/Library/LaunchAgents/$LABEL.plist"
```

Delete the dedicated checkout or local logs only after separately confirming they are no longer needed. Collector config is shared with manual collector commands and is not removed automatically.

## Failure recovery

For invalid snapshots, Git conflicts, network loss, expired credentials, or an unpublished local commit, keep the job stopped and follow [Daily snapshot publisher failure recovery](snapshot-publisher-failure-recovery.md).

## `mac-m5`

Use these values on the M5 Mac:

```sh
export CHECKOUT="$HOME/TokenViewer-ops/mac-m5"
export EXPECTED_REMOTE="git@github.com:OWNER/tokenViewer.git"
export LABEL="com.tokenviewer.collector.mac-m5"
```

### Install

Create a separate fresh operational checkout directly on `master`, then install dependencies and collector config:

```sh
git clone --branch master --single-branch "$EXPECTED_REMOTE" "$CHECKOUT"
pnpm --dir "$CHECKOUT" install --frozen-lockfile
pnpm --dir "$CHECKOUT" build
pnpm --dir "$CHECKOUT" --filter collector exec tsx src/cli.ts init \
  --machine-name mac-m5 \
  --checkout-path "$CHECKOUT" \
  --expected-remote-url "$EXPECTED_REMOTE"
```

Review the rendered plist without writing or loading it, then install the daily 09:00 local-time job:

```sh
node "$CHECKOUT/ops/macos/install-launchd.mjs" \
  --machine mac-m5 --checkout "$CHECKOUT" --hour 9 --minute 0 --dry-run
node "$CHECKOUT/ops/macos/install-launchd.mjs" \
  --machine mac-m5 --checkout "$CHECKOUT" --hour 9 --minute 0
```

The installer refuses a non-`master`, dirty, nested, wrong-origin, or mismatched collector checkout.
Each daily run pulls and rebases `master`, rebuilds the collector and its compiled workspace dependencies, and only then starts snapshot publication.

### Status and logs

```sh
pnpm --dir "$CHECKOUT" --filter collector exec tsx src/cli.ts status
launchctl print "gui/$(id -u)/$LABEL"
tail -n 200 "$HOME/Library/Logs/TokenViewer/mac-m5.out.log"
tail -n 200 "$HOME/Library/Logs/TokenViewer/mac-m5.err.log"
```

### Manual run

```sh
pnpm --dir "$CHECKOUT" --filter collector publish
launchctl kickstart -k "gui/$(id -u)/$LABEL"
```

### Disable

```sh
launchctl disable "gui/$(id -u)/$LABEL"
launchctl bootout "gui/$(id -u)/$LABEL"
```

This leaves the plist, checkout, snapshots, config, and logs in place.

### Uninstall

```sh
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm "$HOME/Library/LaunchAgents/$LABEL.plist"
```

Delete the dedicated checkout or local logs only after separately confirming they are no longer needed. Collector config is shared with manual collector commands and is not removed automatically.

## Historical `old-mac`

`old-mac` is retired and read-only. Its already imported aggregate snapshots under `snapshots/old-mac/` remain valid for validation and dashboard history, but this identity has no collector generation, Git publication, dedicated operational checkout, manual publisher command, or `launchd` installation path. Both the publisher and installer reject `old-mac`; do not repurpose its historical folder for `mac-m5`.
