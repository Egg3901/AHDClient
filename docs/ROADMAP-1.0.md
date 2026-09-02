# ROTUNDA 1.0 roadmap

1.0 means completion: full singleplayer parity with mainline A House Divided's shipped systems (eras 1953 and 1960), the hardened multiplayer viewer, granular creation, cheats, saves, packaged installers with updates. Nothing on mainline's phase list is skipped; every phase is either ported or explicitly N/A-for-singleplayer with a reason recorded here.

Working method: numbered waves. One wave = one muse brief (or an inline pass by the operator), landing verified and merged before its lane advances. Two to three agents run concurrently across disjoint lanes. Observed cadence: a wave lands in about 45 minutes including merge; roughly 2.5 waves/hour sustained.

## Progress ledger (done)

Engine core (turn pipeline, RNG, saves) - real seed packs, 27 countries, both eras - macro economy (output gap, Okun, Phillips) - political skeleton (parties, legislatures, real 1953 compositions) - 1,815 seated politicians - NPC name generator (25 country pools) - sim CLI (run/determinism/bench, 64k turns/sec) - launcher with era command globe - granular creation flow - cheat panel + engine cheat API - schema v5 with chained migrations - 122 tests green.

## Lane 1: economy core (engine)

- W1 commodity prices + contract settlement
- W2 budgets: federal budget, subsidyBudget, regionalBudgetProcessing (incl JP/DE variants), fiscalYear, fiscalBaseGrowth; fiscal term into macro
- W3 central banks: npcBankPolicyTurn, FOMC meetings/nominations (president-appointed chair), chair selection/removal, interest rates; monetary term into macro
- W4 forex: exchange rates, forexTurn, ledgerPreForexSnapshot
- W5 savings interest, pensions, line of credit
- W6 metric engine: economicModel, nationalMetrics, metricDecay, inflationRecalc, investorConfidenceDecay, economicVitalSigns
- W7 command economy (ships ON)
- W8 trade: tradeGrowthMirror, tariffs, economic blocs

## Lane 2: corporate and markets (engine)

- W9 corporations: corporationTurn, sectors, plants, production
- W10 markets: share prices, stock exchange, investors, recomputeSharePrices
- W11 extraction, prospecting resolution, contract issuance
- W12 banking: bankingTurn, bankSolvencyTurn, NPC banks
- W13 bonds: bondTurn
- W14 unownedSectorGrowth, stateOwnershipConcentration, capital stock

## Lane 3: labor and society (engine)

- W15 unions: unionsTurn, nppUnionBehavior, dues
- W16 demographics: demographicEffects, demographicFlows, census, labor force
- W17 socialAxisDrift, bucket approvals (buckets, not archetypes), archetypeApprovalDecay, policyReactionDecay

## Lane 4: parties and support (engine)

- W18 party org: partyInfluenceTurn, partyOrgTurn, partyTierTurn, caucusTax, partyActionGeneration, expireCharters, emptyPartyCleanup, partyMemberCountReconcile
- W19 support model: supportDecay/Accrual, turnoutDecay, partyGOTV, regDriftDecay, pressureDecay, priorityRegionDecay
- W20 intra-party elections: state/national party elections, national committees, leadership elections, coalitions (incl disband votes)

## Lane 5: elections (operator-led, muse on edges)

