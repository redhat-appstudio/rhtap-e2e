const fs = require('fs');
const path = require('path');

const generateTemplatesConfig = (ocpVersion, templateName, jenkinsEnabled, tektonEnabled, actionsEnabled, gitlabEnabled, githubEnabled, gitlabciEnabled, bitbucketEnabled) => {
    const config = {
        templates: [
            "dotnet-basic",
            "go",
            "nodejs",
            "python",
            "java-quarkus",
            "java-springboot"
        ],
        priority: [
            "High"
        ],
        github: {
            tekton: tektonEnabled === 'true',
            jenkins: jenkinsEnabled === 'true',
            actions: actionsEnabled === 'true',
            host: "https://api.github.com"
        },
        gitlab: {
            tekton: tektonEnabled === 'true',
            jenkins: jenkinsEnabled === 'true',
            gitlabci: gitlabciEnabled === 'true',
            host: "https://gitlab.com",
        },
        bitbucket: {
            tekton: tektonEnabled === 'true',
            jenkins: jenkinsEnabled === 'true',
            host: "https://api.bitbucket.org/2.0",
        },
        pipeline: {
            ocp: ocpVersion,
            version: "1.4",
            github: githubEnabled === 'true',
            gitlab: gitlabEnabled === 'true',
            bitbucket: bitbucketEnabled === 'true'
        }
    };

    const jsonContent = JSON.stringify(config, null, 2);
    const filePath = path.resolve(__dirname, templateName);
    fs.writeFileSync(filePath, jsonContent, 'utf-8');
};

const ocpVersion = process.env.OCP_VERSION

const templateName = process.env.SOFTWARE_TEMPLATES_FILE || 'softwareTemplates.json';
const jenkinsEnabled = process.env.JENKINS_ENABLED || 'false';
const tektonEnabled = process.env.TEKTON_ENABLED || 'false';
const actionsEnabled = process.env.ACTIONS_ENABLED || 'false' ;  // Github Actions
const gitlabEnabled = process.env.GITLAB_ENABLED || 'false';
const githubEnabled = process.env.GITHUB_ENABLED || 'false';
const gitlabciEnabled = process.env.GITLABCI_ENABLED || 'false';
const bitbucketEnabled = process.env.BITBUCKET_ENABLED || 'false';


generateTemplatesConfig(ocpVersion, templateName, jenkinsEnabled, tektonEnabled, actionsEnabled, gitlabEnabled, githubEnabled, gitlabciEnabled, bitbucketEnabled);