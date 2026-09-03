import { useEffect, useMemo, useState } from "react";
import { getCatalog, type WorldState } from "@ahdclient/engine";
import "./governorOffice.css";

export interface GovernorAddressInput {
  title: string;
  body?: string;
  emphasizedCategories: string[];
  targetGroupId?: string;
}

export interface GovernorOfficeRules {
  actionCap: number;
  addressActionCost: number;
  addressCooldownTurns: number;
  addressDurationTurns: number;
  addressTurnoutDelta: number;
  addressTitleMinLength: number;
  addressTitleMaxLength: number;
  addressBodyMaxLength: number;
  addressEmphasisMin: number;
  addressEmphasisMax: number;
  orderActionCostPerStep: number;
  orderDurationTurns: number;
  orderSlotCap: number;
}

export interface GovernorOfficeActions {
  rules: GovernorOfficeRules;
  deliverAddress: (
    world: WorldState,
    stateId: string,
    input: GovernorAddressInput,
  ) => { ok: boolean; error?: string; addressId?: string };
  issueOrder: (
    world: WorldState,
    stateId: string,
    legislationTypeId: string,
    direction: 1 | -1,
    steps: 1 | 2,
  ) => { ok: boolean; error?: string; orderId?: string };
}

export interface GovernorOfficeScreenProps {
  world: WorldState;
  actions: GovernorOfficeActions;
  onWorld: (world: WorldState) => void;
  onBack: () => void;
  onToast?: (message: string) => void;
}

interface Feedback {
  message: string;
  tone: "error" | "success";
}

