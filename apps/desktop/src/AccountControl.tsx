interface Props {
  checked: boolean;
  linked: boolean;
  onLink: () => void;
  onProfile: () => void;
}

export function AccountControl({ checked, linked, onLink, onProfile }: Props): JSX.Element {
  return (
    <button className="client-account-control" type="button" disabled={!checked} onClick={linked ? onProfile : onLink}>
      {!checked ? "Account" : linked ? "Profile" : "Link account"}
    </button>
  );
}
