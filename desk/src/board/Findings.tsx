import { motion } from "motion/react";
import { source } from "../data/lab";
import { useRun } from "../run";
import type { Lab, TestRun } from "../incident/types";
import { canaryOutcome, type Facts } from "../story/beats";
import type { StoryData } from "../story/data";
import { DUR, EASE, enter, stagger } from "./motion";

type Step = keyof StoryData["origins"];
const isRules = (data: StoryData, step: Step) => data.origins[step] === "rules";

const Prov = ({ data, step }: { data: StoryData; step: Step }) =>
  isRules(data, step) ? <span className="prov prov--rules">Rules</span> : <span className="prov">AI, checked</span>;

const aiClass = (data: StoryData, step: Step) => (isRules(data, step) ? "" : " node--ai");

// ---- e5: hypotheses and containment ----

export function Hypotheses({ data, f }: { data: StoryData; f: Facts }) {
  return (
    <div className="hypotheses">
      <div className="hypotheses-pair">
        {data.investigation.hypotheses.slice(0, 2).map((h, i) => (
          <motion.article
            key={h.statement}
            className={`node node-hypothesis${aiClass(data, "investigate")}`}
            {...enter}
            transition={{ ...enter.transition, delay: i * 0.08 }}
          >
            <p className="node-kicker">
              {i === 0 ? "Leading" : "Alternative"} <span className="chip chip--attn">Not confirmed</span>{" "}
              <Prov data={data} step="investigate" />
            </p>
            <h3 className="node-title node-title--sm">{h.statement}</h3>
            <div className="pros-cons">
              <div>
                <p className="node-sub">Supported by</p>
                <ul>
                  {h.supports.slice(0, 1).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="node-sub">Gap</p>
                <ul>
                  {h.against_or_gaps.slice(0, 1).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      <motion.article className="node node-contain" {...enter} transition={{ ...enter.transition, delay: 0.2 }}>
        <p className="node-kicker">Support acts now</p>
        <ul className="contain-list">
          {f.incident.containment.board.map((line) => (
            <li key={line.lead}>
              <strong>{line.lead}</strong>
              {line.rest}
            </li>
          ))}
        </ul>
        <p className="caption">{f.incident.containment.boardCaption(f.heldRunbook)}</p>
      </motion.article>
    </div>
  );
}

// ---- e6 and v2: the lab ----

export function LabNode({ lab, variant }: { lab: Lab; variant: "repro" | "fix" }) {
  return (
    <motion.article
      layoutId={variant === "repro" ? "node-repro" : "node-fix"}
      className="node node-lab"
      transition={{ layout: { duration: DUR.slow, ease: EASE } }}
    >
      <p className="node-kicker">{variant === "repro" ? lab.reproKicker : lab.fixKicker}</p>
      {variant === "fix" && (
        <ol className="rules">
          {lab.rules.map((r, i) => (
            <motion.li key={r.name} {...enter} transition={{ ...enter.transition, delay: stagger(i, 0.06) }}>
              <span className="rule-n">{i + 1}</span>
              <span>
                <strong>{r.name}.</strong> {r.text}
              </span>
            </motion.li>
          ))}
        </ol>
      )}
      <div className="testruns">
        {(variant === "repro" ? [lab.reproduction] : [lab.regression, lab.edgeCases]).map((t, ti) => (
          <TestRunView key={t.className} t={t} task={lab.testTask} start={0.2 + ti * 0.2} />
        ))}
      </div>
      {variant === "fix" && (
        <p className="testrun-note">
          With the flag forced off, {lab.regression.className} fails. That is how it proves the change.
        </p>
      )}
      <p className="links">
        <a
          href={source(variant === "repro" ? lab.reproduction.path : lab.regression.path)}
          target="_blank"
          rel="noreferrer"
        >
          Read the test
        </a>
        {variant === "fix" &&
          lab.adrs.map((a) => (
            <a key={a.path} href={source(a.path)} target="_blank" rel="noreferrer">
              {a.title}
            </a>
          ))}
        {variant === "repro" && (
          <>
            <a href={source(lab.readme)} target="_blank" rel="noreferrer">
              How the lab works
            </a>
            {lab.precedent && (
              <a href={lab.precedent.url} target="_blank" rel="noreferrer">
                Related public fix: {lab.precedent.title}
              </a>
            )}
          </>
        )}
      </p>
    </motion.article>
  );
}

function TestRunView({ t, task, start }: { t: TestRun; task: string; start: number }) {
  return (
    <div className="testrun" role="group" aria-label={`${t.className}, flag ${t.flag}`}>
      <p className="testrun-cmd" title={`./gradlew ${task} --tests ${t.className}`}>
        {t.className}
        <span className="testrun-flag">flag {t.flag}</span>
      </p>
      <ul>
        {t.cases.map(([s, outcome], i) => (
          <motion.li
            key={s}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DUR.fast, delay: start + stagger(i, 0.06) }}
          >
            <span className="pass" aria-label="passed">
              ✓
            </span>
            <span className="mono">{s}</span>
            <span className="muted">{outcome}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ---- v1: the handoff ----

export function HandoffNode({ data, sent }: { data: StoryData; sent: boolean }) {
  const h = data.handoff;
  return (
    <motion.article
      layoutId="node-handoff"
      className={`node node-handoff${aiClass(data, "handoff")}`}
      transition={{ layout: { duration: DUR.slow, ease: EASE } }}
    >
      <p className="node-kicker">
        Handoff · {h.severity} <Prov data={data} step="handoff" />{" "}
        <span className={sent ? "chip chip--ok" : "chip"}>
          {sent ? "Sent to engineering · simulated" : "Draft · awaiting approval"}
        </span>
      </p>
      <h3 className="node-title node-title--sm">{h.title}</h3>
      <p className="handoff-ask">
        <span className="node-sub">The ask</span>
        {h.the_ask}
      </p>
      <div className="pros-cons">
        <div>
          <p className="node-sub">Attached</p>
          <ul>
            {h.evidence_attached.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="node-sub">Escalation rules that fired</p>
          <p className="chips">
            {h.rules_triggered.map((r) => (
              <span key={r} className="chip">
                {r}
              </span>
            ))}
          </p>
          <p className="caption">{h.hypothesis_note}</p>
        </div>
      </div>
    </motion.article>
  );
}

// ---- v3: canary against control ----

export function ResultBars({ f }: { f: Facts }) {
  const v = f.incident.verification;
  const { groups, unit, caption } = v.bars;
  const max = Math.max(...groups.flatMap((g) => g.arms.map((a) => a.value)), 1);
  const outcome = canaryOutcome(f);
  return (
    <motion.figure
      layoutId="node-result"
      className="node node-figure"
      transition={{ layout: { duration: DUR.slow, ease: EASE } }}
    >
      <div className="result">
        {groups.map((g, gi) => (
          <div key={g.name} className="result-group">
            <p className="node-sub">{g.name}</p>
            {g.arms.map((arm, ri) => (
              <div key={arm.label} className="result-row">
                <span className="result-label">
                  {arm.label} · {v.windowDays} d
                </span>
                <span className="result-track">
                  <motion.span
                    className={`result-bar${arm.label === "After" ? ` result-bar--${g.tone}` : ""}`}
                    style={{ width: `${(arm.value / max) * 100}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: DUR.slow, ease: EASE, delay: 0.15 + gi * 0.2 + ri * 0.1 }}
                  />
                </span>
                <span className="result-num">
                  <strong>{arm.value}</strong> {unit}
                </span>
                <span className="result-ctx muted">{arm.context}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <figcaption className="caption">
        {outcome.charAt(0).toUpperCase() + outcome.slice(1)}. {caption}
      </figcaption>
    </motion.figure>
  );
}

// ---- v4: what it proves and doesn't ----

export function ProveNode({ data, f }: { data: StoryData; f: Facts }) {
  const held = f.incident.verification.held;
  return (
    <div className="prove">
      <motion.section className="node node--attn" {...enter}>
        <p className="node-kicker">What this doesn't prove</p>
        <ul>
          {data.verify.what_it_does_not_prove.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </motion.section>
      <motion.section className="node node--ok" {...enter} transition={{ ...enter.transition, delay: 0.08 }}>
        <p className="node-kicker">{held.title}</p>
        <ul>
          {held.lines.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </motion.section>
      <motion.section
        className={`node${aiClass(data, "verify")}`}
        {...enter}
        transition={{ ...enter.transition, delay: 0.16 }}
      >
        <p className="node-kicker">
          Next decision <Prov data={data} step="verify" />
        </p>
        <p className="next-decision">{data.verify.next_decision}</p>
      </motion.section>
    </div>
  );
}

// ---- c1: the article, and the next ticket ----

export function ArticleNode({ data }: { data: StoryData }) {
  const { pack } = useRun();
  const kb = data.kb;
  const c = data.classify;
  return (
    <div className="split">
      <motion.article
        layoutId="node-article"
        className={`node node-article${aiClass(data, "kb")}`}
        transition={{ layout: { duration: DUR.slow, ease: EASE } }}
      >
        <p className="node-kicker">
          Knowledge base · draft for review <Prov data={data} step="kb" />
        </p>
        <h3 className="node-title node-title--sm">{kb.title}</h3>
        <p className="node-sub">Steps</p>
        <ol className="article-steps">
          {kb.steps.slice(0, 5).map((s, i) => (
            <li key={s} className={i === 0 ? "article-step--gate" : undefined}>
              {s}
            </li>
          ))}
        </ol>
        <p className="node-sub">Escalate if</p>
        <ul>
          {kb.escalate_if.slice(0, 3).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </motion.article>
      <motion.article
        className={`node node-newticket${aiClass(data, "classify")}`}
        {...enter}
        transition={{ ...enter.transition, delay: 0.15 }}
      >
        <p className="node-kicker">A new ticket arrives</p>
        <blockquote className="ticket-text">{pack.newTicketExample}</blockquote>
        <dl className="classify">
          <div>
            <dt>Matches</dt>
            <dd>{c.matches_known_pattern ? c.matched_article : "No known pattern"}</dd>
          </div>
          <div>
            <dt>Suggested</dt>
            <dd>{c.suggested_action}</dd>
          </div>
          {c.confirm && (
            <div className="classify-gate">
              <dt>A person checks first</dt>
              <dd>{c.confirm}</dd>
            </div>
          )}
        </dl>
        <p className="caption">
          Try your own wording in the desk. <Prov data={data} step="classify" />
        </p>
      </motion.article>
    </div>
  );
}