- W21 election engine core: candidacies, voteAccumulation, primaryResolution, electionResolution, electionTimers, perpetualElections, byElectionWatcher, clearResolvedSupport
- W22 candidates: DONE — generateChallengers (makeChallenger/fillCandidates, W21c), candidatePartySweep (`sweepCandidaciesOnPartyChange`, wired into join/leave/foundParty), autoReelectionEntry (`runAutoReelectionEntry`, opt-in via `player.autoRunForReelection`). staleCandidateCleanup ported as `cullOrphanedGenerated` (elections/orchestration.ts, runs at every election resolution: generated NPCs holding no seat/office and standing in no unresolved race are dropped; it was the missing cull for ex-holders displaced by a race they were not in, which W40's subnational chambers turned into a 3.8k-orphan leak at t700). withdrawInactiveCandidates is N/A for solo (needs other human players' activity data solo has none of; documented in elections/candidacy.ts)
- W23 parliamentary: governmentFormation, parliamentaryGovernmentPhases, vacancy watcher, leadershipVacate
- W24 presidential: DONE as nationwide-majority + 12th Amendment contingent (documented simplification; the brief's "uniform national vote" premise was wrong — mainline still runs per-state EV)
- W24b Electoral College: DONE — real per-state Electoral College (`presidentialElectoralCollege.ts` + `tallyAdapter.ts`'s `realAccumulatePresident`): per-state winner-take-all, EV = house seats + 2 senators (531-EV 1953 college, 266 majority, never hardcoded 270), 12th Amendment contingent fallback on real EVs. Nationwide-vote path kept only as the defensive fallback for a world whose states lack demographics. Not ported (documented, out of scope): mainline's VP home-state bonus, governor endorsements, granular per-unit electorate substrate — structure over per-unit flavor
- W25 referendums: DONE — referendumLifecycle (polling->actuating|settled edge; granted->campaigning, campaigning->polling, actuating->completed|cancelled are PORT-STUB, documented in referendum/lifecycle.ts), independenceDesireDrift (real UK inflation input, PORT-STUB devolved-FM policy/approval inputs, documented in devolution/independenceDesireDrift.ts)
- W26 campaigns: campaignTurn, canvassing, campaign ops trees, debates, campaignSpendReset, primarySnapshots

## Lane 6: legislation and governance (engine)

- W27 bills: billLifecycle, billVoteLogic, cloture quorum, stateBillTimers, committees
- W28 enactment: billEnactment (budget gates, currency adoption), policyEffects, ministerialOrders
- W29 cabinet nominations/transitions, SCOTUS turn, UK judicial review
- W30 executive: governors, governor office

## Lane 7: world and narrative (engine)

- W31 events: worldEventsScheduler/maintenance, playerRandomEvents, crisisTurn and crisis action hooks
- W32 cold war tension and nuclear, wars, alignment, settlement, international organizations
- W33 eraCrossing in-sim (a world crosses from its start era into the next real pack: 1953 -> 1979 -> 1991 -> 2019), metricActivation: DONE — `eraCrossingPhase` (phases/eraCrossing.ts) reproduces mainline's entire substantive effect (a news post on the era-id edge; `currentEraId` is otherwise a UI label, grep-confirmed). `metricActivation`'s gameplay mechanism (`isMetricActive`) is a stateless per-call re-evaluation, not a turn-phase mutation — no phase to port; the underlying metric catalog is PORT-STUB (needs the approval-scoring/policy-cost systems it feeds, not built yet)

## Lane 8: player systems (engine)

- W34 actions: actionRefresh, fundGeneration, action catalog with costs/cooldowns
- W35 character: wealth, accounts, international wires, achievements
- W36 membership: join/found party, caucuses, endorsements (playerEndorsementPartySweep)

## Lane 9: NPC behavior (engine)

- W37 nppBehavior, relationship maintenance, bill sponsorship, action processing, fund generation, stance logic, monetary operations

## Lane 10: states and geography (content + engine)

- W38 US states: metrics, House districts and apportionment, state legislature seeding
- W39 UK constituencies; RU and DD subdivisions; regional chambers
- W40 subnational chamber compositions: DONE — real per-region elections for all four playable countries (US stateSenate, UK regionalCouncil, RU republicSupremeSoviet, DD landAssembly), wired into `electionSeriesForWorld` (elections/orchestration.ts SUBNATIONAL_CHAMBERS); mainline confirms all four are real per-region races (perpetualElections.ts), no country is N/A

## Lane 11: history (engine)

- W41 snapshot phases become WorldHistory: metric/approval/portfolio/wealth/interest/moneySupply history for charts; ledgerReconcile and balance snapshots become invariant checks wired into CLI and tests

## Lane 12: Head of State mode (after Lanes 1, 6, 7 land their cores)

Binding rule in FRAMEWORK.md: a mode is who the player is, never how the world works. No `if (mode)` in any phase.

- M1 engine: `player.mode` ("career" | "headOfState"), ruling-party/government binding at creation, action-layer gating that grants the player the existing party/executive action surfaces; NPCs fill unheld roles identically in both modes; schema bump
- M2 creation flow: mode picker; HoS variant selects country + ruling party instead of character career start
- M3 HoS UI hub: legislative agenda console, economic direction console (NPP economy encouragement, subsidies, state levers), war and foreign policy console; reuses U-lane screens with the HoS lever set

## Integration findings ledger (40-year sims, 2026-09-01)

The 2080-turn runs hold every invariant (finite, clamped, deterministic) with these known artifacts, each owned by a wave:

- Growth random-walks and unemployment drifts to the 11-14% band: macro PORT-STUB inputs (sector, fiscal, monetary all neutral) - owned by W2/W3/W6/W9.
- Party treasuries accumulate unbounded (no spending sinks) - owned by W20/W26 (elections and campaigns drain funds).
- NPC action points peg at cap (nothing spends them) - owned by W37.
- Near-empty news feed - owned by W31.
- Default majors demoted by t300 (no org maintenance without players/NPCs): PORT-STUB exemption shipped, removed at W37.

## Milestone: elections live (2026-09-01)

W21a/b/c complete: worlds run continuous election cycles from mainline canonical anchors (US house per state, senate by class, UK commons, RU soviets, DD Volkskammer); the player can join a party, declare, and win or lose a seat. Seat invariants exact at 700 turns. Vote tallies run on a marked PORT-STUB pending W16 demographics, after which the ported `accumulateVoteTurn` wires in (it hard-requires demographic inputs). Sequencing: W16 next in engine lane, then the tally wiring pass, then W20/W22-26 depth (primaries, conventions, campaigns, presidential).

## N/A for singleplayer (recorded, not silently dropped)

activityLogging (server telemetry), auditAnomalyScan / suspiciousDetection / financialSuspectScan (anti-abuse against human opponents), bannedShareholderRelease / inactiveShareholderShareRelease (moderation and absent-human recovery; NPC ownership handled inside Lane 2), altDetection, auth/account/discord/masscomm/analytics/adsense infra. Reason: these exist because other humans exist. gameHealthSnapshot maps to CLI invariants instead.

## UI lane (desktop, trails its engine wave)

U1 government viewer (in flight) - U2 economy dashboard with charts - U3 corporation management - U4 banking and portfolio - U5 elections center and results night - U6 congress/bills - U7 party screens - U8 campaign screen - U9 world map/globe screen (region geojsons, same source as mainline) - U10 character and actions hub - U11 events and news feed - U12 history charts - U13 saves: slots, autosave, crash-safe writes - U14 cheat panel extensions (force election, spawn event, edit politician)

## Platform lane

- P1 autosave and save slots (with U13)
- P2 packaging: tauri bundle, icons, updater plugin; linux builds on this box; windows/macOS need a runner decision (owner: enable Actions billing, make repo public at release, or build on an owned machine)
- P3 multiplayer viewer polish: session persistence, external link handling; ahd-client feature audit, absorption, archive
- P4 QA gate: 40 in-game years per era via CLI without invariant breaks, determinism in verify, bench budget, manual smoke checklist on a real desktop
- P5 release: 1.0.0 version, changelog, distribution

## Dependency notes

Lanes 1-4 and 8-11 are mutually independent; run continuously, two to three concurrent. Lane 5 needs W19 (support) and W38 (US states). Lane 6 needs W18. Lane 7 anytime. UI waves start when their engine wave merges. Platform lane last except P1.

## Post-1.0 lane (booked, not in the 60)

- A1 Android: swap the existing thin Capacitor wrapper's WebView content for the ROTUNDA bundle (SP local engine + MP navigation, both in the wrapper's own shell). ~1 wave platform adapters (Capacitor Filesystem for saves/dialogs), 2-4 waves mobile responsive UX pass, ~1 wave wiring + Firebase distribution (local builds; Android CI is billing-dead). Existing Android plumbing untouched.

## Count

41 engine/content waves + 14 UI waves + 5 platform waves = 60 waves, minus 1 in flight. At observed cadence this is roughly two sustained days of continuous operation, bounded by merge serialization and the windows/macOS packaging decision, not by engine work.

- W61 post-Cold-War playable rosters: DONE (M1) — 1991 opens JP/DE/CN/BR/IE and 2019 opens JP/DE/CN/IE per mainline RESET_PRESETS[...].countries; regions, registration, Layer-1 demographics, parties, seat-table compositions, cabinet position tables and voter-group categories generated from mainline by `packages/content/scripts/generateRosters.ts`; per-region election series for every lower/upper/subnational chamber, governors, IE uachtaran, CN partyChairSync president. M2 (open): per-country legislation catalogs (~300 types, mainline *LegislationTypes.ts) and authored per-era national budgets (coupled: tax rates resolve from tax-policy law types), BR president (mainline itself does not activate it), JP Sangiin/BR Senado class staggering, DE AMS list seats, IE STV.
