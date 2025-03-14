#!/usr/bin/env bash

# Enable strict error checking
set -o errexit  # Exit immediately if a command exits with a non-zero status
set -o nounset  # Treat unset variables as an error
set -o pipefail # The return value of a pipeline is the status of the last command

#===========================================
# GLOBAL VARIABLES
#===========================================

# Artifact and output directories
export ARTIFACT_DIR="${ARTIFACT_DIR:-$(mktemp -d)}"

# Default namespace and organization settings
export APPLICATION_ROOT_NAMESPACE="rhtap-app"
export BITBUCKET_USERNAME="rhtap-test-admin"
export BITBUCKET_WORKSPACE="rhtap-test"
export BITBUCKET_PROJECT="RHTAP"

# OCI container registry settings
export OCI_CONTAINER="${OCI_CONTAINER:-""}"

#===========================================
# UTILITY FUNCTIONS
#===========================================

# Print message with timestamp and log level
log() {
    local level="$1"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [${level}] ${message}"
}

# Check if a Kubernetes secret exists
secret_exists() {
    local namespace="$1"
    local secret_name="$2"
    log "DEBUG" "Checking if secret $secret_name exists in namespace $namespace"
    
    # Show all secrets in the namespace for debugging
    kubectl get secrets -n "$namespace" | tee /tmp/secrets-list.txt
    
    # Test if the specific secret exists and show result
    if kubectl get secrets -n "$namespace" | grep "$secret_name"; then
        log "DEBUG" "Secret $secret_name found in namespace $namespace"
        return 0
    else
        log "DEBUG" "Secret $secret_name NOT found in namespace $namespace"
        return 1
    fi
}

# Extract value from a Kubernetes secret
get_secret_value() {
    local namespace="$1"
    local secret_name="$2"
    local key="$3"
    kubectl -n "$namespace" get secret "$secret_name" -o go-template="{{index .data \"$key\" | base64decode}}"
}

#===========================================
# CONFIGURATION FUNCTIONS
#===========================================

# Load credentials from secret files
load_oci_storage_credentials() {
    log "INFO" "Loading credentials from secret files"

    export OCI_STORAGE_TOKEN="$(jq -r '."quay-token"' /usr/local/konflux-test-infra/oci-storage)"
    export OCI_STORAGE_USERNAME="$(jq -r '."quay-username"' /usr/local/konflux-test-infra/oci-storage)"
}

configure_github_variables() {
    log "INFO" "Configuring GitHub credentials from cluster secrets"

    if ! secret_exists "rhtap" "rhtap-github-integration"; then
        log "WARN" "No GitHub integration secret found in the rhtap namespace"
        return 0
    fi
    export GITHUB_ORGANIZATION="rhtap-rhdh-qe"
    export GITHUB_TOKEN="$(get_secret_value "rhtap" "rhtap-github-integration" "token")"
}   
# Extract GitLab organization from Kubernetes secret
configure_gitlab_variables() {
    log "INFO" "Configuring GitLab credentials from cluster secrets"
    
    if ! secret_exists "rhtap" "rhtap-gitlab-integration"; then
        log "WARN" "No GitLab integration secret found in the rhtap namespace"
        return 0
    fi
    
    # Extract and export all GitLab-related credentials
    export GITLAB_ORGANIZATION="$(get_secret_value "rhtap" "rhtap-gitlab-integration" "group")"
    export GITLAB_TOKEN="$(get_secret_value "rhtap" "rhtap-gitlab-integration" "token")"
    
    log "INFO" "GitLab credentials configured successfully (organization: ${GITLAB_ORGANIZATION})"
}

# Extract Artifactory registry credentials
extract_artifactory_credentials() {
    local namespace="rhtap"
    local secret_name="rhtap-artifactory-integration"
    local dockerconfig
    
    log "DEBUG" "Extracting Artifactory integration credentials"
    
    # Get the dockerconfig JSON from the secret
    dockerconfig=$(get_secret_value "$namespace" "$secret_name" ".dockerconfigjson")
    
    if [ -z "$dockerconfig" ]; then
        log "ERROR" "Failed to extract dockerconfig from Artifactory secret"
        return 1
    fi
    
    # Parse the JSON only once and extract all needed values
    export IMAGE_REGISTRY=$(echo "$dockerconfig" | jq -r '.auths | to_entries[0].key')
    
    # Extract auth token and decode it
    local auth=$(echo "$dockerconfig" | jq -r '.auths | to_entries[0].value.auth')
    local auth_decoded=$(echo "$auth" | base64 -d)
    
    # Split the auth string into username and password
    export IMAGE_REGISTRY_USERNAME=$(echo "$auth_decoded" | cut -d: -f1)
    export IMAGE_REGISTRY_PASSWORD=$(echo "$auth_decoded" | cut -d: -f2-)
    
    log "INFO" "Successfully extracted Artifactory credentials for ${IMAGE_REGISTRY}"
}

