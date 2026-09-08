interface Props {
  checked: boolean;
  linked: boolean;
  displayName: string | undefined;
  supporter: boolean | undefined;
  onLink: () => void;
  onProfile: () => void;
  onManage: () => void;
}

export function AccountControl({ checked, linked, displayName, supporter, onLink, onProfile, onManage }: Props): JSX.Element {
  if (checked && linked) return (
    <details className="client-account-menu">
      <summary className="client-account-control"><span className="client-account-name">{displayName || "Profile"}</span><span aria-hidden="true">⌄</span></summary>
      <div role="menu">
        <p><strong>{displayName || "Game account"}</strong><small>{supporter ? "Supporter" : "Player"}</small></p>
        <button role="menuitem" type="button" onClick={onProfile}>View profile</button>
        <button role="menuitem" type="button" onClick={onManage}>Manage game account</button>
      </div>
    </details>
  );
  return (
    <button className="client-account-control" type="button" disabled={!checked} onClick={onLink}>
      {!checked ? "Account" : "Link account"}
    </button>
  );
}
