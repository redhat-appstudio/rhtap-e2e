import { V1ObjectMeta } from "@kubernetes/client-node";

export interface OpenshiftRoute {
    apiVersion: string
    kind: string
    metadata: V1ObjectMeta
    spec: OpenshiftRouteSpec
}

export interface OpenshiftRouteSpec {
    host: string
}
