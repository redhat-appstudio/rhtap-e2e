import axios, { Axios } from 'axios';
import { Utils } from '../git-providers/utils';

export class JenkinsCI extends Utils {
    // Jenkins server details
    private JENKINS_URL: string;
    private JENKINS_USER: string;
    private JENKINS_API_TOKEN: string;
    private axiosInstance: Axios;

    /**
     * Constructs a new instance of DeveloperHubClient.
     * 
     * @throws {Error} Throws an error if the 'JENKINS_URL' environment variable is not set.
     */
    constructor() {
        super();

        if (!process.env.JENKINS_URL) {
            throw new Error("Cannot initialize DeveloperHubClient, missing 'JENKINS_URL' environment variable");
        }

        this.JENKINS_URL = process.env.JENKINS_URL;
        this.JENKINS_USER = process.env.JENKINS_USERNAME!;
        this.JENKINS_API_TOKEN = process.env.JENKINS_TOKEN!;

        this.axiosInstance = axios.create({
            baseURL: this.JENKINS_URL,
            headers: {
                "Content-Type": "application/xml",
            },
            auth: {
                username: this.JENKINS_USER,
                password: this.JENKINS_API_TOKEN,
            },
        });
    }

    // Function to create a new Jenkins job
    public async createJenkinsJob(gitProvider: string, organization: string, jobName: string) {
        const url = `${this.JENKINS_URL}/createItem?name=${jobName}`;
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

    // Function to check if a job exists
    public async jobExists(jobName: string): Promise<boolean> {
        const url = `${this.JENKINS_URL}/job/${jobName}/api/json`;
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
            if (error.response && error.response.status === 404) {
                return false;
            } else {
                console.error('Error checking job existence:', error);
                throw error;
            }
        }
    }

    // Function to wait until a job is created
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

    // Function to trigger a build for a Jenkins job
    public async buildJenkinsJob(jobName: string): Promise<string | null> {
        const url = `${this.JENKINS_URL}/job/${jobName}/build`;
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

    // Function to get the build number from the queue item URL
    public async getBuildNumber(queueItemUrl: string): Promise<number | null> {
        const url = `${this.JENKINS_URL}${queueItemUrl}api/json`;
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
            // console.error('Error getting build number:', error);
            return null;
        }
    }

    // Function to wait for a build to finish and get its result
    public async waitForBuildToFinish(jobName: string, buildNumber: number) {
        const url = `${this.JENKINS_URL}/job/${jobName}/${buildNumber}/api/json`;

        while (true) {
            try {
                const response = await this.axiosInstance.post(url);
                if (response.data.building) {
                    console.log(`Build #${buildNumber} is still in progress...`);
                    await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for 15 seconds
                } else {
                    console.log(`Build #${buildNumber} finished with status: ${response.data.result}`);
                    break;
                }
            } catch (error) {
                console.error('Error checking build status:', error);
                break;
            }
        }
    }

    // Function to get the latest build number for a Jenkins job
    public async getLatestBuildNumber(jobName: string): Promise<number | null> {
        const url = `${this.JENKINS_URL}/job/${jobName}/api/json?tree=lastBuild[number]`;

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
}
