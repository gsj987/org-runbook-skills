#!/usr/bin/env bash
# =============================================================================
# pi-adapter E2E Test Suite - HTTP API Library
# =============================================================================
# Provides wrapper functions for all supervisor HTTP API endpoints:
# - GET  /health                    - Health check
# - POST /worker/spawn              - Spawn a worker
# - GET  /worker/:id/status         - Get worker status
# - POST /worker/:id/await          - Await worker result
# - GET  /results                   - Get all results
# - POST /workflow/update           - Update workflow with findings
# - GET  /workers                   - List active workers
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

DEFAULT_SUPERVISOR_PORT="${PI_SUPERVISOR_PORT:-3847}"
DEFAULT_SUPERVISOR_URL="http://localhost:${DEFAULT_SUPERVISOR_PORT}"

# Default timeout for HTTP requests (seconds)
DEFAULT_HTTP_TIMEOUT="${DEFAULT_HTTP_TIMEOUT:-60}"

# Curl options for all requests
CURL_OPTS=(--silent --fail --max-time "$DEFAULT_HTTP_TIMEOUT" -H "Content-Type: application/json")

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------

# Make HTTP request and return response body
# Usage: http_request <method> <url> [data_json]
# NOTE: Supports both parameter data and stdin (here-string or pipe)
http_request() {
    local method="$1"
    local url="$2"
    local data="${3:-}"
    
    if [[ -n "$data" && -f "$data" ]]; then
        # data is a file path
        curl "${CURL_OPTS[@]}" -X "$method" "$url" -d @"$data"
    elif [[ -n "$data" ]]; then
        # data is JSON string - use printf to avoid here-string issues
        printf '%s' "$data" | curl "${CURL_OPTS[@]}" -X "$method" "$url" -d @-
    elif [[ ! -t 0 ]]; then
        # No data parameter but stdin available (pipe or here-string)
        curl "${CURL_OPTS[@]}" -X "$method" "$url" -d @-
    else
        curl "${CURL_OPTS[@]}" -X "$method" "$url"
    fi
}

# Check if supervisor is healthy
# Usage: supervisor_health_check
# Returns: 0 if healthy, 1 otherwise
supervisor_health_check() {
    curl "${CURL_OPTS[@]}" "${DEFAULT_SUPERVISOR_URL}/health" &>/dev/null
}

# Get health status as JSON
# Usage: api_health
api_health() {
    http_request GET "${DEFAULT_SUPERVISOR_URL}/health"
}

# Check if health endpoint returns OK
# Usage: api_health_ok
# Returns: 0 if status is "ok", 1 otherwise
api_health_ok() {
    local response
    response=$(api_health)
    echo "$response" | grep -q '"status":"ok"'
}

# -----------------------------------------------------------------------------
# Worker Management API
# -----------------------------------------------------------------------------

# Spawn a new worker
# Usage: api_spawn <role> <task> <taskId> <workflowPath> [skill] [context_files...]
# Outputs: JSON with workerId
# Example:
#   worker_id=$(api_spawn "code-agent" "echo hello" "task-1" "workflow.org" | jq -r '.workerId')
api_spawn() {
    local role="$1"
    local task="$2"
    local task_id="$3"
    local workflow_path="$4"
    local skill="${5:-}"
    local context_files=("${@:6}")
    
    # Build JSON payload
    local payload
    payload=$(jq -n \
        --arg role "$role" \
        --arg task "$task" \
        --arg taskId "$task_id" \
        --arg workflowPath "$workflow_path" \
        --arg skill "$skill" \
        '{
            role: $role,
            task: $task,
            taskId: $taskId,
            workflowPath: $workflowPath,
            skill: (if $skill == "" then null else $skill end)
        }')
    
    http_request POST "${DEFAULT_SUPERVISOR_URL}/worker/spawn" <<< "$payload"
}

