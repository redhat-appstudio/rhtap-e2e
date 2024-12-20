import { Octokit } from "@octokit/rest";
import { AxiosError } from "axios";
import sodium from 'libsodium-wrappers'
import { Utils } from "./utils";
import { generateRandomChars } from "../../utils/generator";

export class GitHubProvider extends Utils {
    private readonly octokit: Octokit
    private readonly jenkinsAgentImage = "image-registry.openshift-image-registry.svc:5000/jenkins/jenkins-agent-base:latest";

    constructor(githubToken: string) {
        super()

        this.octokit = new Octokit({
            baseUrl: 'https://api.github.com',
            userAgent: 'rhtap-e2e',
            auth: githubToken,
        })
    }

    /**
     * checkifRepositoryExists return if a repository exists in GitHub
     * @param organization A valid GitHub organization
     * @param name A valid GitHub repository
     */
    public async checkIfRepositoryExists(organization: string, name: string): Promise<boolean> {
        try {
            const repositoryResponse = await this.octokit.repos.get({ owner: organization, repo: name })

            return repositoryResponse.status === 200
        } catch (error) {
            console.log(error)

            return false
        }
    }

    /**
     * Check, if repo exists and delete, returns true if a repository exists and was deleted in GitHub
     * @param organization A valid GitHub organization
     * @param name A valid GitHub repository
     */
    public async checkIfRepositoryExistsAndDelete(organization: string, name: string): Promise<boolean> {
        //Check, if repo exists and delete
        try {
            if (await this.checkIfRepositoryExists(organization, name)) {
                await this.deleteRepository(organization, name)
                return true
            }
            return false
        } catch (error) {
            console.log(error)
            return false
        }
    }

    /**
     * delete repository in GitHub
     * @param organization A valid GitHub organization
     * @param name A valid GitHub repository
     */
    public async deleteRepository(organization: string, name: string): Promise<boolean> {
        try {
            const repositoryResponse = await this.octokit.request('DELETE /repos/' + organization + '/' + `${name}`, {
                owner: organization,
                repo: `${name}`,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            })
            return repositoryResponse.status === 204
        } catch (error) {
            console.log(error)

            return false
        }
    }

    /**
     * checkIfFolderExistsInRepository
     * @param organization
     * @param name
     * @param folderPath
     */
    public async checkIfFolderExistsInRepository(organization: string, name: string, folderPath: string): Promise<boolean> {
        try {
            const response = await this.octokit.repos.getContent({ owner: organization, repo: name, path: folderPath });

            return response.status === 200
        } catch (error) {
            const e = error as AxiosError
            console.error(`Failed to fetch folderPath: ${folderPath}, from repository: ${organization}/${name}, request status: ${e.status}, message: ${e.message}`)

            return false
        }
    }

    /**
     * Commits a file to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - The name of the GitHub organization.
     * @param {string} gitRepository - The name of the repository where the file will be committed.
     * @returns {Promise<string | undefined>} A Promise resolving to the SHA of the commit if successful, otherwise undefined.
     * @throws Any error that occurs during the execution of the function.
     */
    public async createEmptyCommit(gitOrg: string, gitRepository: string): Promise<string | undefined> {
        try {
            const baseBranchRef = await this.octokit.git.getRef({ owner: gitOrg, repo: gitRepository, ref: 'heads/main' })

            const currentCommit = await this.octokit.git.getCommit({
                owner: gitOrg, repo: gitRepository,
                commit_sha: baseBranchRef.data.object.sha,
            });

            const newCommit = await this.octokit.git.createCommit({
                owner: gitOrg, repo: gitRepository,
                message: 'Automatic commit generated from tests',
                tree: currentCommit.data.tree.sha,
                parents: [currentCommit.data.sha],
            });

            await this.octokit.git.updateRef({
                owner: gitOrg, repo: gitRepository,
                ref: `heads/main`,
                sha: newCommit.data.sha,
            });

            return newCommit.data.sha
        } catch (error) {
            console.log(error)
        }
    }

