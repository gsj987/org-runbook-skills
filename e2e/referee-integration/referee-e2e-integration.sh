#!/bin/bash
# ============================================================
# Referee E2E Integration Test Runner
# Layer 2: Integration Tests with Real Fixtures
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
ADAPTERS_PI_DIR="$PROJECT_ROOT/adapters/pi"

echo "============================================================"
echo "  Referee E2E Integration Tests"
echo "  Layer 2: Integration with Real Fixtures"
echo "============================================================"
echo ""
echo "Project root: $PROJECT_ROOT"
echo "Adapters pi: $ADAPTERS_PI_DIR"
echo ""

# Check prerequisites
if [ ! -d "$ADAPTERS_PI_DIR" ]; then
    echo "❌ Error: adapters/pi directory not found"
    exit 1
fi

if [ ! -d "$SCRIPT_DIR/fixtures" ]; then
    echo "❌ Error: fixtures directory not found"
    exit 1
fi

# Count fixtures
FIXTURE_COUNT=$(ls -1 "$SCRIPT_DIR/fixtures"/*.org 2>/dev/null | wc -l)
echo "📁 Found $FIXTURE_COUNT fixture files:"
ls -1 "$SCRIPT_DIR/fixtures"/*.org 2>/dev/null | sed 's|.*/||' | sed 's/^/   - /'
echo ""

# Count integration tests
TEST_COUNT=$(ls -1 "$SCRIPT_DIR"/*.test.ts 2>/dev/null | wc -l)
echo "🧪 Found $TEST_COUNT integration test files:"
ls -1 "$SCRIPT_DIR"/*.test.ts 2>/dev/null | sed 's|.*/||' | sed 's/^/   - /'
echo ""

# Check node/tsx
if ! command -v npx &> /dev/null; then
    echo "❌ Error: npx not found"
    exit 1
fi

# Change to adapters/pi directory for proper module resolution
cd "$ADAPTERS_PI_DIR"

# Track results
TOTAL_FAILED=0
TOTAL_PASSED=0

# Run each integration test
echo "============================================================"
echo "  Running Integration Tests"
echo "============================================================"
echo ""

for test_file in "$SCRIPT_DIR"/*.test.ts; do
    test_name=$(basename "$test_file")
    echo "▶ Running: $test_name"
    
    # Run from adapters/pi directory for proper module resolution
    if npx tsx "$test_file" 2>&1; then
        echo "✅ $test_name: PASSED"
        ((TOTAL_PASSED++)) || true
    else
        echo "❌ $test_name: FAILED"
        ((TOTAL_FAILED++)) || true
    fi
    echo ""
done

# Summary
echo "============================================================"
echo "  Integration Test Summary"
echo "============================================================"
echo "  Files tested: $TEST_COUNT"
echo "  Passed:      $TOTAL_PASSED"
echo "  Failed:      $TOTAL_FAILED"
echo "============================================================"

if [ $TOTAL_FAILED -gt 0 ]; then
    echo "⚠️  Some integration tests failed!"
    exit 1
else
    echo "✅ All integration tests passed!"
    exit 0
fi
