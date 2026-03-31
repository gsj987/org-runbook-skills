#!/bin/bash
# e2e/pi-adapter-extension.sh
# E2E test for pi-adapter extension
# Tests the complete workflow: deploy, spawn worker, run task, verify results
#
# Usage: ./e2e/pi-adapter-extension.sh
#
# This test verifies:
# 1. Clean deploy works (delete .pi, redeploy)
# 2. Supervisor starts correctly with proper CWD
# 3. Worker spawns and executes task
# 4. Worker output is captured correctly
# 5. No errors or warnings in supervisor log

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULT_FILE="/tmp/pi-adapter-e2e-result.txt"
ERRORS=0

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; ((ERRORS++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

cleanup() {
    log_info "Cleaning up..."
    fuser -k 3847/tcp 2>/dev/null || true
    pkill -f "ts-node.*protocol" 2>/dev/null || true
    sleep 2
}

check_supervisor() {
    local max_attempts=15
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3847/health > /dev/null 2>&1; then
            return 0
        fi
        ((attempt++))
        sleep 1
    done
    return 1
}

wait_for_worker() {
    local max_wait=60
    local waited=0
    while [ $waited -lt $max_wait ]; do
        if curl -s http://localhost:3847/workers 2>/dev/null | grep -q '"status":"completed"'; then
            return 0
        fi
        sleep 2
        ((waited+=2))
    done
    return 1
}

# ============================================================
# STEP 1: Clean environment
# ============================================================
step1_clean() {
    echo ""
    echo "=========================================="
    echo "STEP 1: Clean Environment"
    echo "=========================================="
    
    # Kill supervisor
    cleanup
    
    # Remove .pi directory and test files
    rm -rf "$PROJECT_DIR/.pi"
    rm -f "$PROJECT_DIR/runbook/999-e2e-test.org"
    rm -f "$RESULT_FILE"
    
    # Verify cleanup
    if [ -d "$PROJECT_DIR/.pi" ]; then
        log_error ".pi directory still exists"
        return 1
    fi
    log_success ".pi directory removed"
    
    # Verify port is free
    if fuser 3847/tcp 2>/dev/null; then
        log_error "Port 3847 still in use"
        return 1
    fi
    log_success "Port 3847 is free"
    
    return 0
}

# ============================================================
# STEP 2: Deploy
# ============================================================
step2_deploy() {
    echo ""
    echo "=========================================="
    echo "STEP 2: Deploy"
    echo "=========================================="
    
    cd "$PROJECT_DIR"
    ./deploy.sh --project . > /tmp/deploy.log 2>&1
    
    if [ $? -ne 0 ]; then
        log_error "Deploy failed"
        cat /tmp/deploy.log
        return 1
    fi
    log_success "Deploy completed"
    
    # Verify deployment
    if [ ! -d "$PROJECT_DIR/.pi/extensions/pi-adapter" ]; then
        log_error "pi-adapter not deployed"
        return 1
    fi
    log_success "pi-adapter extension deployed"
    
    return 0
}

# ============================================================
# STEP 3: Start supervisor
# ============================================================
step3_start_supervisor() {
    echo ""
    echo "=========================================="
    echo "STEP 3: Start Supervisor"
    echo "=========================================="
    
    cd "$PROJECT_DIR/.pi/extensions/pi-adapter"
    rm -f ~/.pi-adapter-supervisor.pid
    rm -rf ~/.pi-adapter/logs/*  # Clean old logs
    
    # Start supervisor in background
    npx ts-node --esm protocol.ts > /tmp/supervisor-e2e.log 2>&1 &
    
    # Wait for supervisor to be ready
    if ! check_supervisor; then
        log_error "Supervisor failed to start"
        cat /tmp/supervisor-e2e.log
        return 1
    fi
    
    sleep 1
    log_success "Supervisor started"
    
    return 0
}

# ============================================================
# STEP 4: Run pi with fixed prompt
# ============================================================
step4_run_pi() {
    echo ""
    echo "=========================================="
    echo "STEP 4: Run pi with orchestrator task"
    echo "=========================================="
    
    cd "$PROJECT_DIR"
    
    # Run pi with timeout - it will be killed after timeout
    timeout 90 pi -p -- .pi/skills/orchestrator-skill 2>&1 << 'EOF' > /tmp/pi-e2e-output.log
As orchestrator:
1. Create a runbook at runbook/999-e2e-test.org using workflow.init
2. Spawn an ops-agent worker that lists files with 'ls -la' and saves to /tmp/pi-adapter-e2e-result.txt
3. Wait for worker to complete
4. Report status
EOF
    
    PI_EXIT=$?
    
    echo ""
    log_info "pi command exit code: $PI_EXIT (124 = timeout, which is OK)"
    
    # Give worker time to complete if it just did
    sleep 3
    
    return 0
}

# ============================================================
# STEP 5: Verify results
# ============================================================
step5_verify() {
    echo ""
    echo "=========================================="
    echo "STEP 5: Verify Results"
    echo "=========================================="
    
    local failed=0
    local log_file=$(ls -t ~/.pi-adapter/logs/supervisor-*.log 2>/dev/null | head -1)
    
    # Check 1: Result file exists
    if [ -f "$RESULT_FILE" ]; then
        log_success "Result file exists: $RESULT_FILE"
    else
        log_error "Result file not found: $RESULT_FILE"
        ((failed++))
    fi
    
    # Check 2: Result file has content
    if [ -f "$RESULT_FILE" ] && [ -s "$RESULT_FILE" ]; then
        log_success "Result file has content ($(wc -l < "$RESULT_FILE") lines)"
    else
        log_error "Result file is empty"
        ((failed++))
    fi
    
    # Check 3: Runbook was created
    if [ -f "$PROJECT_DIR/runbook/999-e2e-test.org" ]; then
        log_success "Runbook created: runbook/999-e2e-test.org"
    else
        log_error "Runbook not created"
        ((failed++))
    fi
    
    # Check 4: Supervisor log has no errors
    if [ -f "$log_file" ]; then
        local errors=$(grep -c "ERROR" "$log_file" 2>/dev/null | head -1 || echo "0")
        errors=${errors//[[:space:]]/}  # Remove whitespace
        local bad_requests=$(grep -c "/worker//" "$log_file" 2>/dev/null | head -1 || echo "0")
        bad_requests=${bad_requests//[[:space:]]/}  # Remove whitespace
        
        if [ "$errors" = "0" ]; then
            log_success "No errors in supervisor log"
        else
            log_error "Found $errors error(s) in supervisor log"
            grep "ERROR" "$log_file" | tail -3
            ((failed++))
        fi
        
        if [ "$bad_requests" = "0" ]; then
            log_success "No empty workerId requests"
        else
            log_error "Found $bad_requests empty workerId requests"
            ((failed++))
        fi
        
        # Check for successful worker completion
        if grep -q "Worker.*exited with code 0" "$log_file"; then
            log_success "Worker completed successfully"
        else
            log_error "Worker did not complete successfully"
            ((failed++))
        fi
    else
        log_error "No supervisor log found"
        ((failed++))
    fi
    
    # Check 5: Supervisor is still healthy
    local health=$(curl -s http://localhost:3847/health 2>/dev/null)
    if echo "$health" | grep -q '"status":"ok"'; then
        log_success "Supervisor is healthy"
    else
        log_error "Supervisor is not healthy: $health"
        ((failed++))
    fi
    
    return $failed
}

# ============================================================
# Cleanup
# ============================================================
final_cleanup() {
    echo ""
    echo "=========================================="
    echo "Cleanup"
    echo "=========================================="
    
    # Kill supervisor
    fuser -k 3847/tcp 2>/dev/null || true
    pkill -f "ts-node.*protocol" 2>/dev/null || true
    
    # Remove test files
    rm -f "$PROJECT_DIR/runbook/999-e2e-test.org"
    rm -f "$RESULT_FILE"
    
    log_info "Cleanup done"
}

# ============================================================
# Main
# ============================================================
main() {
    echo ""
    echo "=========================================="
    echo "  pi-adapter Extension E2E Test"
    echo "=========================================="
    echo "Project: $PROJECT_DIR"
    echo "Date: $(date)"
    echo ""
    
    # Run cleanup on exit
    trap final_cleanup EXIT
    
    # Run steps
    step1_clean || exit 1
    step2_deploy || exit 1
    step3_start_supervisor || exit 1
    step4_run_pi || exit 1
    step5_verify || exit 1
    
    echo ""
    echo "=========================================="
    echo "  E2E Test Complete"
    echo "=========================================="
    
    if [ $ERRORS -eq 0 ]; then
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
        exit 0
    else
        echo -e "${RED}❌ $ERRORS TEST(S) FAILED${NC}"
        exit 1
    fi
}

main "$@"
