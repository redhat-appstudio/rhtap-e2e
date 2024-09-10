import axios, { Axios, AxiosResponse } from 'axios';
import { ScaffolderScaffoldOptions, ScaffolderTask } from '@backstage/plugin-scaffolder-react';
import { TaskIdReponse } from './types';
import { TemplateEntityV1beta3 } from '@backstage/plugin-scaffolder-common';
import { Utils } from '../git-providers/utils';
import * as https from 'https';

/**
 * A client for interacting with the Red Hat Developer Hub backend.
 */
export class DeveloperHubClient extends Utils {
    private RHDHUrl: string;
    private axiosInstance : Axios;

    /**
     * Constructs a new instance of DeveloperHubClient.
     * 
     * @throws {Error} Throws an error if the 'RED_HAT_DEVELOPER_HUB_URL' environment variable is not set.
     */
    constructor() {
        super();

        if (!process.env.RED_HAT_DEVELOPER_HUB_URL) {
            throw new Error("Cannot initialize DeveloperHubClient, missing 'RED_HAT_DEVELOPER_HUB_URL' environment variable");
        }

        this.RHDHUrl = process.env.RED_HAT_DEVELOPER_HUB_URL;
        this.axiosInstance = axios.create({
            httpAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
    }

    /**
     * Creates a Developer Hub task based on the provided component creation options.
     * 
     * @param {ScaffolderScaffoldOptions} componentCreateOptions - The options for creating the component.
     * @returns {Promise<TaskIdReponse>} A Promise that resolves to the response containing the task ID.
     * @throws {Error} Throws an error if it fails to create the task or encounters an error during the creation process.
     */
    async createDeveloperHubTask(componentCreateOptions: ScaffolderScaffoldOptions): Promise<TaskIdReponse> {
        try {
            const response: AxiosResponse<TaskIdReponse> = await this.axiosInstance.post(`${this.RHDHUrl}/api/scaffolder/v2/tasks`, componentCreateOptions);
            return response.data;
        } catch (error) {
            console.error(error);

            throw new Error(`Failed to create Developer Hub component:`);
        }
    }

    /**
     * Retrieves Golden Path templates from the Red Hat Developer Hub backend.
     * 
     * @returns {Promise<TemplateEntityV1beta3[]>} A Promise that resolves to an array of Golden Path templates.
     * @throws {Error} Throws an error if it fails to retrieve the templates or encounters an error during retrieval.
     */
    public async getGoldenPathTemplates(): Promise<TemplateEntityV1beta3[]> {
        try {
            const response: AxiosResponse<TemplateEntityV1beta3[]> = await this.axiosInstance.get(`${this.RHDHUrl}/api/catalog/entities?filter=kind=template`);

            return response.data;
        } catch (error) {
            console.error(error);

            throw new Error("Failed to retrieve Golden Path templates");
        }
    }

    /**
     * Retrieves a processed task from the Red Hat Developer Hub backend.
     * 
     * @param {string} taskId - The ID of the task to retrieve.
     * @param {number} timeoutMs - The maximum time to wait for the task to be processed, in milliseconds.
     * @returns {Promise<ScaffolderTask>} A Promise that resolves to the processed task.
     * @throws {Error} Throws an error if it times out waiting for the task to be processed or encounters an error during retrieval.
     */
    async getTaskProcessed(taskId: string, timeoutMs: number): Promise<ScaffolderTask> {
        const delayMs = 5 * 1000;
        let totalTimeMs = 0;

        while (totalTimeMs < timeoutMs) {
            try {
                const response: AxiosResponse<ScaffolderTask> = await this.axiosInstance.get(`${this.RHDHUrl}/api/scaffolder/v2/tasks/${taskId}`);
                if (response.data.status !== "processing" && response.data.status !== "open") {
                    return response.data;
                }

                await this.sleep(delayMs);
                totalTimeMs += delayMs;
            } catch (error) {
                throw new Error(`Error retrieving processed task. Task ID: ${taskId}. Error: ${error}`);
            }
        }

        throw new Error("Timeout to process a task. Error to process a Developer Hub Task");
    }

    /**
     * Retrieves the event stream log for a given task ID from the Red Hat Developer Hub backend.
     * 
     * @param {string} taskId - The ID of the task to retrieve the event stream log for.
     * @returns {Promise<string>} A Promise that resolves to the event stream log for the specified task ID.
     * @throws {Error} Throws an error if it fails to retrieve the event stream log or if the response status is not 200.
     */
    async getEventStreamLog(taskId: string): Promise<string> {
        const response: AxiosResponse<string> = await this.axiosInstance.get(`${this.RHDHUrl}/api/scaffolder/v2/tasks/${taskId}/eventstream`);

        if (response.status !== 200) {
            throw new Error(`Failed to get task event stream logs. Task Id: ${taskId}, status:${response.status}`);
        }

        return response.data;
    }

    public async checkComponentEndpoint(url: string): Promise<boolean> {
        try {
            const response = await axios.get(url);
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    public async waitUntilComponentEndpointBecomeReady(url: string, timeoutMs: number): Promise<boolean> {
        const startTime = Date.now();
        let elapsedTime = 0;
        while (elapsedTime < timeoutMs) {
            if (await this.checkComponentEndpoint(url)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            elapsedTime = Date.now() - startTime;
        }
        return false;
    }
}
