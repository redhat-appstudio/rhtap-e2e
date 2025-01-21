import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

/**
 * Tests Go template in Gitlab with Jenkins
 * 
 * @group jenkins
 * @group go
 * @group gitlab
 * @group basic
 */

const golangTemplateName = 'go';
const stringOnRoute = 'Hello World!';

const runGolangBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(golangTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(golangTemplateName, stringOnRoute);
    } else {
        skipSuite(golangTemplateName);
    }
};

runGolangBasicTests();
