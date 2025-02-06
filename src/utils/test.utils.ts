import { GitLabProvider } from "../../src/apis/git-providers/gitlab";
import { GitHubProvider } from "../../src/apis/git-providers/github";
import { Kubernetes } from "../../src/apis/kubernetes/kube";
import { DeveloperHubClient } from "../../src/apis/backstage/developer-hub";
import { JenkinsCI } from "../../src/apis/ci/jenkins";
import { ScaffolderScaffoldOptions } from "@backstage/plugin-scaffolder-react";
import { syncArgoApplication } from "./argocd";
import { TaskIdReponse } from "../../src/apis/backstage/types";
import { TrustificationClient } from "../../src/apis/trustification/trustification";


export async function cleanAfterTestGitHub(gitHubClient: GitHubProvider, kubeClient: Kubernetes, rootNamespace: string, githubOrganization: string, repositoryName: string) {
    //Check, if gitops repo exists and delete
    await gitHubClient.checkIfRepositoryExistsAndDelete(githubOrganization, `${repositoryName}-gitops`);

    //Check, if repo exists and delete
    await gitHubClient.checkIfRepositoryExistsAndDelete(githubOrganization, repositoryName);

    //Delete app of apps from argo
    await kubeClient.deleteApplicationFromNamespace(rootNamespace, `${repositoryName}-app-of-apps`);
}

export async function cleanAfterTestGitLab(gitLabProvider: GitLabProvider, kubeClient: Kubernetes, rootNamespace: string, gitLabOrganization: string, gitlabRepositoryID: number, repositoryName: string) {
    //Check, if gitops repo exists and delete
    const gitlabRepositoryIDGitOps = await gitLabProvider.checkIfRepositoryExists(gitLabOrganization, `${repositoryName}-gitops`);
    await gitLabProvider.deleteProject(gitlabRepositoryIDGitOps);

    //Check, if repo exists and delete
    await gitLabProvider.deleteProject(gitlabRepositoryID);

    //Delete app of apps from argo
    await kubeClient.deleteApplicationFromNamespace(rootNamespace, `${repositoryName}-app-of-apps`);
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

export async function getGitHubClient(kubeClient: Kubernetes) {
    if (process.env.GITHUB_TOKEN) {
        return new GitHubProvider(process.env.GITHUB_TOKEN);
    } else {
        return new GitHubProvider(await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "rhtap-github-integration", "token"));
    }
}

export async function getDeveloperHubClient(kubeClient: Kubernetes) {
    if (process.env.RED_HAT_DEVELOPER_HUB_URL) {
        return new DeveloperHubClient(process.env.RED_HAT_DEVELOPER_HUB_URL);
    } else {
        return new DeveloperHubClient(await kubeClient.getDeveloperHubRoute(await getRHTAPRootNamespace()));
    }
}

export async function getJenkinsCI(kubeClient: Kubernetes) {
    if (process.env.JENKINS_URL && process.env.JENKINS_USERNAME && process.env.JENKINS_TOKEN) {
        return new JenkinsCI(process.env.JENKINS_URL, process.env.JENKINS_USERNAME, process.env.JENKINS_TOKEN);
    } else {
        const jenkinsURL = await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__BASEURL");
        const jenkinsUsername = await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__USERNAME");
        const jenkinsToken = await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__TOKEN");
        return new JenkinsCI(jenkinsURL, jenkinsUsername, jenkinsToken);
    }
}

export async function getGitLabProvider(kubeClient: Kubernetes) {
    if (process.env.GITLAB_TOKEN) {
        return new GitLabProvider(process.env.GITLAB_TOKEN);
    } else {
        return new GitLabProvider(await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "GITLAB__TOKEN"));
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
    await syncArgoApplication(await getRHTAPRootNamespace(), `${repositoryName}-${environmentName}`);
    const componentRoute = await kubeClient.getOpenshiftRoute(repositoryName, namespaceName);
    const isReady = await backstageClient.waitUntilComponentEndpointBecomeReady(`https://${componentRoute}`, 10 * 60 * 1000);
    if (!isReady) {
        throw new Error("Component seems was not synced by ArgoCD in 10 minutes");
    }
    expect(await waitForStringInPageContent(`https://${componentRoute}`, stringOnRoute, 120000)).toBe(true);
}

