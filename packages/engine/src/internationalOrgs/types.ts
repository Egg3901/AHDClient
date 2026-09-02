/**
 * International organizations — static membership tracker. Ports the
 * def/seed SHAPE of src/lib/constants/internationalOrganizations.ts
 * InternationalOrganizationDef + src/lib/admin/seed/seedInternationalOrganizations.ts,
 * trimmed to "org exists, these countries are members."
 *
 * Mainline's resolution/dues/tribute/leadership machinery (9 resolution
 * types, elected leadership seats, membership proposals with unanimous-vote
 * gating, GDP-fraction dues/tribute) is dozens of Mongo-collection-backed,
 * turn-phase-driven files under src/lib/internationalOrganizations/, sized
 * for a many-player political game. PORT-STUB in its entirety — B16, named
 * blocker: no per-turn org mechanics (sanctions, directives, aid, dues,
 * leadership elections) are ported this wave, only static membership.
 */
export interface InternationalOrgState {
  id: string;
  name: string;
  foundedYear: number;
  members: string[];
}
