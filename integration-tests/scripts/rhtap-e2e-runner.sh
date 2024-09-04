#!/bin/sh

        set -o errexit
        set -o nounset
        set -o pipefail

        export RED_HAT_DEVELOPER_HUB_URL GITHUB_TOKEN \
            GITHUB_ORGANIZATION QUAY_IMAGE_ORG APPLICATION_ROOT_NAMESPACE NODE_TLS_REJECT_UNAUTHORIZED GITLAB_TOKEN \
            GITLAB_ORGANIZATION QUAY_USERNAME QUAY_PASSWORD IMAGE_REGISTRY

        QUAY_USERNAME=$(cat /usr/local/oras-credentials/quay-username)
        QUAY_PASSWORD=$(cat /usr/local/oras-credentials/quay-password)

        function saveArtifacts() {
          local EXIT_CODE=$?
          cd /workspace
          oras login -u $QUAY_USERNAME -p $QUAY_PASSWORD quay.io

          echo '{"doc": "README.md"}' > config.json

          oras push "$(params.oras-container)" --config config.json:application/vnd.acme.rocket.config.v1+json \
            ./test-artifacts/:application/vnd.acme.rocket.docs.layer.v1+tar

          exit $EXIT_CODE
        }

        trap saveArtifacts EXIT

        export ARTIFACT_DIR="/workspace/test-artifacts"
        mkdir -p $ARTIFACT_DIR

        echo -e "INFO: Login to the ephemeral cluster..."
        $(params.ocp-login-command)

        GITLAB_TOKEN=$(cat /usr/local/rhtap-cli-install/gitlab_token)
        GITLAB_ORGANIZATION="rhtap-qe"
        APPLICATION_ROOT_NAMESPACE="rhtap-app"
        QUAY_IMAGE_ORG="rhtap"
        GITHUB_ORGANIZATION="rhtap-rhdh-qe"
        GITHUB_TOKEN=$(cat /usr/local/rhtap-cli-install/gihtub_token)
        RED_HAT_DEVELOPER_HUB_URL=https://"$(kubectl get route backstage-developer-hub -n rhtap -o jsonpath='{.spec.host}')"
        IMAGE_REGISTRY=$(kubectl -n rhtap-quay get route rhtap-quay-quay -o  'jsonpath={.spec.host}')

        cd "$(mktemp -d)"
        echo -e "INFO: Cloning repository '$(params.git-repo)' with revision '$(params.git-revision)' from URL '$(params.git-url)'"
        git clone "$(params.git-url)" .

        if [ "$(params.git-repo)" = "rhtap-e2e" ]; then
          git checkout "$(params.git-revision)"
        fi

        NODE_TLS_REJECT_UNAUTHORIZED=0
        yarn && yarn test tests/gpts/github/quarkus.test.ts

