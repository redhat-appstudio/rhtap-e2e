import { GitLabProvider } from "../../src/apis/git-providers/gitlab";
import { GitHubProvider } from "../../src/apis/git-providers/github";
import { Kubernetes } from "../../src/apis/kubernetes/kube";
<<<<<<< HEAD
import { DeveloperHubClient } from "../../src/apis/backstage/developer-hub";
import { JenkinsCI } from "../../src/apis/ci/jenkins";
=======
import { ScaffolderScaffoldOptions } from "@backstage/plugin-scaffolder-react";
>>>>>>> d704417 (RHTAP-2015 Jenkins tests for GitLab)


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

export async function waitForStringInPageContent(
    url: string,
    searchString: string,
    timeout: number = 60000, // Default timeout is 60 seconds
    interval: number = 5000 // Check every 5 seconds
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

<<<<<<< HEAD
export async function getRHTAPRootNamespace() {
    return process.env.RHTAP_ROOT_NAMESPACE || 'rhtap';
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
        const jenkinsURL = await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__BASEURL")
        const jenkinsUsername = await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__USERNAME")
        const jenkinsToken = await kubeClient.getDeveloperHubSecret(await getRHTAPRootNamespace(), "developer-hub-rhtap-env", "JENKINS__TOKEN")
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


=======
export async function checkEnvVariablesGitLab(componentRootNamespace: string, gitLabOrganization: string, quayImageOrg: string, developmentNamespace: string, kubeClient: Kubernetes){
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

export async function checkEnvVariablesGitHub(componentRootNamespace: string, githubOrganization: string, quayImageOrg: string, developmentNamespace: string, kubeClient: Kubernetes){
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
export async function createTaskCreatorOptionsGitlab(softwareTemplateName: string, quayImageName: string, quayImageOrg: string, imageRegistry: string, gitLabOrganization: string, repositoryName: string, componentRootNamespace: string, ciType: string) : Promise<ScaffolderScaffoldOptions>{
    const taskCreatorOptions: ScaffolderScaffoldOptions = {
        templateRef: `template:default/${softwareTemplateName}`,
        values: {
            branch: 'main',
            gitlabServer: 'gitlab.com',
            hostType: 'GitLab',
            imageName: quayImageName,
            imageOrg: quayImageOrg,
            imageRegistry: imageRegistry,
            name: repositoryName,
            namespace: componentRootNamespace,
            owner: "user:guest",
            repoName: repositoryName,
            repoOwner: gitLabOrganization,
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
        export async function createTaskCreatorOptionsGitHub(softwareTemplateName: string, quayImageName: string, quayImageOrg: string, imageRegistry: string, gitLabOrganization: string, repositoryName: string, componentRootNamespace: string, ciType: string) : Promise<ScaffolderScaffoldOptions>{
            const taskCreatorOptions: ScaffolderScaffoldOptions = {
                templateRef: `template:default/${softwareTemplateName}`,
                values: {
                    branch: 'main',
                    githubServer: 'github.com',
                    hostType: 'GitHub',
                    imageName: quayImageName,
                    imageOrg: quayImageOrg,
                    imageRegistry: imageRegistry,
                    name: repositoryName,
                    namespace: componentRootNamespace,
                    owner: "user:guest",
                    repoName: repositoryName,
                    repoOwner: gitLabOrganization,
                    ciType: ciType
                }
            };
            return taskCreatorOptions;
        }
>>>>>>> d704417 (RHTAP-2015 Jenkins tests for GitLab)
