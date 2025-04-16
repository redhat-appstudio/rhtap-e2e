/* eslint-disable camelcase */
import { Octokit, RestEndpointMethodTypes, workflowRuns } from "@octokit/rest";
import { AxiosError } from "axios";
import { Utils } from "./utils";
import { generateRandomChars } from "../../utils/generator";
import sodium from 'sodium-native';

export class GitHubProvider extends Utils {
    private readonly octokit: Octokit;
    //Uncomment this, in case you want to build image for Jenkins Agent
    //private readonly jenkinsAgentImage = "image-registry.openshift-image-registry.svc:5000/jenkins/jenkins-agent-base:latest";
    private readonly jenkinsAgentImage = "quay.io/jkopriva/rhtap-jenkins-agent:0.2";

    constructor(githubToken: string) {
        super();

        this.octokit = new Octokit({
            baseUrl: 'https://api.github.com',
            userAgent: 'rhtap-e2e',
            auth: githubToken,
        });
    }

    /**
     * checkifRepositoryExists return if a repository exists in GitHub
     * @param organization A valid GitHub organization
     * @param name A valid GitHub repository
     */
    public async checkIfRepositoryExists(organization: string, name: string): Promise<boolean> {
        try {
            const repositoryResponse = await this.octokit.repos.get({ owner: organization, repo: name });

            return repositoryResponse.status === 200;
        } catch (error) {
            console.log(error);

            return false;
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
                await this.deleteRepository(organization, name);
                return true;
            }
            return false;
        } catch (error) {
            console.log(error);
            return false;
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
            });
            return repositoryResponse.status === 204;
        } catch (error) {
            console.log(error);

            return false;
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

            return response.status === 200;
        } catch (error) {
            const e = error as AxiosError;
            console.error(`Failed to fetch folderPath: ${folderPath}, from repository: ${organization}/${name}, request status: ${e.status}, message: ${e.message}`);

            return false;
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
            const baseBranchRef = await this.octokit.git.getRef({ owner: gitOrg, repo: gitRepository, ref: 'heads/main' });

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

            return newCommit.data.sha;
        } catch (error) {
            console.log(error);
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
        return await this.commitInGitHub(gitOrg, gitRepository, 'Jenkinsfile', "agent any",
            "agent {\n      kubernetes {\n        label 'jenkins-agent'\n        cloud 'openshift'\n        serviceAccount 'jenkins'\n        podRetention never()\n        idleMinutes '0'\n        containerTemplate {\n         name 'jnlp'\n         image '" + this.jenkinsAgentImage + "'\n         ttyEnabled true\n         args '${computer.jnlpmac} ${computer.name}'\n         resourceRequestMemory '4Gi'\n         resourceLimitMemory '4Gi'\n        }\n       }    \n}"
            , "Update agent in Jenkinsfile");
    }

    public async createRegistryUserCommit(gitOrg: string, gitRepository: string): Promise<string | undefined> {
        return await this.commitInGitHub(gitOrg, gitRepository, 'Jenkinsfile', "/* IMAGE_REGISTRY_USER = credentials('IMAGE_REGISTRY_USER') */", `IMAGE_REGISTRY_USER = credentials('IMAGE_REGISTRY_USER')`, "Update Jenkinsfile to use IMAGE_REGISTRY_USER");
    }

    public async createRegistryPasswordCommit(gitOrg: string, gitRepository: string): Promise<string | undefined> {
        return await this.commitInGitHub(gitOrg, gitRepository, 'Jenkinsfile', "/* IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD') */", `IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD')`, "Update Jenkinsfile to use IMAGE_REGISTRY_PASSWORD");
    }

    public async disableQuayCommit(gitOrg: string, gitRepository: string): Promise<string | undefined> {
        return await this.commitInGitHub(gitOrg, gitRepository, 'Jenkinsfile', "QUAY_IO_CREDS = credentials('QUAY_IO_CREDS')", `/* QUAY_IO_CREDS = credentials('QUAY_IO_CREDS') */`, "Enable ACS scan in Jenkins");
    }


    /**
     * Commits multiple changes to workflow file required to enable RekorHost and TufMirror Secrets.
     *
     * @param {string} githubOrganization - The name of the GitHub organization.
     * @param {string} repositoryName - The name of the repository where the files will be committed.
     * @param {string} workflowPath - The workflow file name
     * @returns {Promise<string | undefined>} A Promise resolving to "true" if commit successful, otherwise undefined.
    */
    async updateJenkinsfileToEnableSecrets(githubOrganization: string, repositoryName: string, jenkinsfilePath: string) {
        return await this.commitMultipleFilesInGitHub(
            githubOrganization,
            repositoryName,
            [
                {
                    path: jenkinsfilePath,
                    stringToFind: "/* IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD') */",
                    replacementString: `IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD')`
                },
                {
                    path: jenkinsfilePath,
                    stringToFind: "QUAY_IO_CREDS = credentials('QUAY_IO_CREDS')",
                    replacementString: `/* QUAY_IO_CREDS = credentials('QUAY_IO_CREDS') */`
                },
                {
                    path: jenkinsfilePath,
                    stringToFind: "agent any",
                    replacementString: "agent {\n      kubernetes {\n        label 'jenkins-agent'\n        cloud 'openshift'\n        serviceAccount 'jenkins'\n        podRetention onFailure()\n        idleMinutes '5'\n        containerTemplate {\n         name 'jnlp'\n         image '" + this.jenkinsAgentImage + "'\n         ttyEnabled true\n         args '${computer.jnlpmac} ${computer.name}'\n        }\n       }\n}"
                },
                {
                    path: jenkinsfilePath,
                    stringToFind: "COSIGN_PUBLIC_KEY = credentials('COSIGN_PUBLIC_KEY')",
                    replacementString: "",
                },
                {
                    path: jenkinsfilePath,
                    stringToFind: `/* TRUSTIFICATION_BOMBASTIC_API_URL = credentials('TRUSTIFICATION_BOMBASTIC_API_URL') */`,
                    replacementString: "TRUSTIFICATION_BOMBASTIC_API_URL = credentials('TRUSTIFICATION_BOMBASTIC_API_URL')"
                },
                {
                    path: jenkinsfilePath,
                    stringToFind: `/* TRUSTIFICATION_OIDC_ISSUER_URL = credentials('TRUSTIFICATION_OIDC_ISSUER_URL') */`,
                    replacementString: "TRUSTIFICATION_OIDC_ISSUER_URL = credentials('TRUSTIFICATION_OIDC_ISSUER_URL')"
                },
                {
                    path: jenkinsfilePath,
                    stringToFind: `/* TRUSTIFICATION_OIDC_CLIENT_ID = credentials('TRUSTIFICATION_OIDC_CLIENT_ID') */`,
                    replacementString: "TRUSTIFICATION_OIDC_CLIENT_ID = credentials('TRUSTIFICATION_OIDC_CLIENT_ID')"
                },
                {
                    path: jenkinsfilePath,
                    stringToFind: `/* TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION = credentials('TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION') */`,
                    replacementString: `TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION = credentials('TRUSTIFICATION_SUPPORTED_CYCLONEDX_VERSION')`
                }
            ],
            "Update Jenkinsfile for tests"
        );
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
        return await this.commitInGitHub(gitOrg, gitRepository, 'rhtap/env.sh', "export DISABLE_ACS=false", "export DISABLE_ACS=true", "Enable ACS scan in Jenkins");
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
        return await this.commitInGitHub(gitOrg, gitRepository, 'rhtap/env.sh', "http://tuf.rhtap-tas.svc", tufURL, "Update TUF mirror in environment file");//NOSONAR
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
        return await this.commitInGitHub(gitOrg, gitRepository, 'rhtap/env.sh', "http://rekor-server.rhtap-tas.svc", rekorHost, "Update rekor URL in environment file");//NOSONAR
    }

    public async updateRoxCentralEndpoint(gitOrg: string, gitRepository: string, roxCentralEndpoint: string): Promise<string | undefined> {
        return await this.commitInGitHub(gitOrg, gitRepository, 'rhtap/env.sh', "# export ROX_CENTRAL_ENDPOINT=central-acs.apps.user.cluster.domain.com:443", "export ROX_CENTRAL_ENDPOINT=" + roxCentralEndpoint, "Update roxCentralEndpoint URL in environment file");//NOSONAR
    }

    public async deleteCosignPublicKey(gitOrg: string, gitRepository: string): Promise<string | undefined> {
        return await this.commitInGitHub(gitOrg, gitRepository, 'Jenkinsfile', "COSIGN_PUBLIC_KEY = credentials('COSIGN_PUBLIC_KEY')", "", "Delete cosign");//NOSONAR
    }

    public async updateCosignPublicKey(gitOrg: string, gitRepository: string, cosignPublicKey: string): Promise<string | undefined> {
        return await this.commitNewLineInGitHub(gitOrg, gitRepository, 'rhtap/env.sh', "export COSIGN_PUBLIC_KEY=" + cosignPublicKey, "Update cosign public key in environment file");//NOSONAR
    }

    public async updateImageRegistryUser(gitOrg: string, gitRepository: string, imageRegistryUser: string): Promise<string | undefined> {
        return await this.commitNewLineInGitHub(gitOrg, gitRepository, 'rhtap/env.sh', "export IMAGE_REGISTRY_USER=" + imageRegistryUser, "Update image registry user in environment file");//NOSONAR
    }

    public async commitInGitHub(gitOrg: string, gitRepository: string, path: string, stringToFind: string, replacementString: string, commitMessage: string): Promise<string | undefined> {
        try {
            const responseContent = await this.octokit.repos.getContent({
                owner: gitOrg, repo: gitRepository,
                path: path,
                ref: `main`,
            });

            //   // Decode the base64 content
            const content = Buffer.from(responseContent.data.content, "base64").toString();

            // Step 2: Modify the content
            const updatedContent = content.replace(
                stringToFind,
                replacementString
            );

            // Step 3: Create a commit with the new content
            await this.octokit.repos.createOrUpdateFileContents({
                owner: gitOrg, repo: gitRepository,
                path: path,
                message: commitMessage,
                content: Buffer.from(updatedContent).toString("base64"),
                sha: responseContent.data.sha, // The current commit SHA of the file
                ref: `main`,
            });

            console.log("env.sh updated successfully! Message:" + commitMessage);
            return "true";

        } catch (error) {
            console.error("An error occurred while updating the enviroment file", error);
        }
    }

    public async commitNewLineInGitHub(gitOrg: string, gitRepository: string, path: string,  lineToAppend: string, commitMessage: string): Promise<string | undefined> {
        try {
            const responseContent = await this.octokit.repos.getContent({
                owner: gitOrg, repo: gitRepository,
                path: path,
                ref: `main`,
            });

            //   // Decode the base64 content
            const content = Buffer.from(responseContent.data.content, "base64").toString();

            // Step 2: Modify the content
            const updatedContent = content.concat("\n" + lineToAppend + "\n");

            // Step 3: Create a commit with the new content
            await this.octokit.repos.createOrUpdateFileContents({
                owner: gitOrg, repo: gitRepository,
                path: path,
                message: commitMessage,
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

    public async createPullRequestFromMainBranch(owner: string, repo: string, filePath: string, content: string, fileSHA = ""): Promise<number> {
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

            return pullRequest.number;

        } catch (error) {
            console.error("Error:", error);
            throw new Error(`Error: ${error}`);
        }
    }

    /**
     * Merge GitHub pull request.
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} pullRequest - PR number.
     */
    public async mergePullRequest(owner: string, repo: string, pullRequest: number) {
        try {
            await this.octokit.pulls.merge({
                owner,
                repo,
                pull_number: pullRequest,
                commit_title: "RHTAP E2E: Automatic Pull Request merge",
                merge_method: "squash"
            });
        } catch (error) {
            throw new Error(`Failed to merge Pull Request ${pullRequest}, owner: ${owner}, repo: ${repo}. Error: ${error}`);
        }
    }

    /**
     * Extract image from GitOps repository for promotion.
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} componentName - component name.
     * @param {string} environment - environment name(development, stage, prod).
     */
    public async extractImageFromContent(owner: string, repo: string, componentName: string, environment: string): Promise<string> {
        try {
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path: `components/${componentName}/overlays/${environment}/deployment-patch.yaml`
            });

            const { content } = { ...response.data };

            const decodedData = Buffer.from(content, 'base64');

            const decodedContent = decodedData.toString();

            // Define the regular expression pattern to extract the desired string
            const pattern = /- image: (.*)/;

            // Use regular expression to extract the desired string
            const matches = decodedContent.match(pattern);

            if (matches && matches.length > 1) {
                const extractedImage = matches[1];
                console.log("Extracted image:", extractedImage);

                return extractedImage;
            } else {
                throw new Error("Image not found in the gitops repository path");
            }

        } catch (error) {
            console.log(error);
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
    public async promoteGitopsImageEnvironment(owner: string, repo: string, componentName: string, environment: string, image: string): Promise<number> {
        try {
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path: `components/${componentName}/overlays/${environment}/deployment-patch.yaml`
            });

            const { content, sha: fileSHA } = { ...response.data };

            const decodedData = Buffer.from(content, 'base64');
            let decodedContent = decodedData.toString();

            const pattern = /- image: (.*)/;
            decodedContent = decodedContent.replace(pattern, `- image: ${image}`);

            return await this.createPullRequestFromMainBranch(owner, repo, `components/${componentName}/overlays/${environment}/deployment-patch.yaml`, decodedContent, fileSHA);

        } catch (error) {
            throw new Error(`Error: ${error}`);
        }
    }

    /**
     * Function to get latest GitHub Actions Run Status of specified Workflow
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} workflowName - The workflow name in the repo
     * @returns {Promise<string>} A Promise resolving to string
     */
    public async getLatestWorkflowRunStatus(owner: string, repo: string, workflowName: string) : Promise<string> {
        const workflowId = await this.getWorkflowId(owner, repo, workflowName);
        const latestRun = await this.waitForLatestWorkflowRunInfo(owner, repo, workflowId);
        return latestRun.conclusion;
    }

    /**
     * Function to get latest GitHub Actions Run ID of specified Workflow
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} workflowName - The workflow name in the repo
     * @returns {Promise<number>} A Promise resolving to number
     */
    public async getLatestWorkflowRunId(owner: string, repo: string, workflowName: string): Promise<number> {
        const workflowId = await this.getWorkflowId(owner, repo, workflowName);
        const latestRun = await this.waitForLatestWorkflowRunInfo(owner, repo, workflowId);
        return latestRun.id;
    }

    /**
     * Function to wait for the latest run in a GitHub Actions workflow to finish and get its info
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {number} workflowId - The workflow ID in the repo
     * @returns {Promise<workflowRuns>} A Promise resolving to workflowRuns
     */
    public async waitForLatestWorkflowRunInfo(owner: string, repo: string, workflow_id: number, timeout = 300000): Promise<workflowRuns> { // Default timeout is 5 minutes
        console.log(`Waiting for the latest run in workflow '${workflow_id}' in repository '${owner}/${repo}' to finish...`);
        // workaround for the issue with the GitHub API not returning the latest job status immediately
        await this.sleep(10000);
        
        const startTime = Date.now();

        while (true) {
            // Check for timeout
            if (Date.now() - startTime > timeout) {
                throw new Error(`Timeout: The latest run did not finish within the specified time.`);
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
                    console.log(`Latest run '${latestRun.id}' in workflow '${workflow_id}' in repository '${owner}/${repo}' has finished. Status: ${latestRun.conclusion}`);
                    return latestRun;
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
                console.log(`Found workflow '${workflowName}' with ID: ${workflow.id} in repository '${owner}/${repo}'`);
                return workflow.id;
            } else {
                console.log(`Workflow '${workflowName}' not found in repository '${owner}/${repo}'`);
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
    public async rerunWorkflow(owner: string, repo: string, workflowId: number) {
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
            });
        } catch (error) {
            console.error(`Error rerunning workflow id=${workflowId}: `, error);
            throw error;
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
     * @param envVars array of secretName:secretValue pairs. Example
     * {
     *  "IMAGE_REGISTRY":"quay.io",
     *  "ROX_API_TOKEN": "xxxxx"
     * }
     * @author rhopp
     */
    public async setGitHubSecrets(owner: string, repo: string, envVars: Record<string, string>) {
        console.group(`Adding env vars to github ${owner}/${repo}`);
        let publicKeyResponse;
        try {
            publicKeyResponse = await this.octokit.actions.getRepoPublicKey({
                owner,
                repo
            });
        } catch (error) {
            console.error("Error getting repo public key to setup secrets:", error);
            console.groupEnd();
            throw error;
        }
        for (const [envVarName, envVarValue] of Object.entries(envVars)) {
            console.log("Setting env var: " + envVarName);
            this.setSecret(owner, repo, envVarName, envVarValue, publicKeyResponse);
        }
        console.groupEnd();
    }

    public async encryptSecret(publicKey: string, secretValue: string) {
        const keyBuffer = Buffer.from(publicKey, 'base64');
        const secretBuffer = Buffer.from(secretValue, 'utf8');
        const encryptedBuffer = Buffer.alloc(secretBuffer.length + sodium.crypto_box_SEALBYTES);
        sodium.crypto_box_seal(encryptedBuffer, secretBuffer, keyBuffer);
        return encryptedBuffer.toString('base64');
    }

    public async setSecret(owner: string, repo: string, secretName: string, secretValue: string, publicKeyResponse: RestEndpointMethodTypes["actions"]["getRepoPublicKey"]["response"]) {
        try {
            const encryptedValue = await this.encryptSecret(publicKeyResponse.data.key, secretValue);
            await this.octokit.rest.actions.createOrUpdateRepoSecret(
                {
                    owner,
                    repo,
                    secret_name: secretName,
                    encrypted_value: encryptedValue,
                    key_id: publicKeyResponse.data.key_id,
                }
            );

            console.log(`Secret "${secretName}" has been set successfully.`);
        } catch (error) {
            console.error('Error setting secret:', error);
            throw error;
        }
    }

    public async setGitHubVariables(owner: string, repo: string, envVars: Record<string, string>) {
        console.group(`Adding variables to github ${owner}/${repo}`);
        let variables;
        try {
            const response = await this.octokit.actions.listRepoVariables({
                owner,
                repo,
            });
            variables = response.data.variables;
        } catch (error) {
            console.error(`Error listing variables: ${error}`);
            console.groupEnd();
            throw error;
        }
        console.log("Variables:", variables);
        for (const [envVarName, envVarValue] of Object.entries(envVars)) {
            if (variables.map(variable => variable.name).includes(envVarName)) {
                console.log(`Updating ${envVarName}`);
                try {
                    await this.octokit.actions.updateRepoVariable({
                        owner,
                        repo,
                        name: envVarName,
                        value: envVarValue
                    });
                } catch (error) {
                    console.error(`Error updating variable ${envVarName}: ${error}`);
                    console.groupEnd();
                }
                continue;
            }
            try {
                await this.octokit.actions.createRepoVariable({
                    owner,
                    repo,
                    name: envVarName,
                    value: envVarValue
                });
            } catch (error) {
                console.error(`Error creating variable ${envVarName}: ${error}`);
                console.groupEnd();
                throw error;
            }
        }
        console.groupEnd();
    }
    /**
     * Commits multiple file changes to the main branch of a specified Git repository.
     * 
     * @param {string} gitOrg - The name of the GitHub organization.
     * @param {string} gitRepository - The name of the repository where the files will be committed.
     * @param {Array<{path: string, stringToFind?: string, replacementString: string}>} fileChanges - Array of file changes to commit
     * @param {string} commitMessage - The commit message
     * @returns {Promise<string | undefined>} A Promise resolving to "true" if commit successful, otherwise undefined.
     */
    public async commitMultipleFilesInGitHub(
        gitOrg: string, 
        gitRepository: string, 
        fileChanges: {
            path: string,
            stringToFind?: string | RegExp,
            replacementString: string
        }[], 
        commitMessage: string
    ): Promise<string | undefined> {
        try {
            // Use a Map to track files by path
            const fileContentsMap = new Map<string, {
                content: string,
                sha: string
            }>();
    
            // Group changes by file path
            const changesByPath = new Map<string, {
                stringToFind?: string | RegExp,
                replacementString: string
            }[]>();
            
            // Organize changes by path
            for (const change of fileChanges) {
                if (!changesByPath.has(change.path)) {
                    changesByPath.set(change.path, []);
                }
                const changes = changesByPath.get(change.path);
                if (changes) {
                    changes.push({
                        stringToFind: change.stringToFind,
                        replacementString: change.replacementString
                    });
                }
            }
            
            // Process each unique file path
            for (const [path, pathChanges] of changesByPath.entries()) {
                try {
                    // Get current file content
                    const response = await this.octokit.repos.getContent({
                        owner: gitOrg,
                        repo: gitRepository,
                        path,
                        ref: 'main'
                    });
    
                    let currentContent = Buffer.from(response.data.content, "base64").toString();
                    console.log(`File before all changes: ${path}\n${currentContent}`);
                    
                    // Apply all changes sequentially to this file
                    for (const change of pathChanges) {
                        if (change.stringToFind) {
                            // Create a regular expression for global replacement if stringToFind is a string
                            const searchPattern = typeof change.stringToFind === 'string' 
                                ? new RegExp(change.stringToFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') 
                                : change.stringToFind;
                            
                            // Update the content with this change
                            currentContent = currentContent.replace(searchPattern, change.replacementString);
                        } else {
                            // Replace entire file content
                            currentContent = change.replacementString;
                            break; // No need to process more changes if we're replacing the whole file
                        }
                    }
                    
                    console.log(`File after all changes: ${path}\n${currentContent}`);
                    
                    // Store the final content for this file
                    fileContentsMap.set(path, {
                        content: Buffer.from(currentContent).toString("base64"),
                        sha: response.data.sha
                    });
                    
                } catch (error) {
                    console.error(`Error processing file ${path}:`, error);
                    throw error;
                }
            }
    
            // Convert the map to the array format needed for the commit
            const fileUpdates = Array.from(fileContentsMap.entries()).map(
                ([path, {content, sha}]) => ({path, content, sha})
            );
            
            // If we have file changes, create a commit
            if (fileUpdates.length > 0) {
                // Rest of the function remains the same...
                const { data: refData } = await this.octokit.git.getRef({
                    owner: gitOrg,
                    repo: gitRepository,
                    ref: 'heads/main'
                });
                
                const { data: commitData } = await this.octokit.git.getCommit({
                    owner: gitOrg,
                    repo: gitRepository,
                    commit_sha: refData.object.sha
                });
                
                // Create a tree with all file changes
                const { data: treeData } = await this.octokit.git.createTree({
                    owner: gitOrg,
                    repo: gitRepository,
                    base_tree: commitData.tree.sha,
                    tree: fileUpdates.map(file => ({
                        path: file.path,
                        mode: '100644',
                        type: 'blob',
                        content: Buffer.from(file.content, 'base64').toString('utf8')
                    }))
                });
                
                // Create a commit with the new tree
                const { data: newCommitData } = await this.octokit.git.createCommit({
                    owner: gitOrg,
                    repo: gitRepository,
                    message: commitMessage,
                    tree: treeData.sha,
                    parents: [commitData.sha]
                });
                
                // Update the reference
                await this.octokit.git.updateRef({
                    owner: gitOrg,
                    repo: gitRepository,
                    ref: 'heads/main',
                    sha: newCommitData.sha
                });
                
                console.log(`Multiple files updated successfully in ${gitOrg}/${gitRepository}!`);
                return "true";
            } else {
                console.log("No files were changed");
                return undefined;
            }
        } catch (error) {
            console.error("An error occurred while updating multiple files", error);
            return undefined;
        }
    }
    /**
     * Gets the content of a file from a GitHub repository
     * @param owner Repository owner
     * @param repo Repository name
     * @param path Path to the file
     * @returns The content of the file as a string
     */
    async getFileContent(owner: string, repo: string, path: string): Promise<string> {
        try {
            const response = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path
            });
            
            // GitHub returns file content as base64 encoded
            if ('content' in response.data && !Array.isArray(response.data)) {
                const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
                return content;
            }
            throw new Error('Could not get file content');
        } catch (error) {
            console.error(`Error getting file content: ${error}`);
            throw error;
        }
    }

    /**
     * Commits multiple changes to workflow file required to enable RekorHost and TufMirror Secrets.
     *
     * @param {string} githubOrganization - The name of the GitHub organization.
     * @param {string} repositoryName - The name of the repository where the files will be committed.
     * @param {string} workflowPath - The workflow file name
     * @returns {Promise<string | undefined>} A Promise resolving to "true" if commit successful, otherwise undefined.
    */
    async updateWorkflowFileToEnableSecrets(githubOrganization: string, repositoryName: string, workflowPath: string) {
        return await this.commitMultipleFilesInGitHub(
            githubOrganization,
            repositoryName,
            [
                {
                    path: workflowPath,
                    stringToFind: "# REKOR_HOST: ${{ secrets.REKOR_HOST }}",
                    replacementString: "REKOR_HOST: ${{ secrets.REKOR_HOST }}"
                },
                {
                    path: workflowPath,
                    stringToFind: "/*REKOR_HOST: `${{ secrets.REKOR_HOST }}`, */",
                    replacementString: "REKOR_HOST: `${{ secrets.REKOR_HOST }}`,"
                },
                {
                    path: workflowPath,
                    stringToFind: "# TUF_MIRROR: ${{ secrets.TUF_MIRROR }}",
                    replacementString: "TUF_MIRROR: ${{ secrets.TUF_MIRROR }}"
                },
                {
                    path: workflowPath,
                    stringToFind: "/*TUF_MIRROR: `${{ secrets.TUF_MIRROR }}`, */",
                    replacementString: "TUF_MIRROR: `${{ secrets.TUF_MIRROR }}`,"
                }
            ],
            "Update Workflow file for Rekor host and TUF mirror secrets"
        );
    }

    /**
     * Function to get latest job ID for a specific workflow run
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {number} runId - The workflow Run ID in the repo
     * @returns {Promise<number>} A Promise resolving to number
     */
    public async getLatestWorkflowRunsJobId(owner: string, repo: string, runId: number): Promise<number> {
        try {
            console.log(`Getting latest job info for workflow run ${runId}`);
            const { data: jobs } = await this.octokit.rest.actions.listJobsForWorkflowRun({
                owner,
                repo,
                run_id: runId,
            });
            const latestJob = jobs.jobs[0];
            console.log(`Fetched latest job id: ${latestJob.id} for workflow run ${runId}`);
            return latestJob.id;
        } catch (error) {
            console.error('Error fetching jobs for workflow run:', error);
            throw error;
        }
    }

    /**
     * Function to get logs for a specific job in a workflow run
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {number} jobId - The job ID of workflow run in the repo
     * @returns {Promise<number>} A Promise resolving to string
     */
    public async getJobLogsFromWorkflowRun(owner: string, repo: string, jobId: number): Promise<string> {
        try {
            console.log(`Fetching job logs for ${jobId}`);
            const response = await this.octokit.rest.actions.downloadJobLogsForWorkflowRun({
                owner,
                repo,
                job_id: jobId
            });
            console.log(`Successfully fetched logs for job with ID: ${jobId}`);

            // The response includes download URL
            const logDownloadUrl = response.url;

            // Fetch the log content from the download URL
            const logResponse = await fetch(logDownloadUrl);
            const logContent = await logResponse.text();
            return logContent;
        } catch (error) {
            console.error('Error fetching job logs:', error);
            throw error;
        }
    }

    /**
     * Function to get logs of a job for a specific workflow
     * @param {string} owner - The name of the GitHub organization.
     * @param {string} repo - The name of the repository.
     * @param {string} workflowName - The workflow name in the repo
     * @returns {Promise<string>} A Promise resolving to string
     */
    public async getJobLogsFromWorkflowName(owner: string, repo: string, workflowName: string): Promise<string> {
        const runId = await this.getLatestWorkflowRunId(owner, repo, workflowName);
        const jobId = await this.getLatestWorkflowRunsJobId(owner, repo, runId);
        return await this.getJobLogsFromWorkflowRun(owner, repo, jobId);
    }
}
