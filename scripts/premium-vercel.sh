#!/usr/bin/env bash
# Arma la versión del premium real para su propio proyecto de Vercel (planilla-lud-premium.vercel.app),
# así abre en la dirección pelada, sin /premium-real/. Pone premium-real/ en la raíz y al lado lo que
# esa página lee con "../" (datos, escudos, ícono), que desde la raíz queda en el mismo lugar.
# En Vercel: Build Command = bash scripts/premium-vercel.sh · Output Directory = dist-premium
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist-premium
mkdir -p dist-premium
cp -r premium-real/. dist-premium/
cp -r data escudos dist-premium/
cp favicon.svg og.png apple-touch-icon.png chat-config.json dist-premium/
echo "Listo: dist-premium"
