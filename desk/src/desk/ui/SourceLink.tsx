import type { ReactNode } from "react";
import { source } from "../../data/lab";
import "./ui.css";

/** A link to a file in the repository (depth 3). Built from the one repository constant in data/lab.ts. */
export function SourceLink({ path, children }: { path: string; children: ReactNode }) {
  return (
    <a className="dk-link" href={source(path)} target="_blank" rel="noreferrer">
      {children}
      <span className="sr-only"> (opens the repository in a new tab)</span>
    </a>
  );
}
