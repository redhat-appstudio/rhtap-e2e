import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

/**
 * Tests Python template in Gitlab with Jenkins
 * 
 * @group jenkins
 * @group python
 * @group gitlab
 * @group basic
 */

const pythonTemplateName = 'python';
const stringOnRoute = 'Hello World!';

const runPythonBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(pythonTemplateName) && configuration.gitlab.active && configuration.gitlab.jenkins) {

        gitLabJenkinsBasicTests(pythonTemplateName, stringOnRoute)
    } else {
        skipSuite(pythonTemplateName)
    }
}

runPythonBasicTests()