export async function checkEnvVariablesGitLab(componentRootNamespace: string, gitLabOrganization: string, quayImageOrg: string, developmentNamespace: string, kubeClient: Kubernetes) {
    if (componentRootNamespace === '') {
        throw new Error("The 'APPLICATION_TEST_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (gitLabOrganization === '') {
        throw new Error("The 'GITLAB_ORGANIZATION' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (quayImageOrg === '') {
        throw new Error("The 'QUAY_IMAGE_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (!await kubeClient.namespaceExists(developmentNamespace)) {
        throw new Error(`The development namespace was not created. Make sure you have created ${developmentNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
    }
}

export async function checkEnvVariablesGitHub(componentRootNamespace: string, githubOrganization: string, quayImageOrg: string, developmentNamespace: string, kubeClient: Kubernetes) {
    if (componentRootNamespace === '') {
        throw new Error("The 'APPLICATION_TEST_NAMESPACE' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (githubOrganization === '') {
        throw new Error("The 'GITHUB_ORGANIZATION' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    if (quayImageOrg === '') {
        throw new Error("The 'QUAY_IMAGE_ORG' environment variable is not set. Please ensure that the environment variable is defined properly or you have cluster connection.");
    }

    const namespaceExists = await kubeClient.namespaceExists(developmentNamespace);

    if (!namespaceExists) {
        throw new Error(`The development namespace was not created. Make sure you have created ${developmentNamespace} is created and all secrets are created. Example: 'https://github.com/jduimovich/rhdh/blob/main/default-rhtap-ns-configure'`);
    }
}

/**
    * Creates a task creator options for Developer Hub to generate a new component using specified git and kube options.
    * 
    * @param {string} softwareTemplateName Refers to the Developer Hub template name.
    * @param {string} quayImageName Registry image name for the component to be pushed.
    * @param {string} quayImageOrg Registry organization name for the component to be pushed.
    * @param {string} imageRegistry Image registry provider. Default is Quay.io.
    * @param {string} repositoryName Name of the GitLab repository.
    * @param {string} gitLabOrganization Owner of the GitLab repository.
    * @param {string} componentRootNamespace Kubernetes namespace where ArgoCD will create component manifests.
    * @param {string} ciType CI Type: "jenkins" "tekton"
*/
export async function createTaskCreatorOptionsGitlab(softwareTemplateName: string, quayImageName: string, quayImageOrg: string, imageRegistry: string, gitLabOrganization: string, repositoryName: string, componentRootNamespace: string, ciType: string): Promise<ScaffolderScaffoldOptions> {
    const taskCreatorOptions: ScaffolderScaffoldOptions = {
        templateRef: `template:default/${softwareTemplateName}`,
        values: {
            branch: 'main',
            glHost: 'gitlab.com',
            hostType: 'GitLab',
            imageName: quayImageName,
            imageOrg: quayImageOrg,
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
    * @param {string} quayImageName Registry image name for the component to be pushed.
    * @param {string} quayImageOrg Registry organization name for the component to be pushed.
    * @param {string} imageRegistry Image registry provider. Default is Quay.io.
    * @param {string} repositoryName Name of the GitHub repository.
    * @param {string} gitLabOrganization Owner of the GitHub repository.
    * @param {string} componentRootNamespace Kubernetes namespace where ArgoCD will create component manifests.
    * @param {string} ciType CI Type: "jenkins" "tekton"
*/
export async function createTaskCreatorOptionsGitHub(softwareTemplateName: string, quayImageName: string, quayImageOrg: string, imageRegistry: string, gitLabOrganization: string, repositoryName: string, componentRootNamespace: string, ciType: string): Promise<ScaffolderScaffoldOptions> {
    const taskCreatorOptions: ScaffolderScaffoldOptions = {
        templateRef: `template:default/${softwareTemplateName}`,
        values: {
            branch: 'main',
            ghHost: 'github.com',
            hostType: 'GitHub',
            imageName: quayImageName,
            imageOrg: quayImageOrg,
            imageRegistry: imageRegistry,
            name: repositoryName,
            namespace: componentRootNamespace,
            owner: "user:guest",
            repoName: repositoryName,
            ghOwner: gitLabOrganization,
            ciType: ciType
        }
    };
    return taskCreatorOptions;
}

export async function waitForJenkinsJobToFinish(jenkinsClient: JenkinsCI, jobName: string, jobBuildNumber: number) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const jobStatus = await jenkinsClient.waitForBuildToFinish(jobName, jobBuildNumber, 540000);
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
 * @param {string} developmentNamespace - The Kubernetes namespace where the development resources (including the ACS scan pod) are deployed.
 * @returns {Promise<boolean>} A Promise that resolves to `true` if the ACS scan was successful, or `false` if not.
 * @throws {Error} If the pipeline run cannot be found or if there is an error interacting with the Kubernetes API.
 * 
 */
export async function checkIfAcsScanIsPass(kubeClient: Kubernetes, repositoryName: string, developmentNamespace: string):Promise<boolean> {
    const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'push');
    if (pipelineRun?.metadata?.name) {
        const podName: string = pipelineRun.metadata.name + '-acs-image-scan-pod';
        // Read the logs from the related container
        const podLogs: any = await kubeClient.readContainerLogs(podName, developmentNamespace, 'step-rox-image-scan');
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
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_PUBLIC_KEY", process.env.COSIGN_PUBLIC_KEY ?? '');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_KEY", process.env.COSIGN_SECRET_KEY ?? '');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "COSIGN_SECRET_PASSWORD", process.env.COSIGN_SECRET_PASSWORD ?? '');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_USERNAME", 'fakeUsername');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "GITOPS_AUTH_PASSWORD", await gitLabProvider.getGitlabToken());
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "IMAGE_REGISTRY_PASSWORD", process.env.QUAY_PASSWORD ?? '');
    await gitLabProvider.setEnvironmentVariable(gitlabRepositoryID, "IMAGE_REGISTRY_USER", process.env.QUAY_USERNAME ?? '');
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

    if(response?.id){
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
 * @param {string} developmentNamespace - The Kubernetes namespace where the development resources (including the ACS scan pod) are deployed.
 * @returns {Promise<boolean>} A Promise that resolves to `true` if image verification is successful, or `false` if not.
 * @throws {Error} If the pipeline run cannot be found or if there is an error interacting with the Kubernetes API.
 * 
 */
export async function verifySyftImagePath(kubeClient: Kubernetes, repositoryName: string, developmentNamespace: string): Promise<boolean> {
    const pipelineRun = await kubeClient.getPipelineRunByRepository(repositoryName, 'push');
    let result = true;
    if (pipelineRun?.metadata?.name) {
        const doc: any = await kubeClient.pipelinerunfromName(pipelineRun.metadata.name, developmentNamespace);
        const index = doc.spec.pipelineSpec.tasks.findIndex((item: { name: string; }) => item.name === "build-container");
        const regex = new RegExp("registry.redhat.io/rh-syft-tech-preview/syft-rhel9", 'i');
        const imageIndex: number = (doc.spec.pipelineSpec.tasks[index].taskSpec.steps.findIndex((item: { image: string; }) => regex.test(item.image)));
        if (imageIndex !== -1) {
            console.log("The image path found is " + doc.spec.pipelineSpec.tasks[index].taskSpec.steps[imageIndex].image);
        }
        else {
            const podName: string = pipelineRun.metadata.name + '-build-container-pod';
            // Read the yaml of the given pod
            const podYaml = await kubeClient.getPodYaml(podName, developmentNamespace);
            console.log(`The image path not found.The build-container pod yaml is : \n${podYaml}`);
            result = false;
        }
    }
    return result;
}

export async function checkSBOMInTrustification(kubeClient: Kubernetes, componentId: string) {
    let trust: TrustificationClient;
    const bombasticApiUrl = await kubeClient.getTTrustificationBombasticApiUrl(await getRHTAPRootNamespace());
    const oidcIssuesUrl =await kubeClient.getTTrustificationOidcIssuerUrl(await getRHTAPRootNamespace()); 
    const oidcclientId = await kubeClient.getTTrustificationClientId(await getRHTAPRootNamespace());
    const oidcclientSecret = await kubeClient.getTTrustificationClientSecret(await getRHTAPRootNamespace());
    
    trust = new TrustificationClient(bombasticApiUrl, oidcIssuesUrl,oidcclientId, oidcclientSecret);

    try {
        await trust.initializeTpaToken();
        const sbomData = await trust.waitForSbomSearchByName(componentId);
        console.log('SBOM Data:', sbomData);
    } catch (error) {
        console.error('Error fetching SBOM data:', error);
    }
}
