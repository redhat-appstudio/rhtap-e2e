FROM registry.access.redhat.com/ubi9/ubi:9.5-1744101466 as builder

LABEL KONFLUX_CI="true"
LABEL MAINTAINERS="RHTAP QE"

# renovate: datasource=repology depName=homebrew/openshift-cli
ARG OC_VERSION=4.14.8

# renovate: datasource=github-releases depName=stedolan/jq
ARG JQ_VERSION=1.6

# renovate: datasource=github-releases depName=mikefarah/yq
ARG YQ_VERSION=4.43.1

# renovate: datasource=github-releases depName=helm/helm
ARG HELM_VERSION=v3.15.3

# renovate: datasource=github-releases depName=oras-project/oras
ARG ORAS_VERSION=1.2.0

# renovate: datasource=github-releases depName=argoproj/argo-cd
ARG ORAS_VERSION=1.2.0

# renovate: datasource=github-releases depName=argoproj/argo-cd
ARG ARGOCD_VERSION=v2.11.4

# renovate: datasource=github-releases depName=tektoncd/cli
ARG TEKTON_VERSION=v0.37.0

# renovate: datasource=github-releases depName=sigstore/cosign
ARG COSIGN_VERSION=v2.4.3
   
RUN curl --proto "=https" --tlsv1.2 -sSf -L "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz" -o /tmp/helm.tar.gz && \
    tar -xzf /tmp/helm.tar.gz && \
    mv linux-amd64/helm /usr/local/bin/helm && \
    helm version

RUN curl --proto "=https" --tlsv1.2 -sSf -LO "https://github.com/oras-project/oras/releases/download/v${ORAS_VERSION}/oras_${ORAS_VERSION}_linux_amd64.tar.gz" && \
    mkdir -p oras-install/ && \
    tar -zxf oras_${ORAS_VERSION}_*.tar.gz -C oras-install/ && \
    mv oras-install/oras /usr/local/bin/ && \
    rm -rf oras_${ORAS_VERSION}_*.tar.gz oras-install/ && \
    oras version

RUN curl --proto "=https" --tlsv1.2 -sSf -L "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq && \
    yq --version

RUN curl --proto "=https" --tlsv1.2 -sSf -L "https://github.com/stedolan/jq/releases/download/jq-${JQ_VERSION}/jq-linux64" -o /usr/local/bin/jq  && \
    chmod +x /usr/local/bin/jq && \
    jq --version

RUN curl --proto "=https" --tlsv1.2 -sSf -L "https://mirror.openshift.com/pub/openshift-v4/clients/ocp/${OC_VERSION}/openshift-client-linux.tar.gz" -o /tmp/openshift-client-linux.tar.gz && \
    tar --no-same-owner -xzf /tmp/openshift-client-linux.tar.gz && \
    mv oc kubectl /usr/local/bin && \
    oc version --client && \
    kubectl version --client

RUN curl --proto "=https" --tlsv1.2 -sSf -L "https://github.com/argoproj/argo-cd/releases/download/${ARGOCD_VERSION}/argocd-linux-amd64" -o /usr/local/bin/argocd && \
    chmod +x /usr/local/bin/argocd && \
    argocd version --client

RUN curl --proto "=https" --tlsv1.2 -sSf -L "https://github.com/tektoncd/cli/releases/download/${TEKTON_VERSION}/tkn_${TEKTON_VERSION//v}_Linux_x86_64.tar.gz" -o /tmp/tkn.tar.gz && \
    tar --no-same-owner -xzf /tmp/tkn.tar.gz && \
    mv tkn /usr/local/bin && \
    tkn version

ADD https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-amd64 /usr/local/bin/cosign
RUN chmod +x /usr/local/bin/cosign && \
    cosign version

FROM registry.access.redhat.com/ubi9/go-toolset:9.5-1745328278

USER root

RUN dnf module install -y nodejs:20/common && \
    npm i -g yarn && \
    yarn -v

COPY --from=builder /usr/local/bin/oc /usr/local/bin/oc
COPY --from=builder /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --from=builder /usr/local/bin/jq /usr/local/bin/jq
COPY --from=builder /usr/local/bin/yq /usr/local/bin/yq
COPY --from=builder /usr/local/bin/oras /usr/local/bin/oras
COPY --from=builder /usr/local/bin/argocd /usr/local/bin/argocd
COPY --from=builder /usr/local/bin/helm /usr/local/bin/helm
COPY --from=builder /usr/local/bin/tkn /usr/local/bin/tkn
COPY --from=builder /usr/local/bin/cosign /usr/local/bin/cosign