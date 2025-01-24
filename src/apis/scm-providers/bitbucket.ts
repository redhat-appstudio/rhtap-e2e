import axios from 'axios';
import { Utils } from "./utils";
import * as qs from 'qs';

export class BitbucketProvider extends Utils {
    private readonly bitbucket;
    // private readonly bitbucketWorkspace;
    // private readonly bitbucketUserName;
    // private readonly bitbucketAppPassword;
    // private readonly jenkinsAgentImage = "image-registry.openshift-image-registry.svc:5000/jenkins/jenkins-agent-base:latest";

    constructor(bitbucketUserName: string, bitbucketAppPassword: string) {
        super();
        this.bitbucket = axios.create({
            baseURL: "https://api.bitbucket.org/2.0",
            auth: {
                username: bitbucketUserName || '',
                password: bitbucketAppPassword || '',
            },
            headers: {
                'Content-Type': 'application/json', // Ensure this is set
            },
        });
    }

    // Method to fetch repository
    public async checkIfRepositoryExists(workspace: string, repoName: string) {
        try {
            const projects = await this.bitbucket.get(`/repositories/${workspace}/${repoName}`);
            // const projects = await this.bitbucket.get(`/repositories/${workspace}`);
            console.log('Repositories: ', projects);
            if (projects) {
                console.info(`Repository '${repoName}' found in Workspace '${workspace}'
                    created at '${projects.data.created_on}' and Status '${projects.status}' `);
                return projects.status === 200;
                }
        } catch (error) {
            console.error('Error fetching repositories:', error);
        }
    }

    public async checkIfFolderExistsInRepository(workspace: string, repoName: string, folderPath: string): Promise<boolean> {
        try {
            const response = await this.bitbucket.get(`/repositories/${workspace}/${repoName}/src/main/${folderPath}`);
            console.log('Repositories: ', response.data);
            return response.status === 200;
        } catch (error) {
            // const e = error as AxiosError;
            console.error(`Failed to fetch folderPath:`, error);

            return false;
        }
    }

    // Method to delete repository
    public async deleteRepository(workspace: string, repoName: string) {
        try {
            const projects = await this.bitbucket.delete(`/repositories/${workspace}/${repoName}`);
            console.info(projects.status);
        } catch (error) {
            console.error('Error fetching repositories:', error);
        }
    }

    // Method to create commit repository
    public async createCommit(
        workspace: string,
        repoSlug: string,
        repoBranch: string,
        fileName: string,
        fileContent: string,
    ): Promise<void> {
        try {

            const commitData = qs.stringify({
                [fileName]: fileContent,
                message: "Automatic commit generated from tests",
                branch: repoBranch,
            });

            const response = await this.bitbucket.post(
                `/repositories/${workspace}/${repoSlug}/src`,
                commitData,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    }
                }
            );

            console.log('Commit successfully created:', response.data);

        } catch (error) {
            console.error('Error committing file:', error);
        }
    }

    public async createPullrequest(workspace: string, repoSlug: string, fileName: string, fileContent: string){
        const test_branch = "stage-test-2";
        // create new branch
        try{
        const newBranch = await this.bitbucket.post(
            `/repositories/${workspace}/${repoSlug}/refs/branches`,
            {
                "name" : test_branch,
                "target" : {
                    "hash" : "main",
                }
            },
        );
        console.log("NEW BRANCH CREATED: ", newBranch);

        // Make changes in new branch
        // await this.createCommit(workspace, repoSlug, test_branch, fileName, fileContent);
        // console.log("Commit Done:", commitNew.data);

        // Open PR to merge new branch into main branch
        // const prData = {
        //     "title": "PR created by Automated Tests",
        //     "source": {
        //         "branch": {
        //             "name": test_branch
        //         }
        //     },
        //     "destination": {
        //         "branch": {
        //             "name": "main"
        //         }
        //     }
        // };

        // const prResponse = await this.bitbucket.post(
        //     `repositories/${workspace}/${repoSlug}/pullrequests`,
        //     prData,
        // );

        // console.log('Pull request created successfully:', prResponse.data.id);

        } catch(error){
            console.error("Error:", error)
        }
    }

    public async mergePullrequest(workspace: string, repoSlug: string, pullRequestID: string){
        const mergeData = {
            "type": "commit",
            "message": "PR merge by automated tests",
            "close_source_branch": true,
            "merge_strategy": "merge_commit"
          };

        try {
            await this.bitbucket.post(
                `repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestID}/merge`,
                mergeData
            );

            console.log(`Pull request "${pullRequestID}" merged successfully.`);
        } catch (error) {
            console.log(error);
            // throw new Error("Failed to merge Merge Request. Check bellow error", error);
        }
    }

}