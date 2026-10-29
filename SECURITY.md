# Security

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private reporting form:

https://github.com/Tarikdxd/Eschaton-Code/security/advisories/new

Include the version, the command you ran and, if possible, a minimal reproduction.

## Scope

Eschaton Code runs shell commands and edits files in the directory you start it in. That is the
intended behaviour, not a vulnerability.

Reports about a model provider's quota, pricing or availability belong to that provider.

## API keys

Keys are read from environment variables or from `~/.eschaton/config.json`. The file is created
with mode 0600 and is never written to logs. If you suspect a key leaked, revoke it at the
provider and save a new one with `eschaton login`.
