import { skipSuite } from "../../test-utils.ts";
import { loadSoftwareTemplatesTestsGlobals } from "../github/test-config/config.ts";
import { gitLabJenkinsAdvancedTests } from './suites-config/gitlab_advanced_jenkins.ts';

/**
 * Tests Quarkus template in Gitlab with Jenkins
 * 
 * @group jenkins
 * @group quarkus
 * @group gitlab
 * @group private
 * @group advanced
 */

const quarkusTemplateName = 'java-quarkus';
const stringOnRoute = 'Congratulations, you have created a new Quarkus cloud application.';
const gitLabOrganization = process.env.GITLAB_ORGANIZATION_PRIVATE || '';

const runQuarkusBasicTests = () => {
    const configuration = loadSoftwareTemplatesTestsGlobals();

    if (configuration.templates.includes(quarkusTemplateName) && configuration.pipeline.gitlab && configuration.gitlab.jenkins) {
        gitLabJenkinsAdvancedTests(quarkusTemplateName, stringOnRoute, gitLabOrganization);
    } else {
        skipSuite(quarkusTemplateName);
    }
};

runQuarkusBasicTests();
