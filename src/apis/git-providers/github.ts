import { Octokit } from "@octokit/rest";
import { AxiosError } from "axios";
import { Utils } from "./utils";

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
}
