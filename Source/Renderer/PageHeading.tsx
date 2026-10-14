import type { ReactNode } from "react";

// One heading contract prevents per-page typography and action alignment from
// shifting the title when users switch between Projects, Samples and Build.
export function PageHeading({ title, description, actions }: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return <header className="page-heading">
    <div className="page-heading-copy"><h1>{title}</h1><p>{description}</p></div>
    {actions && <div className="heading-actions">{actions}</div>}
  </header>;
}
