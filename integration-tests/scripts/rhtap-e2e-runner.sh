#!/usr/bin/env bash
set -o errexit
set -o nounset
set -o pipefail

# Important variables to start tests
export ARTIFACT_DIR="${ARTIFACT_DIR:-$(mktemp -d)}"

# Load secrets from files
export GITLAB_TOKEN="$(cat /usr/local/rhtap-cli-install/gitlab_token)"
export GITHUB_TOKEN="$(cat /usr/local/rhtap-cli-install/github_token)"
export BITBUCKET_APP_PASSWORD="$(cat /usr/local/rhtap-cli-install/bitbucket-app-password)"
export OCI_STORAGE_TOKEN="$(jq -r '."quay-token"' /usr/local/konflux-test-infra/oci-storage)"
export OCI_STORAGE_USERNAME="$(jq -r '."quay-username"' /usr/local/konflux-test-infra/oci-storage)"

export APPLICATION_ROOT_NAMESPACE="rhtap-app"
export GITHUB_ORGANIZATION="rhtap-rhdh-qe"
export GITLAB_ORGANIZATION="rhtap-qe"
export BITBUCKET_USERNAME="rhtap-test-admin"
export BITBUCKET_WORKSPACE="rhtap-test"
export BITBUCKET_PROJECT="RHTAP"

#TODO: This is a temporary workaround as we are using only installations with quay installed in the cluster.
# Once we add back the scenario using public quay.io instance, we need to have a logic that uses `rhtap-qe` 
#org in case of public quay.io and `rhtap` or in case of in-cluster quay.

# Check the integrations present in rhtap namespace for fetching the Image Registry details
# rhtap is the default org for in-cluster quay
if [[ $(kubectl get secrets -n rhtap |grep rhtap-quay-integration) ]];then
    export IMAGE_REGISTRY="$(echo $(kubectl get secret rhtap-quay-integration -n rhtap -o json |jq '.data.url | @base64d')| sed -E 's|https://([^/]+).*|\1|')"
    export IMAGE_REGISTRY_ORG="rhtap"
    echo -e "[INFO] Identified quay registry as ${IMAGE_REGISTRY} with org as ${IMAGE_REGISTRY_ORG}"
fi
# the org name (repositry name for artifactory) is hardcoded since it should be pre-existing.
if [[ $(kubectl get secrets -n rhtap |grep rhtap-artifactory-integration) ]];then
    export IMAGE_REGISTRY="$(echo $(kubectl get secret rhtap-artifactory-integration -n rhtap -o json |jq '.data.url | @base64d')| sed -E 's|https://([^/]+).*|\1|')"
    export IMAGE_REGISTRY_ORG="rhtap"
    echo -e "[INFO] Identified artifactory registry as ${IMAGE_REGISTRY} with org as ${IMAGE_REGISTRY_ORG}"
fi
# the org name (repositry name for nexus) is hardcoded since it should be pre-existing.
if [[ $(kubectl get secrets -n rhtap |grep rhtap-artifactory-integration) ]];then
    export IMAGE_REGISTRY="$(echo $(kubectl get secret rhtap-nexus-integration -n rhtap -o json |jq '.data.url | @base64d')| sed -E 's|https://([^/]+).*|\1|')"
    export IMAGE_REGISTRY_ORG="rhtap"
    echo -e "[INFO] Identified nexus registry as ${IMAGE_REGISTRY} with org as ${IMAGE_REGISTRY_ORG}"
fi

export OCI_CONTAINER="${OCI_CONTAINER:-""}"
export RED_HAT_DEVELOPER_HUB_URL="https://$(kubectl get route backstage-developer-hub -n rhtap-dh -o jsonpath='{.spec.host}')"

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

# generate softwareTemplates-<OCP version>.json file
node generateTemplatesConfig.js
echo "[INFO] Print out ${SOFTWARE_TEMPLATES_FILE} file"
cat "${SOFTWARE_TEMPLATES_FILE}"

yarn && yarn test
