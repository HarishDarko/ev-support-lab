import type { PackId } from "../../shared/packs";
import { useIndustry } from "./IndustryContext";
import "./IndustryMenu.css";

/**
 * The Industry menu: a native select, so keyboard and screen readers get the platform's own control. It appears only
 * when there is more than one complete industry to pick from.
 */
export function IndustryMenu({ className = "" }: { className?: string }) {
  const { id, options, pick } = useIndustry();
  if (options.length < 2) return null;
  return (
    <label className={`industry ${className}`.trim()}>
      <span className="industry-label">Industry</span>
      <select className="industry-select" value={id} onChange={(e) => pick(e.target.value as PackId)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
