#!/bin/bash
# deploy.sh - Deploy org-runbook-skills
# Usage: 
#   ./deploy.sh                    # Deploy to current project (.pi/) [default]
#   ./deploy.sh --global           # Deploy to ~/.pi/agent (global)
#   ./deploy.sh --project <path>   # Deploy to specific project
#   ./deploy.sh --force            # Overwrite existing
#   ./deploy.sh --remove           # Remove from project

set -e

# Configuration
PI_DIR="${PI_DIR:-$HOME/.pi/agent}"
SKILLS_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE=""
MODE="project"
PROJECT_DIR="."
REMOVE=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE="--force"
            shift
            ;;
        --global)
            MODE="global"
            shift
            ;;
        --project)
            MODE="project"
            PROJECT_DIR="$2"
            shift 2
            ;;
        --remove)
            REMOVE="yes"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --project <path>   Deploy to project .pi/ directory (default: current dir)"
            echo "  --global           Deploy to ~/.pi/agent (global)"
            echo "  --force            Overwrite existing skills"
            echo "  --remove           Remove from project"
            echo "  --help, -h         Show this help"
            echo ""
            echo "Examples:"
            echo "  ./deploy.sh                    # Deploy to current project (default)"
            echo "  ./deploy.sh --project .        # Same as above"
            echo "  ./deploy.sh --global           # Global install"
            echo "  ./deploy.sh --project ~/proj   # Specific project"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Determine target directories
if [ "$MODE" = "project" ]; then
    if [ -z "$PROJECT_DIR" ]; then
        echo -e "${RED}✗ Error: --project requires a path${NC}"
        exit 1
    fi
    TARGET_DIR="$(cd "$PROJECT_DIR" && pwd)/.pi"
    SKILLS_DIR="$TARGET_DIR/skills"
    ADAPTERS_DIR="$TARGET_DIR/adapters"
else
    # Global mode
    TARGET_DIR="$PI_DIR"
    SKILLS_DIR="$PI_DIR/skills"
    ADAPTERS_DIR="$PI_DIR/adapters"
fi

# ============================================================
# Remove from project
# ============================================================
if [ "$REMOVE" = "yes" ]; then
    if [ "$MODE" = "global" ]; then
        echo -e "${RED}✗ Error: --remove only works with --project${NC}"
        exit 1
    fi
    
    echo "Removing org-runbook-skills from project..."
    echo "Target: $TARGET_DIR"
    
    # Remove skills
    for skill in runbook-org runbook-multiagent runbook-brainstorm orchestrator-skill exception-routing; do
        if [ -d "$SKILLS_DIR/$skill" ]; then
            rm -rf "$SKILLS_DIR/$skill"
            echo -e "  ${YELLOW}✓${NC} Removed $skill"
        fi
    done
    
    # Remove adapter extension directory
    if [ -d "$TARGET_DIR/extensions/pi-adapter" ]; then
        rm -rf "$TARGET_DIR/extensions/pi-adapter"
        echo -e "  ${YELLOW}✓${NC} Removed pi-adapter"
    fi
    
    # Backup and remove settings
    if [ -f "$TARGET_DIR/settings.json" ]; then
        cp "$TARGET_DIR/settings.json" "$TARGET_DIR/settings.json.bak"
        echo -e "  ${YELLOW}✓${NC} Backed up settings.json → settings.json.bak"
        
        # Remove org-runbook entries from settings
        python3 -c "
import json
with open('$TARGET_DIR/settings.json', 'r') as f:
    data = json.load(f)
if 'extensions' in data:
    del data['extensions']
if 'skills' in data:
    data['skills'] = [s for s in data['skills'] if not any(x in s for x in ['runbook', 'orchestrator', 'exception'])]
