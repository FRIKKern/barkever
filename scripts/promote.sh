#!/usr/bin/env bash
set -euo pipefail

skip() {
  echo "nothing promoted: $1" | tee -a "$GITHUB_STEP_SUMMARY"
  exit 0
}
red() {
  echo "::error::$1" | tee -a "$GITHUB_STEP_SUMMARY"
  exit 1
}
case $EVENT in pull_request | pull_request_target) skip "ci ran for a $EVENT event" ;; esac
[ "$HEAD_REPO" = "$REPO" ] || skip "the run is from $HEAD_REPO"
[ "$HEAD_BRANCH" = staging ] || skip "the run is on $HEAD_BRANCH, not staging"
[ "$RESULT" != cancelled ] || skip "the run was cancelled"
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || skip "the run names no commit"
head=$(gh api "repos/$REPO/git/ref/heads/staging" -q .object.sha)
[ "$head" = "$SHA" ] || skip "ci ran on $SHA, but staging is at $head now; only staging's head is promoted"
[ "$WORKFLOW_PATH" = .github/workflows/ci.yml ] && [ "$WORKFLOW_NAME" = ci ] ||
  red "A run named $WORKFLOW_NAME from $WORKFLOW_PATH finished on staging's head, and promote knows only ci from .github/workflows/ci.yml, so main did not move."
[[ $EVENT == push || $EVENT == workflow_dispatch ]] ||
  red "A ci run for a $EVENT event finished on staging's head, and promote moves main only after a push or a dispatch, so main did not move."

report() {
  local title="$1" body="$2"
  if [[ -z "$(gh issue list -R "$REPO" --state open --search "\"$title\" in:title" --json number -q '.[].number')" ]]; then
    gh issue create -R "$REPO" --title "$title" --body "$body"
  fi
}
red_issues() {
  gh issue list -R "$REPO" --state open --limit 100 --search '"staging is red" in:title' --json number,title,author,body \
    -q '[.[] | select(.author.is_bot and .author.login == "app/github-actions" and .title == "staging is red")] | sort_by(.number) | .[] | "\(.number) \([.body | capture("on `(?<sha>[0-9a-f]{40})`")][0].sha // "")"' < /dev/null
}
job_words() {
  case $1 in
    scan) echo 'the secret scan (`scan`)' ;;
    check) echo 'the repository checks (`check`)' ;;
    build) echo 'the build (`build`)' ;;
    test-scripts) echo 'the script tests (`test-scripts`)' ;;
    test-app) echo 'the app tests (`test-app`)' ;;
    test-mac) echo 'the Mac app tests (`test-mac`)' ;;
    *) printf '`%s`\n' "$(printf '%s' "$1" | tr -cd 'A-Za-z0-9 ._()/-' | cut -c1-80)" ;;
  esac
}
failed_jobs() {
  local names name
  [[ ${RUN_ID:-} =~ ^[0-9]+$ ]] && names=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs?per_page=100" \
    -q '.jobs[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "cancelled") | .name' < /dev/null) ||
    { echo '- the run page lists them'; return; }
  [ -n "$names" ] || { echo '- the run page lists them'; return; }
  while IFS= read -r name; do echo "- $(job_words "$name")"; done <<<"$names"
}
report_red() {
  local body found number
  body=$(printf '%s\n' "ci ended as $RESULT on \`$SHA\`, so main stays where it is." '' 'Checks that failed:' "$(failed_jobs)" '' 'Main moves again once ci is green on a later staging head; this issue then closes.' "Run: $RUN_URL")
  found=$(red_issues | head -n 1)
  number=${found%% *}
  if [ -n "$number" ]; then
    gh issue edit "$number" -R "$REPO" --body "$body"
  else
    gh issue create -R "$REPO" --title "staging is red" --body "$body"
  fi
}
settle() {
  local number red
  while read -r number red; do
    case "$([ -z "$red" ] && echo ahead || gh api "repos/$REPO/compare/$red...$SHA" -q .status < /dev/null || true)" in
      ahead|identical)
        gh issue close "$number" -R "$REPO" --comment "main now holds $SHA, which includes ${red:-the red head}. Run: $RUN_URL" < /dev/null || echo "::warning::issue $number is still open"
        ;;
    esac
  done < <(gh issue list -R "$REPO" --state open --limit 100 --search '"staging is red at" in:title' --json number,title,author \
    -q '.[] | select(.author.is_bot and .author.login == "app/github-actions" and (.title | test("^staging is red at [0-9a-f]{10}$"))) | "\(.number) \(.title[-10:])"'
    red_issues)
}
if [[ "$RESULT" != success ]]; then
  if [[ "$(gh api "repos/$REPO/compare/main...$SHA" -q .status)" =~ ^(identical|behind)$ ]]; then
    echo "ci ended as $RESULT on $SHA, but main already holds it" | tee -a "$GITHUB_STEP_SUMMARY"
    exit 0
  fi
  report_red
  exit 0
fi
state="$(gh api "repos/$REPO/compare/main...$SHA" -q .status)"
case "$state" in
  ahead)
    if ! gh api -X PATCH "repos/$REPO/git/refs/heads/main" -f sha="$SHA" -F force=false -q .object.sha; then
      report "main could not move to ${SHA:0:10}" "ci is green on $SHA but main did not move; the promote run log says why. Someone with push rights can run git push origin $SHA:main. Run: $RUN_URL"
      exit 1
    fi
    echo "main moved to $SHA" | tee -a "$GITHUB_STEP_SUMMARY"
    settle
    ;;
  identical|behind)
    echo "main already holds $SHA" | tee -a "$GITHUB_STEP_SUMMARY"
    settle
    ;;
  *)
    report "main and staging split at ${SHA:0:10}" "ci is green on $SHA but main holds commits staging lacks ($state), so main was not moved. The next land merges main into staging. Run: $RUN_URL"
    exit 1
    ;;
esac
