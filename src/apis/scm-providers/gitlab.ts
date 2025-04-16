import { Gitlab, ProjectHookSchema } from "@gitbeaker/rest";
import { Utils } from "./utils";
import { AxiosError } from "axios";


export class GitLabProvider extends Utils {
    private readonly gitlab;
    private readonly gitlabToken;
    private readonly extractImagePatternFromGitopsManifest;

    constructor(gitlabToken: string) {
        super();

        if (!gitlabToken) {
            throw new Error("Missing environment variable GITLAB_TOKEN");
        }
        this.gitlabToken = gitlabToken;
        this.extractImagePatternFromGitopsManifest = /- image: (.*)/;
        this.gitlab = new Gitlab({
            host: 'https://gitlab.com',
            token: this.gitlabToken
        });
    }

    // Get GitLab token
    public async getGitlabToken(): Promise<string> {
        return this.gitlabToken;
    }

    // Function to find a repository by name
    public async checkIfRepositoryExists(organization: string, repoName: string): Promise<number> {
        //RHTAPBUGS-1327: Added wait: it should improve stability of Gitlab test - sometimes request from tests could be faster, than GitLab responses
        while (true) {
            try {
                const projects = await this.gitlab.Projects.show(`${organization}/${repoName}`);
                if (projects) {
                    console.info(`Repository with name '${repoName}' found in organization '${organization}'
                       created at '${projects.created_at}' url: gitlab.com/${organization}/${repoName}`);
                    return projects.id;
                }

                await this.sleep(10000); // Wait 10 seconds before checking again
            } catch (_) {
                console.info(`Failed to check if repository ${organization}/${repoName} exists`);
            }
        }
    }

    /**
     * checkIfRepositoryHaveFolder
     */
    public async checkIfRepositoryHaveFolder(repositoryID: number, folderPath: string): Promise<boolean> {
        //RHTAPBUGS-1327: Added wait: it should improve stability of Gitlab test - sometimes request from tests could be faster, than GitLab responses
        while (true) {
            try {
                const file = await this.gitlab.Repositories.allRepositoryTrees(repositoryID);
                if (file) {
                    return file.some((folder) => {
                        return folder.path === folderPath && folder.type === 'tree';
                    });
                }

                await this.sleep(10000); // Wait 10 seconds before checking again
            } catch (error) {
                console.error('Error checking for folder creation:', error);
            }
        }
    }

    /**
     * checkIfRepositoryHaveFile
     */
    public async checkIfRepositoryHaveFile(repositoryID: number, filePath: string): Promise<boolean> {
        try {
            await this.gitlab.RepositoryFiles.show(repositoryID, filePath, 'main');
            return true;
        } catch (error: unknown) {
            if (error instanceof AxiosError && error.response && error.response.status === 404) {
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
            console.log(error);
            throw new Error("Failed to create commit in Gitlab. Check bellow error");
        }
    }

    public async updateJenkinsfileAgent(repositoryID: number, branchName: string, jenkinsAgentImage: string): Promise<boolean> {
        const stringToFind = "agent any";
        const replacementString = "agent {\n      kubernetes {\n        label 'jenkins-agent'\n        cloud 'openshift'\n        serviceAccount 'jenkins'\n        podRetention never()\n        idleMinutes '0'\n        containerTemplate {\n         name 'jnlp'\n         image '" + jenkinsAgentImage + "'\n         ttyEnabled true\n         args '${computer.jnlpmac} ${computer.name}'\n         resourceRequestMemory '4Gi'\n         resourceLimitMemory '4Gi'\n        }\n       }    \n}";
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Update Jenkins agent', stringToFind, replacementString);
    }

    public async createUsernameCommit(repositoryID: number, branchName: string): Promise<boolean> {
        const stringToFind = "/* GITOPS_AUTH_USERNAME = credentials('GITOPS_AUTH_USERNAME') */";
        const replacementString = `GITOPS_AUTH_USERNAME = credentials('GITOPS_AUTH_USERNAME')`;
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Update creds for Gitlab', stringToFind, replacementString);
    }

    public async createRegistryUserCommit(repositoryID: number, branchName: string): Promise<boolean> {
        const stringToFind = "/* IMAGE_REGISTRY_USER = credentials('IMAGE_REGISTRY_USER') */";
        const replacementString = `IMAGE_REGISTRY_USER = credentials('IMAGE_REGISTRY_USER')`;
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Update creds for IMAGE_REGISTRY_USER', stringToFind, replacementString);
    }

    public async createRegistryPasswordCommit(repositoryID: number, branchName: string): Promise<boolean> {
        const stringToFind = "/* IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD') */";
        const replacementString = `IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD')`;
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Update creds for IMAGE_REGISTRY_PASSWORD', stringToFind, replacementString);
    }

    public async disableQuayCommit(repositoryID: number, branchName: string): Promise<boolean> {
        const stringToFind = "QUAY_IO_CREDS = credentials('QUAY_IO_CREDS')";
        const replacementString = `/* QUAY_IO_CREDS = credentials('QUAY_IO_CREDS') */`;
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Disable Quay creds for Gitlab', stringToFind, replacementString);
    }
    public async disableCosignPublicKeyFromCreds(repositoryID: number, branchName: string): Promise<boolean> {
        const stringToFind = "COSIGN_PUBLIC_KEY = credentials('COSIGN_PUBLIC_KEY')";
        const replacementString = ``;
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'Jenkinsfile', 'Disable Quay creds for Gitlab', stringToFind, replacementString);
    }

