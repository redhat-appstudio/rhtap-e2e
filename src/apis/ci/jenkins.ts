import axios, { Axios } from 'axios';
import { Utils } from '../scm-providers/utils';

export class JenkinsCI extends Utils {
    // Jenkins server details
    private readonly jenkinsUrl: string;
    private readonly jenkinsUsername: string;
    private readonly jenkinsApiToken: string;
    private readonly axiosInstance: Axios;

    /**
     * Constructs a new instance of DeveloperHubClient.
     * 
     */
    constructor(jenkinsURL: string, jenkinsUsername: string, jenkinsToken: string) {
        super();
        this.jenkinsUrl = jenkinsURL;
        this.jenkinsUsername = jenkinsUsername;
        this.jenkinsApiToken = jenkinsToken;

        this.axiosInstance = axios.create({
            baseURL: this.jenkinsUrl,
            headers: {
                "Content-Type": "application/xml",
            },
            auth: {
                username: this.jenkinsUsername,
                password: this.jenkinsApiToken,
            },
        });
    }

    // createJenkinsJob creates a new Jenkins job
    public async createJenkinsJobURL(gitProvider: string, organization: string, jobName: string, url: string) {
        const jobConfigXml = `
            <flow-definition plugin="workflow-job@2.40">
                <actions/>
                <description></description>
                <keepDependencies>false</keepDependencies>
                <properties>
                    <org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
                        <triggers>
                            <com.cloudbees.jenkins.GitHubPushTrigger plugin="github@1.37.1">
                            <spec/>
                            </com.cloudbees.jenkins.GitHubPushTrigger>
                        </triggers>
                    </org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
                </properties>
                <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps@2.89">
                    <scm class="hudson.plugins.git.GitSCM" plugin="git@4.4.5">
                        <configVersion>2</configVersion>
                        <userRemoteConfigs>
                            <hudson.plugins.git.UserRemoteConfig>
                                <url>https://${gitProvider}/${organization}/${jobName}</url>
                                <credentialsId>GITOPS_CREDENTIALS</credentialsId>
                            </hudson.plugins.git.UserRemoteConfig>
                        </userRemoteConfigs>
                        <branches>
                            <hudson.plugins.git.BranchSpec>
                                <name>*/main</name>
                            </hudson.plugins.git.BranchSpec>
                        </branches>
                        <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
                        <submoduleCfg class="list"/>
                        <extensions/>
                    </scm>
                    <scriptPath>Jenkinsfile</scriptPath>
                    <lightweight>true</lightweight>
                </definition>
                <disabled>false</disabled>
            </flow-definition>
            `;

        try {
            const response = await this.axiosInstance.post(url, jobConfigXml);
            if (response.status === 200) {
                console.log(`Job '${jobName}' created successfully.`);
            } else {
                console.error(`Failed to create job. Status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error creating job:', error);
        }
    }

    // createJenkinsJob creates a new Jenkins job
    public async createJenkinsJob(gitProvider: string, organization: string, jobName: string) {
        const url = `${this.jenkinsUrl}/createItem?name=${jobName}`;
        await this.createJenkinsJobURL(gitProvider, organization, jobName, url);
    }

    // createJenkinsJob creates a new Jenkins job
    public async createJenkinsJobInFolder(gitProvider: string, organization: string, jobName: string, jobFolder: string) {
        const url = `${this.jenkinsUrl}/job/${jobFolder}/createItem?name=${jobName}`;
        await this.createJenkinsJobURL(gitProvider, organization, jobName, url);
    }

    // Create credentials in Jenkins instance
    public async createCredentialsInFolder(scope: string, id: string, secret: string, folderName: string) {
        if (await this.checkCredentialsExistInFolder(id, folderName) === false) {
            const url = `${this.jenkinsUrl}/job/${folderName}/credentials/store/folder/domain/_/createCredentials`;
            const credsConfigXml = `
            <org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl plugin="plain-credentials">
                <id>${id}</id>
                <scope>${scope}</scope>
                <description></description>
                <secret>${secret}</secret>
            </org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>
            `;

            try {
                const response = await this.axiosInstance.post(url, credsConfigXml);
                if (response.status === 200) {
                    console.log(`Credentials '${id}' created successfully.`);
                } else {
                    console.error(`Failed to create credentials. Status: ${response.status}`);
                }
            } catch (error) {
                console.error('Error creating credentials:', error);
            }
        }
    }

    // Create credentials in Jenkins instance
    public async createCredentialsUsernamePasswordInFolder(scope: string, id: string, username: string, password: string, folderName: string) {
        if (await this.checkCredentialsExistInFolder(id, folderName) === false) {
            const url = `${this.jenkinsUrl}/job/${folderName}/credentials/store/folder/domain/_/createCredentials`;
            const credsConfigXml = `
                <com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl plugin="plain-credentials">
                    <id>${id}</id>
                    <scope>${scope}</scope>
                    <description></description>
                    <username>${username}</username>
                    <password>${password}</password>
                </com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl>
                `;

            try {
                const response = await this.axiosInstance.post(url, credsConfigXml);
                if (response.status === 200) {
                    console.log(`Credentials '${id}' created successfully.`);
                } else {
                    console.error(`Failed to create credentials. Status: ${response.status}`);
                }
            } catch (error) {
                console.error('Error creating credentials:', error);
            }
        }
    }

    public async checkCredentialsExistInFolder(credentialId: string, folderName: string): Promise<boolean> {
        const url = `${this.jenkinsUrl}/job/${folderName}/credentials/store/system/domain/_/credential/${credentialId}/api/xml`;
        try {
            const response = await this.axiosInstance.post(url);
            if (response.status === 200) {
                console.log(`Credential '${credentialId}' does exist.`);
                return true;
            }
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                console.log(`Credential '${credentialId}' does NOT exist.`);
                return false;
            }
            console.error('Error checking credentials:', error);
            throw error;
        }
        return false;
    }

    // jobExists checks if a job exists
    public async jobExistsInFolder(jobName: string, folderName: string): Promise<boolean> {
        const url = `${this.jenkinsUrl}/job/${folderName}/job/${jobName}/api/json`;
        try {
            const response = await this.axiosInstance.post(url);
            if (response.status === 200) {
                return true;
            }
            if (response.status === 404) {
                return false;
            }
            return response.status === 200;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response && error.response.status === 404) {
                    return false;
                } else {
                    console.error('Axios error checking job existence:', error);
                    throw error;
                }
            } else {
                console.error('Error checking job existence:', error);
                throw error;
            }
        }
    }

    // waitForJobCreation waits until a job is created
    public async waitForJobCreationInFolder(jobName: string, folderName: string) {
        console.log(`Waiting for job '${jobName}' to be created...`);
        while (true) {
            if (await this.jobExistsInFolder(jobName, folderName)) {
                console.log(`Job '${jobName}' is now available.`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
        }
    }

    // buildJenkinsJob triggers a build for a Jenkins job
    public async buildJenkinsJobInFolder(jobName: string, folderName: string): Promise<string | null> {
        const url = `${this.jenkinsUrl}/job/${folderName}/job/${jobName}/build`;
        try {
            const response = await this.axiosInstance.post(url);
            if (response.status === 201) {
                const queueItemUrl = response.headers.location;
                console.log(`Build triggered for job '${jobName}' successfully.`);
                return queueItemUrl;
            } else {
                console.error(`Failed to trigger build. Status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error triggering build:', error);
        }
        return null;
    }

    // getBuildNumber gets the build number from the queue item URL
    public async getBuildNumber(queueItemUrl: string): Promise<number | null> {
        const url = `${this.jenkinsUrl}${queueItemUrl}api/json`;
        try {
            const response = await this.axiosInstance.post(url);
            if (response.data.executable) {
                return response.data.executable.number;
            } else if (response.data.cancelled) {
                console.error('Build was cancelled.');
                return null;
            } else {
                return null;
            }
        } catch (error) {
            console.error('Error getting build number:', error);
            return null;
        }
    }

    // waitForBuildToFinish waits for a build to finish and get its result
    public async waitForJobToFinishInFolder(jobName: string, buildNumber: number, timeoutMs: number, folderName: string) {
        const url = `${this.jenkinsUrl}/job/${folderName}/job/${jobName}/${buildNumber}/api/json`;

        const retryInterval = 10 * 1000;
        let totalTimeMs = 0;

        while (timeoutMs === 0 || totalTimeMs < timeoutMs) {
            try {
                const response = await this.axiosInstance.post(url);
                if (response.data.building) {
                    console.log(`Build #${buildNumber} of job ${jobName} is still in progress...`);
                    await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for 15 seconds
                } else {
                    console.log(`Build #${buildNumber} finished with status: ${response.data.result}`);
                    return response.data.result;
                }
            } catch (error) {
                console.error('Error checking build status:', error);
                await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for 15 seconds
            }
            totalTimeMs += retryInterval;
        }
    }

    // getLatestBuildNumber gets the latest build number for a Jenkins job
    public async getLatestBuildNumber(jobName: string): Promise<number | null> {
        const url = `${this.jenkinsUrl}/job/${jobName}/api/json?tree=lastBuild[number]`;

        try {
            const response = await this.axiosInstance.post(url);
            const lastBuild = response.data.lastBuild;

            if (lastBuild) {
                return lastBuild.number;
            } else {
                console.log(`No builds found for job '${jobName}'.`);
                return null;
            }
        } catch (error) {
            console.error('Error getting latest build number:', error);
            return null;
        }
    }

    public async getJobConsoleLogForBuild(jobName: string, folderName: string, buildNumber: number): Promise<string> {
        const url = `${this.jenkinsUrl}/job/${folderName}/job/${jobName}/${buildNumber}/consoleFull`;

        try {
            const response = await this.axiosInstance.post(url);
            return response.data;
        } catch (error) {
            console.error('Error getting latest build number:', error);
            return "";
        }
    }

    public async deleteJenkinsJobInFolder(jobName: string, folderName: string) {
        const url = `${this.jenkinsUrl}/job/${folderName}/job/${jobName}/doDelete`;

        try {
            const response = await this.axiosInstance.post(url);

            if (response.status === 200) {
                console.log(`Job '${jobName}' deleted successfully.`);
            } else {
                console.error(`Failed to delete job. Status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error deleting job:', error);
        }
    }

    public async createFolder(folderName: string) {
        const url = `${this.jenkinsUrl}/createItem?name=${folderName}`;

        const folderXml = `
      <com.cloudbees.hudson.plugins.folder.Folder plugin="cloudbees-folder@6.15">
          <description></description>
      </com.cloudbees.hudson.plugins.folder.Folder>
    `;

        try {

            // Send POST request to create the folder
            const response = await this.axiosInstance.post(url, folderXml);

            if (response.status === 200) {
                console.log(`Folder '${folderName}' created successfully.`);
            } else {
                console.log(`Failed to create folder '${folderName}', status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error creating Jenkins folder:', error);
            throw error;
        }
    }


    public async getJenkinsURL() {
        return this.jenkinsUrl;
    }
}
