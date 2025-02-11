export const onPullTasks = ["init", "clone-repository", "build-container", "acs-image-check", "acs-image-scan", "show-sbom", "show-summary"];
export const onPushTasks = [...onPullTasks, "acs-deploy-check", "update-deployment"];
export const onPullGitopsTasks = ["clone-repository", "get-images-to-upload-sbom", "get-images-to-verify", "download-sboms", "verify-enterprise-contract", "upload-sboms-to-trustification"];
