import axios from 'axios';
import { Utils } from "./utils";
import * as qs from "qs";
import { generateRandomChars } from '../../../src/utils/generator';


export class BitbucketProvider extends Utils {
    private readonly bitbucket;

    constructor(bitbucketUsername: string, bitbucketAppPassword: string) {
        super();
        this.bitbucket = axios.create({
            baseURL: "https://api.bitbucket.org/2.0",
            auth: {
                username: bitbucketUsername || '',
                password: bitbucketAppPassword || '',
            },
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    // Method to fetch repository
    public async checkIfRepositoryExists(workspace: string, repoName: string) {
        try {
            const projects = await this.bitbucket.get(`/repositories/${workspace}/${repoName}`);
            if (projects) {
                console.info(`Repository '${repoName}' found in Workspace '${workspace}'
                    created at '${projects.data.created_on}' and Status '${projects.status}' `);
                return projects.status === 200;
                }
        } catch (error) {
            console.error('Error fetching repositories:', error);
        }
    }

    // Method to fetch folder in repository
    public async checkIfFolderExistsInRepository(workspace: string, repoName: string, folderPath: string) {
        try {
            const response = await this.bitbucket.get(`/repositories/${workspace}/${repoName}/src/main/${folderPath}`);
            return response.status === 200;
        } catch (error) {
            console.error(`Failed to fetch folderPath:`, error);
        }
    }

    // Method to delete repository
    public async deleteRepository(workspace: string, repoName: string) {
        try {
            const projects = await this.bitbucket.delete(`/repositories/${workspace}/${repoName}`);
            console.info(`Delete repository '${repoName}' from Workspace '${workspace}' `);
            return projects.status;
        } catch (error) {
            console.error('Error deleting repository:', error);
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
            return response.data;

        } catch (error) {
            console.error('Error committing file:', error);
        }
    }

    // Method to create WebHook in repository
    public async createRepoWebHook(workspace: string, repoSlug: string, webHookUrl: string){
        try{
            const webhookData = {
                "description": "rhtap-push",
                "url": webHookUrl,
                "active": true,
                "skip_cert_verification": true,
                secret_set: false,
                "events": [
                    "repo:push",
                    "pullrequest:created",
                    "pullrequest:fulfilled"
                ]
            };
            const hook = await this.bitbucket.post(`/repositories/${workspace}/${repoSlug}/hooks`, webhookData);
            return hook.data;
        } catch (error) {
            console.error('Error creating webhook:', error);
        }
    }

    // Method to create Pull Request for repository
    public async createPullrequest(workspace: string, repoSlug: string, fileName: string, fileContent: string){
        const test_branch = `test-${generateRandomChars(4)}`;

        // create new branch
        try{
        await this.bitbucket.post(
            `/repositories/${workspace}/${repoSlug}/refs/branches`,
            {
                "name" : test_branch,
                "target" : {
                    "hash" : "main",
                }
            },
        );

        // Make changes in new branch
        await this.createCommit(workspace, repoSlug, test_branch, fileName, fileContent);

        // Open PR to merge new branch into main branch
        const prData = {
            "title": "PR created by Automated Tests",
            "source": {
                "branch": {
                    "name": test_branch
                }
            },
            "destination": {
                "branch": {
                    "name": "main"
                }
            }
        };

        const prResponse = await this.bitbucket.post(
            `repositories/${workspace}/${repoSlug}/pullrequests`,
            prData,
        );

        console.log('Pull request created successfully:', prResponse.data.id);
        return prResponse.data.id

        } catch(error){
            console.error("Error creating PR:", error)
        }
    }

    // Method to merge Pull Request
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
            console.log("Error merging PR", error);
        }
    }

}