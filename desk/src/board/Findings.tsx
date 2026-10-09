import { motion } from "motion/react";
import { HERO, NEW_TICKET_EXAMPLE } from "../data/synthetic";
import { LAB, source, type TestRun } from "../data/lab";
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
          <li>
            <strong>{HERO.openIds.length} open sessions corrected</strong> under {HERO.incidentId}: each closed at its
            own last meter value, idle fees reversed, invoice flagged for billing review.
          </li>
          <li>
            <strong>Detector proposed</strong>, read-only, every 15 minutes: an open session with no meter change for 30
            minutes and a reconnect near unplug becomes a candidate for a person.
          </li>
          <li>
            <strong>The tickets stay open</strong> on the incident. None is closed as a one-off.
          </li>
        </ul>
        <p className="caption">
          Containment corrects records with {f.heldRunbook}. It does not change why sessions stay open.
        </p>
      </motion.article>
    </div>
  );
}

// ---- e6 and v2: the lab ----

export function LabNode({ variant }: { variant: "repro" | "fix" }) {
  return (
    <motion.article
      layoutId={variant === "repro" ? "node-repro" : "node-fix"}
      className="node node-lab"
      transition={{ layout: { duration: DUR.slow, ease: EASE } }}
    >
      <p className="node-kicker">
        {variant === "repro" ? "Reproduction lab · Java 25 · OCPP 2.0.1" : "The change · behind a flag per station"}
      </p>
      {variant === "fix" && (
        <ol className="rules">
          {LAB.rules.map((r, i) => (
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
        {(variant === "repro" ? [LAB.reproduction] : [LAB.regression, LAB.edgeCases]).map((t, ti) => (
          <TestRunView key={t.className} t={t} start={0.2 + ti * 0.2} />
        ))}
      </div>
      {variant === "fix" && (
        <p className="testrun-note">
          With the flag forced off, {LAB.regression.className} fails. That is how it proves the change.
        </p>
      )}
      <p className="links">
        <a
          href={source(variant === "repro" ? LAB.reproduction.path : LAB.regression.path)}
          target="_blank"
          rel="noreferrer"
        >
          Read the test
        </a>
        {variant === "fix" &&
          LAB.adrs.map((a) => (
            <a key={a.path} href={source(a.path)} target="_blank" rel="noreferrer">
              {a.title}
            </a>
          ))}
        {variant === "repro" && (
          <>
            <a href={source(LAB.readme)} target="_blank" rel="noreferrer">
              How the lab works
            </a>
            <a href={LAB.precedent.url} target="_blank" rel="noreferrer">
              Related public fix: {LAB.precedent.title}
            </a>
          </>
        )}
      </p>
    </motion.article>
  );
}

function TestRunView({ t, start }: { t: TestRun; start: number }) {
  return (
    <div className="testrun" role="group" aria-label={`${t.className}, flag ${t.flag}`}>
      <p className="testrun-cmd" title={`./gradlew :lab:test --tests ${t.className}`}>
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
  const v = f.v;
  const max = Math.max(v.canary.before.stuck, v.control.before.stuck, v.canary.after.stuck, v.control.after.stuck, 1);
  const groups = [
    { name: `Canary · ${v.canary.sites} sites · fix on`, before: v.canary.before, after: v.canary.after, tone: "ok" },
    {
      name: `Control · ${v.control.sites} sites · fix off`,
      before: v.control.before,
      after: v.control.after,
      tone: "bad",
    },
  ];
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
            {(
              [
                ["Before", g.before],
                ["After", g.after],
              ] as const
            ).map(([label, arm], ri) => (
              <div key={label} className="result-row">
                <span className="result-label">
                  {label} · {v.windowDays} d
                </span>
                <span className="result-track">
                  <motion.span
                    className={`result-bar${label === "After" ? ` result-bar--${g.tone}` : ""}`}
                    style={{ width: `${(arm.stuck / max) * 100}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: DUR.slow, ease: EASE, delay: 0.15 + gi * 0.2 + ri * 0.1 }}
                  />
                </span>
                <span className="result-num">
                  <strong>{arm.stuck}</strong> stuck
                </span>
                <span className="result-ctx muted">{arm.dropsNearUnplug} drops near unplug</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <figcaption className="caption">
        {canaryOutcome(f).replace(/^on/, "On")}. Sessions flagged for a person are counted separately, not as stuck.
        Computed by the lab's experiment from scripted, synthetic inputs.
      </figcaption>
    </motion.figure>
  );
}

// ---- v4: what it proves and doesn't ----

export function ProveNode({ data, f }: { data: StoryData; f: Facts }) {
  const c = f.v.correctness;
  const held = [
    `${c.falseClosures} false closures: no reconciled session had rising energy or an ongoing report`,
    `${c.duplicateCharges} duplicate charges`,
    `${c.lateEndedApplied} of ${c.lateEndedArrived} late Ended events applied once`,
    `${c.newerTransactionSkips} newer-transaction skip, left for a person`,
    `${c.invoicesReviewed} provisional invoices reviewed, ${c.invoicesAdjusted} adjusted`,
  ];
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
        <p className="node-kicker">Checks that held · {c.canarySessions.toLocaleString("en-US")} canary sessions</p>
        <ul>
          {held.map((s) => (
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
        <blockquote className="ticket-text">{NEW_TICKET_EXAMPLE}</blockquote>
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
