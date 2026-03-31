#!/usr/bin/env bash
# E2E Test Coverage Report Generator

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_JSON="$SCRIPT_DIR/coverage-report.json"
OUTPUT_TXT="$SCRIPT_DIR/coverage-report.txt"

main() {
    # Test tracking
    declare -A SPEC_TESTS IMPLEMENTED_TESTS TEST_FILES

    # Category counts
    CATS=("Supervisor" "Workflow" "Worker" "Fencing" "State Machine" "Deploy" "Error Handling")
    declare -a CAT_TOTAL=(0 0 0 0 0 0 0)
    declare -a CAT_IMPL=(0 0 0 0 0 0 0)
    declare -a CAT_MISS=(0 0 0 0 0 0 0)

    TOTAL_SPEC=0
    TOTAL_IMPL=0
    TOTAL_MISS=0

    get_cat_idx() {
        local tid="$1"
        # Extract category: TC-SUP-001 -> TC-SUP
        local base="${tid%-[0-9]*}"
        # Handle both TC-SUP and TC-WF, etc.
        case "$base" in
            TC-SUP) echo 0 ;;
            TC-WF) echo 1 ;;
            TC-WK) echo 2 ;;
            TC-FN) echo 3 ;;
            TC-ST) echo 4 ;;
            TC-DP) echo 5 ;;
            TC-ERR) echo 6 ;;
            *) echo -1 ;;
        esac
    }

    convert_func() {
        local s="${1#test_tc_}"
        echo "TC-${s^^}" | tr '_' '-'
    }

    # Define tests
    SPEC_TESTS=(
        ["TC-SUP-001"]="Supervisor Start - Basic" ["TC-SUP-002"]="Singleton Enforcement"
        ["TC-SUP-003"]="Kill Supervisor Cleanup" ["TC-SUP-004"]="Restart Clean State"
        ["TC-SUP-005"]="Stale PID File" ["TC-SUP-006"]="Health Endpoint"
        ["TC-SUP-007"]="Log Output" ["TC-SUP-008"]="Port Conflict"
        ["TC-SUP-009"]="SIGINT Shutdown" ["TC-SUP-010"]="SIGTERM Shutdown"
        ["TC-WF-001"]="workflow.init Default" ["TC-WF-002"]="workflow.init Custom"
        ["TC-WF-003"]="workflow.init ProjectId" ["TC-WF-004"]="workflow.init Reject Existing"
        ["TC-WF-005"]="workflow.init Reject Invalid" ["TC-WF-006"]="workflow.init Parent Dirs"
        ["TC-WF-007"]="workflow.update Append" ["TC-WF-008"]="workflow.update Preserve"
        ["TC-WF-009"]="workflow.update Missing" ["TC-WF-010"]="workflow.appendFinding Valid"
        ["TC-WF-011"]="workflow.appendFinding Invalid" ["TC-WF-012"]="workflow.attachEvidence Valid"
        ["TC-WF-013"]="workflow.attachEvidence Invalid" ["TC-WF-014"]="workflow.setStatus Transitions"
        ["TC-WF-015"]="workflow.advancePhase Progression"
        ["TC-WK-001"]="worker.spawn arch-agent" ["TC-WK-002"]="worker.spawn code-agent"
        ["TC-WK-003"]="worker.spawn test-agent" ["TC-WK-004"]="worker.spawn ops-agent"
        ["TC-WK-005"]="worker.spawn pm-agent" ["TC-WK-006"]="worker.spawn research-agent"
        ["TC-WK-007"]="worker.spawn ux-agent" ["TC-WK-008"]="worker.spawn api-agent"
        ["TC-WK-009"]="worker.spawn qa-agent" ["TC-WK-010"]="worker.spawn integration-agent"
        ["TC-WK-011"]="worker.spawn deploy-agent" ["TC-WK-012"]="worker.spawn deps-agent"
        ["TC-WK-013"]="worker.spawn security-agent" ["TC-WK-014"]="worker.spawn perf-agent"
        ["TC-WK-015"]="worker.spawn data-agent" ["TC-WK-016"]="worker.spawn orchestrator"
        ["TC-WK-017"]="worker.awaitResult Success" ["TC-WK-018"]="worker.awaitResult Timeout"
        ["TC-WK-019"]="worker.status Running" ["TC-WK-020"]="Multiple Workers Isolation"
        ["TC-FN-001"]="code-agent Tool Restrictions" ["TC-FN-002"]="test-agent Tool Restrictions"
        ["TC-FN-003"]="ops-agent Tool Restrictions" ["TC-FN-004"]="research-agent Tool Restrictions"
        ["TC-FN-005"]="orchestrator Full Access" ["TC-FN-006"]="Protected /path/to/secrets"
        ["TC-FN-007"]="Protected /path/to/prod" ["TC-FN-008"]="Protected /.pi/secrets"
        ["TC-FN-009"]="Protected /.ssh" ["TC-FN-010"]="Orchestrator Non-Execution Rule"
        ["TC-ST-001"]="Task TODO to IN-PROGRESS" ["TC-ST-002"]="Task IN-PROGRESS to DONE"
        ["TC-ST-003"]="Task IN-PROGRESS to BLOCKED" ["TC-ST-004"]="Task BLOCKED to IN-PROGRESS"
        ["TC-ST-005"]="Phase Discovery to Design" ["TC-ST-006"]="Phase Design to Implementation"
        ["TC-ST-007"]="Phase Full Cycle" ["TC-ST-008"]="Invalid TODO to DONE"
        ["TC-ST-009"]="Invalid Phase Jump" ["TC-ST-010"]="Finding F-uuid Preservation"
        ["TC-DP-001"]="deploy.sh Basic" ["TC-DP-002"]="deploy.sh --force"
        ["TC-DP-003"]="deploy.sh Clean State" ["TC-DP-004"]="deploy.sh --remove"
        ["TC-DP-005"]="deploy.sh --help" ["TC-DP-006"]="deploy.sh Invalid Path"
        ["TC-DP-007"]="deploy.sh --global" ["TC-DP-008"]="Verify Skills"
        ["TC-DP-009"]="Verify Adapter" ["TC-DP-010"]="Settings Updated"
        ["TC-ERR-001"]="Supervisor Unavailable" ["TC-ERR-002"]="Invalid Parameters"
        ["TC-ERR-003"]="Worker Timeout Default" ["TC-ERR-004"]="Worker Timeout Custom"
        ["TC-ERR-005"]="Concurrent Spawn" ["TC-ERR-006"]="Malformed workflow.org"
        ["TC-ERR-007"]="Missing workflow.org" ["TC-ERR-008"]="Network Timeout"
        ["TC-ERR-009"]="PID File Corruption" ["TC-ERR-010"]="Extension Load Failure"
    )

    # Scan test files
    echo "Scanning test files..."
    while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        [[ "$f" =~ (run-all|generate-coverage|pi-adapter-extension)\.sh$ ]] && continue
        fname=$(basename "$f")
        echo "  Scanning: $fname"
        while IFS= read -r func; do
            tid=$(convert_func "$func")
            if [[ -n "${SPEC_TESTS[$tid]:-}" ]]; then
                IMPLEMENTED_TESTS[$tid]=1
                TEST_FILES[$tid]="$fname"
                echo "    Found: $tid"
            fi
        done < <(grep -oE 'test_tc_[a-z]+_[0-9]{3}' "$f" 2>/dev/null | sort -u)
    done < <(find "$SCRIPT_DIR" -maxdepth 1 -name "*.sh" -type f 2>/dev/null | sort)

    # Compare with spec
    echo "Comparing against specification..."
    for tid in "${!SPEC_TESTS[@]}"; do
        ((TOTAL_SPEC++))
        idx=$(get_cat_idx "$tid")
        [[ $idx -ge 0 ]] && CAT_TOTAL[$idx]=$((CAT_TOTAL[$idx] + 1))
        
        if [[ -z "${IMPLEMENTED_TESTS[$tid]:-}" ]]; then
            ((TOTAL_MISS++))
            [[ $idx -ge 0 ]] && CAT_MISS[$idx]=$((CAT_MISS[$idx] + 1))
        else
            ((TOTAL_IMPL++))
            [[ $idx -ge 0 ]] && CAT_IMPL[$idx]=$((CAT_IMPL[$idx] + 1))
        fi
    done

    overall_pct=0
    [[ $TOTAL_SPEC -gt 0 ]] && overall_pct=$((TOTAL_IMPL * 100 / TOTAL_SPEC))

    echo ""
    echo "========================================"
    echo "     Coverage Report Summary"
    echo "========================================"
    echo ""
    echo "  Total Specified:  $TOTAL_SPEC"
    echo "  Total Implemented: $TOTAL_IMPL"
    echo "  Total Missing:    $TOTAL_MISS"
    echo ""
    echo "  Overall Coverage: ${overall_pct}%"
    echo ""
    echo "  Coverage by Category:"
    echo ""
    
    for i in "${!CATS[@]}"; do
        tot=${CAT_TOTAL[$i]}
        imp=${CAT_IMPL[$i]}
        pct=0
        [[ $tot -gt 0 ]] && pct=$((imp * 100 / tot))
        printf "    %-15s: %2d/%2d (%3d%%)\n" "${CATS[$i]}" "$imp" "$tot" "$pct"
    done
    echo ""
    echo "  Reports:"
    echo "    - $OUTPUT_JSON"
    echo "    - $OUTPUT_TXT"
    echo ""

    # Generate JSON
    {
        echo "{"
        echo "  \"report\": {"
        echo "    \"generated_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "    \"total_spec\": $TOTAL_SPEC,"
        echo "    \"total_implemented\": $TOTAL_IMPL,"
        echo "    \"total_missing\": $TOTAL_MISS,"
        echo "    \"overall_coverage_percent\": $overall_pct"
        echo "  },"
        echo "  \"categories\": {"
        first=1
        for i in "${!CATS[@]}"; do
            [[ $first -eq 0 ]] && echo ","
            first=0
            tot=${CAT_TOTAL[$i]}
            imp=${CAT_IMPL[$i]}
            mis=${CAT_MISS[$i]}
            pct=0
            [[ $tot -gt 0 ]] && pct=$((imp * 100 / tot))
            echo "    \"${CATS[$i]}\": {\"total\": $tot, \"implemented\": $imp, \"missing\": $mis, \"coverage_percent\": $pct}"
        done
        echo "  }"
        echo "}"
    } > "$OUTPUT_JSON"

    # Generate Text
    {
        echo "================================================================================"
        echo "                    E2E Test Coverage Report"
        echo "================================================================================"
        echo "Generated: $(date)"
        echo ""
        echo "Total Tests Specified:   $TOTAL_SPEC"
        echo "Total Tests Implemented: $TOTAL_IMPL"
        echo "Total Tests Missing:     $TOTAL_MISS"
        echo "Overall Coverage:        ${overall_pct}%"
        echo ""
        echo "COVERAGE BY CATEGORY"
        echo "--------------------------------------------------------------------------------"
        printf "| %-15s | %11s | %7s | %5s | %8s |\n" "Category" "Implemented" "Missing" "Total" "Coverage"
        echo "|-----------------|-------------|---------|-------|----------|"
        for i in "${!CATS[@]}"; do
            tot=${CAT_TOTAL[$i]}
            imp=${CAT_IMPL[$i]}
            mis=${CAT_MISS[$i]}
            pct=0
            [[ $tot -gt 0 ]] && pct=$((imp * 100 / tot))
            printf "| %-15s | %11s | %7s | %5s | %7s%% |\n" \
                "${CATS[$i]}" "$imp" "$mis" "$tot" "$pct"
        done
        echo "|-----------------|-------------|---------|-------|----------|"
        printf "| %-15s | %11s | %7s | %5s | %7s%% |\n" \
            "TOTAL" "$TOTAL_IMPL" "$TOTAL_MISS" "$TOTAL_SPEC" "$overall_pct"
        echo ""
        if [[ $TOTAL_MISS -eq 0 ]]; then
            echo "  All tests are implemented!"
        else
            echo "  Missing tests:"
            echo ""
            for tid in $(printf '%s\n' "${!SPEC_TESTS[@]}" | sort); do
                [[ -n "${IMPLEMENTED_TESTS[$tid]:-}" ]] && continue
                idx=$(get_cat_idx "$tid")
                cat="${CATS[$idx]}"
                echo "    $tid [$cat] - ${SPEC_TESTS[$tid]}"
            done
        fi
        echo ""
        echo "================================================================================"
    } > "$OUTPUT_TXT"

    echo "Done!"
}

main
