import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

/**
 * Tests Springboot template in Gitlab with Jenkins
 * 
 * @group jenkins
 * @group springboot
 * @group gitlab
 * @group basic
 */

const springBootTemplateName = 'java-springboot';
const stringOnRoute = 'Hello World!';

const runSpringBootBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(springBootTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(springBootTemplateName, stringOnRoute);
    } else {
        skipSuite(springBootTemplateName);
    }
};

runSpringBootBasicTests();
