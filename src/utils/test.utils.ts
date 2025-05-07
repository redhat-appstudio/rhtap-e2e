import { GitLabProvider } from "../../src/apis/scm-providers/gitlab";
import { GitHubProvider } from "../../src/apis/scm-providers/github";
import { BitbucketProvider } from "../../src/apis/scm-providers/bitbucket";
import { Kubernetes } from "../../src/apis/kubernetes/kube";
import { DeveloperHubClient } from "../../src/apis/backstage/developer-hub";
import { JenkinsCI } from "../../src/apis/ci/jenkins";
import { ScaffolderScaffoldOptions } from "@backstage/plugin-scaffolder-react";
import { syncArgoApplication } from "./argocd";
import { TaskIdReponse } from "../../src/apis/backstage/types";
import { TrustificationClient } from "../../src/apis/trustification/trustification";


export async function cleanAfterTestGitHub(gitHubClient: GitHubProvider, kubeClient: Kubernetes, gitopsNamespace: string, githubOrganization: string, repositoryName: string) {
    //Check, if gitops repo exists and delete
    await gitHubClient.checkIfRepositoryExistsAndDelete(githubOrganization, `${repositoryName}-gitops`);

    //Check, if repo exists and delete
    await gitHubClient.checkIfRepositoryExistsAndDelete(githubOrganization, repositoryName);

    //Delete app of apps from argo
    await kubeClient.deleteApplicationFromNamespace(gitopsNamespace, `${repositoryName}-app-of-apps`);
}

export async function cleanAfterTestGitLab(gitLabProvider: GitLabProvider, kubeClient: Kubernetes, gitopsNamespace: string, gitLabOrganization: string, gitlabRepositoryID: number, repositoryName: string) {
    //Check, if gitops repo exists and delete
    const gitlabRepositoryIDGitOps = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`);
    await gitLabProvider.deleteProject(gitlabRepositoryIDGitOps);

    //Check, if repo exists and delete
    await gitLabProvider.deleteProject(gitlabRepositoryID);

    //Delete app of apps from argo
    await kubeClient.deleteApplicationFromNamespace(gitopsNamespace, `${repositoryName}-app-of-apps`);
}

export async function cleanAfterTestBitbucket(bitbucketClient: BitbucketProvider, kubeClient: Kubernetes, gitopsNamespace: string, bitbucketWorkspace: string, repositoryName: string) {
    //Check, if gitops repo exists and delete
    if (await bitbucketClient.checkIfRepositoryExists(bitbucketWorkspace, `${repositoryName}-gitops`)) {
        await bitbucketClient.deleteRepository(bitbucketWorkspace, `${repositoryName}-gitops`);
    }

    //Check, if repo exists and delete
    if (await bitbucketClient.checkIfRepositoryExists(bitbucketWorkspace, repositoryName)) {
        await bitbucketClient.deleteRepository(bitbucketWorkspace, repositoryName);
    }

    //Delete app of apps from argo
    await kubeClient.deleteApplicationFromNamespace(gitopsNamespace, `${repositoryName}-app-of-apps`);
}

export async function waitForStringInPageContent(
    url: string,
    searchString: string,
    timeout = 60000, // Default timeout is 60 seconds
    interval = 5000 // Check every 5 seconds
): Promise<boolean> {
    const endTime = Date.now() + timeout;
    while (Date.now() < endTime) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Error fetching page content: ${response.statusText}`);
            }
            const content = await response.text();
            // Check if the content contains the specific string
            if (content.includes(searchString)) {
                return true;
            }
            // Wait for the specified interval before checking again
            await new Promise(resolve => setTimeout(resolve, interval));
        } catch (error) {
            console.error('Error during fetch:', error);
            throw error;
        }
    }
    // Return false if the timeout is reached and the string was not found
    return false;
}

export async function getRHTAPRootNamespace() {
    return process.env.RHTAP_ROOT_NAMESPACE ?? 'rhtap';
}

