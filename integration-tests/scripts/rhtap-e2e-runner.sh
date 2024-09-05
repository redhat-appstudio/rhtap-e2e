#!/bin/sh

set -euo pipefail

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$1] $2"
}

#JOB_SPEC env:
# {
#     "container_image": "quay.io/rhtap/rhtap-cli@sha256:d2c1a65eda860ff667b30bffde2ec325c1ea7375ae2a68d4defd7aedbd0effdf",
#     "konflux_component": "rhtap-cli",
#     "git": {
#         "pull_request_number": 195,
#         "pull_request_author": "flacatus",
#         "git_org": "redhat-appstudio",
#         "git_repo": "rhtap-cli",
#         "commit_sha": "ff9aacf8c902f1d6a5004e258522771d48f2b629",
#         "event_type": "pull_request",
#         "source_repo_url": "https://github.com/flacatus/rhtap-cli",
#         "source_repo_branch": "fix_pr"
#     }
# }
# Ensure JOB_SPEC is set
: "${JOB_SPEC:?JOB_SPEC environment variable must be set}"

# Important variables to start tests
ARTIFACT_DIR="${ARTIFACT_DIR:-$(mktemp -d)}"
GIT_REPO="${GIT_REPO:-$(echo "$JOB_SPEC" | jq -r '.git.git_repo')}"
GIT_REVISION="${GIT_REVISION:-$(echo "$JOB_SPEC" | jq -r '.git.commit_sha')}"
GIT_URL="${GIT_URL:-$(echo "$JOB_SPEC" | jq -r '.git.source_repo_url')}"

APPLICATION_ROOT_NAMESPACE="rhtap-app"
GITHUB_ORGANIZATION="rhtap-rhdh-qe"
GITLAB_ORGANIZATION="rhtap-qe"
IMAGE_REGISTRY="$(kubectl -n rhtap-quay get route rhtap-quay-quay -o 'jsonpath={.spec.host}')"
OCI_CONTAINER="${OCI_CONTAINER:-""}"
OCI_STORAGE_TOKEN="$(jq -r '."quay-token"' /usr/local/konflux-test-infra/oci-storage)"
OCI_STORAGE_USERNAME="$(jq -r '."quay-username"' /usr/local/konflux-test-infra/oci-storage)"
RED_HAT_DEVELOPER_HUB_URL="https://$(kubectl get route backstage-developer-hub -n rhtap -o jsonpath='{.spec.host}')"

# Load secrets from files
GITLAB_TOKEN="$(cat /usr/local/rhtap-cli-install/gitlab_token 2>/dev/null || { log "ERROR" "GITLAB_TOKEN not found"; exit 1; })"
GITHUB_TOKEN="$(cat /usr/local/rhtap-cli-install/github_token 2>/dev/null || { log "ERROR" "GITHUB_TOKEN not found"; exit 1; })"

post_actions() {
    local exit_code=$?
    local temp_annotation_file

    temp_annotation_file="$(mktemp)"
    cd "$ARTIFACT_DIR"

    MANIFESTS=$(oras manifest fetch "${OCI_CONTAINER}" | jq .annotations) || {
        log "ERROR" "Failed to fetch manifest annotations"
        exit 1
    }

    jq -n --argjson manifest "$MANIFESTS" '{ "manifest": $manifest }' > "${temp_annotation_file}"
    oras pull "${OCI_CONTAINER}"

    for attempt in {1..5}; do
        oras push "$OCI_CONTAINER" --username="$OCI_STORAGE_USERNAME" --password="$OCI_STORAGE_TOKEN" --annotation-file "$temp_annotation_file" ./:application/vnd.acme.rocket.docs.layer.v1+tar && break
        log "WARNING" "oras push failed (attempt $attempt). Retrying..."
        sleep 5
        [ $attempt -eq 5 ] && { log "ERROR" "oras push failed after $attempt attempts"; exit 1; }
    done

    exit "$exit_code"
}

trap post_actions EXIT

cd "$(mktemp -d)"
log "INFO" "Cloning ${GIT_REPO} at ${GIT_REVISION} from ${GIT_URL}"
git clone "${GIT_URL}" .

[ "$GIT_REPO" = "rhtap-e2e" ] && git checkout "$GIT_REVISION"

log "INFO" "Starting tests"
yarn && yarn test tests/gpts/github/quarkus.test.ts
