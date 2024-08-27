import { GitLabProvider } from "../../src/apis/git-providers/gitlab";
import { GitHubProvider } from "../../src/apis/git-providers/github";
import { Kubernetes } from "../../src/apis/kubernetes/kube";


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