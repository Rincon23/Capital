#!/usr/bin/env bash
# Atualiza o Capital neste host: puxa o código novo, reconstrói a imagem e
# reinicia o container. Rode na pasta do projeto:  ./update.sh
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env.local ]; then
  echo "Falta .env.local — copie de .env.example e preencha antes de atualizar." >&2
  exit 1
fi

dc() { docker compose --env-file .env.local "$@"; }

echo "==> git pull"
git pull --ff-only

echo "==> build + up (reconstrói se código / build args mudaram)"
dc up -d --build

echo "==> removendo imagens órfãs"
docker image prune -f >/dev/null || true

echo "==> status"
dc ps
echo
dc logs --tail=20 capital
