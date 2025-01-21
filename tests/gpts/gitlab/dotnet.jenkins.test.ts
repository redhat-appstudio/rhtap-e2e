import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

/**
 * Tests Dotnet template in Gitlab with Jenkins
 * 
 * @group jenkins
 * @group dotnet
 * @group gitlab
 * @group basic
 */

const dotNetTemplateName = 'dotnet-basic';
const stringOnRoute = 'Welcome';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(dotNetTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(dotNetTemplateName, stringOnRoute);
    } else {
        skipSuite(dotNetTemplateName);
    }
};

runDotNetBasicTests();
