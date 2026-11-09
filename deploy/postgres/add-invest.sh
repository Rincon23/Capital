#!/bin/sh
# Cria, no Postgres que já está no ar, os bancos do Invest + (o app de investimentos que saiu do
# Capital +): "invest" (produção) e "invest_dev" (desenvolvimento), cada um com o seu usuário, que
# só conecta no próprio banco. Pode rodar de novo sem medo: não troca senha nem apaga nada.
#
#   cd ~/capitalapp/db && ./add-invest.sh
#
# As senhas novas ficam no .env desta pasta (INVEST_DB_PASSWORD e INVEST_DEV_DB_PASSWORD), e o
# backup diário passa a salvar também o banco "invest".
set -eu
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Falta o .env desta pasta: o banco do Capital + ainda não foi instalado (./install.sh)." >&2
  exit 1
fi
if ! docker exec capital-postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; then
  echo "O Postgres (capital-postgres) não está no ar." >&2
  exit 1
fi

umask 077
value() { grep "^$1=" .env | head -n 1 | cut -d= -f2- | tr -d '"'; }
add() {
  if [ -z "$(value "$1")" ]; then
    sed -i "/^$1=/d" .env
    echo "$1=$2" >> .env
    echo "==> $1 criada no .env"
  fi
}
add INVEST_DB_PASSWORD "$(openssl rand -hex 24)"
add INVEST_DEV_DB_PASSWORD "$(openssl rand -hex 24)"

# O backup diário: os bancos do Capital + e o do Invest +.
current=$(value BACKUP_DATABASES)
case " ${current:-capital} " in
  *" invest "*) ;;
  *)
    sed -i '/^BACKUP_DATABASES=/d' .env
    echo "BACKUP_DATABASES=\"${current:-capital} invest\"" >> .env
    echo "==> backup diário agora salva também o banco invest"
    ;;
esac

create() {
  docker exec -i capital-postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres \
    -v role="$1" -v pw="$2" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'role', :'role')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'role') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'role') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'role', :'role') \gexec
SQL
  echo "==> banco $1 pronto"
}
create invest "$(value INVEST_DB_PASSWORD)"
create invest_dev "$(value INVEST_DEV_DB_PASSWORD)"

# Só o container do backup é recriado: o Postgres segue no ar, sem reiniciar.
echo "==> aplicando o .env novo ao backup (o Postgres não reinicia)"
docker compose up -d --no-deps backup >/dev/null
echo "Pronto. A DATABASE_URL do Invest +:"
echo "  postgres://invest:<INVEST_DB_PASSWORD do .env>@capital-postgres:5432/invest"
