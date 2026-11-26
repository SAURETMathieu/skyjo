#!/bin/sh
set -eu

if [ -z "${NPM_TOKEN:-}" ]; then
  echo "NPM_TOKEN est requis pour télécharger les paquets GitHub." >&2
  exit 1
fi

npm install --global corepack@latest
corepack enable
corepack pnpm config set "//npm.pkg.github.com/:_authToken" "$NPM_TOKEN"
corepack pnpm install --ignore-workspace
