import { gitLabProviderBasicTests } from "./suites-config/gitlab_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Nodejs template in GitLab with Tekton
 * 
 * @group tekton
 * @group nodejs
 * @group gitlab
 * @group basic
 */

const nodejsTemplateName = 'nodejs';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(nodejsTemplateName) && configuration.gitlab.active && configuration.gitlab.tekton) {

        gitLabProviderBasicTests(nodejsTemplateName)
    } else {
        skipSuite(nodejsTemplateName)
    }
}

runNodeJSBasicTests()
