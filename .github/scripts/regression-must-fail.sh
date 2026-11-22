#!/usr/bin/env bash
# The gate for "with the fix off, the regression test must fail". It reads the JUnit XML report Gradle wrote and
# passes only when the report shows exactly the expected tests, every one of them failed, each failure has the
# expected type, and nothing errored or was skipped. A Gradle or Docker error, a filter that matched no test, a test
# that passes with the fix off, or a crash in place of an assertion all fail the gate.
#
# Usage: regression-must-fail.sh <report.xml> <failure type> <test name>...
# Test names are the method names; Gradle's "()" suffix for JUnit 5 methods is ignored. For a parameterized test,
# name each case by its argument: Gradle writes a case as `[1] scenario = "slow-web-repay"` (or `[1] slow-web-repay`),
# and the gate reads that as slow-web-repay. Every case must be named, so a dropped case fails the gate.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <report.xml> <failure type> <test name>..." >&2
  exit 2
fi
report=$1
want_type=$2
shift 2
want_names=("$@")

fail() {
  echo "::error::$1" >&2
  exit 1
}

[ -f "$report" ] || fail "No report at $report: the regression test did not run with the fix off."

suite=$(grep -o '<testsuite [^>]*>' "$report" | head -n 1 || true)
[ -n "$suite" ] || fail "$report has no <testsuite> element."
# An attribute that is missing reads as empty (grep finding nothing is not an error here), and an empty count never
# equals the expected one, so a missing attribute fails the gate with a message instead of passing or ending silently.
attr() { printf '%s' "$suite" | { grep -o " $1=\"[0-9]*\"" || true; } | tr -dc '0-9'; }
tests=$(attr tests)
failures=$(attr failures)
errors=$(attr errors)
skipped=$(attr skipped)
want=${#want_names[@]}
echo "With the fix off: tests=${tests:-?} failures=${failures:-?} errors=${errors:-?} skipped=${skipped:-?} (expected $want, $want, 0, 0)"
if [ "${tests:-}" != "$want" ] || [ "${failures:-}" != "$want" ] || [ "${errors:-}" != "0" ] || [ "${skipped:-}" != "0" ]; then
  fail "Expected all $want tests to fail on assertions with the fix off; got tests=${tests:-?} failures=${failures:-?} errors=${errors:-?} skipped=${skipped:-?}."
fi

# One line per test case: its name, then its failure type ("-" when it passed). Text inside CDATA (the captured
# output) is skipped, so a log line can never look like a test case or a failure.
actual=$(awk '
  {
    line = $0
    if (incdata) {
      i = index(line, "]]>")
      if (!i) next
      line = substr(line, i + 3)
      incdata = 0
    }
    while ((i = index(line, "<![CDATA[")) > 0) {
      rest = substr(line, i + 9)
      j = index(rest, "]]>")
      if (j) line = substr(line, 1, i - 1) substr(rest, j + 3)
      else { line = substr(line, 1, i - 1); incdata = 1; break }
    }
  }
  line ~ /<testcase / {
    match(line, / name="[^"]*"/); name = substr(line, RSTART + 7, RLENGTH - 8); sub(/\(\)$/, "", name)
    # A parameterized case, `[1] scenario = &quot;slow-web-repay&quot;` or `[1] slow-web-repay`, is read as its argument.
    if (name ~ /^\[[0-9]+\] /) {
      sub(/^\[[0-9]+\] /, "", name)
      sub(/^[A-Za-z_][A-Za-z0-9_]* = /, "", name)
      if (name ~ /^&quot;.*&quot;$/) name = substr(name, 7, length(name) - 12)
    }
    order[++n] = name; type[name] = "-"
  }
  line ~ /<failure / && n { match(line, / type="[^"]*"/); type[order[n]] = substr(line, RSTART + 7, RLENGTH - 8) }
  END { for (i = 1; i <= n; i++) print order[i] "\t" type[order[i]] }' "$report")
echo "Test cases and failure types:"
printf '%s\n' "$actual" | sed 's/^/  /'

expected=$(for name in "${want_names[@]}"; do printf '%s\t%s\n' "$name" "$want_type"; done | sort)
if [ "$(printf '%s\n' "$actual" | sort)" != "$expected" ]; then
  echo "Expected:" >&2
  printf '%s\n' "$expected" | sed 's/^/  /' >&2
  fail "With the fix off, the failing tests or their failure types are not the expected ones."
fi
echo "With the fix off, all $want expected tests fail with $want_type, as they should."
