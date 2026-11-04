#!/usr/bin/env bash
set -euo pipefail

base=${1:-http://localhost:8080}
base=${base%/}
product_id=${2:-10}

date -Iseconds
curl -fsS -o /dev/null -w 'Web HTTP %{http_code}\n' "$base/producto/$product_id"
curl -fsS -w '\nSalud HTTP %{http_code}\n' "$base/health"
curl -fsS -o /dev/null -w 'Producto API HTTP %{http_code}\n' "$base/api/v1/productos/$product_id"
