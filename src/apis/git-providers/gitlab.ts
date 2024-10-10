import { Gitlab, ProjectHookSchema } from "@gitbeaker/rest"
import { Utils } from "./utils";

export class GitLabProvider extends Utils {
    private readonly gitlab;
    private readonly extractImagePatternFromGitopsManifest;

    constructor() {
        super()

        if (!process.env.GITLAB_TOKEN) {
            throw new Error("missed environment GITLAB_TOKEN");
            
        }

        this.extractImagePatternFromGitopsManifest = /- image: (.*)/;
        this.gitlab = new Gitlab({
            host: 'https://gitlab.com',
            token: process.env.GITLAB_TOKEN
        })
    }

    // Function to find a repository by name
    public async checkIfRepositoryExists(namespace: string, repoName: string): Promise<number> {
        try {
            const projects = await this.gitlab.Projects.show(`${namespace}/${repoName}`);
            console.info(`Repository with name '${repoName}' found in namespace '${namespace}'
                created at '${projects.created_at}' url: gitlab.com/${namespace}/${repoName}`);

            return projects.id
        } catch (error) {
            console.error(error);

            throw new Error(`Failed to check if repository ${repoName} exists`);
        }
    }

    /**
     * checkIfRepositoryHaveFolder
     */
    public async checkIfRepositoryHaveFolder(repositoryID: number, folderPath: string): Promise<boolean> {
        const file = await this.gitlab.Repositories.allRepositoryTrees(repositoryID)

        return file.some((folder)=> {
            return folder.path === folderPath && folder.type === 'tree'
        })
    }

