fail() {
  local m=${1//'%'/%25}
  m=${m//$'\r'/%0D}
  printf '::error::%s\n' "${m//$'\n'/%0A}"
  exit 1
}

act_token=${ACT_TOKEN:-}
unset ACT_TOKEN

token_push() {
  [ -n "$act_token" ] || fail 'no token'
  SYNC_PUSH_TOKEN=$act_token GIT_TERMINAL_PROMPT=0 git -c credential.helper= \
    -c 'credential.helper=!f() { test "$1" = get && printf "username=x-access-token\npassword=%s\n" "$SYNC_PUSH_TOKEN"; }; f' \
    push -q "${PUSH_URL:-https://github.com/$GH_REPO.git}" "$1"
}

token_gh() {
  [ -n "$act_token" ] || fail 'no token'
  GH_TOKEN=$act_token gh "$@"
}