export async function getRHTAPGitopsNamespace() {
    return process.env.RHTAP_GITOPS_NAMESPACE ?? 'rhtap-gitops';
}

export async function getRHTAPRHDHNamespace() {
    return process.env.RHTAP_RHDH_NAMESPACE ?? 'rhtap-dh';
}

export async function getGitHubClient(kubeClient: Kubernetes) {
    if (process.env.GITHUB_TOKEN) {
        return new GitHubProvider(process.env.GITHUB_TOKEN);
    } else {
        return new GitHubProvider(await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "rhtap-github-integration", "token"));
    }
}

export async function getDeveloperHubClient(kubeClient: Kubernetes) {
    if (process.env.RED_HAT_DEVELOPER_HUB_URL) {
        return new DeveloperHubClient(process.env.RED_HAT_DEVELOPER_HUB_URL);
    } else {
        return new DeveloperHubClient(await kubeClient.getDeveloperHubRoute(await getRHTAPRHDHNamespace()));
    }
}

export async function getJenkinsCI(kubeClient: Kubernetes) {
    if (process.env.JENKINS_URL && process.env.JENKINS_USERNAME && process.env.JENKINS_TOKEN) {
        return new JenkinsCI(process.env.JENKINS_URL, process.env.JENKINS_USERNAME, process.env.JENKINS_TOKEN);
    } else {
        const jenkinsURL = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "JENKINS__BASEURL");
        const jenkinsUsername = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "JENKINS__USERNAME");
        const jenkinsToken = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "JENKINS__TOKEN");
        return new JenkinsCI(jenkinsURL, jenkinsUsername, jenkinsToken);
    }
}

export async function getGitLabProvider(kubeClient: Kubernetes) {
    if (process.env.GITLAB_TOKEN) {
        return new GitLabProvider(process.env.GITLAB_TOKEN);
    } else {
        return new GitLabProvider(await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "GITLAB__TOKEN"));
    }
}

export async function getBitbucketClient(kubeClient: Kubernetes) {
    if (process.env.BITBUCKET_APP_PASSWORD && process.env.BITBUCKET_USERNAME) {
        return new BitbucketProvider(process.env.BITBUCKET_USERNAME, process.env.BITBUCKET_APP_PASSWORD);
    } else {
        const bitbucketUserName = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "BITBUCKET__USERNAME");
        const bitbucketAppPassword = await kubeClient.getDeveloperHubSecret(await getRHTAPRHDHNamespace(), "developer-hub-rhtap-env", "BITBUCKET__APP_PASSWORD");
        return new BitbucketProvider(bitbucketUserName, bitbucketAppPassword);
    }
}

export async function getCosignPassword(kubeClient: Kubernetes) {
    if (process.env.COSIGN_SECRET_PASSWORD) {
        return process.env.COSIGN_SECRET_PASSWORD;
    } else {
        return await kubeClient.getCosignPassword();
    }
}

export async function getCosignPrivateKey(kubeClient: Kubernetes) {
    if (process.env.COSIGN_SECRET_KEY) {
        return process.env.COSIGN_SECRET_KEY;
    } else {
        return await kubeClient.getCosignPrivateKey();
    }
}

export async function getCosignPublicKey(kubeClient: Kubernetes) {
    if (process.env.COSIGN_PUBLIC_KEY) {
        return process.env.COSIGN_PUBLIC_KEY;
    } else {
        return await kubeClient.getCosignPublicKey();
    }
}

export async function waitForComponentCreation(backstageClient: DeveloperHubClient, repositoryName: string, developerHubTask: TaskIdReponse) {
    const taskCreated = await backstageClient.getTaskProcessed(developerHubTask.id, 120000);

    if (taskCreated.status !== 'completed') {
        console.log("Failed to create backstage task. Creating logs...");

        try {
            const logs = await backstageClient.getEventStreamLog(taskCreated.id);
            await backstageClient.writeLogsToArtifactDir('backstage-tasks-logs', `gitlab-${repositoryName}.log`, logs);
        } catch (error) {
            throw new Error(`Failed to write logs to artifact directory: ${error}`);
        }
    } else {
        console.log("Task created successfully in backstage");
    }
}

