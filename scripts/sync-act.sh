#!/usr/bin/env bash
set -euo pipefail
. "${BASH_SOURCE[0]%/*}/push-token.sh"

mode=${1:-}
plan="$RUNNER_TEMP/plan"
barkpark="${BARKPARK_GIT:-https://github.com/FRIKKern/barkpark}"
src=api/priv/portable_doc
pack=conformance/pack
report=conformance/barkever-blocks.json
issue_title='PortableDoc pack sync waits: conformance rows moved'
re_sha='^[0-9a-f]{40}$'
re_type='^[A-Za-z][A-Za-z0-9_-]{0,63}$'
re_source='commit `([0-9a-f]{40})`'

case "$mode" in push | report) ;; *) fail 'usage: sync-act.sh push|report' ;; esac
action=$(jq -r .action "$plan/plan.json")
[ "$action" = "$mode" ] || fail "the plan asks for $action; this job does $mode"

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

on_barkpark() {
  git -C "$bp" merge-base --is-ancestor "$was" "$bpmain" 2>/dev/null ||
    fail "Barkpark $was, which staging's SOURCE.md names, is not on Barkpark's main (history rewritten?): sync by hand once"
  git -C "$bp" merge-base --is-ancestor "$1" "$bpmain" 2>/dev/null || fail "Barkpark $1 is not on Barkpark's main"
  git -C "$bp" merge-base --is-ancestor "$was" "$1" || fail "Barkpark $1 does not hold $was, the commit staging's SOURCE.md names: an older pack is never taken"
}

note_for() {
  printf '%s\n' '# PortableDoc conformance pack' '' \
    "Written by \`scripts/pack-sync.mjs\` from \`FRIKKern/barkpark\` commit \`$1\`, path \`$src\`." \
    "Never edit it by hand: Barkpark is the source, and \`.github/workflows/sync-pack.yml\` brings it here." '' \
    '| File | sha256 |' '|---|---|' \
    "| \`conformance.mjs\` | \`$2\` |" "| \`conformance.d.mts\` | \`$3\` |" "| \`goldens/stamp.json\` | \`$4\` |" '' \
    "The block goldens are named, with their sha256, in \`goldens/stamp.json\`."
}

report_issue() {
  local source list number body="$RUNNER_TEMP/sync-issue.md" t
  source=$(jq -r .source "$plan/plan.json")
  [[ $source =~ $re_sha ]] || fail "source $source"
  on_barkpark "$source"
  list=$(jq -r '.moved | if type == "array" and length > 0 and length <= 200 then .[] | tostring else error("moved is not a list of 1 to 200 types") end' "$plan/plan.json")
  moved=()
  while IFS= read -r t; do moved+=("$t"); done <<<"$list"
  for t in "${moved[@]}"; do
    [[ $t =~ $re_type ]] || fail "moved type $t"
    git -C "$bp" rev-parse -q --verify "$source:$src/goldens/blocks/$t.golden.json" >/dev/null ||
      git cat-file blob "$staging:$report" | jq -e --arg t "$t" 'any(.rows[]; .type == $t)' >/dev/null ||
      fail "$t is no block type in Barkpark $source or in $report"
  done
  {
    printf '%s\n' "Barkpark [${source:0:12}](https://github.com/FRIKKern/barkpark/commit/$source) changes the PortableDoc pack, and Barkever's blocks no longer render as \`$report\` records for:" ''
    printf -- '- `%s`\n' "${moved[@]}"
    printf '%s\n' '' "So the daily sync pushes nothing to staging. On a branch: \`node scripts/pack-sync.mjs <a Barkpark checkout>\`, then fix the renderer, or accept the rows with \`pnpm conformance:write\` and say why in the commit. Close this issue when that lands; until then each sync brings this list up to date."
  } >"$body"
  number=$(gh issue list --state open --limit 100 --search "\"$issue_title\" in:title" --json number,title,author \
    -q '[.[] | select(.author.is_bot and .author.login == "app/github-actions" and .title == "PortableDoc pack sync waits: conformance rows moved") | .number] | first // empty')
  if [ -n "$number" ]; then
    gh issue edit "$number" --body-file "$body"
  else
    gh issue create --title "$issue_title" --body-file "$body"
  fi
}

push_sync() {
  local new=refs/sync-pack/new parent extra bad='' meta path old mode status note at h1 h2 h3 entry oid rel from held message sync
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

  note=$(git cat-file blob "$new:$pack/SOURCE.md")
  [[ $note =~ $re_source ]] || fail 'SOURCE.md names no Barkpark commit'
  at=${BASH_REMATCH[1]}
  [[ $note =~ '| `conformance.mjs` | `'([0-9a-f]{64}) ]] && h1=${BASH_REMATCH[1]} || fail 'SOURCE.md has no conformance.mjs row'
  [[ $note =~ '| `conformance.d.mts` | `'([0-9a-f]{64}) ]] && h2=${BASH_REMATCH[1]} || fail 'SOURCE.md has no conformance.d.mts row'
  [[ $note =~ '| `goldens/stamp.json` | `'([0-9a-f]{64}) ]] && h3=${BASH_REMATCH[1]} || fail 'SOURCE.md has no goldens/stamp.json row'
  [ "$note" = "$(note_for "$at" "$h1" "$h2" "$h3")" ] || fail 'SOURCE.md is not as pack-sync writes it'
  on_barkpark "$at"

  for rel in conformance.mjs conformance.d.mts goldens/stamp.json; do
    git cat-file -e "$new:$pack/$rel" 2>/dev/null || bad+="$rel absent; "
  done
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

  if git diff --quiet "$staging" "$new" -- "$report"; then
    git diff --quiet "$staging" "$new" -- "$pack/goldens/stamp.json" || fail "the stamp moved and $report did not take it"
  else
    local before after
    before=$(git cat-file blob "$staging:$report")
    after=$(git cat-file blob "$new:$report")
    [ "$after" = "$(jq --indent 2 . <<<"$after")" ] || fail "$report is not as conformance writes it"
    jq -n -e --argjson a "$before" --argjson b "$after" '
      def kept: [.rows[] | select(.status != "missing")] | sort_by(.type);
      ($b | keys) == ["compare", "pack_stamp", "ran_at_sha", "renderer", "rows"]
      and $a.renderer == $b.renderer and $a.compare == $b.compare
      and ($a | kept) == ($b | kept)
      and ($b.pack_stamp | test("^[0-9a-f]{64}$"))
      and ($b.ran_at_sha | test("^[0-9a-f]{40}$"))
      and ([$b.rows[] | select(.status == "missing") | keys == ["status", "type"] and (.type | test("^[A-Za-z][A-Za-z0-9_-]{0,63}$"))] | all)' >/dev/null ||
      fail "$report moves more than the stamp and rows Barkever does not render"
  fi

  message="PortableDoc pack: sync from Barkpark ${at:0:12}"$'\n\n'"Written by scripts/pack-sync.mjs and checked by scripts/sync-act.sh: every pack file but SOURCE.md is Barkpark's own at $at, and no conformance row moved."
  sync=$(git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit-tree "$new^{tree}" -p "$staging" -m "$message")
  token_push "$sync:refs/heads/staging"
  echo 'pushed=true' >>"$GITHUB_OUTPUT"
  echo "staging moved to $sync: PortableDoc pack from Barkpark ${at:0:12}"
}

if [ "$mode" = push ]; then push_sync; else report_issue; fi
