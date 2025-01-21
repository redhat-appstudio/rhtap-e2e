import { V1ObjectMeta, V1Condition } from "@kubernetes/client-node";
import { PipelineRunKind, TaskRunKind } from '@janus-idp/shared-react';

export interface PipelineRunSpec {
    apiVersion: string
    kind: string
    metadata: V1ObjectMeta
    spec: JSON
    status: PipelineRunStatusSpec
}

export interface PipelineRunStatusSpec {
    conditions: V1Condition[]
}

export interface PipelineRunList {
    items: PipelineRunKind[]
}

export interface PipelineRunList {
    items: PipelineRunKind[]
}

export interface TaskRunList {
    items: TaskRunKind[]
}
