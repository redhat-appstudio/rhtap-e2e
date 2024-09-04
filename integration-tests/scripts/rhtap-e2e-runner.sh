#!/bin/sh

set -euo pipefail

log() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] [$1] $2"
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
load_envs() {
    local rhtap_secrets_file="/usr/local/rhtap-cli-install"
    local konflux_infra_secrets_file="/usr/local/konflux-test-infra"

    declare -A config_envs=(
        [APPLICATION_ROOT_NAMESPACE]="rhtap-app"
        [ARTIFACT_DIR]="$(mktemp -d)"
        [GITHUB_ORGANIZATION]="rhtap-rhdh-qe"
        [GITLAB_ORGANIZATION]="rhtap-qe"
        [GIT_REPO]="$(echo "$JOB_SPEC" | jq -r '.git.git_repo')"
        [GIT_REVISION]="$(echo "$JOB_SPEC" | jq -r '.git.commit_sha')"
        [GIT_URL]="$(echo "$JOB_SPEC" | jq -r '.git.source_repo_url')"
        [IMAGE_REGISTRY]="$(kubectl -n rhtap-quay get route rhtap-quay-quay -o  'jsonpath={.spec.host}')"
        [NODE_TLS_REJECT_UNAUTHORIZED]=0
        [OCI_CONTAINER]="${OCI_CONTAINER:-""}"
        [OCI_STORAGE_TOKEN]="$(jq -r '."quay-token"' ${konflux_infra_secrets_file}/oci-storage)"
        [OCI_STORAGE_USERNAME]="$(jq -r '."quay-username"' ${konflux_infra_secrets_file}/oci-storage)"
        [RED_HAT_DEVELOPER_HUB_URL]=https://"$(kubectl get route backstage-developer-hub -n rhtap -o jsonpath='{.spec.host}')"
    )

    declare -A load_envs_from_file=(
        [GITLAB_TOKEN]="${rhtap_secrets_file}/gitlab_token"
        [GITHUB_TOKEN]="${rhtap_secrets_file}/github_token"
    )

    for var in "${!config_envs[@]}"; do
        export "$var"="${config_envs[$var]}"
    done

    for var in "${!load_envs_from_file[@]}"; do
        local file="${load_envs_from_file[$var]}"
        if [[ -f "$file" ]]; then
            export "$var"="$(<"$file")"
        else
            log "ERROR" "Secret file for $var not found at $file"
        fi
    done
}

post_actions() {
    local exit_code=$?
    local temp_annotation_file="$(mktemp)"

    cd "$ARTIFACT_DIR"

    # Fetch the manifest annotations for the container
    if ! MANIFESTS=$(oras manifest fetch "${OCI_CONTAINER}" | jq .annotations); then
        log "ERROR" "Failed to fetch manifest from ${OCI_STORAGE_CONTAINER}"
        exit 1
    fi

    jq -n --argjson manifest "$MANIFESTS" '{ "$manifest": $manifest }' > "${temp_annotation_file}"

    oras pull "${OCI_CONTAINER}"

    local attempt=1
    while ! oras push "$OCI_CONTAINER" --username="${OCI_STORAGE_USERNAME}" --password="${OCI_STORAGE_TOKEN}" --annotation-file "${temp_annotation_file}" ./:application/vnd.acme.rocket.docs.layer.v1+tar; do
        if [[ $attempt -ge 5 ]]; then
            log "ERROR" "oras push failed after $attempt attempts."
            exit 1
        fi
        log "WARNING" "oras push failed (attempt $attempt). Retrying in 5 seconds..."
        sleep 5
        ((attempt++))
    done

    exit "$exit_code"
}

trap post_actions EXIT

cd "$(mktemp -d)"

log "INFO" "Cloning repository '${GIT_REPO}' with revision '${GIT_REVISION}' from URL '${GIT_URL}'"

git clone "${GIT_URL}" .

if [ "${GIT_REPO}" = "rhtap-e2e" ]; then
    git checkout "${GIT_REVISION}"
fi

yarn && yarn test tests/gpts/github/quarkus.test.ts
