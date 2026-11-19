#!/usr/bin/env bash
set -euo pipefail

skip() {
  echo "nothing promoted: $1" | tee -a "$GITHUB_STEP_SUMMARY"
  exit 0
}
[[ $EVENT == push || $EVENT == workflow_dispatch ]] || skip "ci ran for a $EVENT event"
[ "$HEAD_REPO" = "$REPO" ] || skip "the run is from $HEAD_REPO"
[ "$HEAD_BRANCH" = staging ] || skip "the run is on $HEAD_BRANCH, not staging"
[ "$RESULT" != cancelled ] || skip "the run was cancelled"
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || skip "the run names no commit"
head=$(gh api "repos/$REPO/git/ref/heads/staging" -q .object.sha)
[ "$head" = "$SHA" ] || skip "ci ran on $SHA, but staging is at $head now; only staging's head is promoted"
if [ "$WORKFLOW_PATH" != .github/workflows/ci.yml ] || [ "$WORKFLOW_NAME" != ci ]; then
  echo "::error::A run named $WORKFLOW_NAME from $WORKFLOW_PATH finished on staging's head, and promote knows only ci from .github/workflows/ci.yml, so main did not move." | tee -a "$GITHUB_STEP_SUMMARY"
  exit 1
fi

report() {
  local title="$1" body="$2"
  if [[ -z "$(gh issue list -R "$REPO" --state open --search "\"$title\" in:title" --json number -q '.[].number')" ]]; then
    gh issue create -R "$REPO" --title "$title" --body "$body"
  fi
}
settle() {
  local number red
  while read -r number red; do
    case "$(gh api "repos/$REPO/compare/$red...$SHA" -q .status < /dev/null || true)" in
      ahead|identical)
        gh issue close "$number" -R "$REPO" --comment "main now holds $SHA, which includes $red. Run: $RUN_URL" < /dev/null || echo "::warning::issue $number is still open"
        ;;
    esac
  done < <(gh issue list -R "$REPO" --state open --limit 100 --search '"staging is red at" in:title' --json number,title,author \
    -q '.[] | select(.author.is_bot and .author.login == "app/github-actions" and (.title | test("^staging is red at [0-9a-f]{10}$"))) | "\(.number) \(.title[-10:])"')
}
if [[ "$RESULT" != success ]]; then
  if [[ "$(gh api "repos/$REPO/compare/main...$SHA" -q .status)" =~ ^(identical|behind)$ ]]; then
    echo "ci ended as $RESULT on $SHA, but main already holds it" | tee -a "$GITHUB_STEP_SUMMARY"
    exit 0
  fi
  report "staging is red at ${SHA:0:10}" "ci ended as $RESULT on $SHA, so main stays where it is. Run: $RUN_URL"
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
