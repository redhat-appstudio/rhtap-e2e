import { GitLabProvider } from "../../src/apis/git-providers/gitlab";
import { GitHubProvider } from "../../src/apis/git-providers/github";
import { Kubernetes } from "../../src/apis/kubernetes/kube";
import { DeveloperHubClient } from "../../src/apis/backstage/developer-hub";
import { TaskIdReponse } from "../../src/apis/backstage/types";


export async function cleanAfterTestGitHub(gitHubClient: GitHubProvider, kubeClient: Kubernetes, rootNamespace: string, githubOrganization: string, repositoryName: string) {
    //Check, if gitops repo exists and delete
    await gitHubClient.checkIfRepositoryExistsAndDelete(githubOrganization, `${repositoryName}-gitops`)

    //Check, if repo exists and delete
    await gitHubClient.checkIfRepositoryExistsAndDelete(githubOrganization, repositoryName)

    //Delete app of apps from argo
    await kubeClient.deleteApplicationFromNamespace(rootNamespace, `${repositoryName}-app-of-apps`)
}

export async function cleanAfterTestGitLab(gitLabProvider: GitLabProvider, kubeClient: Kubernetes, rootNamespace: string, gitLabOrganization: string, gitlabRepositoryID: number, repositoryName: string) {
    //Check, if gitops repo exists and delete
    const gitlabRepositoryIDGitOps = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`)
    await gitLabProvider.deleteProject(gitlabRepositoryIDGitOps)

    //Check, if repo exists and delete
    await gitLabProvider.deleteProject(gitlabRepositoryID)

    //Delete app of apps from argo
    await kubeClient.deleteApplicationFromNamespace(rootNamespace, `${repositoryName}-app-of-apps`)
}

export async function beforeChecks(componentRootNamespace: string, githubOrganization: string, quayImageOrg: string, developmentNamespace: string, kubeClient: Kubernetes) {
    if (componentRootNamespace === '') {
        throw new Error("The 'APPLICATION_TEST_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (githubOrganization === '') {
        throw new Error("The 'GITHUB_ORGANIZATION' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (quayImageOrg === '') {
        throw new Error("The 'QUAY_IMAGE_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    const namespaceExists = await kubeClient.namespaceExists(developmentNamespace)

    if (!namespaceExists) {
        throw new Error(`The development namespace was not created. Make sure you have created ${developmentNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
    }
}

export async function checkComponentInBackstage(backstageClient: DeveloperHubClient, repositoryName: string, developerHubTask: TaskIdReponse) {
    // Check location in developer hub
    const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000)

    if (taskCreated.status !== 'completed') {

        try {
            const logs = await backstageClient.getEventStreamLog(taskCreated.id)
            await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `github-${repositoryName}.log`, logs);

            throw new Error("failed to create backstage tasks. Please check Developer Hub tasks logs...");

        } catch (error) {
            throw new Error(`failed to write files to console: ${error}`);
        }
    } else {
        console.log("Task created successfully in backstage");
    }
    const componentUid = await backstageClient.getComponentUid(repositoryName);
    expect(componentUid).toBeDefined()
}


