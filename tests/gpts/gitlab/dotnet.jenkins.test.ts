import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsBasicTests } from "./suites-config/gitlab_suite_jenkins.ts";

const dotNetTemplateName = 'dotnet-basic';
const stringOnRoute =  'Welcome';

const runDotNetBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals()

    if (configuration.templates.includes(dotNetTemplateName) && configuration.gitlab.active && configuration.gitlab.jenkins) {
        gitLabJenkinsBasicTests(dotNetTemplateName, stringOnRoute);
    } else {
        skipSuite(dotNetTemplateName)
    }
}

runDotNetBasicTests()
