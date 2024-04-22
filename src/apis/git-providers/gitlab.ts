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
            console.error(`Error finding repository: ${error}`);

            throw new Error("check");
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
                    enableSslVerification: true
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
     * name
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
}