    public async updateRoxCentralEndpoint(repositoryID: number, branchName: string, roxCentralEndpoint: string) {
        const stringToFind = "# export ROX_CENTRAL_ENDPOINT=central-acs.apps.user.cluster.domain.com:443";
        const replacementString = "export ROX_CENTRAL_ENDPOINT=" + roxCentralEndpoint;
        return await this.commitReplacementStringInFile(repositoryID, branchName, 'rhtap/env.sh',  "Update roxCentralEndpoint URL in environment file", stringToFind, replacementString);
    }

    public async getImageToPromotion(repositoryID: number, branch: string, componentName: string, environment: string) {
        let extractedImage;
        try {
            const environmentContent = await this.gitlab.RepositoryFiles.showRaw(repositoryID,
                `components/${componentName}/overlays/${environment}/deployment-patch.yaml`, branch);

            const fromEnvironmentContentToString = environmentContent.toString();
            const matches = fromEnvironmentContentToString.match(this.extractImagePatternFromGitopsManifest);

            if (matches && matches.length > 1) {
                extractedImage = matches[1];
                console.log("Extracted image:", extractedImage);
                return extractedImage;

            } else {
                throw new Error("Image not found in the gitops repository path");
            }
        } catch (error) {
            console.log(error);
            throw new Error("Cannot extract image. Check bellow error");

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

            extractedImage = (await this.getImageToPromotion(repositoryID, targetBranch, componentName, fromEnvironment)).toString();

            const targetEnvironmentContent = await this.gitlab.RepositoryFiles.showRaw(repositoryID,
                `components/${componentName}/overlays/${toEnvironment}/deployment-patch.yaml`, targetBranch);

            const targetEnvironmentContentToString = targetEnvironmentContent.toString();

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

            return mergeRequest.iid;
        } catch (error) {
            console.log(error);
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
                    token: process.env.GITLAB_WEBHOOK_SECRET ?? '',
                    pushEvents: true,
                    mergeRequestsEvents: true,
                    tagPushEvents: true,
                    enableSslVerification: false
                }
            );
        } catch (error) {
            console.log(error);
            throw new Error('Failed to create webhook. Check bellow error.');
        }
    }

    /**
     * createMergeRequest
     */
    public async createMergeRequest(repositoryID: number, branchName: string, title: string): Promise<number> {
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

            // Wait for GitLab to process the commit
            await new Promise(resolve => setTimeout(resolve, 5000));

            const mergeRequest = await this.gitlab.MergeRequests.create(repositoryID, branchName, "main", title);

            console.log(`Pull request "${title}" created successfully. URL: ${mergeRequest.web_url}`);

            return mergeRequest.iid;
        } catch (error) {
            console.log(error);
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
            console.log(`Merging merge request "${mergeRequestId}"`);
            await this.gitlab.MergeRequests.accept(projectId, mergeRequestId);

            console.log(`Pull request "${mergeRequestId}" merged successfully.`);
        } catch (error) {
            console.log(error);
            throw new Error("Failed to merge Merge Request. Check bellow error");
        }
    }

    /**
     * Wait until merge request have mergeable status
     * 
     * @param {number} projectId - The ID number of GitLab repo.
     * @param {number} mergeRequestId - The ID number of GitLab merge request.
     */
    public async waitForMergeableMergeRequest(projectId: number, mergeRequestId: number, timeoutMs: number) {
        console.log(`Waiting for new pipeline to be created...`);
        const retryInterval = 10 * 1000;
        let totalTimeMs = 0;

        while (timeoutMs === 0 || totalTimeMs < timeoutMs) {
            try {
                const detailedStatus = (await this.gitlab.MergeRequests.show(projectId, mergeRequestId)).detailed_merge_status;
                if (detailedStatus.toString() == "mergeable") {
                    return;
                }

                await this.sleep(5000); // Wait 5 seconds
            } catch (error) {
                console.error('Error checking merge status:', error);
                await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for 15 seconds
            }
            totalTimeMs += retryInterval;
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
            console.log(error);
            throw new Error("Failed to delete project. Check bellow error");
        }
    }

    public async waitForPipelinesToBeCreated(projectId: number, pipelinesCount: number, timeoutMs: number) {
        console.log(`Waiting for new pipeline to be created...`);
        const retryInterval = 10 * 1000;
        let totalTimeMs = 0;

        while (timeoutMs === 0 || totalTimeMs < timeoutMs) {
            try {
                const pipelines = await this.gitlab.Pipelines.all(projectId);
                if (pipelines.length == pipelinesCount) {
                    return;
                }

                await this.sleep(5000); // Wait 5 seconds
            } catch (error) {
                console.error('Error checking pipeline count:', error);
                await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for 15 seconds
            }
            totalTimeMs += retryInterval;
        }
    }

    public async getLatestPipeline(projectId: number) {
        try {
            const pipelines = await this.gitlab.Pipelines.all(projectId);
            if (pipelines.length === 0) {
                console.log(`No pipelines found!`);
                return null;
            }
            const latestPipeline = pipelines.sort((a, b) => b.id - a.id)[0];
            console.log(`Latest pipeline ID: ${latestPipeline.id} Status: ${latestPipeline.status}`);
            return latestPipeline;
        } catch (error) {
            console.error('Error triggering pipeline:', error);
            throw error;
        }
    }

    // Trigger a GitLab pipeline
    public async triggerPipeline(projectId: number, branchName: string, triggerToken: string) {
        try {
            const response = await this.gitlab.PipelineTriggerTokens.trigger(projectId, branchName, triggerToken);
            console.log('Pipeline triggered successfully:', response);
            return response;
        } catch (error) {
            console.error('Error triggering pipeline:', error);
            throw error;
        }
    }

    // Wait until the pipeline is created
    public async waitForPipelineToBeCreated(projectId: number, ref: string, sha: string) {
        console.log(`Waiting for the pipeline with ref '${ref}' and sha '${sha}' to be created...`);

        while (true) {
            try {
                const pipelines = await this.gitlab.Pipelines.all(projectId, { ref });

                // Check if the pipeline with the matching ref and sha is created
                const pipeline = pipelines.find(pipeline => pipeline.sha === sha);
                if (pipeline) {
                    console.log(`Pipeline created: ID ${pipeline.id}`);
                    return pipeline;
                }

                await this.sleep(5000); // Wait 5 seconds before checking again
            } catch (error) {
                console.error('Error checking for pipeline creation:', error);
            }
        }
    }

    // Wait until the pipeline finishes
    public async waitForPipelineToFinish(projectId: number, pipelineId: number, timeoutMs: number) {
        console.log(`Waiting for pipeline ${pipelineId} to finish...`);
        const retryInterval = 10 * 1000;
        let totalTimeMs = 0;

        while (timeoutMs === 0 || totalTimeMs < timeoutMs) {
            try {
                const pipeline = await this.gitlab.Pipelines.show(projectId, pipelineId);

                if (
                    pipeline.status === 'success' ||
                    pipeline.status === 'failed' ||
                    pipeline.status === 'canceled'
                ) {
                    return pipeline.status;
                }

                await this.sleep(15000); // Wait 15 seconds
            } catch (error) {
                console.error('Error checking pipeline status:', error);
                await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for 15 seconds
            }
            totalTimeMs += retryInterval;
        }
    }

    // Set environment variables (secrets) for the repository
    public async setEnvironmentVariable(projectId: number, key: string, value: string) {
        try {
            const response = await this.gitlab.ProjectVariables.create(projectId, key, value, {
                protected: false,
                masked: false,
            });
            console.log(`Environment variable '${key}' set successfully.`);
            return response;
        } catch (error) {
            console.error(`Error setting environment variable '${key}':`, error);
            throw error;
        }
    }

    public async updateEnvFileForJenkins(repositoryID: number, branchName: string, rekorHost: string, tufMirror: string, cosignPublicKey: string, imageRegistryUser: string): Promise<boolean> {
        const filePath = 'rhtap/env.sh';
        const fileContent = await this.getFileContentAsString(repositoryID, branchName, filePath);
        // Replace rekor
        let updatedContent = fileContent.replace(`http://rekor-server.rhtap-tas.svc`, rekorHost);
        // Replace TUF
        updatedContent = updatedContent.replace(`http://tuf.rhtap-tas.svc`, tufMirror);
        // Add cosign public key variable
        updatedContent = updatedContent.concat("\n" + "export COSIGN_PUBLIC_KEY=" + cosignPublicKey + "\n");
        // Add image registry username
        updatedContent = updatedContent.concat("\n" +"export IMAGE_REGISTRY_USER=" + imageRegistryUser + "\n");
        // Add GitHub username
        updatedContent = updatedContent.concat("\n" +"export GITOPS_AUTH_USERNAME=fakeUsername\n");
        //Commit changed file
        return await this.commitFileContent(repositoryID, branchName, filePath, "Update env file for GitLabCI", updatedContent);
    }

    public async updateEnvFileForJenkinsTustification(repositoryID: number, branchName: string, bombastitApiURL: string, oidcIssuesrURL: string, oidcClientId: string): Promise<boolean> {
        const filePath = 'rhtap/env.sh';
        const fileContent = await this.getFileContentAsString(repositoryID, branchName, filePath);
        // Add cosign public key variable
        let updatedContent = fileContent.concat("\n" + "export TRUSTIFICATION_BOMBASTIC_API_URL=" + bombastitApiURL + "\n");
        // Add image registry username
        updatedContent = updatedContent.concat("\n" +"export TRUSTIFICATION_OIDC_ISSUER_URL=" + oidcIssuesrURL + "\n");
        // Add GitHub username
        updatedContent = updatedContent.concat("\n" +"export TRUSTIFICATION_OIDC_CLIENT_ID=" + oidcClientId + "\n");
        //Commit changed file
        return await this.commitFileContent(repositoryID, branchName, filePath, "Update env file for GitLabCI", updatedContent);
    }

    public async updateEnvFileForGitLabCI(repositoryID: number, branchName: string, rekorHost: string, tufMirror: string): Promise<boolean> {
        const filePath = 'rhtap/env.sh';
        const fileContent = await this.getFileContentAsString(repositoryID, branchName, filePath);
        // Replace rekor
        let updatedContent = fileContent.replace(`http://rekor-server.rhtap-tas.svc`, rekorHost);
        // Replace TUF
        updatedContent = updatedContent.replace(`http://tuf.rhtap-tas.svc`, tufMirror);
        //Commit changed file
        return await this.commitFileContent(repositoryID, branchName, filePath, "Update env file for GitLabCI", updatedContent);
    }


    public async commitReplacementStringInFile(repositoryID: number, branchName: string, filePath: string, commitMessage: string, textToReplace: string, replacement: string): Promise<boolean> {
        try {
            // Get the current content of the file
            const file = await this.gitlab.RepositoryFiles.show(repositoryID, filePath, branchName);
            const fileContent = Buffer.from(file.content, 'base64').toString('utf-8');

            // Replace specific text
            const updatedContent = fileContent.replace(textToReplace, replacement);

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

            console.log(`${filePath} updated successfully with commit message: ${commitMessage}`);
            return true;
        } catch (error: unknown) {
            console.error('Error updating ${filePath}:', error);
            return false;
        }
    }

    public async getFileContentAsString(repositoryID: number, branchName: string, filePath: string): Promise<string> {
        try {
            // Get the current content of the file
            const file = await this.gitlab.RepositoryFiles.show(repositoryID, filePath, branchName);
            return Buffer.from(file.content, 'base64').toString('utf-8');
        } catch (error: unknown) {
            console.error('Error getting content of ${filePath}:', error);
            return "";
        }
    }

    public async commitFileContent(repositoryID: number, branchName: string, filePath: string, commitMessage: string, fileContent: string): Promise<boolean> {
        try {
            // Encode the updated content to base64
            const encodedContent = Buffer.from(fileContent).toString('base64');

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
        } catch (error: unknown) {
            console.error('Error updating ${filePath}:', error);
            return false;
        }
    }

    // Function to kill the oldest pipeline
    public async killInitialPipeline(repositoryID: number) {
        try {
            const pipelines = await this.gitlab.Pipelines.all(repositoryID);
            if (pipelines.length === 0) {
                console.log('No pipelines found.');
                return null;
            }

            // Sort pipelines by creation time (ascending order) to get the oldest pipeline
            const oldestPipeline = pipelines.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
            console.log(`Initial pipeline ID: ${oldestPipeline.id}, Status: ${oldestPipeline.status}`);

            // Cancel the oldest pipeline
            const cancelResponse = await this.gitlab.Pipelines.cancel(repositoryID, oldestPipeline.id);
            console.log(`Initial pipeline (ID: ${oldestPipeline.id}) has been canceled.`);
            return cancelResponse;
        } catch (error) {
            console.error('Error killing the initial pipeline:', error);
            throw error;
        }
    }

    // Get all jobs for GitLab pipeline
    public async getPipelineJobs(projectId: number, pipelineId: number) {
        try {
            const response = await this.gitlab.Jobs.all(projectId, { pipelineId });
            console.log('Pipeline triggered successfully:', response);
            return response;
        } catch (error) {
            console.error('Error triggering pipeline:', error);
            throw error;
        }
    }

    // Return buildah job for GitLab pipeline
    public async getLogForBuildah(projectId: number, pipelineId: number) : Promise<string>{
        return this.getLogForJobName(projectId, pipelineId, "buildah-rhtap");
    }

    // Return job with name for GitLab pipeline
    public async getLogForJobName(projectId: number, pipelineId: number, jobName: string): Promise<string>{
        try {
            const jobList = await this.getPipelineJobs(projectId, pipelineId);
            for (const job of jobList) {
                if (job.name.includes(jobName)){
                    return await this.gitlab.Jobs.showLog(projectId, job.id);
                }
            };
        } catch (error) {
            console.error('Error triggering pipeline:', error);
            throw error;
        }
        return "";
    }

    //Parse SBOM version from buildah log
    public async parseSbomVersionFromLog(log: string) : Promise<string>{
        return log.substring(
            log.indexOf("sha256-") + 7,
            log.lastIndexOf(".sbom")
        );
    }

}
