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
- W22 candidates: generateChallengers, candidatePartySweep, staleCandidateCleanup, withdrawInactiveCandidates, autoReelectionEntry
- W23 parliamentary: governmentFormation, parliamentaryGovernmentPhases, vacancy watcher, leadershipVacate
- W24 presidential: US presidential (current v3 uniform-national-vote model), succession, impeachmentLifecycle
- W25 referendums: referendumLifecycle, independenceDesireDrift
- W26 campaigns: campaignTurn, canvassing, campaign ops trees, debates, campaignSpendReset, primarySnapshots

## Lane 6: legislation and governance (engine)

- W27 bills: billLifecycle, billVoteLogic, cloture quorum, stateBillTimers, committees
- W28 enactment: billEnactment (budget gates, currency adoption), policyEffects, ministerialOrders
- W29 cabinet nominations/transitions, SCOTUS turn, UK judicial review
- W30 executive: governors, governor office

## Lane 7: world and narrative (engine)

- W31 events: worldEventsScheduler/maintenance, playerRandomEvents, crisisTurn and crisis action hooks
- W32 cold war tension and nuclear, wars, alignment, settlement, international organizations
- W33 eraCrossing in-sim (1953 world crosses into 1960 rules), metricActivation

## Lane 8: player systems (engine)

- W34 actions: actionRefresh, fundGeneration, action catalog with costs/cooldowns
- W35 character: wealth, accounts, international wires, achievements
- W36 membership: join/found party, caucuses, endorsements (playerEndorsementPartySweep)

## Lane 9: NPC behavior (engine)

- W37 nppBehavior, relationship maintenance, bill sponsorship, action processing, fund generation, stance logic, monetary operations

## Lane 10: states and geography (content + engine)

- W38 US states: metrics, House districts and apportionment, state legislature seeding
- W39 UK constituencies; RU and DD subdivisions; regional chambers
- W40 subnational chamber compositions (currently vacant by design)

## Lane 11: history (engine)

- W41 snapshot phases become WorldHistory: metric/approval/portfolio/wealth/interest/moneySupply history for charts; ledgerReconcile and balance snapshots become invariant checks wired into CLI and tests

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

## Count

41 engine/content waves + 14 UI waves + 5 platform waves = 60 waves, minus 1 in flight. At observed cadence this is roughly two sustained days of continuous operation, bounded by merge serialization and the windows/macOS packaging decision, not by engine work.
