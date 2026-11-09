#!/bin/sh
# Roda uma única vez, na primeira inicialização do Postgres (pasta de dados vazia), como o
# 01-capital.sh. Cria os bancos do Invest + quando há senha para eles:
#   - usuário "invest",     dono do banco "invest"      (produção)
#   - usuário "invest_dev", dono do banco "invest_dev"  (desenvolvimento)
# Num Postgres que já existe, quem cria é o ./add-invest.sh.
set -eu

for pair in "invest:${INVEST_DB_PASSWORD:-}" "invest_dev:${INVEST_DEV_DB_PASSWORD:-}"; do
  name="${pair%%:*}"
  pw="${pair#*:}"
  [ -n "$pw" ] || continue
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v name="$name" -v pw="$pw" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'name', :'pw') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'name', :'name') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'name') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'name', :'name') \gexec
SQL
done
