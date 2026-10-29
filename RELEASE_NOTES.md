# Release notes

## 1.3.0

- Terminal interface with four modes (`Build`, `Plan`, `Review`, `Fast`) and streaming tool
  output.
- Provider list for DeepSeek models with failover when a provider returns an error.
- File and shell tools for editing and running commands.

Known issues in this release:

- `/refresh` does not renew a quota. It writes a new local device key and reports success
  without contacting a live backend.
- The first provider points at `eschaton-gateway.workers.dev`, which does not resolve.
- The package is not published to npm.

## Earlier releases

See the repository history.
