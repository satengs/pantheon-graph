#!/usr/bin/env bash
# Register and run a GitHub Actions self-hosted runner for satengs/pantheon-graph.
# Usage:
#   RUNNER_TOKEN=... ./scripts/github-self-hosted-runner.sh
# Token: repo → Settings → Actions → Runners → New self-hosted runner
set -euo pipefail

REPO="${GH_REPO:-satengs/pantheon-graph}"
NAME="${RUNNER_NAME:-pantheon-graph-$(hostname -s 2>/dev/null || echo runner)}"
LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,pantheon-graph}"
DIR="${RUNNER_DIR:-$HOME/actions-runner}"

if [[ -z "${RUNNER_TOKEN:-}" ]]; then
  echo "Set RUNNER_TOKEN to a registration token from"
  echo "  https://github.com/${REPO}/settings/actions/runners/new"
  exit 1
fi

mkdir -p "$DIR"
cd "$DIR"

os="linux"
arch="$(uname -m)"
case "$arch" in
  x86_64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *) echo "unsupported arch: $arch"; exit 1 ;;
esac

if [[ ! -x ./run.sh ]]; then
  api="https://api.github.com/repos/actions/runner/releases/latest"
  tag="$(curl -fsSL "$api" | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])')"
  ver="${tag#v}"
  tarball="actions-runner-${os}-${arch}-${ver}.tar.gz"
  curl -fsSL -o "$tarball" \
    "https://github.com/actions/runner/releases/download/${tag}/${tarball}"
  tar xzf "$tarball"
  rm -f "$tarball"
fi

if [[ ! -f .runner ]]; then
  ./config.sh --unattended \
    --url "https://github.com/${REPO}" \
    --token "$RUNNER_TOKEN" \
    --name "$NAME" \
    --labels "$LABELS" \
    --work _work \
    --replace
fi

exec ./run.sh
