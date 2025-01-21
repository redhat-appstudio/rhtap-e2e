import { gitLabProviderBasicTests } from "./suites-config/gitlab_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests dotnet template in GitLab with Tekton
 * 
 * @group tekton
 * @group dotnet
 * @group gitlab
 * @group basic
 */

const dotNetTemplateName = 'dotnet-basic';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(dotNetTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.tekton) {

        gitLabProviderBasicTests(dotNetTemplateName);
    } else {
        skipSuite(dotNetTemplateName);
    }
};

runDotNetBasicTests();
