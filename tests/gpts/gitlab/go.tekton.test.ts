import { gitLabProviderBasicTests } from "./suites-config/gitlab_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Go template in GitLab with Tekton
 * 
 * @group tekton
 * @group go
 * @group gitlab
 * @group basic
 */

const golangTemplateName = 'go';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(golangTemplateName) && configuration.gitlab.active && configuration.gitlab.tekton) {

        gitLabProviderBasicTests(golangTemplateName);
    } else {
        skipSuite(golangTemplateName);
    }
}

runGolangBasicTests();