# Spawn worker with context files
# Usage: api_spawn_with_context <role> <task> <taskId> <workflowPath> <context_files_json>
api_spawn_with_context() {
    local role="$1"
    local task="$2"
    local task_id="$3"
    local workflow_path="$4"
    local context_files_json="$5"
    
    local payload
    payload=$(jq -n \
        --arg role "$role" \
        --arg task "$task" \
        --arg taskId "$task_id" \
        --arg workflowPath "$workflow_path" \
        --argjson contextFiles "$context_files_json" \
        '{
            role: $role,
            task: $task,
            taskId: $taskId,
            workflowPath: $workflowPath,
            contextFiles: $contextFiles
        }')
    
    http_request POST "${DEFAULT_SUPERVISOR_URL}/worker/spawn" <<< "$payload"
}

# Get worker status
# Usage: api_status <workerId>
# Outputs: JSON with status ("running" or "completed")
api_status() {
    local worker_id="$1"
    http_request GET "${DEFAULT_SUPERVISOR_URL}/worker/${worker_id}/status"
}

# Get worker status as string
# Usage: api_status_str <workerId>
# Outputs: "running", "completed", or error message
api_status_str() {
    local worker_id="$1"
    local response
    response=$(api_status "$worker_id")
    echo "$response" | jq -r '.status // .error // empty'
}

# Check if worker is running
# Usage: api_is_running <workerId>
# Returns: 0 if running, 1 otherwise
api_is_running() {
    local worker_id="$1"
    [[ "$(api_status_str "$worker_id")" == "running" ]]
}

# Check if worker is completed
# Usage: api_is_completed <workerId>
# Returns: 0 if completed, 1 otherwise
api_is_completed() {
    local worker_id="$1"
    [[ "$(api_status_str "$worker_id")" == "completed" ]]
}

# Await worker result
# Usage: api_await <workerId> [timeout_seconds]
# Outputs: JSON with WorkerResult
api_await() {
    local worker_id="$1"
    local timeout="${2:-300}"
    
    local payload
    payload=$(jq -n --arg timeout "$timeout" '{timeout: ($timeout | tonumber)}')
    
    http_request POST "${DEFAULT_SUPERVISOR_URL}/worker/${worker_id}/await" <<< "$payload"
}

# Await worker with polling
# Usage: api_await_with_poll <workerId> [timeout] [poll_interval]
# Outputs: JSON with WorkerResult
# Exits: 1 if timeout exceeded
api_await_with_poll() {
    local worker_id="$1"
    local timeout="${2:-300}"
    local poll_interval="${3:-2}"
    local elapsed=0
    
    while [[ $elapsed -lt $timeout ]]; do
        if api_is_completed "$worker_id"; then
            api_await "$worker_id" 1
            return 0
        fi
        sleep "$poll_interval"
        elapsed=$((elapsed + poll_interval))
    done
    
    echo '{"error": "timeout", "message": "Worker did not complete within timeout"}' >&2
    return 1
}

# -----------------------------------------------------------------------------
# Results API
# -----------------------------------------------------------------------------

# Get all results
# Usage: api_results
# Outputs: JSON array of WorkerResult
api_results() {
    http_request GET "${DEFAULT_SUPERVISOR_URL}/results"
}

# Get specific worker result from file
# Usage: api_result_file <workerId>
# Outputs: JSON with WorkerResult
api_result_file() {
    local worker_id="$1"
    local results_dir="${PI_RESULTS_DIR:-/tmp/pi-adapter-results}"
    local result_file="${results_dir}/${worker_id}.json"
    
    if [[ -f "$result_file" ]]; then
        cat "$result_file"
    else
        echo '{"error": "not_found", "message": "Result file not found"}'
        return 1
    fi
}

# Get worker findings from result
# Usage: api_result_findings <workerId>
# Outputs: JSON array of findings
api_result_findings() {
    local worker_id="$1"
    api_result_file "$worker_id" | jq -r '.findings // []'
}

# Get worker exit code
# Usage: api_exit_code <workerId>
# Outputs: Exit code number
api_exit_code() {
    local worker_id="$1"
    api_result_file "$worker_id" | jq -r '.exitCode // -1'
}

# -----------------------------------------------------------------------------
# Workers List API
# -----------------------------------------------------------------------------

# Get list of active workers
# Usage: api_workers
# Outputs: JSON array of worker IDs
api_workers() {
    http_request GET "${DEFAULT_SUPERVISOR_URL}/workers"
}

