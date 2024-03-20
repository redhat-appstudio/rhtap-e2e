import { Octokit } from "@octokit/rest";
import { AxiosError } from "axios";
import { Utils } from "./utils";
import { generateRandomName } from "../../utils/generator";

export class GitHubProvider extends Utils {
    private readonly octokit: Octokit

    constructor() {
        super()

        this.octokit = new Octokit({
            baseUrl: 'https://api.github.com',
            userAgent: 'rhtap-e2e',
            auth: process.env.GITHUB_TOKEN,
        })
    }

    /**
     * checkifRepositoryExists return if a repository exists in GitHub
     * @param organization A valid GitHub organization
     * @param name A valid GitHub repository
     */
    public async checkIfRepositoryExists(organization: string, name: string): Promise<boolean> {
        try {
            const repositoryResponse = await this.octokit.repos.get({owner: organization, repo: name})

            return repositoryResponse.status === 200
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
            const response = await this.octokit.repos.getContent({ owner: organization, repo: name, path: folderPath});

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
    public async createEmptyCommit(gitOrg: string, gitRepository: string):Promise<string | undefined> {
        try {
            const baseBranchRef = await this.octokit.git.getRef({ owner: gitOrg, repo: gitRepository, ref: 'heads/main' })

            const currentCommit = await this.octokit.git.getCommit({owner: gitOrg, repo: gitRepository,
                commit_sha: baseBranchRef.data.object.sha,
            });

            const newCommit = await this.octokit.git.createCommit({owner: gitOrg, repo: gitRepository,
                message: 'Automatic commit generated from tests',
                tree: currentCommit.data.tree.sha,
                parents: [currentCommit.data.sha],
            });

            await this.octokit.git.updateRef({owner: gitOrg, repo: gitRepository,
                ref: `heads/main`,
                sha: newCommit.data.sha,
            });

            return newCommit.data.sha
        } catch (error) {
            console.log(error)
        }
    }

    public async createPullRequestFromMainBranch(owner: string, repo: string, filePath: string, content: string, fileSHA = ""): Promise<number | undefined> {
        const baseBranch = "main"; // Specify the base branch
        const newBranch = generateRandomName(); // Specify the new branch name
    
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
                message: "Commit generated automatically from Red Hat Trusted Application Pipeline E2E framework",
                content: Buffer.from(content).toString("base64"),
                branch: newBranch,
                sha: fileSHA
            });

            const { data: pullRequest } = await this.octokit.pulls.create({
                owner,
                repo,
                title: "E2E framework: Automatic Pull Request",
                head: newBranch,
                base: baseBranch,
                body: "E2E framework: Automatic Pull Request"
            });

            return pullRequest.number
    
        } catch (error) {
            console.error("Error:", error);
        }
    }

    /**
     * name
     */
    public async mergePullRequest(owner: string, repo: string, pull_request: number) {
        try {
            await this.octokit.pulls.merge({
                owner,
                repo,
                pull_number: pull_request,
                commit_title: "E2E framework: Automatic Pull Request merge",
                merge_method: "squash"
            });
        } catch (error) {
            console.log(error)
        }
    }

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
            throw new Error(`Error: ${error}`);
        }
    }

    /**
     * name
     */
    public async promoteGitopsImageEnvironment(owner: string, repo: string, componentName: string, environment: string, image: string):Promise<number| undefined> {
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
            console.log(error)
        }
    }
}