export async function checkComponentSyncedInArgoAndRouteIsWorking(kubeClient: Kubernetes, backstageClient: DeveloperHubClient, namespaceName: string, environmentName: string, repositoryName: string, stringOnRoute: string) {
    console.log(`syncing argocd application in ${environmentName} environment`);
    await syncArgoApplication(await getRHTAPGitopsNamespace(), `${repositoryName}-${environmentName}`);
    const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, namespaceName);
    const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}`, 10 * 60 * 1000);
    if (!isReady) {
        throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
    }
    console.log(`waiting for application page to be ready in ${environmentName} environment`);
    expect(await waitForStringInPageContent(`https://${componentRoute}`, stringOnRoute, 600000)).toBe(true);
}

export async function checkEnvVariablesGitLab(componentRootNamespace: string, gitLabOrganization: string, imageOrg: string, ciNamespace: string, kubeClient: Kubernetes) {
    if (componentRootNamespace === '') {
        throw new Error("The 'APPLICATION_ROOT_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (gitLabOrganization === '') {
        throw new Error("The 'GITLAB_ORGANIZATION_PUBLIC' or 'GITLAB_ORGANIZATION_PRIVATE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (imageOrg === '') {
        throw new Error("The 'IMAGE_REGISTRY_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (!await kubeClient.namespaceExists(ciNamespace)) {
        throw new Error(`The CI namespace was not created. Make sure ${ciNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
    }
}


export async function checkEnvVariablesGitHub(componentRootNamespace: string, githubOrganization: string, imageOrg: string, ciNamespace: string, kubeClient: Kubernetes) {
    if (componentRootNamespace === '') {
        throw new Error("The 'APPLICATION_ROOT_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (githubOrganization === '') {
        throw new Error("The 'GITHUB_ORGANIZATION' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (imageOrg === '') {
        throw new Error("The 'IMAGE_REGISTRY_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    const namespaceExists = await kubeClient.namespaceExists(ciNamespace);

    if (!namespaceExists) {
        throw new Error(`The CI namespace was not created. Make sure ${ciNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
    }
}

export async function checkEnvVariablesBitbucket(componentRootNamespace: string, bitbucketWorkspace: string, bitbucketProject: string, imageOrg: string, ciNamespace: string, kubeClient: Kubernetes) {
    if (componentRootNamespace === '') {
        throw new Error("The 'APPLICATION_ROOT_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (bitbucketWorkspace === '') {
        throw new Error("The 'BITBUCKET_WORKSPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (bitbucketProject === '') {
        throw new Error("The 'BITBUCKET_PROJECT' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (imageOrg === '') {
        throw new Error("The 'IMAGE_REGISTRY_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    const namespaceExists = await kubeClient.namespaceExists(ciNamespace);

    if (!namespaceExists) {
        throw new Error(`The CI namespace was not created. Make sure ${ciNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
    }

}

/**
    * Creates a task creator options for Developer Hub to generate a new component using specified git and kube options.
    * 
    * @param {string} softwareTemplateName Refers to the Developer Hub template name.
    * @param {string} imageName Registry image name for the component to be pushed.
    * @param {string} imageOrg Registry organization name for the component to be pushed.
    * @param {string} imageRegistry Image registry provider. Default is Quay.io.
    * @param {string} repositoryName Name of the GitLab repository.
    * @param {string} gitLabOrganization Owner of the GitLab repository.
    * @param {string} componentRootNamespace Kubernetes namespace where ArgoCD will create component manifests.
    * @param {string} ciType CI Type: "jenkins" "tekton"
*/
export async function createTaskCreatorOptionsGitlab(softwareTemplateName: string, imageName: string, imageOrg: string, imageRegistry: string, gitLabOrganization: string, repositoryName: string, componentRootNamespace: string, ciType: string): Promise<ScaffolderScaffoldOptions> {
    const taskCreatorOptions: ScaffolderScaffoldOptions = {
        templateRef: `template:default/${softwareTemplateName}`,
        values: {
            branch: 'main',
            glHost: 'gitlab.com',
            hostType: 'GitLab',
            imageName: imageName,
            imageOrg: imageOrg,
            imageRegistry: imageRegistry,
            name: repositoryName,
            namespace: componentRootNamespace,
            owner: "user:guest",
            repoName: repositoryName,
            glOwner: gitLabOrganization,
            ciType: ciType
        }
    };
    return taskCreatorOptions;
}

/**
    * Creates a task creator options for Developer Hub to generate a new component using specified git and kube options.
    * 
    * @param {string} softwareTemplateName Refers to the Developer Hub template name.
    * @param {string} imageName Registry image name for the component to be pushed.
    * @param {string} imageOrg Registry organization name for the component to be pushed.
    * @param {string} imageRegistry Image registry provider. Default is Quay.io.
    * @param {string} repositoryName Name of the GitHub repository.
    * @param {string} gitHubOrganization Owner of the GitHub repository.
    * @param {string} componentRootNamespace Kubernetes namespace where ArgoCD will create component manifests.
    * @param {string} ciType CI Type: "jenkins" "tekton"
*/
export async function createTaskCreatorOptionsGitHub(softwareTemplateName: string, imageName: string, imageOrg: string, imageRegistry: string, gitHubOrganization: string, repositoryName: string, componentRootNamespace: string, ciType: string): Promise<ScaffolderScaffoldOptions> {
    const taskCreatorOptions: ScaffolderScaffoldOptions = {
        templateRef: `template:default/${softwareTemplateName}`,
        values: {
            branch: 'main',
            ghHost: 'github.com',
            hostType: 'GitHub',
            imageName: imageName,
            imageOrg: imageOrg,
            imageRegistry: imageRegistry,
            name: repositoryName,
            namespace: componentRootNamespace,
            owner: "user:guest",
            repoName: repositoryName,
            ghOwner: gitHubOrganization,
            ciType: ciType
        }
    };
    return taskCreatorOptions;
}

/**
    * Creates a task creator options for Developer Hub to generate a new component using specified git and kube options.
    * 
    * @param {string} softwareTemplateName Refers to the Developer Hub template name.
    * @param {string} imageName Registry image name for the component to be pushed.
    * @param {string} imageOrg Registry organization name for the component to be pushed.
    * @param {string} imageRegistry Image registry provider. Default is Quay.io.
    * @param {string} repositoryName Name of the GitHub repository.
    * @param {string} gitHubOrganization Owner of the GitHub repository.
    * @param {string} componentRootNamespace Kubernetes namespace where ArgoCD will create component manifests.
    * @param {string} ciType CI Type: "jenkins" "tekton"
*/
export async function createImportTaskGitHub(newRepositoryName: string, inputUrl: string, imageName: string, imageOrg: string, imageRegistry: string, gitHubOrganization: string, componentRootNamespace: string, ciType: string): Promise<ScaffolderScaffoldOptions> {
    const taskCreatorOptions: ScaffolderScaffoldOptions = {
        templateRef: `template:default/import-repo`,
        values: {
            name: newRepositoryName,
            owner: "user:guest",
            inputUrl: inputUrl,
            dockerfileLocation: "Dockerfile",
            dockerfileBuildContext: ".",
            appPort: "8080",
            hostType: 'GitHub',
            repoName: newRepositoryName,
            branch: 'main',
            ghOwner: gitHubOrganization,
            ghHost: 'github.com',
            imageRegistry: imageRegistry,
            imageName: imageName,
            imageOrg: imageOrg,
            namespace: componentRootNamespace,
            ciType: ciType
        }
    };
    return taskCreatorOptions;
}

/**
    * Creates a task creator options for Developer Hub to generate a new component using specified git and kube options.
    *
    * @param {string} softwareTemplateName Refers to the Developer Hub template name.
    * @param {string} imageName Registry image name for the component to be pushed.
    * @param {string} imageOrg Registry organization name for the component to be pushed.
    * @param {string} imageRegistry Image registry provider. Default is Quay.io.
    * @param {string} bitbucketUsername Bitbucket username to create repo in Bitbucket.
    * @param {string} bitbucketWorkspace Bitbucket workspace where repo to be created in Bitbucket.
    * @param {string} bitbucketProject Bitbucket project where repo to be created in Bitbucket.
    * @param {string} repositoryName Name of the Bitbucket repository.
    * @param {string} componentRootNamespace Kubernetes namespace where ArgoCD will create component manifests.
    * @param {string} ciType CI Type: "jenkins" "tekton"
*/
export async function createTaskCreatorOptionsBitbucket(softwareTemplateName: string, imageName: string, imageOrg: string, imageRegistry: string, bitbucketUsername: string, bitbucketWorkspace: string, bitbucketProject: string, repositoryName: string, componentRootNamespace: string, ciType: string): Promise<ScaffolderScaffoldOptions> {
    const taskCreatorOptions: ScaffolderScaffoldOptions = {
        templateRef: `template:default/${softwareTemplateName}`,
        values: {
            branch: 'main',
            bbHost: 'bitbucket.org',
            hostType: 'Bitbucket',
            imageName: imageName,
            imageOrg: imageOrg,
            imageRegistry: imageRegistry,
            name: repositoryName,
            namespace: componentRootNamespace,
            owner: "user:guest",
            repoName: repositoryName,
            bbOwner: bitbucketUsername,
            workspace: bitbucketWorkspace,
            project: bitbucketProject,
            ciType: ciType
        }
    };

    return taskCreatorOptions;
}

export async function waitForJenkinsJobToFinish(jenkinsClient: JenkinsCI, jobName: string, jobBuildNumber: number) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const jobStatus = await jenkinsClient.waitForJobToFinishInFolder(jobName, jobBuildNumber, 540000, jobName);
    expect(jobStatus).not.toBe(undefined);
    expect(jobStatus).toBe("SUCCESS");
}

/**
 * Checks whether an ACS scan has passed for a given repository.
 * 
 * This function retrieves the pipeline run associated with a repository, looks for the 
 * ACS image scan pod related to the pipeline, and checks the container logs to determine 
 * if the scan was successful.
 * 
 * @param {string} repositoryName - The name of the repository for which the pipeline run is triggered.
 * @param {string} ciNamespace - The Kubernetes namespace where the CI resources (including the ACS scan pod) are deployed.
 * @param {string} eventType - The type of the event which triggered the pipeline.
 * @returns {Promise<boolean>} A Promise that resolves to `true` if the ACS scan was successful, or `false` if not.
 * @throws {Error} If the pipeline run cannot be found or if there is an error interacting with the Kubernetes API.
 * 
 */
export async function checkIfAcsScanIsPass(kubeClient: Kubernetes, repositoryName: string, ciNamespace: string, eventType: string): Promise<boolean> {
    const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, eventType);
    if (pipelineRun?.metadata?.name) {
        const podName: string = pipelineRun.metadata.name + '-acs-image-scan-pod';
        // Read the logs from the related container
        const podLogs: unknown = await kubeClient.readContainerLogs(podName, ciNamespace, 'step-rox-image-scan');
        if (typeof podLogs !== "string") {
            throw new Error(`Failed to retrieve container logs: Expected a string but got ${typeof podLogs}`);
        }
        // Print the logs from the container 
        console.log("Logs from acs-image-scan for pipelineRun " + pipelineRun.metadata.name + ": \n\n" + podLogs);
        const regex = new RegExp("\"result\":\"SUCCESS\"", 'i');
        // Verify if the scan was success from logs
        const result: boolean = regex.test(podLogs);
        return (result);
    }
    // Returns false when if condition not met
    return false;
}

export async function setSecretsForGitLabCI(gitLabProvider: GitLabProvider, gitlabRepositoryID: number, kubeClient: Kubernetes) {
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_PUBLIC_KEY", await getCosignPublicKey(kubeClient));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_KEY", await getCosignPrivateKey(kubeClient));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_PASSWORD", await getCosignPassword(kubeClient));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_USERNAME", 'fakeUsername');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_PASSWORD", await gitLabProvider.getGitlabToken());
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "IMAGE_REGISTRY_PASSWORD", process.env.IMAGE_REGISTRY_PASSWORD ?? '');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "IMAGE_REGISTRY_USER", process.env.IMAGE_REGISTRY_USERNAME ?? '');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "ROX_API_TOKEN", await kubeClient.getACSToken(await getRHTAPRootNamespace()));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "ROX_CENTRAL_ENDPOINT", await kubeClient.getACSEndpoint(await getRHTAPRootNamespace()));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "TRUSTIFICATION_BOMBASTIC_API_URL", await kubeClient.getTTrustificationBombasticApiUrl(await getRHTAPRootNamespace()));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "TRUSTIFICATION_OIDC_ISSUER_URL", await kubeClient.getTTrustificationOidcIssuerUrl(await getRHTAPRootNamespace()));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "TRUSTIFICATION_OIDC_CLIENT_ID", await kubeClient.getTTrustificationClientId(await getRHTAPRootNamespace()));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "TRUSTIFICATION_OIDC_CLIENT_SECRET", await kubeClient.getTTrustificationClientSecret(await getRHTAPRootNamespace()));
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION", await kubeClient.getTTrustificationSupportedCycloneDXVersion(await getRHTAPRootNamespace()));
}

export async function waitForGitLabCIPipelineToFinish(gitLabProvider: GitLabProvider, gitlabRepositoryID: number, pipelineRunNumber: number) {
    await gitLabProvider.waitForPipelinesToBeCreated(gitlabRepositoryID, pipelineRunNumber, 10000);
    const response = await gitLabProvider.getLatestPipeline(gitlabRepositoryID);

    if (response?.id) {
        const pipelineResult = await gitLabProvider.waitForPipelineToFinish(gitlabRepositoryID, response.id, 540000);
        expect(pipelineResult).toBe("success");
    }
}

/**
 * Verifies the syft image path used for pipelinerun
 * 
 * This function retrieves the pipeline run associated with a repository, looks for the 
 * build-container pod related to the pipeline, and verifies the rh-syft image path 
 * If not found,return pod yaml for reference
 * 
 * @param {string} repositoryName - The name of the repository for which the pipeline run is triggered.
 * @param {string} ciNamespace - The Kubernetes namespace where the CI resources (including the ACS scan pod) are deployed.
 * @param {string} eventType - The type of the event which triggered the pipeline.
 * @returns {Promise<boolean>} A Promise that resolves to `true` if image verification is successful, or `false` if not.
 * @throws {Error} If the pipeline run cannot be found or if there is an error interacting with the Kubernetes API.
 * 
 */
export async function verifySyftImagePath(kubeClient: Kubernetes, repositoryName: string, ciNamespace: string, eventType: string): Promise<boolean> {
    const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, eventType);
    let result = true;
    if (pipelineRun?.metadata?.name) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc: any = await kubeClient.pipelinerunfromName(pipelineRun.metadata.name, ciNamespace);
        const index = doc.spec.pipelineSpec.tasks.findIndex((item: { name: string; }) => item.name === "build-container");
        const regex = new RegExp("registry.redhat.io/rh-syft-tech-preview/syft-rhel9", 'i');
        const imageIndex: number = (doc.spec.pipelineSpec.tasks[index].taskSpec.steps.findIndex((item: { image: string; }) => regex.test(item.image)));
        if (imageIndex !== -1) {
            console.log("The image path found is " + doc.spec.pipelineSpec.tasks[index].taskSpec.steps[imageIndex].image);
        }
        else {
            const podName: string = pipelineRun.metadata.name + '-build-container-pod';
            // Read the yaml of the given pod
            const podYaml = await kubeClient.getPodYaml(podName, ciNamespace);
            console.log(`The image path not found.The build-container pod yaml is : \n${podYaml}`);
            result = false;
        }
    }
    return result;
}

/**
 * Search SBOm in trustification by string, which could be SBOM name, SBOm version...
 * 
 * @param {Kubernetes} kubeClient - Kubernetes client.
 * @param {string} searchString - String to search in trustification: for example SBOM, name, SBOm version...
 * @throws {Error} If there is an error during search.
 */
export async function checkSBOMInTrustification(kubeClient: Kubernetes, searchString: string) {
    const bombasticApiUrl = await kubeClient.getTTrustificationBombasticApiUrl(await getRHTAPRootNamespace());
    const oidcIssuesUrl = await kubeClient.getTTrustificationOidcIssuerUrl(await getRHTAPRootNamespace());
    const oidcclientId = await kubeClient.getTTrustificationClientId(await getRHTAPRootNamespace());
    const oidcclientSecret = await kubeClient.getTTrustificationClientSecret(await getRHTAPRootNamespace());

    const trust = new TrustificationClient(bombasticApiUrl, oidcIssuesUrl, oidcclientId, oidcclientSecret);

    try {
        await trust.initializeTpaToken();
        const sbomData = await trust.waitForSbomSearchByName(searchString);
        console.log('SBOM Data:', sbomData);
    } catch (error) {
        console.error('Error fetching SBOM data:', error);
        throw error;
    }
}

export async function setSecretsForJenkinsInFolder(jenkinsClient: JenkinsCI, kubeClient: Kubernetes, folderName: string, scmProvider: string) {
    if (scmProvider == "gitlab") {
        await jenkinsClient.createCredentialsInFolder("GLOBAL", "GITOPS_AUTH_USERNAME", 'fakeUsername', folderName);
        await jenkinsClient.createCredentialsInFolder("GLOBAL", "GITOPS_AUTH_PASSWORD", process.env.GITLAB_TOKEN ?? '', folderName);
        await jenkinsClient.createCredentialsUsernamePasswordInFolder("GLOBAL", "GITOPS_CREDENTIALS", "fakeUsername", process.env.GITLAB_TOKEN ?? '', folderName);
    } else if (scmProvider == "bitbucket") {
        await jenkinsClient.createCredentialsInFolder("GLOBAL", "GITOPS_AUTH_USERNAME", process.env.BITBUCKET_USERNAME ?? '', folderName);
        await jenkinsClient.createCredentialsInFolder("GLOBAL", "GITOPS_AUTH_PASSWORD", process.env.BITBUCKET_APP_PASSWORD ?? '', folderName);
        await jenkinsClient.createCredentialsUsernamePasswordInFolder("GLOBAL", "GITOPS_CREDENTIALS", process.env.BITBUCKET_USERNAME ?? '', process.env.BITBUCKET_APP_PASSWORD ?? '', folderName);
    } else {
        await jenkinsClient.createCredentialsInFolder("GLOBAL", "GITOPS_AUTH_PASSWORD", process.env.GITHUB_TOKEN ?? '', folderName);
        await jenkinsClient.createCredentialsUsernamePasswordInFolder("GLOBAL", "GITOPS_CREDENTIALS", "fakeUsername", process.env.GITHUB_TOKEN ?? '', folderName);
    }
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "COSIGN_SECRET_KEY", await getCosignPrivateKey(kubeClient), folderName);
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "COSIGN_SECRET_PASSWORD", await getCosignPassword(kubeClient), folderName);
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "IMAGE_REGISTRY_PASSWORD", process.env.IMAGE_REGISTRY_PASSWORD ?? '', folderName);
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "ROX_API_TOKEN", await kubeClient.getACSToken(await getRHTAPRootNamespace()), folderName);
}

export async function setSecretsForJenkinsInFolderForTPA(jenkinsClient: JenkinsCI, kubeClient: Kubernetes, folderName: string) {
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "TRUSTIFICATION_BOMBASTIC_API_URL", await kubeClient.getTTrustificationBombasticApiUrl(await getRHTAPRootNamespace()), folderName);
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "TRUSTIFICATION_OIDC_ISSUER_URL", await kubeClient.getTTrustificationOidcIssuerUrl(await getRHTAPRootNamespace()), folderName);
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "TRUSTIFICATION_OIDC_CLIENT_ID", await kubeClient.getTTrustificationClientId(await getRHTAPRootNamespace()), folderName);
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "TRUSTIFICATION_OIDC_CLIENT_SECRET", await kubeClient.getTTrustificationClientSecret(await getRHTAPRootNamespace()), folderName);
    await jenkinsClient.createCredentialsInFolder("GLOBAL", "TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION", await kubeClient.getTTrustificationSupportedCycloneDXVersion(await getRHTAPRootNamespace()), folderName);
}

export async function setGitHubActionSecrets(gitHubClient: GitHubProvider, kubeClient: Kubernetes, githubOrganization: string, repositoryName: string) {
    await gitHubClient.setGitHubSecrets(githubOrganization, repositoryName, {
        "ROX_API_TOKEN": await kubeClient.getACSToken(await getRHTAPRootNamespace()),
        "GITOPS_AUTH_PASSWORD": process.env.GITHUB_TOKEN || '',
        "IMAGE_REGISTRY_PASSWORD": process.env.IMAGE_REGISTRY_PASSWORD || '',
        "COSIGN_SECRET_PASSWORD": await getCosignPassword(kubeClient),
        "COSIGN_SECRET_KEY": await getCosignPrivateKey(kubeClient),
        "TRUSTIFICATION_OIDC_CLIENT_SECRET": await kubeClient.getTTrustificationClientSecret(await getRHTAPRootNamespace()),
    });
}

export async function setGitHubActionVariables(gitHubClient: GitHubProvider, kubeClient: Kubernetes, githubOrganization: string, repositoryName: string, imageRegistry: string) {
    await gitHubClient.setGitHubVariables(githubOrganization, repositoryName, {
        "IMAGE_REGISTRY": imageRegistry,
        "ROX_CENTRAL_ENDPOINT": await kubeClient.getACSEndpoint(await getRHTAPRootNamespace()),
        "IMAGE_REGISTRY_USER": process.env.IMAGE_REGISTRY_USERNAME || '',
        "COSIGN_PUBLIC_KEY": await getCosignPublicKey(kubeClient),
        "REKOR_HOST": await kubeClient.getRekorServerUrl(await getRHTAPRootNamespace()) || '',
        "TUF_MIRROR": await kubeClient.getTUFUrl(await getRHTAPRootNamespace()) || '',
        "TRUSTIFICATION_BOMBASTIC_API_URL": await kubeClient.getTTrustificationBombasticApiUrl(await getRHTAPRootNamespace()),
        "TRUSTIFICATION_OIDC_ISSUER_URL":  await kubeClient.getTTrustificationOidcIssuerUrl(await getRHTAPRootNamespace()),
        "TRUSTIFICATION_OIDC_CLIENT_ID": await kubeClient.getTTrustificationClientId(await getRHTAPRootNamespace()),
        "TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION": await kubeClient.getTTrustificationSupportedCycloneDXVersion(await getRHTAPRootNamespace()),
    });
}

//Parse SBOM version from build log
export async function parseSbomVersionFromLogs(log: string): Promise<string> {
    const filter = log.split("Uploading SBOM file for").pop()?.split("vnd.cyclonedx+json").shift()?.trim();
    if (filter != undefined){
        return filter.substring(
            filter.indexOf("sha256-") + 7,
            filter.lastIndexOf(".sbom")
        );
    } else {
        return "";
    }
}
