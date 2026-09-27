#!/usr/bin/env bash
# Publishes the version in package.json to npm and tags it: `yarn release`.
#
# Stops before publishing unless everything a release needs is true: on main,
# nothing uncommitted, level with origin/main, the version not on npm yet, a
# changelog entry for it, logged in to npm, and the same checks CI runs pass
# on a fresh build. Then it shows what would be published and asks.
#
# To release: bump "version" in package.json and add its docs/ChangeLog.md
# entry in a PR; after it is merged, `git checkout main && git pull`, then
# `yarn release`. npm asks for a one-time password if the account has 2FA.
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "release: $*" >&2
  exit 1
}

name=$(node -p 'require("./package.json").name')
version=$(node -p 'require("./package.json").version')
echo "Releasing ${name}@${version}"

[ "$(git branch --show-current)" = "main" ] || fail "not on main"
[ -z "$(git status --porcelain)" ] || fail "uncommitted changes (git status)"
git fetch --quiet origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
  fail "main is not level with origin/main (git pull)"

if npm view "${name}@${version}" version >/dev/null 2>&1; then
  fail "${name}@${version} is already on npm; bump \"version\" in package.json"
fi
grep -qE "^## ${version//./\\.}( |$)" docs/ChangeLog.md ||
  fail "docs/ChangeLog.md has no \"## ${version}\" entry"
if git rev-parse --quiet --verify "refs/tags/v${version}" >/dev/null; then
  fail "the tag v${version} exists already"
fi
npm whoami >/dev/null 2>&1 || fail "not logged in to npm (npm login)"

echo "Checking (as CI does)…"
yarn install --frozen-lockfile --silent
yarn -s typecheck
yarn -s lint
yarn -s test
rm -rf dist
yarn -s build

echo
npm pack --dry-run 2>&1 | grep -E "npm notice (name|version|filename|package size|unpacked size|total files)"
echo
read -r -p "Publish ${name}@${version} to npm? [y/N] " answer
[ "${answer}" = "y" ] || [ "${answer}" = "Y" ] || fail "not published"

npm publish
git tag "v${version}"
git push --quiet origin "v${version}"
echo "Published ${name}@${version} and pushed the tag v${version}."
