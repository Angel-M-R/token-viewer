# tokenviewer-collector

## Copilot Quota

Authenticate GitHub Copilot quota collection with device-flow OAuth:

```sh
tokenviewer-collector copilot login
```

The command prints a GitHub device code and verification URL, stores the OAuth token in the local collector config, and leaves that config file with `0600` permissions.

Check or remove the stored session:

```sh
tokenviewer-collector copilot status
tokenviewer-collector copilot logout
```

During `tokenviewer-collector run`, Copilot quota collection is best-effort. If no Copilot token is configured, the step is skipped. If GitHub or the TokenViewer server rejects the quota request, log ingestion continues and the run reports a warning.
