module.exports = {
    testEnvironment: './jest-environment-fail-fast.js',
    maxWorkers: 6,
    bail: false,
    testRunner: 'jest-circus/runner',
    verbose: true,
    reporters: [
        "default",
        "jest-junit",
        ["jest-html-reporters", {
            "publicPath": process.env.ARTIFACT_DIR || "./artifacts",
            "filename": "report.html",
            "openReport": true,
            "expand": true,
            "pageTitle": "Red Hat Trusted Application Pipeline e2e report",
        }],
    ],
    runner: "groups"
};