function labelize(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="gov-empty" aria-live="polite">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

export function GovernorOfficeScreen({
  world,
  actions,
  onWorld,
  onBack,
  onToast,
}: GovernorOfficeScreenProps) {
  const stateId = world.player.homeRegionId ?? null;
  const region = stateId === null ? undefined : world.regions[stateId];
  const governor = stateId === null ? undefined : world.governors[stateId];
  const turnout = stateId === null ? undefined : world.regionTurnouts[stateId];
  const categoryOptions = useMemo(
    () => Object.keys(turnout?.modifiers ?? {}).sort(),
    [turnout],
  );
  const policyOptions = useMemo(
    () =>
      region === undefined
        ? []
        : getCatalog(region.countryId)
            .filter(
              (entry) =>
                entry.status === "available" &&
                (entry.allowedScope === "regional" || entry.allowedScope === "both"),
            )
            .sort((a, b) => a.title.localeCompare(b.title)),
    [region],
  );

  const [addressTitle, setAddressTitle] = useState("");
  const [addressBody, setAddressBody] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [targetGroup, setTargetGroup] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [steps, setSteps] = useState<1 | 2>(1);
  const [addressStatus, setAddressStatus] = useState<Feedback | null>(null);
  const [orderStatus, setOrderStatus] = useState<Feedback | null>(null);
  const rules = actions.rules;

  useEffect(() => {
    const firstCategory = categoryOptions[0] ?? "";
    const firstGroup = firstCategory
      ? Object.keys(turnout?.modifiers[firstCategory] ?? {}).sort()[0] ?? ""
      : "";
    setCategories(firstCategory ? [firstCategory] : []);
    setTargetGroup(firstGroup);
    setPolicyId(policyOptions[0]?.id ?? "");
    setAddressStatus(null);
    setOrderStatus(null);
  }, [stateId, categoryOptions, policyOptions, turnout]);

  const groupOptions = useMemo(() => {
    const found = new Set<string>();
    for (const category of categories) {
      for (const group of Object.keys(turnout?.modifiers[category] ?? {})) found.add(group);
    }
    return [...found].sort();
  }, [categories, turnout]);

  useEffect(() => {
    if (!groupOptions.includes(targetGroup)) setTargetGroup(groupOptions[0] ?? "");
  }, [groupOptions, targetGroup]);

  if (stateId === null) {
    return (
      <main className="gov-root">
        <button className="gov-back" type="button" onClick={onBack}>Back</button>
        <EmptyState title="No home state selected">
          Choose a home state before opening the Governor's Office. This local world has no
          state context to operate on yet.
        </EmptyState>
      </main>
    );
  }

  if (region === undefined || region.countryId !== world.player.countryId) {
    return (
      <main className="gov-root">
        <button className="gov-back" type="button" onClick={onBack}>Back</button>
        <EmptyState title="Home state unavailable">
          The saved home state {stateId} is not a region in the player's country. Pick a valid
          home state before using this office.
        </EmptyState>
      </main>
    );
  }

  if (governor === undefined) {
    return (
      <main className="gov-root">
        <button className="gov-back" type="button" onClick={onBack}>Back</button>
        <EmptyState title="Governor office not modeled">
          {region.name} has no governor record in this local world. No controls are available
          because there is no engine state to mutate.
        </EmptyState>
      </main>
    );
  }

  const officeStateId: string = stateId;
  const officeRegion = region;

  const holderName =
    governor.governorId === "player"
      ? world.player.name
      : governor.governorName ?? governor.governorId ?? "Vacant";
  const holderParty =
    governor.governorParty === null
      ? "Independent"
      : world.parties[governor.governorParty]?.abbreviation ?? governor.governorParty;
  const isPlayerGovernor = governor.governorId === "player";
  const activeOrders = world.governorOrders
    .filter((order) => order.stateId === stateId && order.status === "active")
    .sort((a, b) => b.issuedAtTurn - a.issuedAtTurn);
  const recentAddresses = world.governorAddresses
    .filter((address) => address.stateId === stateId)
    .sort((a, b) => b.deliveredAtTurn - a.deliveredAtTurn)
    .slice(0, 5);
  const cooldownTurn =
    governor.lastAddressTurn === null
      ? null
      : governor.lastAddressTurn + rules.addressCooldownTurns;
  const addressOnCooldown = cooldownTurn !== null && world.meta.turn < cooldownTurn;
  const selectedPolicy = policyOptions.find((policy) => policy.id === policyId);
  const selectedPolicyAlreadyActive = activeOrders.some(
    (order) => order.legislationTypeId === policyId,
  );
  const canAddress =
    !addressOnCooldown &&
    governor.gubernatorialActions >= rules.addressActionCost &&
    addressTitle.trim().length >= rules.addressTitleMinLength &&
    addressTitle.trim().length <= rules.addressTitleMaxLength &&
    categories.length >= rules.addressEmphasisMin &&
    categories.length <= rules.addressEmphasisMax &&
    groupOptions.length > 0 &&
    targetGroup !== "";
  const orderCost = steps * rules.orderActionCostPerStep;
  const canOrder =
    policyId !== "" &&
    activeOrders.length < rules.orderSlotCap &&
    !selectedPolicyAlreadyActive &&
    governor.gubernatorialActions >= orderCost;

  function toggleCategory(category: string) {
    setCategories((current) => {
      if (current.includes(category)) return current.filter((item) => item !== category);
      if (current.length >= rules.addressEmphasisMax) return current;
      return [...current, category];
    });
  }

  function submitAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddressStatus(null);
    const result = actions.deliverAddress(world, officeStateId, {
      title: addressTitle,
      ...(addressBody.trim() ? { body: addressBody } : {}),
      emphasizedCategories: categories,
      targetGroupId: targetGroup,
    });
    if (!result.ok) {
      setAddressStatus({
        message: result.error ?? "The engine rejected this address.",
        tone: "error",
      });
      return;
    }
    setAddressTitle("");
    setAddressBody("");
    setAddressStatus({
      message: `Address delivered. The turnout effect is active for ${rules.addressDurationTurns} turns.`,
      tone: "success",
    });
    onWorld({ ...world });
    onToast?.(`Governor's address delivered in ${officeRegion.name}.`);
  }

  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrderStatus(null);
    const result = actions.issueOrder(world, officeStateId, policyId, direction, steps);
    if (!result.ok) {
      setOrderStatus({
        message: result.error ?? "The engine rejected this executive order.",
        tone: "error",
      });
      return;
    }
    setOrderStatus({
      message: `Executive order issued. Its regional grant effect is active for ${rules.orderDurationTurns} turns.`,
      tone: "success",
    });
    onWorld({ ...world });
    onToast?.(`Executive order issued in ${officeRegion.name}.`);
  }

  return (
    <main className="gov-root">
      <header className="gov-hero">
        <div>
          <p className="gov-kicker">State government</p>
          <h1>Governor's Office</h1>
          <p className="gov-subtitle">{region.name} · Turn {world.meta.turn} · {world.meta.date}</p>
        </div>
        <button className="gov-back" type="button" onClick={onBack}>Back</button>
      </header>

      <dl className="gov-vitals" aria-label="Office status">
        <div><dt>Governor</dt><dd>{holderName}</dd></div>
        <div><dt>Party</dt><dd>{holderParty}</dd></div>
        <div><dt>Office actions</dt><dd>{governor.gubernatorialActions} / {rules.actionCap}</dd></div>
        <div><dt>Active orders</dt><dd>{activeOrders.length} / {rules.orderSlotCap}</dd></div>
      </dl>

      {governor.governorId === null ? (
        <EmptyState title="Office vacant">
          The governor's office is vacant. Address and executive-order controls will become
          available when an election or succession fills the seat.
        </EmptyState>
      ) : !isPlayerGovernor ? (
        <EmptyState title="You do not hold this office">
          {holderName} currently governs {region.name}. This screen shows the office record,
          but only the player governor may use its powers.
        </EmptyState>
      ) : (
        <div className="gov-action-grid">
          <section className="gov-card" aria-labelledby="gov-address-heading">
            <div className="gov-card-head">
              <div>
                <p className="gov-kicker">Public agenda</p>
                <h2 id="gov-address-heading">Deliver an address</h2>
              </div>
              <span className="gov-cost">{rules.addressActionCost} office action</span>
            </div>
            <p className="gov-explainer">
              Boost one voter group's turnout by {rules.addressTurnoutDelta} points. The effect
              and approval record last {rules.addressDurationTurns} turns. Addresses have a
              {" "}{rules.addressCooldownTurns}-turn cooldown.
            </p>
            {categoryOptions.length === 0 ? (
              <p className="gov-inline-warning" role="alert">
                No turnout categories exist for this state, so the local engine has no valid
                address target.
              </p>
            ) : (
              <form onSubmit={submitAddress}>
                <label className="gov-field">
                  <span>Address title</span>
                  <input
                    value={addressTitle}
                    onChange={(event) => setAddressTitle(event.target.value)}
                    minLength={rules.addressTitleMinLength}
                    maxLength={rules.addressTitleMaxLength}
                    placeholder={`A stronger future for ${region.name}`}
                    required
                  />
                  <small>
                    {addressTitle.trim().length} / {rules.addressTitleMaxLength}, minimum {rules.addressTitleMinLength}
                  </small>
                </label>
                <label className="gov-field">
                  <span>Remarks, optional</span>
                  <textarea
                    value={addressBody}
                    onChange={(event) => setAddressBody(event.target.value)}
                    maxLength={rules.addressBodyMaxLength}
                    rows={4}
                  />
                </label>
                <fieldset className="gov-fieldset">
                  <legend>Emphasis, choose one or two</legend>
                  <div className="gov-check-grid">
                    {categoryOptions.map((category) => (
                      <label key={category}>
                        <input
                          type="checkbox"
                          checked={categories.includes(category)}
                          disabled={
                            !categories.includes(category) &&
                            categories.length >= rules.addressEmphasisMax
                          }
                          onChange={() => toggleCategory(category)}
                        />
                        <span>{labelize(category)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="gov-field">
                  <span>Target voter group</span>
                  <select
                    value={targetGroup}
                    onChange={(event) => setTargetGroup(event.target.value)}
                    required
                  >
                    {groupOptions.map((group) => (
                      <option value={group} key={group}>{labelize(group)}</option>
                    ))}
                  </select>
                </label>
                {addressOnCooldown ? (
                  <p className="gov-inline-warning">Next address available on turn {cooldownTurn}.</p>
                ) : governor.gubernatorialActions < rules.addressActionCost ? (
                  <p className="gov-inline-warning">Not enough office actions to deliver an address.</p>
                ) : null}
                {addressStatus ? (
                  <p className="gov-status" data-tone={addressStatus.tone} role="status">
                    {addressStatus.message}
                  </p>
                ) : null}
                <button className="gov-primary" type="submit" disabled={!canAddress}>
                  Deliver address
                </button>
              </form>
            )}
          </section>

          <section className="gov-card" aria-labelledby="gov-order-heading">
            <div className="gov-card-head">
              <div>
                <p className="gov-kicker">Executive authority</p>
                <h2 id="gov-order-heading">Issue an executive order</h2>
              </div>
              <span className="gov-cost">{rules.orderActionCostPerStep} action per step</span>
            </div>
            <p className="gov-explainer">
              The local engine applies a temporary regional grant adjustment. It does not yet
              write a permanent state policy ladder. Up to {rules.orderSlotCap} orders may be
              active for {rules.orderDurationTurns} turns.
            </p>
            {policyOptions.length === 0 ? (
              <p className="gov-inline-warning" role="alert">
                No available regional policy targets exist in this country's local catalog.
              </p>
            ) : (
              <form onSubmit={submitOrder}>
                <label className="gov-field">
                  <span>Policy area</span>
                  <select value={policyId} onChange={(event) => setPolicyId(event.target.value)}>
                    {policyOptions.map((policy) => (
                      <option value={policy.id} key={policy.id}>{policy.title}</option>
                    ))}
                  </select>
                  {selectedPolicy ? <small>{selectedPolicy.description}</small> : null}
                </label>
                <div className="gov-split-fields">
                  <label className="gov-field">
                    <span>Direction</span>
                    <select
                      value={direction}
                      onChange={(event) => setDirection(Number(event.target.value) as 1 | -1)}
                    >
                      <option value={1}>Increase</option>
                      <option value={-1}>Decrease</option>
                    </select>
                  </label>
                  <label className="gov-field">
                    <span>Intensity</span>
                    <select
                      value={steps}
                      onChange={(event) => setSteps(Number(event.target.value) as 1 | 2)}
                    >
                      <option value={1}>1 step</option>
                      <option value={2}>2 steps</option>
                    </select>
                  </label>
                </div>
                {activeOrders.length >= rules.orderSlotCap ? (
                  <p className="gov-inline-warning">Both order slots are currently occupied.</p>
                ) : selectedPolicyAlreadyActive ? (
                  <p className="gov-inline-warning">This policy already has an active order.</p>
                ) : governor.gubernatorialActions < orderCost ? (
                  <p className="gov-inline-warning">Not enough office actions for this intensity.</p>
                ) : null}
                {orderStatus ? (
                  <p className="gov-status" data-tone={orderStatus.tone} role="status">
                    {orderStatus.message}
                  </p>
                ) : null}
                <button className="gov-primary" type="submit" disabled={!canOrder}>
                  Issue order for {orderCost} action{orderCost === 1 ? "" : "s"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}

      <div className="gov-history-grid">
        <section className="gov-card" aria-labelledby="gov-orders-list">
          <h2 id="gov-orders-list">Active orders</h2>
          {activeOrders.length === 0 ? (
            <p className="gov-muted">No executive orders are active.</p>
          ) : (
            <ul className="gov-record-list">
              {activeOrders.map((order) => (
                <li key={order.id}>
                  <strong>{policyOptions.find((policy) => policy.id === order.legislationTypeId)?.title ?? labelize(order.legislationTypeId)}</strong>
                  <span>{order.effectDirection > 0 ? "Increase" : "Decrease"} by {order.steps} step{order.steps === 1 ? "" : "s"}</span>
                  <small>Expires turn {order.expiresAtTurn}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="gov-card" aria-labelledby="gov-address-list">
          <h2 id="gov-address-list">Recent addresses</h2>
          {recentAddresses.length === 0 ? (
            <p className="gov-muted">No addresses have been delivered.</p>
          ) : (
            <ul className="gov-record-list">
              {recentAddresses.map((address) => (
                <li key={address.id}>
                  <strong>{address.title}</strong>
                  <span>{address.emphasizedCategories.map(labelize).join(", ")}</span>
                  <small>
                    Turn {address.deliveredAtTurn} · {address.expired || world.meta.turn >= address.demographicExpiresAtTurn ? "Expired" : `Effects end turn ${address.demographicExpiresAtTurn}`}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
