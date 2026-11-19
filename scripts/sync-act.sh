#!/usr/bin/env bash
set -euo pipefail
. "${BASH_SOURCE[0]%/*}/act-token.sh"

plan="$RUNNER_TEMP/plan"
barkpark="${BARKPARK_GIT:-https://github.com/FRIKKern/barkpark}"
src=api/priv/portable_doc
pack=conformance/pack
report=conformance/barkever-blocks.json
issue_title='PortableDoc pack sync waits for Barkever'
re_sha='^[0-9a-f]{40}$'
re_type='^[A-Za-z][A-Za-z0-9_-]{0,63}$'
re_source='commit `([0-9a-f]{40})`'

action=$(jq -r .action "$plan/plan.json")
case "$action" in push | report) ;; *) fail "the plan asks for $action: act only pushes or reports" ;; esac

git fetch -q origin "+refs/heads/staging:refs/sync-pack/staging"
staging=$(git rev-parse refs/sync-pack/staging)
[[ $(git cat-file blob "$staging:$pack/SOURCE.md") =~ $re_source ]] || fail "staging's SOURCE.md names no Barkpark commit: sync by hand once"
was=${BASH_REMATCH[1]}

bp="$RUNNER_TEMP/barkpark.git"
git init -q --bare "$bp"
git -C "$bp" remote add origin "$barkpark"
git -C "$bp" config remote.origin.promisor true
git -C "$bp" config remote.origin.partialclonefilter blob:none
git -C "$bp" fetch -q --filter=blob:none origin main
bpmain=$(git -C "$bp" rev-parse FETCH_HEAD)
git -C "$bp" config remote.origin.promisor false

on_barkpark() {
  git -C "$bp" merge-base --is-ancestor "$was" "$bpmain" 2>/dev/null ||
    fail "Barkpark $was, which staging's SOURCE.md names, is not on Barkpark's main (history rewritten?): sync by hand once"
  git -C "$bp" merge-base --is-ancestor "$1" "$bpmain" 2>/dev/null || fail "Barkpark $1 is not on Barkpark's main"
  git -C "$bp" merge-base --is-ancestor "$was" "$1" || fail "Barkpark $1 does not hold $was, the commit staging's SOURCE.md names: an older pack is never taken"
}

sha256_of() {
  local h
  if command -v sha256sum >/dev/null; then h=$(sha256sum); else h=$(shasum -a 256); fi
  printf '%s' "${h%% *}"
}

note_for() {
  printf '%s\n' '# PortableDoc conformance pack' '' \
    "Written by \`scripts/pack-sync.mjs\` from \`FRIKKern/barkpark\` commit \`$1\`, path \`$src\`." \
    "Never edit it by hand: Barkpark is the source, and \`.github/workflows/sync-pack.yml\` brings it here." '' \
    '| File | sha256 |' '|---|---|' \
    "| \`conformance.mjs\` | \`$2\` |" "| \`conformance.d.mts\` | \`$3\` |" "| \`goldens/stamp.json\` | \`$4\` |" '' \
    "The block goldens are named, with their sha256, in \`goldens/stamp.json\`."
}

check_name() {
  case $1 in
    check-repo) echo 'the repository check (`node scripts/check-repo.mjs`)' ;;
    pack-compare) echo 'the pack check (`node scripts/pack-compare.mjs`)' ;;
    types) echo "the app's type check (\`tsc --noEmit\`)" ;;
    test:*)
      local file=${1#test:} re_test='^[A-Za-z0-9_][A-Za-z0-9._/-]*\.test\.(mjs|js|ts|tsx)$' re_up='(^|/)\.\.?/'
      [[ $file =~ $re_test && ! $file =~ $re_up ]] || return 1
      git cat-file -e "$staging:$file" 2>/dev/null || return 1
      echo "the tests in \`$file\`, which read the pack"
      ;;
    *) return 1 ;;
  esac
}

