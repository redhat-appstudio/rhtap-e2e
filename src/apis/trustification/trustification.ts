import axios from 'axios';
import { Utils } from '../scm-providers/utils';

export class TrustificationClient extends Utils {

    // Trustification client details
    private readonly bombasticApiUrl: string;
    private readonly oidcIssuesUrl: string;
    private readonly oidcclientId: string;
    private readonly oidcclientSecret: string;
    private tpaToken: string;

    /**
   * Constructs a new instance of Trustification client.
   * 
   */
    constructor(bombasticApiUrl: string, oidcIssuesUrl: string, oidcclientId: string, oidcclientSecret: string) {
        super();
        this.bombasticApiUrl = bombasticApiUrl;
        this.oidcIssuesUrl = oidcIssuesUrl;
        this.oidcclientId = oidcclientId;
        this.oidcclientSecret = oidcclientSecret;
        this.tpaToken = "";
    }

    public async initializeTpaToken() {

        try {

            const response = await axios.post(
                this.oidcIssuesUrl + "/protocol/openid-connect/token",
                {
                    // eslint-disable-next-line camelcase
                    client_id: this.oidcclientId,
                    // eslint-disable-next-line camelcase
                    client_secret: this.oidcclientSecret,
                    // eslint-disable-next-line camelcase
                    grant_type: 'client_credentials'
                },
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            if (response?.data?.access_token) {
                this.tpaToken = response.data.access_token;
                console.log(`TPA token is set for trustification`);
            }

        } catch (error) {
            console.error('Error getting TPA token', error);
            throw error;
        }

    }

    // Function to search for SBOM by name and wait until results are not empty
    public async waitForSbomSearchByName(name: string, timeout = 300000, pollingInterval = 5000): Promise<unknown[]> {
        const searchUrl = this.bombasticApiUrl + "/api/v1/sbom/search";
        const startTime = Date.now();

        while (true) {
            // Timeout check
            if (Date.now() - startTime > timeout) {
                throw new Error(`Timeout: No SBOM found for '${name}' within ${timeout / 1000} seconds.`);
            }

            try {
                // Perform GET request to search for SBOM by name
                const response = await axios.get(searchUrl, {
                    headers: {
                        Authorization: `Bearer ${this.tpaToken}`,
                        Accept: '*/*'
                    },
                    params: {
                        q: name,
                    },
                });

                if (response.status === 200 && response.data.result && response.data.result.length === 1) {
                    console.log(`SBOM for '${name}' retrieved successfully. Found ${response.data.result.length} result.`);
                    return response.data.result;
                }

                console.log(`No SBOM found for '${name}' yet. Retrying...`);
            } catch (error) {
                console.error('Error searching for SBOM:', error);

                // If it's a non-retryable error, throw it
                if (!axios.isAxiosError(error) || (error.response && error.response.status !== 404) || (error.response && error.response.status !== 400) ) {
                    throw error;
                }
            }

            // Wait for the next polling interval
            await this.sleep(pollingInterval);
        }
    }
}
