import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

/**
 * Tests Nodejs template in Gitlab with Jenkins
 * 
 * @group jenkins
 * @group nodejs
 * @group gitlab
 * @group basic
 */

const nodejsTemplateName = 'nodejs';
const stringOnRoute = 'Hello from Node.js Starter Application!';

const runNodeJSBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(nodejsTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(nodejsTemplateName, stringOnRoute);
    } else {
        skipSuite(nodejsTemplateName);
    }
};

runNodeJSBasicTests();
