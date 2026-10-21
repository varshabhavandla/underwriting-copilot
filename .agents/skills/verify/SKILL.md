---
name: verify
description: Run the single completion check before claiming work is done. USE WHEN finishing a change, before a PR, or when asked "does it pass". NOT FOR designing tests.
---
Run `bash workspace/app/scripts/verify.sh`. Report the actual output tail. If it fails, fix the cause; never weaken tests or edit expected fixtures just to pass. If you changed behavior, confirm a test or fixture covers it.