# Configure image registry based on available integration
configure_image_registry() {
    log "INFO" "Setting up image registry configuration"
    
    # Set default organization
    export IMAGE_REGISTRY_ORG="rhtap"
    
    # Check for Quay integration
    if secret_exists "rhtap" "rhtap-quay-integration"; then
        log "INFO" "Quay integration found in rhtap namespace"

        export IMAGE_REGISTRY="$(kubectl get secret rhtap-quay-integration -n rhtap -o go-template='{{index .data "url" | base64decode}}' | sed 's|^https://||')"
        export IMAGE_REGISTRY_USERNAME=$(get_secret_value "rhtap-quay" "rhtap-quay-super-user" "username")
        export IMAGE_REGISTRY_PASSWORD=$(get_secret_value "rhtap-quay" "rhtap-quay-super-user" "password")
        # if IMAGE_REGISTRY is quay.io, then set IMAGE_REGISTRY_ORG to quay organization
        if [[ $IMAGE_REGISTRY == "quay.io" ]]; then
            export IMAGE_REGISTRY_ORG="rhtap_qe"
        fi
        log "INFO" "Using Quay registry: ${IMAGE_REGISTRY} with org: ${IMAGE_REGISTRY_ORG}"
        return 0
    fi
    
    if secret_exists "rhtap" "rhtap-artifactory-integration"; then
        extract_artifactory_credentials
        log "INFO" "Using Artifactory registry: ${IMAGE_REGISTRY} with org: ${IMAGE_REGISTRY_ORG}"
        return 0
    fi
    
    # Check for Nexus integration
    if secret_exists "rhtap" "rhtap-nexus-integration"; then
        export IMAGE_REGISTRY="${IMAGE_REGISTRY:-$(cat /usr/local/rhtap-cli-install/nexus-registry-url)}"
        export IMAGE_REGISTRY_USERNAME="${IMAGE_REGISTRY_USERNAME:-$(cat /usr/local/rhtap-cli-install/nexus-username)}"
        export IMAGE_REGISTRY_PASSWORD="${IMAGE_REGISTRY_PASSWORD:-$(cat /usr/local/rhtap-cli-install/nexus-password)}"
        log "INFO" "Using Nexus registry: ${IMAGE_REGISTRY} with org: ${IMAGE_REGISTRY_ORG}"
        return 0
    fi
    
    log "WARN" "No supported image registry integration found"
}

# Configure Red Hat Developer Hub URL
configure_developer_hub() {
    log "INFO" "Setting up Red Hat Developer Hub configuration"
    
    export RED_HAT_DEVELOPER_HUB_URL="https://$(kubectl get route backstage-developer-hub -n rhtap-dh -o jsonpath='{.spec.host}')"
    log "INFO" "Red Hat Developer Hub URL: ${RED_HAT_DEVELOPER_HUB_URL}"
}

# Clean up and push artifacts to OCI container
post_actions() {
    local exit_code=$?
    log "INFO" "Running post actions, exit code: ${exit_code}"
    
    # Create temporary file for annotations
    local temp_annotation_file="$(mktemp)"
    
    # Change to artifact directory
    cd "$ARTIFACT_DIR" || { log "ERROR" "Failed to change to artifact directory"; exit 1; }
    
    # Fetch the manifest annotations for the container
    if ! MANIFESTS=$(oras manifest fetch "${OCI_CONTAINER}" | jq .annotations); then
        log "ERROR" "Failed to fetch manifest from ${OCI_CONTAINER}"
        exit 1
    fi
    
    # Create annotation file
    jq -n --argjson manifest "$MANIFESTS" '{ "$manifest": $manifest }' > "${temp_annotation_file}"
    
    # Pull OCI container
    log "INFO" "Pulling OCI container: ${OCI_CONTAINER}"
    oras pull "${OCI_CONTAINER}"
    
    # Push artifacts with retry logic
    log "INFO" "Pushing artifacts to OCI container"
    local attempt=1
    while ! oras push "$OCI_CONTAINER" \
                    --username="${OCI_STORAGE_USERNAME}" \
                    --password="${OCI_STORAGE_TOKEN}" \
                    --annotation-file "${temp_annotation_file}" \
                    ./:application/vnd.acme.rocket.docs.layer.v1+tar; do
        
        if [[ $attempt -ge 5 ]]; then
            log "ERROR" "Failed to push artifacts after $attempt attempts"
            exit 1
        fi
        
        log "WARN" "Push attempt $attempt failed. Retrying in 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    log "INFO" "Artifacts pushed successfully"
    exit "$exit_code"
}

# Generate software templates for testing
generate_templates() {
    log "INFO" "Generating software templates configuration"
    
    # Run the template generation script
    node generateTemplatesConfig.js
    
    # Display the generated file
    log "INFO" "Software templates generated: ${SOFTWARE_TEMPLATES_FILE}"
    log "INFO" "Contents of ${SOFTWARE_TEMPLATES_FILE}:"
    cat "${SOFTWARE_TEMPLATES_FILE}"
}

# Run the test suite
run_tests() {
    log "INFO" "Installing dependencies and running tests"
    yarn && yarn test
}

#===========================================
# MAIN EXECUTION
#===========================================

main() {
    log "INFO" "Starting RHTAP E2E test runner"
    
    # Set up trap for cleanup
    trap post_actions EXIT
    
    # Load credentials and configure environment
    load_oci_storage_credentials
    configure_github_variables
    configure_gitlab_variables
    configure_image_registry
    configure_developer_hub
    
    # Generate templates and run tests
    generate_templates
    run_tests
    
    log "INFO" "Test execution completed"
}

# Execute the main function
main "$@"