# Count active workers
# Usage: api_worker_count
# Outputs: Number of active workers
api_worker_count() {
    api_workers | jq -r 'length // 0'
}

# Check if worker exists
# Usage: api_worker_exists <workerId>
# Returns: 0 if exists, 1 otherwise
api_worker_exists() {
    local worker_id="$1"
    api_workers | jq -r ". | contains([\"$worker_id\"])"
}

# -----------------------------------------------------------------------------
# Workflow Update API
# -----------------------------------------------------------------------------

# Update workflow with findings
# Usage: api_workflow_update <workflowPath> <findings_json>
# Outputs: JSON with success status
api_workflow_update() {
    local workflow_path="$1"
    local findings_json="$2"
    
    local payload
    payload=$(jq -n \
        --arg workflowPath "$workflow_path" \
        --argjson findings "$findings_json" \
        '{
            workflowPath: $workflowPath,
            findings: $findings
        }')
    
    http_request POST "${DEFAULT_SUPERVISOR_URL}/workflow/update" <<< "$payload"
}

# Update workflow with single finding
# Usage: api_workflow_append <workflowPath> <finding_content> <rating>
# Rating: ★★★, ★★, or ★
api_workflow_append() {
    local workflow_path="$1"
    local content="$2"
    local rating="$3"
    
    local finding_uuid
    finding_uuid=$(uuidgen 2>/dev/null || echo "f-$(date +%s)-$(head -c 8 /dev/urandom | xxd -p)")
    
    local timestamp
    timestamp=$(date -Iseconds)
    
    local finding_json
    finding_json=$(jq -n \
        --arg uuid "$finding_uuid" \
        --arg content "$content" \
        --arg rating "$rating" \
        --arg timestamp "$timestamp" \
        '[{
            id: $uuid,
            content: $content,
            rating: $rating,
            timestamp: $timestamp
        }]')
    
    api_workflow_update "$workflow_path" "$finding_json"
}

# -----------------------------------------------------------------------------
# Response Parsing Helpers
# -----------------------------------------------------------------------------

# Parse worker ID from spawn response
# Usage: parse_worker_id <json_response>
parse_worker_id() {
    local response="$1"
    echo "$response" | jq -r '.workerId // empty'
}

# Parse success status from response
# Usage: parse_success <json_response>
parse_success() {
    local response="$1"
    echo "$response" | jq -r '.success // false'
}

# Parse error from response
# Usage: parse_error <json_response>
parse_error() {
    local response="$1"
    echo "$response" | jq -r '.error // empty'
}

# Check if response indicates success
# Usage: is_success <json_response>
is_success() {
    local response="$1"
    [[ "$(parse_success "$response")" == "true" ]]
}

# -----------------------------------------------------------------------------
# Error Handling
# -----------------------------------------------------------------------------

# Handle API error
# Usage: handle_api_error <context> <response>
handle_api_error() {
    local context="$1"
    local response="$2"
    local error
    error=$(parse_error "$response")
    
    echo "API Error in $context: $error" >&2
    echo "Full response: $response" >&2
    
    return 1
}

# Retry API call on failure
# Usage: retry_api <max_attempts> <delay> <api_function> [args...]
retry_api() {
    local max_attempts="$1"
    local delay="$2"
    local api_function="$3"
    shift 3
    local attempt=1
    local response
    
    while [[ $attempt -le $max_attempts ]]; do
        if response=$("$api_function" "$@"); then
            echo "$response"
            return 0
        fi
        
        log_warn "Attempt $attempt/$max_attempts failed for $api_function"
        sleep "$delay"
        attempt=$((attempt + 1))
    done
    
    log_error "All $max_attempts attempts failed for $api_function"
    return 1
}

# Export functions
export -f http_request supervisor_health_check api_health api_health_ok
export -f api_spawn api_spawn_with_context api_status api_status_str
export -f api_is_running api_is_completed api_await api_await_with_poll
export -f api_results api_result_file api_result_findings api_exit_code
export -f api_workers api_worker_count api_worker_exists
export -f api_workflow_update api_workflow_append
export -f parse_worker_id parse_success parse_error is_success
export -f handle_api_error retry_api
