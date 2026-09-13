#!/usr/bin/env bash
set -euo pipefail

cd "$1"
upstream_repository='Lixxx1/dsh-vscode'
release_json="$(gh api "repos/$upstream_repository/releases/latest")"
jq -e '.draft == false and .prerelease == false and .published_at != null' <<<"$release_json" >/dev/null
upstream_tag="$(jq -er '.tag_name' <<<"$release_json")"
if [[ ! "$upstream_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Expected a stable upstream vMAJOR.MINOR.PATCH release, got $upstream_tag" >&2
  exit 1
fi
upstream_commit="$(gh api "repos/$upstream_repository/commits/$upstream_tag" --jq .sha)"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git fetch --no-tags "https://github.com/$upstream_repository.git" "refs/tags/$upstream_tag"
if [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" != "$upstream_commit" ]]; then
  echo 'Upstream release tag changed during preparation' >&2
  exit 1
fi
# Merge in a disposable checkout; publish the branch only after validation.
if ! git merge --no-edit "$upstream_commit"; then
  git status --short >&2
  git merge --abort
  echo 'Upstream conflicts with daily-driver; the remote branch and releases are unchanged.' >&2
  exit 1
fi
version="$(node -p "require('./package.json').version")"
if [[ "v$version" != "$upstream_tag" ]]; then
  echo "Source version $version does not match upstream release $upstream_tag" >&2
  exit 1
fi
source_commit="$(git rev-parse HEAD)"
release_tag="daily-$upstream_tag-${source_commit:0:12}"
asset_name="dsh-sidebar-$version-daily-${source_commit:0:12}.vsix"
response_file="$RUNNER_TEMP/existing-daily-release.json"
status_code="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
  -H "Authorization: Bearer $GH_TOKEN" -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$GITHUB_REPOSITORY/releases/tags/$release_tag")"
release_exists=false
case "$status_code" in
  404) ;;
  200)
    if ! jq -e --arg asset "$asset_name" '.draft == false and (.assets | any(.name == $asset and .size > 0))' "$response_file" >/dev/null; then
      echo "Release $release_tag exists but is incomplete; inspect it before retrying." >&2
      exit 1
    fi
    release_exists=true
    ;;
  *) echo "Failed to check release: HTTP $status_code" >&2; exit 1 ;;
esac
should_build=true
if [[ "$release_exists" == true && "${FORCE_BUILD:-false}" != true ]]; then
  should_build=false
fi
{
  echo "upstream_tag=$upstream_tag"
  echo "upstream_commit=$upstream_commit"
  echo "source_commit=$source_commit"
  echo "release_tag=$release_tag"
  echo "asset_name=$asset_name"
  echo "release_exists=$release_exists"
  echo "should_build=$should_build"
} >> "$GITHUB_OUTPUT"
{
  echo "### Daily driver"
  echo "- Upstream: $upstream_repository@$upstream_tag ($upstream_commit)"
  echo "- Source: $source_commit"
  echo "- Release: $release_tag"
  echo "- Build required: $should_build"
} >> "$GITHUB_STEP_SUMMARY"
