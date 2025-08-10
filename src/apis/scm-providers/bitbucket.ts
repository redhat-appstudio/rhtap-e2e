import axios from 'axios';
import { Utils } from "./utils";
import * as qs from "qs";
import { generateRandomChars } from '../../../src/utils/generator';


export class BitbucketProvider extends Utils {
    private readonly bitbucket;
    private readonly bitbucketUsername;
    //Uncomment this, in case you want to build image for Jenkins Agent
    //private readonly jenkinsAgentImage = "image-registry.openshift-image-registry.svc:5000/jenkins/jenkins-agent-base:latest";
    private readonly jenkinsAgentImage = "quay.io/jkopriva/rhtap-jenkins-agent:0.2";

    constructor(bitbucketUsername: string, bitbucketAppPassword: string) {
        super();
        this.bitbucketUsername = bitbucketUsername;
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

    // Get Bitbucket username
    public async getBitbucketUsername(): Promise<string> {
        return this.bitbucketUsername;
    }

    /**
     * checkifRepositoryExists checks if a repository exists in Bitbucket
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid bitbucket repository
     */
    public async checkIfRepositoryExists(workspace: string, repoSlug: string): Promise<boolean> {
        try {
            const projects = await this.bitbucket.get(`/repositories/${workspace}/${repoSlug}`);
            console.info(`Repository '${repoSlug}' found in Workspace '${workspace}'
                created at '${projects.data.created_on}' and Status '${projects.status}' `);
            return projects.status === 200;
        } catch (error) {
            console.error('Error fetching repositories:', error);
            return false;
        }
    }

    /**
     * checkIfFolderExistsInRepository checks if a folder exists in Bitbucket repository
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid bitbucket repository
     * @param folderPath folder path to check in repository
     */
    public async checkIfFolderExistsInRepository(workspace: string, repoSlug: string, folderPath: string): Promise<boolean> {
        try {
            const response = await this.bitbucket.get(`/repositories/${workspace}/${repoSlug}/src/main/${folderPath}`);
            return response.status === 200;
        } catch (error) {
            console.error(`Failed to fetch folderPath:`, error);
            return false;
        }
    }

    /**
     * delete repository in bitbucket
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid bitbucket repository
     */
    public async deleteRepository(workspace: string, repoSlug: string): Promise<boolean> {
        try {
            const projects = await this.bitbucket.delete(`/repositories/${workspace}/${repoSlug}`);
            console.info(`Delete repository '${repoSlug}' from Workspace '${workspace}' `);
            return projects.status === 204;
        } catch (error) {
            console.error('Error deleting repository:', error);
            return false;
        }
    }

    /**
     * create commit in bitbucket repository
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid bitbucket repository
     * @param repoBranch valid branch in bitbucket repository
     * @param fileName file name in bitbucket repo to add/update
     * @param fileContent file content to be committed in file
     */
    public async createCommit(
        workspace: string,
        repoSlug: string,
        repoBranch: string,
        fileName: string,
        fileContent: string,
        message = "Automatic commit generated from tests"
    ):Promise<string> {
        try {

            const commitData = qs.stringify({
                [fileName]: fileContent,
                message: message,
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

            // Extract the revision from the header
            const commitSha = response.headers.location.split('/').pop();
 
            console.log(`Changes in file ${fileName} successfully committed in ${commitSha} for branch ${repoBranch}`);
            if (response.status != 201) {
                throw new Error(`Failed to create commit, request failed with ${response.status}`);
            }

            return commitSha;
        } catch (error) {
            throw new Error(`Error committing file: ${error}`);
        }
    }

    /**
     * create WebHook in bitbucket repository
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid bitbucket repository
     * @param webHookUrl valid webhook url to add in repository
     */
    public async createRepoWebHook(workspace: string, repoSlug: string, webHookUrl: string):Promise<string | undefined> {
        try{
            const webhookData = {
                "description": "rhtap-push",
                "url": webHookUrl,
                "active": true,
                "skip_cert_verification": true,
                "secret_set": false,
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

    /**
     * creates pullrequest in bitbucket repository
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid bitbucket repository where PR to open
     * @param fileName file name in bitbucket repo to add/update in PR
     * @param fileContent file content to be committed in file
     */
    public async createPullrequest(workspace: string, repoSlug: string, fileName: string, fileContent: string):Promise<[number, string]> {
        const testBranch = `test-${generateRandomChars(4)}`;

        // create new branch
        try{
            await this.bitbucket.post(
                `/repositories/${workspace}/${repoSlug}/refs/branches`,
                {
                    "name" : testBranch,
                    "target" : {
                        "hash" : "main",
                    }
                },
            );

            // Make changes in new branch
            const commitSha = await this.createCommit(workspace, repoSlug, testBranch, fileName, fileContent);

            // Open PR to merge new branch into main branch
            const prData = {
                "title": "PR created by Automated Tests",
                "source": {
                    "branch": {
                        "name": testBranch
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

            console.log(`Pull request ${prResponse.data.id} created in ${repoSlug} repository`);
            return [prResponse.data.id, commitSha];

        } catch(error){
            console.log(error);
            throw new Error("Failed to create merge request. Check below error");
        }
    }

    /**
     * merge pullrequest in bitbucket repository
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid bitbucket repository where PR is open
     * @param pullRequestID valid ID of pull request to merge
     */
    public async mergePullrequest(workspace: string, repoSlug: string, pullRequestID: number): Promise<string> {
        const mergeData = {
            "type": "commit",
            "message": "PR merge by automated tests",
            "close_source_branch": true,
            "merge_strategy": "merge_commit"
        };

        try {
            const response = await this.bitbucket.post(
                `repositories/${workspace}/${repoSlug}/pullrequests/${pullRequestID}/merge`,
                mergeData
            );

            const commitSha = response.data.merge_commit.hash;

            console.log(`Pull request "${pullRequestID}" merged successfully in ${repoSlug} repository with merge commit ${commitSha}`);

            return commitSha;
        } catch (error) {
            throw new Error(`Error merging PR: ${error} `);
        }
    }

    /**
     * Create promotion pullrequest in bitbucket gitops repository
     * @param workspace valid workspace in Bitbucket
     * @param componentName valid bitbucket repository name
     * @param fromEnvironment valid environment name from which image will be promoted (dev, stage)
     * @param toEnvironment valid environment name to which image will be promoted (stage, prod)
     */
    public async createPromotionPullrequest(workspace: string, componentName: string, fromEnvironment: string, toEnvironment: string):Promise<[number, string]> {
        const pattern = /- image: (.*)/;
        let extractedImage;

        try {
            const fromEnvironmentContent = await this.getFileContent(workspace, `${componentName}-gitops`, 'main', `components/${componentName}/overlays/${fromEnvironment}/deployment-patch.yaml`);
            const matchImage = fromEnvironmentContent.match(pattern);
            if (matchImage && matchImage.length > 1) {
                extractedImage = matchImage[1];
                console.log("Extracted image:", extractedImage);
            } else {
                throw new Error("Image not found in the gitops repository path");
            }

            const toEnvironmentContent = await this.getFileContent(workspace, `${componentName}-gitops`, 'main', `components/${componentName}/overlays/${toEnvironment}/deployment-patch.yaml`);
            const newContent = toEnvironmentContent.replace(pattern, `- image: ${extractedImage}`);
            return await this.createPullrequest(workspace, `${componentName}-gitops`, `components/${componentName}/overlays/${toEnvironment}/deployment-patch.yaml`, newContent);
        } catch(error){
            console.log(error);
            throw new Error("Failed to create merge request. Check below error");
        }

    }

    /**
     * Get file contents from Bitbucket repository
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid Bitbucket repository slug
     * @param repoBranch valid branch in Bitbucket repository
     * @param filePath valid file path in repository whose contents will be fetched
     */
    public async getFileContent(workspace: string, repoSlug: string, repoBranch: string, filePath: string):Promise<string>  {
        try{
            console.log(`Getting file contents of ${filePath} from repo ${repoSlug} and branch ${repoBranch}`);
            const content = await this.bitbucket.get(`/repositories/${workspace}/${repoSlug}/src/${repoBranch}/${filePath}`);
            return content.data;
        } catch(error){
            console.log(error);
            throw new Error("Failed to get contents of requested file. Check below error");
        }
    }

    /**
     * Update agent and enable Gitops and Image registry vars in Jenkinsfile
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid Bitbucket repository slug
     */
    public async updateJenkinsfileForCI(workspace: string, repoSlug: string): Promise<string> {
        const filePath = 'Jenkinsfile';
        let currentContent = await this.getFileContent(workspace, repoSlug, 'main', filePath);
        const stringReplaceContent = [
            {
                stringToFind: "agent any",
                replacementString: "agent {\n      kubernetes {\n        label 'jenkins-agent'\n        cloud 'openshift'\n        serviceAccount 'jenkins'\n        podRetention onFailure()\n        idleMinutes '5'\n        containerTemplate {\n         name 'jnlp'\n         image '" + this.jenkinsAgentImage + "'\n         ttyEnabled true\n         args '${computer.jnlpmac} ${computer.name}'\n        }\n        }\n        }"
            },
            {
                stringToFind: "/* IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD') */",
                replacementString: "IMAGE_REGISTRY_PASSWORD = credentials('IMAGE_REGISTRY_PASSWORD')"
            },
            {
                stringToFind: "QUAY_IO_CREDS = credentials('QUAY_IO_CREDS')",
                replacementString: "/* QUAY_IO_CREDS = credentials('QUAY_IO_CREDS') */"
            },
        ];

        console.log(`File before all changes: ${filePath}\n${currentContent}`);
        for (const content of stringReplaceContent) {
            currentContent = currentContent.replace(content.stringToFind, content.replacementString);
        }
        console.log(`File after all changes: ${filePath}\n${currentContent}`);
        return await this.createCommit(workspace, repoSlug, 'main', filePath, currentContent, "Update agent and image registry vars in Jenkinsfile for e2e-tests");
    }

    /**
     * Update RekorHost anf TufUrl in rhtap/env.sh file
     * @param workspace valid workspace in Bitbucket
     * @param repoSlug valid Bitbucket repository slug
     * @param rekorHost valid rekor host url
     * @param tufMirrorUrl valid tuf mirror url
     * @param roxCentralEndpoint valid rox central endpount url
     * @param cosignPublicKey valid cosign public key
     * @param imageRegistryUser valid image registry username
     */
    public async updateEnvFileForJenkinsCI(
        workspace: string,
        repoSlug: string,
        rekorHost: string,
        tufMirrorUrl: string,
        roxCentralEndpoint:string,
        cosignPublicKey: string,
        imageRegistryUser: string
    ): Promise<string> {
        const filePath = 'rhtap/env.sh';
        let fileContent = await this.getFileContent(workspace, repoSlug, 'main', filePath);
        console.log(`File before all changes: ${filePath}\n${fileContent}`);

        // Replace env variable values
        const stringReplaceContent = [
            {
                stringToFind: "http://rekor-server.tssc-tas.svc", //NOSONAR
                replacementString: rekorHost
            },
            {
                stringToFind: "http://tuf.tssc-tas.svc", //NOSONAR
                replacementString: tufMirrorUrl
            },
            {
                stringToFind: "# export ROX_CENTRAL_ENDPOINT=central-acs.apps.user.cluster.domain.com:443",
                replacementString: `export ROX_CENTRAL_ENDPOINT=${roxCentralEndpoint}`
            },
        ];
        for (const content of stringReplaceContent) {
            fileContent = fileContent.replace(content.stringToFind, content.replacementString);
        }

        // Add new lines for Cosign pub key, Image user, Gitops user variables
        const newContentList: string[] = [
            `export COSIGN_PUBLIC_KEY=${cosignPublicKey}`,
            `export IMAGE_REGISTRY_USER=${imageRegistryUser}`,
            `export GITOPS_AUTH_USERNAME=${await this.getBitbucketUsername()}`
        ];
        for (const newVars of newContentList) {
            fileContent = fileContent.concat(`\n${newVars}\n`);
        }

        console.log(`File after all changes: ${filePath}\n${fileContent}`);
        return await this.createCommit(workspace, repoSlug, 'main', filePath, fileContent, "Update variables in rhtap/env.sh for e2e-tests");
    }

}