    /**
     * checkIfRepositoryHaveFile
     */
    public async checkIfRepositoryHaveFile(repositoryID: number, filePath: string): Promise<boolean> {
        try {
            await this.gitlab.RepositoryFiles.show(repositoryID, filePath, 'main');
            return true;
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                console.log('File does not exist.');
                return false;
            } else {
                console.error('Error checking file existence:', error);
                return false;
            }
        }
    }

    /**
     * name
     */
    public async createCommit(repositoryID: number, branchName: string) {
        try {

            await this.gitlab.Commits.create(
                repositoryID,
                branchName,
                'Commit message',
                [
                    {
                        action: 'create',
                        filePath: 'test.txt',
                        content: 'Hello world'
                    },
                ]
            );

        } catch (error) {
            console.log(error)
            throw new Error("Failed to create commit in Gitlab. Check bellow error");
        }
    }


    public async updateJenkinsfileAgent(repositoryID: number, branchName: string): Promise<boolean>  {
        let stringToFind = "agent any";
        let replacementString =  "agent {\n      kubernetes {\n        label 'jenkins-agent'\n        cloud 'openshift'\n        serviceAccount 'jenkins'\n        podRetention onFailure()\n        idleMinutes '5'\n        containerTemplate {\n         name 'jnlp'\n         image 'image-registry.openshift-image-registry.svc:5000/jenkins/jenkins-agent-base:latest'\n         ttyEnabled true\n         args '${computer.jnlpmac} ${computer.name}'\n        }\n       }    \n}";
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Update Jenkins agent', stringToFind, replacementString);
    }

    public async createUsernameCommit(repositoryID: number, branchName: string): Promise<boolean> {
        let stringToFind = "/* GITOPS_AUTH_USERNAME = credentials('GITOPS_AUTH_USERNAME') Uncomment this when using GitLab */"
        let replacementString = `GITOPS_AUTH_USERNAME = credentials('GITOPS_AUTH_USERNAME')`
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Update creds for Gitlab', stringToFind, replacementString);
    }

    public async enableACSJenkins(repositoryID: number, branchName: string): Promise<boolean> {
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'rhtap/env.sh', 'Update ACS scan for Gitlab', `DISABLE_ACS=true`, `DISABLE_ACS=false`);
    }

    public async commitReplacementStringInFile(repositoryID: number, branchName: string, filePath: string, commitMessage: string, textToReplace: string, replacement: string): Promise<boolean> {
        try {
            // Get the current content of the file
            const file = await this.gitlab.RepositoryFiles.show(repositoryID, filePath, branchName);
            const fileContent = Buffer.from(file.content, 'base64').toString('utf-8');
    
            // Replace specific text
            const updatedContent = fileContent.replace(textToReplace,replacement);
    
            // Encode the updated content to base64
            const encodedContent = Buffer.from(updatedContent).toString('base64');
    
            // Create a commit to update the file
            await this.gitlab.RepositoryFiles.edit(
                repositoryID,
                filePath,
                branchName,
                encodedContent,
                commitMessage,
                {
                    encoding: 'base64',
                }
            );
    
            console.log(`${filePath} updated successfully for username.`);
            return true;
        } catch (error: any) {
            console.error('Error updating ${filePath}:', error);
            return false;
        }
    }

    public async createMergeRequestWithPromotionImage(repositoryID: number, targetBranch: string,
        componentName: string, fromEnvironment: string, toEnvironment: string): Promise<number> {
        
        let extractedImage;
        
        try {
            // Get the main branch reference
            const mainBranch = await this.gitlab.Branches.show(repositoryID, 'main');
            
            // Create a new branch from the main branch
            await this.gitlab.Branches.create(repositoryID, targetBranch, mainBranch.commit.id);

            console.log(`Branch "${targetBranch}" created successfully.`);

            const fromEnvironmentContent = await this.gitlab.RepositoryFiles.showRaw(repositoryID,
                `components/${componentName}/overlays/${fromEnvironment}/deployment-patch.yaml`, targetBranch);

            const fromEnvironmentContentToString = fromEnvironmentContent.toString()
            const matches = fromEnvironmentContentToString.match(this.extractImagePatternFromGitopsManifest);
            
            if (matches && matches.length > 1) {
                extractedImage = matches[1];
                console.log("Extracted image:", extractedImage);

            } else {
                throw new Error("Image not found in the gitops repository path");
            }
            
            const targetEnvironmentContent = await this.gitlab.RepositoryFiles.showRaw(repositoryID,
                `components/${componentName}/overlays/${toEnvironment}/deployment-patch.yaml`, targetBranch);

            const targetEnvironmentContentToString = targetEnvironmentContent.toString()

            const pattern = /- image: (.*)/;
            const newContent = targetEnvironmentContentToString.replace(pattern, `- image: ${extractedImage}`);

            await this.gitlab.Commits.create(
                repositoryID,
                targetBranch,
                `Promotion from ${fromEnvironment} to ${toEnvironment}`,
                [
                    {
                        action: 'update',
                        filePath: `components/${componentName}/overlays/${toEnvironment}/deployment-patch.yaml`,
                        content: newContent
                    },
                ]
            );

            const mergeRequest = await this.gitlab.MergeRequests.create(repositoryID, targetBranch, "main",
                `Promotion from ${fromEnvironment} to ${toEnvironment}`);

            console.log(`Merge request created successfully. URL: ${mergeRequest.web_url}`);

            return mergeRequest.iid
        } catch (error) {
            console.log(error)
            throw new Error("Failed to create merge request. Check bellow error");
            
        }
    }

    /**
     * createProjectWebHook: create a webhook for a specific repository in gitlab
     */
    public async createProjectWebHook(repositoryID: number, webHookUrl: string): Promise<ProjectHookSchema> {
        try {
            return await this.gitlab.ProjectHooks.add(
                repositoryID,
                webHookUrl,
                {
                    token: process.env.GITLAB_WEBHOOK_SECRET || '',
                    pushEvents: true,
                    mergeRequestsEvents: true,
                    tagPushEvents: true,
                    enableSslVerification: false
                }
            )
        } catch (error) {
            console.log(error)
            throw new Error('Failed to create webhook. Check bellow error.' );
        }
    }

    /**
     * createMergeRequest
     */
    public async createMergeRequest(repositoryID: number, branchName: string, title: string):Promise<number> {
        try {
            const mainBranch = await this.gitlab.Branches.show(repositoryID, 'main');
            
            await this.gitlab.Branches.create(repositoryID, branchName, mainBranch.commit.id);
            
            await this.gitlab.Commits.create(
                repositoryID,
                branchName,
                'Automatic commit generated from RHTAP E2E framework',
                [
                    {
                        action: 'create',
                        filePath: 'test.txt',
                        content: 'Hello world'
                    },
                ]
            );

            const mergeRequest = await this.gitlab.MergeRequests.create(repositoryID, branchName, "main", title);

            console.log(`Pull request "${title}" created successfully. URL: ${mergeRequest.web_url}`);
            
            return mergeRequest.iid
        } catch (error) {
            console.log(error)
            throw new Error("Failed to create merge request. Check bellow error");
        }
    }

    /**
     * Merge merge request
     * 
     * @param {number} projectId - The ID number of GitLab repo.
     * @param {number} mergeRequestId - The ID number of GitLab merge request.
     */
    public async mergeMergeRequest(projectId: number, mergeRequestId: number) {
        try {
            await this.gitlab.MergeRequests.accept(projectId, mergeRequestId);

            console.log(`Pull request "${mergeRequestId}" merged successfully.`);
        } catch (error) {
            console.log(error)
            throw new Error("Failed to merge Merge Request. Check bellow error");
        }
    }

    /**
     * Delete project with ID from GitLab org.
     * 
     * @param {number} projectId - The ID number of GitLab repo.
     */
    public async deleteProject(projectId: number) {
        try {
            await this.gitlab.Projects.remove(projectId);
    
            console.log(`Project with "${projectId}" deleted successfully.`);
        } catch (error) {
            console.log(error)
            throw new Error("Failed to delete project. Check bellow error");
        }
    }
}
