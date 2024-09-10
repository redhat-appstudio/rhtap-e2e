#!/bin/sh

set -e

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
# Check if the JOB_SPEC environment variable is set.
if [ -z "${JOB_SPEC}" ]; then
    echo "Error: JOB_SPEC environment variable must be set."
    exit 1
fi

# Important variables to start tests
export ARTIFACT_DIR="${ARTIFACT_DIR:-$(mktemp -d)}"
export GIT_REPO="${GIT_REPO:-$(echo "$JOB_SPEC" | jq -r '.git.git_repo')}"
export GIT_REVISION="${GIT_REVISION:-$(echo "$JOB_SPEC" | jq -r '.git.commit_sha')}"
export GIT_URL="${GIT_URL:-$(echo "$JOB_SPEC" | jq -r '.git.source_repo_url')}"

# Load secrets from files
export GITLAB_TOKEN="$(cat /usr/local/rhtap-cli-install/gitlab_token)"
export GITHUB_TOKEN="$(cat /usr/local/rhtap-cli-install/github_token)"
export OCI_STORAGE_TOKEN="$(jq -r '."quay-token"' /usr/local/konflux-test-infra/oci-storage)"
export OCI_STORAGE_USERNAME="$(jq -r '."quay-username"' /usr/local/konflux-test-infra/oci-storage)"

export APPLICATION_ROOT_NAMESPACE="rhtap-app"
export GITHUB_ORGANIZATION="rhtap-rhdh-qe"
export GITLAB_ORGANIZATION="rhtap-qe"
export QUAY_IMAGE_ORG="rhtap"
export IMAGE_REGISTRY="$(kubectl -n rhtap-quay get route rhtap-quay-quay -o 'jsonpath={.spec.host}')"
export OCI_CONTAINER="${OCI_CONTAINER:-""}"
export RED_HAT_DEVELOPER_HUB_URL="https://$(kubectl get route backstage-developer-hub -n rhtap -o jsonpath='{.spec.host}')"

post_actions() {
    local exit_code=$?
    local temp_annotation_file="$(mktemp)"

    cd "$ARTIFACT_DIR"

    # Fetch the manifest annotations for the container
    if ! MANIFESTS=$(oras manifest fetch "${OCI_CONTAINER}" | jq .annotations); then
        echo -e "[ERROR] Failed to fetch manifest from ${OCI_STORAGE_CONTAINER}"
        exit 1
    fi

    jq -n --argjson manifest "$MANIFESTS" '{ "$manifest": $manifest }' > "${temp_annotation_file}"

    oras pull "${OCI_CONTAINER}"

    local attempt=1
    while ! oras push "$OCI_CONTAINER" --username="${OCI_STORAGE_USERNAME}" --password="${OCI_STORAGE_TOKEN}" --annotation-file "${temp_annotation_file}" ./:application/vnd.acme.rocket.docs.layer.v1+tar; do
        if [[ $attempt -ge 5 ]]; then
            echo -e "[ERROR] oras push failed after $attempt attempts."
            exit 1
        fi
        echo -e "[WARNING] oras push failed (attempt $attempt). Retrying in 5 seconds..."
        sleep 5
        ((attempt++))
    done

    exit "$exit_code"
}

trap post_actions EXIT

cd "$(mktemp -d)"

if [[ "${GIT_REPO}" = "rhtap-e2e" ]]; then
    echo -e "INFO: Cloning repository '$GIT_REPO' with revision '$GIT_REVISION' from URL '$GIT_URL'"
    git clone "${GIT_URL}" .
    git checkout "${GIT_REVISION}"
else
    echo -e "INFO: Cloning repository 'redhat-appstudio/rhtap-e2e' with revision 'main'"
    git clone https://github.com/redhat-appstudio/rhtap-e2e.git .
fi

yarn && yarn test tests/gpts/github/quarkus.tekton.test.ts