with open('$TARGET_DIR/settings.json', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || echo -e "  ${YELLOW}⚠${NC} Could not update settings.json, manually edit it"
    fi
    
    echo ""
    echo -e "${GREEN}✓ Removed from project${NC}"
    exit 0
fi

# ============================================================
# Deploy
# ============================================================

echo "=========================================="
echo "  org-runbook-skills Deploy"
echo "=========================================="
echo ""
echo "Mode: ${MODE}"
echo "Source: $SKILLS_SOURCE"
echo "Target: $TARGET_DIR"
if [ "$MODE" = "project" ]; then
    echo "Skills: $SKILLS_DIR"
fi
echo ""

# Skills to deploy
SKILLS=(
    "runbook-org"
    "runbook-multiagent"
    "runbook-brainstorm"
    "orchestrator-skill"
    "exception-routing"
)

# Function to deploy a skill directory
deploy_skill() {
    local skill_name="$1"
    local source_path="$SKILLS_SOURCE/$skill_name"
    local target_path="$SKILLS_DIR/$skill_name"
    
    if [ ! -d "$source_path" ]; then
        echo -e "${YELLOW}⚠ Skip $skill_name: source not found${NC}"
        return 1
    fi
    
    # Remove old files
    if [ -d "$target_path" ]; then
        rm -f "$target_path"/*.md 2>/dev/null || true
        rm -f "$target_path"/*.mdwn 2>/dev/null || true
    fi
    
    if [ -d "$target_path" ] && [ "$FORCE" != "--force" ]; then
        echo -e "${YELLOW}⚠ $skill_name exists. Use --force to overwrite${NC}"
        return 0
    fi
    
    mkdir -p "$target_path"
    cp -r "$source_path"/* "$target_path/"
    
    echo -e "${GREEN}✓${NC} Deployed $skill_name"
}

# Function to deploy pi-adapter extension
deploy_adapter() {
    local source_dir="$SKILLS_SOURCE/adapters/pi"
    local target_dir="$TARGET_DIR/extensions/pi-adapter"
    
    if [ ! -f "$source_dir/extension.ts" ]; then
        echo -e "${YELLOW}⚠ pi-adapter extension.ts not found${NC}"
        return 1
    fi
    
    mkdir -p "$target_dir"
    
    # Copy extension as index.ts (pi auto-discovers from subdirectory index)
    cp -f "$source_dir/extension.ts" "$target_dir/index.ts"
    
    # Copy package.json and install dependencies
    cp -f "$source_dir/package.json" "$target_dir/"
    
    echo -e "${BLUE}→${NC} Installing dependencies..."
    (cd "$target_dir" && npm install) || {
        echo -e "${RED}✗ npm install failed in $target_dir${NC}"
        echo "Please run manually: cd $target_dir && npm install"
        return 1
    }
    
    echo -e "${GREEN}✓${NC} Deployed pi-adapter to $target_dir"
}

# ============================================================
# Global mode deployment
# ============================================================
if [ "$MODE" = "global" ]; then
    # Check if pi directory exists
    if [ ! -d "$PI_DIR" ]; then
        echo -e "${RED}✗ Error: PI directory not found: $PI_DIR${NC}"
        exit 1
    fi
    
    echo "Deploying skills..."
    for skill in "${SKILLS[@]}"; do
        deploy_skill "$skill"
    done
    
    echo ""
    echo "Deploying adapters..."
    deploy_adapter
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}✓ Global deployment complete!${NC}"
    echo "=========================================="
    echo ""
    echo "Skills: $SKILLS_DIR/"
    for skill in "${SKILLS[@]}"; do
        echo "  - $skill"
    done
    
    echo ""
    echo "Trigger words:"
    echo "  @runbook-org      - Single agent task"
    echo "  @orchestrate      - Multi-agent orchestrator"
    echo "  @exception        - Exception handling"
    
# ============================================================
# Project mode deployment
# ============================================================
else
    echo -e "${BLUE}→ Deploying to project${NC}"
    
    # Create directories
    mkdir -p "$SKILLS_DIR"
    mkdir -p "$TARGET_DIR/extensions"
    
    # Deploy skills
    echo "Deploying skills..."
    for skill in "${SKILLS[@]}"; do
        deploy_skill "$skill"
    done
    
    # Deploy adapter extension
    echo ""
    echo "Deploying adapter extension..."
    deploy_adapter
    
    # Update/create settings.json
    echo ""
    echo -e "${BLUE}→ Updating settings.json${NC}"
    
    SETTINGS_FILE="$TARGET_DIR/settings.json"
    
    if [ -f "$SETTINGS_FILE" ]; then
        # Backup
        cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
        
        # Update existing settings (pass values as arguments, not env vars)
        python3 - "$SETTINGS_FILE" << 'PYTHON'
import json
import sys

settings_file = sys.argv[1]

with open(settings_file, 'r') as f:
    data = json.load(f)

# Remove old extension paths (extension is now auto-discovered from .pi/extensions/*.ts)
if 'extensions' in data:
    del data['extensions']

# Add skills
skills = data.get('skills', [])
skill_paths = [
    ".pi/skills/runbook-org",
    ".pi/skills/runbook-multiagent",
    ".pi/skills/runbook-brainstorm",
    ".pi/skills/orchestrator-skill",
    ".pi/skills/exception-routing"
]
for sp in skill_paths:
    if sp not in skills:
        skills.append(sp)
data['skills'] = skills

# Enable skill commands
data['enableSkillCommands'] = True

with open(settings_file, 'w') as f:
    json.dump(data, f, indent=2)

print("✓ Updated settings.json")
PYTHON
    else
        # Create new settings
        cat > "$SETTINGS_FILE" << 'EOF'
{
  "description": "org-runbook-skills - project local",
  "skills": [
    ".pi/skills/runbook-org",
    ".pi/skills/runbook-multiagent",
    ".pi/skills/runbook-brainstorm",
    ".pi/skills/orchestrator-skill",
    ".pi/skills/exception-routing"
  ],
  "enableSkillCommands": true
}
EOF
        echo -e "${GREEN}✓${NC} Created settings.json"
    fi
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}✓ Project deployment complete!${NC}"
    echo "=========================================="
    echo ""
    echo "Project: $PROJECT_DIR"
    echo "Config: $TARGET_DIR/settings.json"
    echo ""
    echo "Now run:"
    echo "  cd $PROJECT_DIR"
    echo "  pi"
    echo ""
    echo "Trigger words:"
    echo "  @runbook-org      - Single agent task"
    echo "  @orchestrate      - Multi-agent orchestrator"
    echo "  @exception        - Exception handling"
fi

echo ""
