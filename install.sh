#!/usr/bin/env bash
set -euo pipefail

GITHUB_OUTPUT="${GITHUB_OUTPUT:-/dev/null}"
GITHUB_PATH="${GITHUB_PATH:-/dev/null}"

DPRINT_VERSION="${DPRINT_VERSION:-latest}"

if command -v dprint >/dev/null 2>&1; then
	echo "::notice::dprint is already installed; using existing binary"
	location="$(command -v dprint)"
else
	if [[ "${DPRINT_VERSION}" == "latest" ]]; then
		curl -fsSL https://dprint.dev/install.sh | sh
	else
		curl -fsSL https://dprint.dev/install.sh | sh -s "${DPRINT_VERSION}"
	fi
	location="${HOME}/.dprint/bin/dprint"
fi

if [[ ! -x "${location}" ]]; then
	echo "::error::dprint not found or not executable at: ${location}"
	exit 1
fi

v="$("${location}" --version)"
echo "location=${location}" >>"${GITHUB_OUTPUT}"
echo "version=${v##* }" >>"${GITHUB_OUTPUT}"

dirname "${location}" >>"${GITHUB_PATH}"
