#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - Assertion Library
# =============================================================================
# Provides assertion functions for E2E tests
# =============================================================================

set -euo pipefail

# Source color codes from setup.sh if available
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Track assertion counts
ASSERT_PASSED=0
ASSERT_FAILED=0

# -----------------------------------------------------------------------------
# Core Assertion Functions
# -----------------------------------------------------------------------------

# Assert two values are equal
# Usage: assert_equals "expected" "actual" ["message"]
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Value mismatch}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ "$expected" != "$actual" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Expected: '$expected'${NC}"
        echo -e "  ${RED}Actual:   '$actual'${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a string contains a substring
# Usage: assert_contains "string" "substring" ["message"]
assert_contains() {
    local string="$1"
    local substring="$2"
    local message="${3:-String does not contain substring}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ "$string" != *"$substring"* ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}String: '$string'${NC}"
        echo -e "  ${RED}Expected to contain: '$substring'${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a string does NOT contain a substring
# Usage: assert_not_contains "string" "substring" ["message"]
assert_not_contains() {
    local string="$1"
    local substring="$2"
    local message="${3:-String should not contain substring}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ "$string" == *"$substring"* ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}String: '$string'${NC}"
        echo -e "  ${RED}Should NOT contain: '$substring'${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a file exists
# Usage: assert_file_exists "/path/to/file" ["message"]
assert_file_exists() {
    local file="$1"
    local message="${2:-File should exist: $file}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ ! -f "$file" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}File not found: $file${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a file does NOT exist
# Usage: assert_file_not_exists "/path/to/file" ["message"]
assert_file_not_exists() {
    local file="$1"
    local message="${2:-File should not exist: $file}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ -f "$file" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}File exists: $file${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a directory exists
# Usage: assert_dir_exists "/path/to/dir" ["message"]
assert_dir_exists() {
    local dir="$1"
    local message="${2:-Directory should exist: $dir}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ ! -d "$dir" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Directory not found: $dir${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a directory does NOT exist
# Usage: assert_dir_not_exists "/path/to/dir" ["message"]
assert_dir_not_exists() {
    local dir="$1"
    local message="${2:-Directory should not exist: $dir}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ -d "$dir" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Directory exists: $dir${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert HTTP endpoint returns 200 OK
# Usage: assert_http_ok "http://url" ["message"]
assert_http_ok() {
    local url="$1"
    local message="${2:-HTTP request should succeed: $url}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [[ "$http_code" != "200" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Expected HTTP 200, got: $http_code${NC}"
        echo -e "  ${RED}URL: $url${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert HTTP endpoint returns specific status code
# Usage: assert_http_status "http://url" "status_code" ["message"]
assert_http_status() {
    local url="$1"
    local expected_code="$2"
    local message="${3:-HTTP status code check}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [[ "$http_code" != "$expected_code" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Expected HTTP $expected_code, got: $http_code${NC}"
        echo -e "  ${RED}URL: $url${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a PID is alive (process running)
# Usage: assert_pid_alive "pid" ["message"]
assert_pid_alive() {
    local pid="$1"
    local message="${2:-Process should be alive: $pid}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if ! kill -0 "$pid" 2>/dev/null; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Process not running: $pid${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a PID is dead (process not running)
# Usage: assert_pid_dead "pid" ["message"]
assert_pid_dead() {
    local pid="$1"
    local message="${2:-Process should be dead: $pid}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if kill -0 "$pid" 2>/dev/null; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Process still running: $pid${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert two JSON values are equal
# Usage: assert_json_equals "json" "key" "expected_value" ["message"]
assert_json_equals() {
    local json="$1"
    local key="$2"
    local expected="$3"
    local message="${4:-JSON key value mismatch}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    local actual
    actual=$(echo "$json" | grep -o "\"${key}\":[^,}]*" | cut -d':' -f2 | tr -d '"' | tr -d ' ' || echo "")
    
    if [[ "$expected" != "$actual" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Key: $key${NC}"
        echo -e "  ${RED}Expected: '$expected'${NC}"
        echo -e "  ${RED}Actual: '$actual'${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert JSON contains a key
# Usage: assert_json_has_key "json" "key" ["message"]
assert_json_has_key() {
    local json="$1"
    local key="$2"
    local message="${3:-JSON should contain key: $key}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if ! echo "$json" | grep -q "\"${key}\""; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}JSON: $json${NC}"
        echo -e "  ${RED}Missing key: $key${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a value is not empty
# Usage: assert_not_empty "value" ["message"]
assert_not_empty() {
    local value="$1"
    local message="${2:-Value should not be empty}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ -z "$value" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Value is empty${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert a value is empty
# Usage: assert_empty "value" ["message"]
assert_empty() {
    local value="$1"
    local message="${2:-Value should be empty}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ -n "$value" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Value is not empty: '$value'${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert exit code is zero
# Usage: assert_success "command" ["message"]
assert_success() {
    local command="$1"
    local message="${2:-Command should succeed}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if ! eval "$command" &>/dev/null; then
        local exit_code=$?
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Command failed with exit code: $exit_code${NC}"
        echo -e "  ${RED}Command: $command${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert exit code is non-zero
# Usage: assert_failure "command" ["message"]
assert_failure() {
    local command="$1"
    local message="${2:-Command should fail}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if eval "$command" &>/dev/null; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Command succeeded but should have failed${NC}"
        echo -e "  ${RED}Command: $command${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert command output matches regex
# Usage: assert_matches "command" "regex" ["message"]
assert_matches() {
    local command="$1"
    local regex="$2"
    local message="${3:-Output should match regex}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    local output
    output=$(eval "$command" 2>/dev/null || echo "")
    
    if ! [[ "$output" =~ $regex ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Regex: $regex${NC}"
        echo -e "  ${RED}Output: '$output'${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert number is greater than
# Usage: assert_gt "actual" "expected" ["message"]
assert_gt() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Number should be greater than}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if ! (( actual > expected )); then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Expected > $expected, got: $actual${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert number is less than
# Usage: assert_lt "actual" "expected" ["message"]
assert_lt() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Number should be less than}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if ! (( actual < expected )); then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Expected < $expected, got: $actual${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert number equals
# Usage: assert_num_equals "actual" "expected" ["message"]
assert_num_equals() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Numbers should be equal}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ "$actual" != "$expected" ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Expected: $expected${NC}"
        echo -e "  ${RED}Actual: $actual${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert array contains value
# Usage: assert_array_contains "array[@]" "value" ["message"]
assert_array_contains() {
    local -n arr="$1"
    local value="$2"
    local message="${3:-Array should contain value}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    local found=0
    for item in "${arr[@]}"; do
        if [[ "$item" == "$value" ]]; then
            found=1
            break
        fi
    done
    
    if [[ "$found" -eq 0 ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Array does not contain: $value${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert all items in array match predicate
# Usage: assert_array_not_empty "array[@]" ["message"]
assert_array_not_empty() {
    local -n arr="$1"
    local message="${2:-Array should not be empty}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if [[ ${#arr[@]} -eq 0 ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Array is empty${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert port is free (not in use)
# Usage: assert_port_free "port" ["message"]
assert_port_free() {
    local port="$1"
    local message="${2:-Port should be free: $port}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    if command -v lsof &>/dev/null; then
        if lsof -i ":$port" &>/dev/null; then
            ASSERT_PASSED=$((ASSERT_PASSED - 1))
            ASSERT_FAILED=$((ASSERT_FAILED + 1))
            echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
            echo -e "  ${RED}Port $port is in use${NC}"
            return 1
        fi
    elif command -v fuser &>/dev/null; then
        if fuser "$port/tcp" &>/dev/null 2>&1; then
            ASSERT_PASSED=$((ASSERT_PASSED - 1))
            ASSERT_FAILED=$((ASSERT_FAILED + 1))
            echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
            echo -e "  ${RED}Port $port is in use${NC}"
            return 1
        fi
    elif command -v ss &>/dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ":$port "; then
            ASSERT_PASSED=$((ASSERT_PASSED - 1))
            ASSERT_FAILED=$((ASSERT_FAILED + 1))
            echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
            echo -e "  ${RED}Port $port is in use${NC}"
            return 1
        fi
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert port is in use
# Usage: assert_port_in_use "port" ["message"]
assert_port_in_use() {
    local port="$1"
    local message="${2:-Port should be in use: $port}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    
    local in_use=0
    if command -v lsof &>/dev/null; then
        if lsof -i ":$port" &>/dev/null; then
            in_use=1
        fi
    elif command -v fuser &>/dev/null; then
        if fuser "$port/tcp" &>/dev/null 2>&1; then
            in_use=1
        fi
    elif command -v ss &>/dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ":$port "; then
            in_use=1
        fi
    fi
    
    if [[ "$in_use" -eq 0 ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        echo -e "  ${RED}Port $port is free${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Assert JSON response matches expected structure
# Usage: assert_json_structure "json" "key1,key2,key3" ["message"]
assert_json_structure() {
    local json="$1"
    local keys="$2"
    local message="${3:-JSON should have required keys}"
    
    ASSERT_PASSED=$((ASSERT_PASSED + 1))
    local failed=0
    
    IFS=',' read -ra KEY_ARRAY <<< "$keys"
    for key in "${KEY_ARRAY[@]}"; do
        key=$(echo "$key" | tr -d ' ')
        if ! echo "$json" | grep -q "\"${key}\""; then
            echo -e "  ${RED}Missing key: $key${NC}"
            failed=1
        fi
    done
    
    if [[ "$failed" -eq 1 ]]; then
        ASSERT_PASSED=$((ASSERT_PASSED - 1))
        ASSERT_FAILED=$((ASSERT_FAILED + 1))
        echo -e "${RED}✗ ASSERT FAILED${NC}: $message"
        return 1
    fi
    
    echo -e "${GREEN}✓${NC} $message"
    return 0
}

# Check if any assertions have failed
# Usage: assert_any_failed
# Returns: 0 if no failures, 1 if failures exist
assert_any_failed() {
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        return 1
    fi
    return 0
}

# Print assertion summary
# Usage: assert_summary
assert_summary() {
    echo ""
    echo "Assertion Summary:"
    echo "  ${GREEN}Passed: $ASSERT_PASSED${NC}"
    echo "  ${RED}Failed: $ASSERT_FAILED${NC}"
    
    if [[ $ASSERT_FAILED -gt 0 ]]; then
        return 1
    fi
    return 0
}

# Reset assertion counters
# Usage: assert_reset
assert_reset() {
    ASSERT_PASSED=0
    ASSERT_FAILED=0
}

# Export functions
export -f assert_equals assert_contains assert_not_contains
export -f assert_file_exists assert_file_not_exists
export -f assert_dir_exists assert_dir_not_exists
export -f assert_http_ok assert_http_status
export -f assert_pid_alive assert_pid_dead
export -f assert_json_equals assert_json_has_key
export -f assert_not_empty assert_empty
export -f assert_success assert_failure assert_matches
export -f assert_gt assert_lt assert_num_equals
export -f assert_array_contains assert_array_not_empty
export -f assert_port_free assert_port_in_use assert_json_structure assert_any_failed
export -f assert_summary assert_reset
