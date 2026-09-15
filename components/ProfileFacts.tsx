import type { ReactNode } from "react";

/** Labeled details that stay paired when the profile reflows. */
export default function ProfileFacts({ facts }: {
  facts: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="profile-facts">
      {facts.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