    /**
     * Commits a Jenkins agent configuration for testing to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - The name of the GitHub organization.
     * @param {string} gitRepository - The name of the repository where the file will be committed.
     * @returns {Promise<string | undefined>} A Promise resolving to the SHA of the commit if successful, otherwise undefined.
     * @throws Any error that occurs during the execution of the function.
     */
    public async createAgentCommit(gitOrg: string, gitRepository: string): Promise<string | undefined> {
        try {
            const responseContent = await this.octokit.repos.getContent({
                owner: gitOrg, repo: gitRepository,
                path: 'Jenkinsfile',
                ref: `main`,
            });

            // Decode the base64 content
            const content = Buffer.from(responseContent.data.content, "base64").toString();

            // Step 2: Modify the content
            const updatedContent = content.replace(
                /agent\s+any/,
                "agent {\n      kubernetes {\n        label 'jenkins-agent'\n        cloud 'openshift'\n        serviceAccount 'jenkins'\n        podRetention onFailure()\n        idleMinutes '5'\n        containerTemplate {\n         name 'jnlp'\n         image '" + this.jenkinsAgentImage + "'\n         ttyEnabled true\n         args '${computer.jnlpmac} ${computer.name}'\n        }\n       }\n}"
            );

            // Step 3: Create a commit with the new content
            await this.octokit.repos.createOrUpdateFileContents({
                owner: gitOrg, repo: gitRepository,
                path: 'Jenkinsfile',
                message: "Update Jenkinsfile to use Kubernetes agent",
                content: Buffer.from(updatedContent).toString("base64"),
                sha: responseContent.data.sha, // The current commit SHA of the file
                ref: `heads/main`,
            });

            console.log("Jenkinsfile updated successfully!");
            return "true";

        } catch (error) {
            console.error("An error occurred while updating the Jenkinsfile:", error);
        }
    }

    /**
     * Enables ACS scan for testing to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - The name of the GitHub organization.
     * @param {string} gitRepository - The name of the repository where the file will be committed.
     * @returns {Promise<string | undefined>} A Promise resolving to the SHA of the commit if successful, otherwise undefined.
     * @throws Any error that occurs during the execution of the function.
     */
    public async enableACSJenkins(gitOrg: string, gitRepository: string): Promise<string | undefined> {
        try {
            const responseContent = await this.octokit.repos.getContent({
                owner: gitOrg, repo: gitRepository,
                path: 'rhtap/env.sh',
                ref: `main`,
            });

            //   // Decode the base64 content
            const content = Buffer.from(responseContent.data.content, "base64").toString();

            // Step 2: Modify the content
            const updatedContent = content.replace(
                "export DISABLE_ACS=false",
                "export DISABLE_ACS=true"
            );

            // Step 3: Create a commit with the new content
            await this.octokit.repos.createOrUpdateFileContents({
                owner: gitOrg, repo: gitRepository,
                path: 'rhtap/env.sh',
                message: "Enable ACS scan in Jenkins",
                content: Buffer.from(updatedContent).toString("base64"),
                sha: responseContent.data.sha, // The current commit SHA of the file
                ref: `main`,
            });

            console.log("env.sh updated successfully!");
            return "true";

        } catch (error) {
            console.error("An error occurred while updating the Jenkinsfile:", error);
        }
    }

    /**
    * Enables ACS scan for testing to the main branch of a specified Git repository.
    * 
    * @param {string} gitOrg - The name of the GitHub organization.
    * @param {string} gitRepository - The name of the repository where the file will be committed.
    * @returns {Promise<string | undefined>} A Promise resolving to the "true" if commit was successful, otherwise undefined.
    * @throws Any error that occurs during the execution of the function.
    */
    public async updateTUFMirror(gitOrg: string, gitRepository: string, tufURL: string): Promise<string | undefined> {
        try {
            const responseContent = await this.octokit.repos.getContent({
                owner: gitOrg, repo: gitRepository,
                path: 'rhtap/env.sh',
                ref: `main`,
            });

            //   // Decode the base64 content
            const content = Buffer.from(responseContent.data.content, "base64").toString();

            // Step 2: Modify the content
            const updatedContent = content.replace(
                "http://tuf.rhtap-tas.svc", // NOSONAR
                tufURL
            );

            // Step 3: Create a commit with the new content
            await this.octokit.repos.createOrUpdateFileContents({
                owner: gitOrg, repo: gitRepository,
                path: 'rhtap/env.sh',
                message: "Update TUF mirror in environment file",
                content: Buffer.from(updatedContent).toString("base64"),
                sha: responseContent.data.sha, // The current commit SHA of the file
                ref: `main`,
            });

            console.log("env.sh updated successfully!");
            return "true";

        } catch (error) {
            console.error("An error occurred while updating the enviroment file:", error);
        }
    }

    /**
     * Enables ACS scan for testing to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - The name of the GitHub organization.
     * @param {string} gitRepository - The name of the repository where the file will be committed.
     * @returns {Promise<string | undefined>} A Promise resolving to "true" if commit successful, otherwise undefined.
     * @throws Any error that occurs during the execution of the function.
     */
    public async updateRekorHost(gitOrg: string, gitRepository: string, rekorHost: string): Promise<string | undefined> {
        try {
            const responseContent = await this.octokit.repos.getContent({
                owner: gitOrg, repo: gitRepository,
                path: 'rhtap/env.sh',
                ref: `main`,
            });

            //   // Decode the base64 content
            const content = Buffer.from(responseContent.data.content, "base64").toString();

            // Step 2: Modify the content
            const updatedContent = content.replace(
                "http://rekor-server.rhtap-tas.svc",// NOSONAR
                rekorHost
            );

            // Step 3: Create a commit with the new content
            await this.octokit.repos.createOrUpdateFileContents({
                owner: gitOrg, repo: gitRepository,
                path: 'rhtap/env.sh',
                message: "Update rekor URL in environment file",
                content: Buffer.from(updatedContent).toString("base64"),
                sha: responseContent.data.sha, // The current commit SHA of the file
                ref: `main`,
            });

            console.log("env.sh updated successfully!");
            return "true";

        } catch (error) {
            console.error("An error occurred while updating the enviroment file", error);
        }
    }

