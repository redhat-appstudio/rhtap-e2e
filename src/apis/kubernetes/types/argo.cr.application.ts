import { V1ObjectMeta } from "@kubernetes/client-node"

export interface ApplicationSpec {
    apiVersion: string
    kind: string
    metadata: V1ObjectMeta
    status: ApplicationStatus
}

export interface ApplicationStatus {
    sync?: Status
    health?: Health
}

export interface Status {
    status?: string
}

export interface Health {
    status?: string
}
