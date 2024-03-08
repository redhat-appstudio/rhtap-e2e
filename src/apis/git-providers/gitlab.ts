import { Gitlab } from "@gitbeaker/rest"
import { Utils } from "./utils";

export class GitLabProvider extends Utils {
    private readonly gitlab

    constructor() {
        super()

        if (!process.env.GITLAB_TOKEN) {
            throw new Error("missed environment GITLAB_TOKEN");
            
        }

        this.gitlab = new Gitlab({
            host: 'https://gitlab.com',
            token: process.env.GITLAB_TOKEN
        })
    }

    // Function to find a repository by name
    public async checkIfRepositoryExists(namespace: string, repoName: string): Promise<number> {
        try {
            // Search for projects with the given name in the specified namespace
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
}
