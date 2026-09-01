# Brief W21c-a: port vote tally accumulation as a pure module

Read `docs/FRAMEWORK.md`. Mainline at `/root/projects/AHDGame` is READ-ONLY. You own `packages/engine/src/electionEngine/tally/` (new subdirectory) plus tests and export lines in the electionEngine index. Do NOT touch anything else: no world.ts, save.ts, types.ts, phases (the operator is building orchestration in `src/elections/` in parallel; stay out of that directory too).

Port mainline `src/lib/electionEngine/tallyManagement.ts` (`accumulateVoteTurn`, `initElectionVoteTally`, and their helpers) as pure synchronous functions over plain inputs, same discipline as the existing resolution/ layer: define input interfaces documenting the Mongo-field mapping (election, candidates, candidate support values, party/regional inputs, turnout, campaign spend where read), rng via `WorldRng` parameter where mainline randomizes. Port the sibling tests, byte-identical assertions where inputs allow; document any that changed and why. Where a helper reads a system solo lacks, PORT-STUB the input with mainline's neutral value and name the blocking system.

## Rules

- `npm install` first. Merge gate: `npm run verify` green from repo root.
- When verified, COMMIT on this branch with a conventional commit message. Mandatory; uncommitted work is lost. Do not push. No em dashes.
- Final summary: functions ported, input mappings, stubs, changed assertions, verification, commit hash.
