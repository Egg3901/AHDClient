import { ONLINE_URL } from "../onlineTarget.js";

export interface HelpTarget {
  via: "online-viewer" | "system-browser";
  url: string;
}

const HELP_TARGETS: Readonly<Record<string, HelpTarget>> = {
  "help.wiki": {
    via: "system-browser",
    url: "https://wiki.ahousedividedgame.com",
  },
  "help.about": { via: "online-viewer", url: `${ONLINE_URL}/about` },
  "help.suggestions": { via: "online-viewer", url: `${ONLINE_URL}/feedback` },
  "help.discord": { via: "system-browser", url: "https://discord.gg/DmF8zJJuqN" },
  "help.patreon": {
    via: "system-browser",
    url: "https://www.patreon.com/cw/AHouseDividedGame/membership",
  },
  "help.supporter-wall": {
    via: "system-browser",
    url: "https://lakesidegames.net/supporters",
  },
  "help.email-support": {
    via: "system-browser",
    url: "mailto:admin@ahousedividedgame.com",
  },
  "help.server-status": {
    via: "system-browser",
    url: "https://ops.ahousedividedgame.com/status",
  },
  "help.privacy": { via: "online-viewer", url: `${ONLINE_URL}/privacy` },
  "help.terms": { via: "online-viewer", url: `${ONLINE_URL}/terms` },
};

export function helpTargetForRoute(routeId: string): HelpTarget | undefined {
  return HELP_TARGETS[routeId];
}
