# Shared country overview prototype

Question: can a multiplayer-shaped country overview consume AHDClient's existing local engine through a small platform-neutral reader, without embedding the multiplayer server or coupling the view to `WorldState`, Next.js, Tauri, or Android?

Run it from the repository root:

```sh
npm run prototype:country --workspace apps/desktop
```

Open `http://127.0.0.1:1420/?prototype=country-overview&variant=a`. Use the bottom arrows, keyboard left/right arrows, or `variant=a`, `variant=b`, and `variant=c` to compare the three layouts.

The prototype intentionally has no save persistence. End Turn uses the real local engine, then rereads the projected overview. The expanded Adapter state section exposes the entire view model so missing or fabricated data cannot hide behind the presentation.

## Result

- The local reader projects one US country overview through one async `read(countryId)` interface.
- The view renders without external network requests.
- End Turn advances real engine state and refreshes the same view model.
- The same responsive layout fits a 412 px Android-sized viewport without horizontal overflow.
- The current engine has honest gaps versus multiplayer, including national approval, ceremonial heads of state, chamber leadership, law-derived national ideology, and richer regime and sovereign status data. Those values are omitted rather than invented.

This validates the local UI adapter direction, not a wholesale port of the multiplayer Next.js application. Production work should extract the chosen view into shared presentation code and add separate local-engine and HTTP readers behind the same contract.
