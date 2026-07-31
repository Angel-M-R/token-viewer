# Cutover rollback drill

This drill validates recovery without changing protected `master`, deleting snapshots, moving tags, or enabling the retired `old-mac` identity. Run the job-disable step separately on each active Mac and run restore validation in a disposable directory outside every operational checkout.

## 1. Disable both active jobs

On `angel-mac`:

```sh
LABEL="com.tokenviewer.collector.angel-mac"
launchctl disable "gui/$(id -u)/$LABEL"
launchctl bootout "gui/$(id -u)/$LABEL"
```

On `mac-m5`:

```sh
LABEL="com.tokenviewer.collector.mac-m5"
launchctl disable "gui/$(id -u)/$LABEL"
launchctl bootout "gui/$(id -u)/$LABEL"
```

Treat an already-unloaded `bootout` as acceptable only after `launchctl print` confirms the service is absent. Do not unload or create any service for `old-mac`.

## 2. Validate the approved tag

Use the protected tag only as a detached, disposable restore source:

```sh
export RESTORE_ROOT="$(mktemp -d)"
git clone --no-checkout git@github.com:Angel-M-R/token-viewer.git "$RESTORE_ROOT/tag-restore"
git -C "$RESTORE_ROOT/tag-restore" checkout --detach pre-git-snapshots
test "$(git -C "$RESTORE_ROOT/tag-restore" rev-parse HEAD)" = "7aa3972fb19c2718f09b4655e80a67c927e8c18a"
```

This validates code recovery without updating a branch or publishing anything.

## 3. Validate the offline pre-rewrite backup

Set `OFFLINE_BACKUP` from the private task-11.1 recovery record; never write that location into snapshots or public logs.

For a bundle:

```sh
git bundle verify "$OFFLINE_BACKUP"
git clone "$OFFLINE_BACKUP" "$RESTORE_ROOT/offline-restore"
git -C "$RESTORE_ROOT/offline-restore" fsck --full
```

For a mirror clone:

```sh
git -C "$OFFLINE_BACKUP" fsck --full
git clone "$OFFLINE_BACKUP" "$RESTORE_ROOT/offline-restore"
git -C "$RESTORE_ROOT/offline-restore" fsck --full
```

Confirm the restored copy contains the expected pre-rewrite refs and prior-system files using the private recovery record. Never push those refs to the public repository.

## 4. Record the result

Record only exit codes, validated commit IDs, backup type, and whether both jobs were absent. Do not record the private backup path, credentials, snapshot contents, or raw source data. Keep current snapshots intact and re-enable an active job only after the incident owner approves normal operation.