report_issue() {
  local source list number body="$RUNNER_TEMP/sync-issue.md" t
  source=$(jq -r .source "$plan/plan.json")
  [[ $source =~ $re_sha ]] || fail "source $source"
  on_barkpark "$source"
  list=$(jq -r '[.moved, .failed] | if all(type == "array" and length <= 200) and (add | length) > 0 then .[0][], "--", .[1][] | tostring else error("") end' "$plan/plan.json" 2>/dev/null) ||
    fail 'the plan names no moved rows or failed checks'
  moved=()
  failed=()
  local into=moved
  while IFS= read -r t; do
    if [ "$t" = -- ]; then into=failed; elif [ $into = moved ]; then moved+=("$t"); else failed+=("$t"); fi
  done <<<"$list"
  for t in ${moved[@]+"${moved[@]}"}; do
    [[ $t =~ $re_type ]] || fail "moved type $t"
    git -C "$bp" rev-parse -q --verify "$source:$src/goldens/blocks/$t.golden.json" >/dev/null ||
      git cat-file blob "$staging:$report" | jq -e --arg t "$t" 'any(.rows[]; .type == $t)' >/dev/null ||
      fail "$t is no block type in Barkpark $source or in $report"
  done
  for t in ${failed[@]+"${failed[@]}"}; do check_name "$t" >/dev/null || fail "failed check $t"; done
  {
    printf '%s\n' "The PortableDoc pack from Barkpark commit \`$source\` does not pass Barkever's checks yet, so the sync copies nothing to staging." ''
    if [ ${#failed[@]} -gt 0 ]; then
      printf '%s\n' 'Checks that fail on the new pack:' ''
      for t in "${failed[@]}"; do printf -- '- %s\n' "$(check_name "$t")"; done
      printf '\n'
    fi
    if [ ${#moved[@]} -gt 0 ]; then
      printf '%s\n' "Blocks that no longer render as \`$report\` records:" ''
      printf -- '- `%s`\n' "${moved[@]}"
      printf '\n'
    fi
    printf '%s\n' "What to do: on a branch, run \`node scripts/pack-sync.mjs\` with a Barkpark checkout at that commit. Fix the renderer or the code the checks name, or accept the new rows with \`pnpm conformance:write\` and say why in the commit. Land it, then close this issue. Until then each sync run brings this issue up to date; the run's summary shows the output."
  } >"$body"
  number=$(token_gh issue list --state open --limit 100 --search "\"$issue_title\" in:title" --json number,title,author \
    -q '[.[] | select(.author.is_bot and .author.login == "app/github-actions" and .title == "PortableDoc pack sync waits for Barkever") | .number] | min // empty')
  if [ -n "$number" ]; then
    token_gh issue edit "$number" --body-file "$body"
  else
    token_gh issue create --title "$issue_title" --body-file "$body"
  fi
}

push_sync() {
  local new=refs/sync-pack/new parent extra bad='' meta path old mode status note at entry oid rel from held message sync stamp_sha
  { [ -f "$plan/sync.bundle" ] && git bundle verify -q "$plan/sync.bundle" >/dev/null 2>&1; } || fail 'no valid sync.bundle'
  git fetch -q "$plan/sync.bundle" "HEAD:$new"
  [ "$(git cat-file -t "$new")" = commit ] || fail 'the bundle holds no commit'
  read -r _ parent extra <<<"$(git rev-list --parents -n 1 "$new")"
  { [ -n "$parent" ] && [ -z "$extra" ]; } || fail 'the sync commit is not one plain commit'
  [ "$parent" = "$staging" ] || fail "staging is at $staging, but the sync commit sits on $parent: staging moved since the plan, nothing pushed; the next run tries again"

  local re_path="^($pack/[A-Za-z0-9._-][A-Za-z0-9._/-]*|${report//./\\.})\$" re_dot='(^|/)\.\.?(/|$)' re_mode='^(100644|000000)$'
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    read -r old mode _ _ status <<<"${meta#:}"
    [[ $old =~ $re_mode && $mode =~ $re_mode && $path =~ $re_path && ! $path =~ $re_dot ]] || bad+="$status $old $mode $path; "
  done < <(git diff --no-renames --raw -z "$staging" "$new")
  [ -z "$bad" ] || fail "the sync commit changes what the pack never holds: $bad"
  git diff --quiet "$staging" "$new" -- "$pack" && fail 'the sync commit leaves the pack as it is'

  for rel in conformance.mjs conformance.d.mts goldens/stamp.json; do
    git cat-file -e "$new:$pack/$rel" 2>/dev/null || fail "$pack/$rel is absent"
  done
  note=$(git cat-file blob "$new:$pack/SOURCE.md")
  [[ $note =~ $re_source ]] || fail 'SOURCE.md names no Barkpark commit'
  at=${BASH_REMATCH[1]}
  stamp_sha=$(git cat-file blob "$new:$pack/goldens/stamp.json" | sha256_of)
  [ "$note" = "$(note_for "$at" "$(git cat-file blob "$new:$pack/conformance.mjs" | sha256_of)" "$(git cat-file blob "$new:$pack/conformance.d.mts" | sha256_of)" "$stamp_sha")" ] ||
    fail 'SOURCE.md is not as pack-sync writes it for these files'
  on_barkpark "$at"

  while IFS= read -r -d '' entry; do
    oid=${entry%%$'\t'*}
    oid=${oid##* }
    rel=${entry#*$'\t'"$pack"/}
    case $rel in
      SOURCE.md) continue ;;
      conformance.mjs | conformance.d.mts) from=conformance/$rel ;;
      goldens/stamp.json | goldens/blocks/*.golden.json) from=$rel ;;
      *) bad+="$rel is never in the pack; "; continue ;;
    esac
    [ "$(git -C "$bp" rev-parse -q --verify "$at:$src/$from" || true)" = "$oid" ] || bad+="$rel; "
  done < <(git ls-tree -r -z "$new" -- "$pack/")
  [ -z "$bad" ] || fail "the pack differs from Barkpark $at: $bad"
  held=$(git ls-tree -r --name-only "$new" -- "$pack/goldens/blocks/")
  git cat-file blob "$new:$pack/goldens/stamp.json" |
    jq -e --arg held "$held" '([.files | keys[] | select(startswith("blocks/")) | "conformance/pack/goldens/" + .] | sort) == ($held | split("\n") | map(select(. != "")) | sort)' >/dev/null ||
    fail "the pack's block goldens are not the ones its stamp names"

  local before after
  before=$(git cat-file blob "$staging:$report")
  after=$(git cat-file blob "$new:$report")
  git cat-file blob "$new:$report" | jq --indent 2 . >"$RUNNER_TEMP/report.json" || fail "$report is not JSON"
  [ "$(git hash-object "$RUNNER_TEMP/report.json")" = "$(git rev-parse "$new:$report")" ] || fail "$report is not as conformance writes it"
  jq -n -e --argjson a "$before" --argjson b "$after" --argjson s "$(git cat-file blob "$new:$pack/goldens/stamp.json")" --arg stamp "$stamp_sha" '
    def kept: [.rows[] | select(.status != "missing")] | sort_by(.type);
    ([$s.files | keys[] | select(startswith("blocks/") and endswith(".golden.json")) | .[7:-12]]) as $types
    | ($b | keys_unsorted) == ["renderer", "compare", "pack_stamp", "ran_at_sha", "rows"]
    and $a.renderer == $b.renderer and $a.compare == $b.compare
    and $b.pack_stamp == $stamp
    and ($b.ran_at_sha | test("^[0-9a-f]{40}$"))
    and ($a | kept) == ($b | kept)
    and [$b.rows[].type] == $types
    and ([$b.rows[] | select(.status == "missing") | keys_unsorted == ["type", "status"]] | all)' >/dev/null ||
    fail "$report is not the staging report on the new stamp: only pack_stamp, ran_at_sha and the rows Barkever does not render may change"

  message="PortableDoc pack: sync from Barkpark ${at:0:12}"$'\n\n'"Every pack file but SOURCE.md is Barkpark's own at $at, and no conformance row moved."
  sync=$(GIT_AUTHOR_NAME='github-actions[bot]' GIT_AUTHOR_EMAIL='41898282+github-actions[bot]@users.noreply.github.com' \
    GIT_COMMITTER_NAME='github-actions[bot]' GIT_COMMITTER_EMAIL='41898282+github-actions[bot]@users.noreply.github.com' git commit-tree "$new^{tree}" -p "$staging" -m "$message")
  token_push "$sync:refs/heads/staging"
  echo "staging moved to $sync: PortableDoc pack from Barkpark ${at:0:12}"
  token_gh workflow run ci.yml --ref staging
}

if [ "$action" = push ]; then push_sync; else report_issue; fi
