import { gitLabProviderBasicTests } from "./suites-config/gitlab_positive_suite.ts";
import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";

/**
 * Tests Python template in GitLab with Tekton
 * 
 * @group tekton
 * @group python
 * @group gitlab
 * @group basic
 */

const pythonTemplateName = 'python';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(pythonTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.tekton) {

        gitLabProviderBasicTests(pythonTemplateName);
    } else {
        skipSuite(pythonTemplateName);
    }
};

runPythonBasicTests();
