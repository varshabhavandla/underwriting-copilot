---
name: cross-review
description: Fresh-context adversarial review of a substantial change. USE WHEN a PR touches policy, calculations, permissions, or tenancy, before merge. NOT FOR trivial edits.
---
Review with only the diff, AGENTS.md and tests (not the author's reasoning). Try to break: boundary values, cross-org access, retries, missing citations, document-as-instruction. Report findings ranked by severity with a failing input for each; say "no findings" only after listing what you tried.
