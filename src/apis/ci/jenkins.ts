import axios, { Axios } from 'axios';
import { Utils } from '../git-providers/utils';

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
    public async createJenkinsJob(gitProvider: string, organization: string, jobName: string) {
        const url = `${this.jenkinsUrl}/createItem?name=${jobName}`;
        const jobConfigXml = `
        <flow-definition plugin="workflow-job@2.40">
            <actions/>
            <description></description>
            <keepDependencies>false</keepDependencies>
            <properties>
                <org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
                    <triggers/>
                </org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
            </properties>
            <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps@2.89">
                <scm class="hudson.plugins.git.GitSCM" plugin="git@4.4.5">
                    <configVersion>2</configVersion>
                    <userRemoteConfigs>
                        <hudson.plugins.git.UserRemoteConfig>
                            <url>https://${gitProvider}/${organization}/${jobName}</url>
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

    // jobExists checks if a job exists
    public async jobExists(jobName: string): Promise<boolean> {
        const url = `${this.jenkinsUrl}/job/${jobName}/api/json`;
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
            console.error('Error checking job existence:', error);
            throw error;
        }
    }

    // waitForJobCreation waits until a job is created
    public async waitForJobCreation(jobName: string) {
        console.log(`Waiting for job '${jobName}' to be created...`);
        while (true) {
            if (await this.jobExists(jobName)) {
                console.log(`Job '${jobName}' is now available.`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds
        }
    }

    // buildJenkinsJob triggers a build for a Jenkins job
    public async buildJenkinsJob(jobName: string): Promise<string | null> {
        const url = `${this.jenkinsUrl}/job/${jobName}/build`;
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
    public async waitForBuildToFinish(jobName: string, buildNumber: number, timeoutMs: number) {
        const url = `${this.jenkinsUrl}/job/${jobName}/${buildNumber}/api/json`;

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

    public async deleteJenkinsJob(jobName: string) {
        const url = `${this.jenkinsUrl}/job/${jobName}/doDelete`;
    
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



}