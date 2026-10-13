#!/usr/bin/env bash
# Instala en Claude Code los agentes de agency-agents y el servidor MCP + skill de rea.
#
#   scripts/install-claude-tools.sh            -> global (~/.claude): disponibles en todos tus proyectos
#   scripts/install-claude-tools.sh --project  -> solo este repo (.claude/ y .mcp.json)
#
# Requisitos: git, Node.js >= 22.19 (para rea) y Claude Code.
set -euo pipefail

REA_VERSION="6.4.0"
MODE="global"
[[ "${1:-}" == "--project" ]] && MODE="project"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Agentes que más sirven para este proyecto. Con --all se instalan los 230+.
PROJECT_AGENTS="engineering-frontend-developer,engineering-video-streaming-engineer,engineering-backend-architect,engineering-software-architect,engineering-code-reviewer,engineering-mobile-app-builder,engineering-identity-access-engineer,engineering-devops-automator,design-ui-designer,design-ux-architect,testing-performance-benchmarker,testing-accessibility-auditor,testing-test-automation-engineer"

echo "==> Descargando agency-agents y rea"
git clone --quiet --depth 1 https://github.com/msitarzewski/agency-agents.git "$TMP/agency-agents"
git clone --quiet --depth 1 https://github.com/morluto/rea.git "$TMP/rea"

if [[ "$MODE" == "global" ]]; then
  echo "==> Agentes -> ~/.claude/agents (todos)"
  bash "$TMP/agency-agents/scripts/install.sh" --tool claude-code --no-interactive

  echo "==> Skill de rea -> ~/.claude/skills"
  mkdir -p "$HOME/.claude/skills"
  rm -rf "$HOME/.claude/skills/reverse-engineer-anything"
  cp -r "$TMP/rea/.agents/skills/reverse-engineer-anything" "$HOME/.claude/skills/"

  echo "==> Servidor MCP de rea (alcance usuario)"
  if command -v claude >/dev/null 2>&1; then
    claude mcp remove --scope user rea >/dev/null 2>&1 || true
    claude mcp add --scope user rea -- npx -y "rea-agents@${REA_VERSION}" mcp
  else
    echo "    No encontré el comando 'claude'. Registralo después con:"
    echo "    claude mcp add --scope user rea -- npx -y rea-agents@${REA_VERSION} mcp"
  fi
else
  echo "==> Agentes del proyecto -> .claude/agents"
  bash "$TMP/agency-agents/scripts/install.sh" --tool claude-code --no-interactive \
    --path "$ROOT/.claude/agents" --agent "$PROJECT_AGENTS"

  echo "==> Skill de rea -> .claude/skills"
  mkdir -p "$ROOT/.claude/skills"
  rm -rf "$ROOT/.claude/skills/reverse-engineer-anything"
  cp -r "$TMP/rea/.agents/skills/reverse-engineer-anything" "$ROOT/.claude/skills/"
  echo "    El servidor MCP de rea ya está declarado en .mcp.json"
fi

echo
echo "Listo. Reiniciá Claude Code para que cargue los agentes y el MCP."
echo "Para análisis de binarios nativos rea necesita además Ghidra, IDA o Hopper (opcional)."