    public async createPullRequestFromMainBranch(owner: string, repo: string, filePath: string, content: string, fileSHA = ""): Promise<number | undefined> {
        const baseBranch = "main"; // Specify the base branch
        const newBranch = generateRandomChars(5); // Specify the new branch name

        try {
            const { data: latestCommit } = await this.octokit.repos.getBranch({
                owner,
                repo,
                branch: baseBranch
            });

            // Step 2: Create a new branch based on the latest commit of the base branch
            await this.octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${newBranch}`,
                sha: latestCommit.commit.sha
            });

            await this.octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: filePath,
                message: "RHTAP E2E: Commit generated automatically from Red Hat Trusted Application Pipeline E2E framework",
                content: Buffer.from(content).toString("base64"),
                branch: newBranch,
                sha: fileSHA
            });

            const { data: pullRequest } = await this.octokit.pulls.create({
                owner,
                repo,
                title: "RHTAP E2E: Automatic Pull Request",
                head: newBranch,
                base: baseBranch,
                body: "RHTAP E2E: Automatic Pull Request"
            });

            return pullRequest.number

        } catch (error) {
            console.error("Error:", error);
        }
    }

    /**
     * Merge GitHub pull request.
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} pull_request - PR number.
     */
    public async mergePullRequest(owner: string, repo: string, pull_request: number) {
        try {
            await this.octokit.pulls.merge({
                owner,
                repo,
                pull_number: pull_request,
                commit_title: "RHTAP E2E: Automatic Pull Request merge",
                merge_method: "squash"
            });
        } catch (error) {
            throw new Error(`Failed to merge Pull Request ${pull_request}, owner: ${owner}, repo: ${repo}. Error: ${error}`);
        }
    }

    /**
     * Extract image from GitOps repository for promotion.
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} componentName - component name.
     * @param {string} environment - environment name(development, stage, prod).
     */
    public async extractImageFromContent(owner: string, repo: string, componentName: string, environment: string): Promise<string | undefined> {
        try {
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path: `components/${componentName}/overlays/${environment}/deployment-patch.yaml`
            });

            const { content } = { ...response.data };

            const decodedData = Buffer.from(content, 'base64')

            const decodedContent = decodedData.toString()

            // Define the regular expression pattern to extract the desired string
            const pattern = /- image: (.*)/;

            // Use regular expression to extract the desired string
            const matches = decodedContent.match(pattern);

            if (matches && matches.length > 1) {
                const extractedImage = matches[1];
                console.log("Extracted image:", extractedImage);

                return extractedImage
            } else {
                throw new Error("Image not found in the gitops repository path");
            }

        } catch (error) {
            console.log(error)
            throw new Error(`Error: ${error}`);
        }
    }

    /**
     * Promote image to environment,
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} componentName - component name.
     * @param {string} environment - environment name(development, stage, prod).
     * @param {string} image - image name.
     */
    public async promoteGitopsImageEnvironment(owner: string, repo: string, componentName: string, environment: string, image: string): Promise<number | undefined> {
        try {
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path: `components/${componentName}/overlays/${environment}/deployment-patch.yaml`
            });

            const { content, sha: fileSHA } = { ...response.data };

            const decodedData = Buffer.from(content, 'base64')
            let decodedContent = decodedData.toString()

            const pattern = /- image: (.*)/;
            decodedContent = decodedContent.replace(pattern, `- image: ${image}`);

            return await this.createPullRequestFromMainBranch(owner, repo, `components/${componentName}/overlays/${environment}/deployment-patch.yaml`, decodedContent, fileSHA)

        } catch (error) {
            throw new Error(`Error: ${error}`);
        }
    }

    // Function to wait for the latest job in a GitHub Actions workflow to finish and get its status
    public async waitForLatestJobStatus(owner: string, repo: string, workflow_id: string, timeout = 300000): Promise<string | null> { // Default timeout is 5 minutes
        console.log(`Waiting for the latest job in workflow '${workflow_id}' to finish...`);

        const startTime = Date.now();

        while (true) {
            // Check for timeout
            if (Date.now() - startTime > timeout) {
                throw new Error(`Timeout: The latest job did not finish within the specified time.`);
            }

            try {
                // Fetch the latest workflow runs
                const { data: workflowRuns } = await this.octokit.rest.actions.listWorkflowRuns({
                    owner,
                    repo,
                    workflow_id,
                    per_page: 1, // We only need the latest run
                });

                if (workflowRuns.total_count === 0) {
                    console.log('No workflow runs found, retrying...');
                    await this.sleep(5000);
                    continue;
                }

                // Get the latest workflow run
                const latestRun = workflowRuns.workflow_runs[0];

                // Check if the run is still in progress
                if (latestRun.status === 'completed') {
                    console.log(`Latest job in workflow '${workflow_id}' has finished. Status: ${latestRun.conclusion}`);
                    return latestRun.conclusion; // Return only the status of the job
                } else {
                    console.log(`Latest job in workflow '${workflow_id}' is still in progress, retrying...`);
                }
            } catch (error) {
                console.error('Error fetching workflow run details:', error);
                throw error;
            }

            // Wait 5 seconds before checking again
            await this.sleep(5000);
        }
    }


    // Function to get the workflow ID for a specific workflow name or filename in a repository
    public async getWorkflowId(owner: string, repo: string, workflowName: string): Promise<number> {
        try {
            // Fetch all workflows in the repository
            const { data: workflows } = await this.octokit.rest.actions.listRepoWorkflows({
                owner,
                repo,
            });

            // Find the workflow that matches the provided name or filename
            const workflow = workflows.workflows.find(wf => wf.name === workflowName || wf.path === workflowName);

            if (workflow) {
                console.log(`Found workflow '${workflowName}' with ID: ${workflow.id}`);
                return workflow.id;
            } else {
                console.log(`Workflow '${workflowName}' not found`);
                return 0;
            }
        } catch (error) {
            console.error('Error fetching workflows:', error);
            throw error;
        }
    }

    /**
     * This function reruns latest job of given workflow.
     * 
     */
    public async rerunWorkflow(owner:string, repo: string, workflowId: number) {
        try {
            const { data: workflowRuns } = await this.octokit.rest.actions.listWorkflowRuns({
                owner,
                repo,
                workflow_id: workflowId,
                per_page: 1, // We only need the latest run
            });
            await this.octokit.actions.reRunWorkflow({
                owner,
                repo,
                run_id: workflowRuns.workflow_runs[0].id
            })
        }catch (error) {
            console.error(`Error rerunning workflow id=${workflowId}: `, error)
            throw error
        }
    }
    
    /**
     * Function to create a GitHub webhook for push events(for Jenkins for example)
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} webhookUrl - webhook URL.
     */
    public async createWebhook(owner: string, repo: string, webhookUrl: string) {
        console.log(owner + repo + webhookUrl);
        try {
            const response = await this.octokit.rest.repos.createWebhook({
                owner,
                repo,
                active: true,
                config: {
                    url: webhookUrl,
                    content_type: "form",  // content_type: "json"
                    insecure_ssl: '1'
                },
                events: [
                    'push',
                    'pull_request'
                ],
            });

            console.log(`Webhook created successfully! ID: ${response.data.id}`);
            return response.data;
        } catch (error) {
            console.error('Error creating webhook:', error);
            throw error;
        }
    }

    /**
     * This creates or updates secrets in Github repository to be used in Github Actions
     * 
     * @param owner repo owner/org
     * @param repo repo
     * @param envVars array of envName:envValue pairs. Example
     * {
     *  "IMAGE_REGISTRY":"quay.io",
     *  "ROX_API_TOKEN": "xxxxx"
     * }
     */
    public async setEnvironmentVariables(owner: string, repo: string, envVars: {[key:string]: string}) {
        console.group(`Adding env vars to github ${owner}/${repo}`);
        let publicKeyResponse
        try {
            publicKeyResponse = await this.octokit.actions.getRepoPublicKey({
                owner,
                repo
            })
        }catch (error) {
            console.error("Error getting repo public key to setup secrets:", error);
            console.groupEnd()
            throw error;
        }
        for (const [envVarName,envVarValue] of Object.entries(envVars)){
            console.log(`envVarName`)
            await sodium.ready
            let binkey = sodium.from_base64(publicKeyResponse.data.key, sodium.base64_variants.ORIGINAL)
            let binsec = sodium.from_string(envVarValue)
            let encBytes = sodium.crypto_box_seal(binsec, binkey)
            let output = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL)
            try {
                await this.octokit.actions.createOrUpdateRepoSecret({
                    owner,
                    repo,
                    secret_name: envVarName,
                    encrypted_value: output,
                    key_id: publicKeyResponse.data.key_id
                })
            }catch (error) {
                console.error(`Error creating secret ${envVarName}: ${error}`);
                console.groupEnd()
                throw error
            }
        }
        console.groupEnd()
    }


}
