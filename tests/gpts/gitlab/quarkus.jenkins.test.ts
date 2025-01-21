import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

/**
 * Tests Quarkus template in Gitlab with Jenkins
 * 
 * @group jenkins
 * @group quarkus
 * @group gitlab
 * @group basic
 */

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute = 'Congratulations, you have created a new Quarkus cloud application.';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(quarkusTemplateName, stringOnRoute)
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
