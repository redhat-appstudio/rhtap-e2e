import * as fs from "fs";
import * as path from "node:path";

export class Utils {
    private readonly artifactDir: string;
    constructor() {
        this.artifactDir = process.env.ARTIFACT_DIR ?? path.join(__dirname, '../../../', 'artifacts');
    }

    public async writeLogsToArtifactDir(storeDirectory: string, fileName: string, logData: string) {
        const directoryPath = path.join(this.artifactDir, storeDirectory);
        const logFilePath = path.join(directoryPath, fileName);

        try {
            // Check if the directory exists
            if (!fs.existsSync(directoryPath)) {
                // If the directory doesn't exist, create it
                fs.mkdirSync(directoryPath, { recursive: true });
            }

            // Check if the file exists
            if (!fs.existsSync(logFilePath)) {
                // If the file doesn't exist, create it
                fs.writeFileSync(logFilePath, logData, { encoding: 'utf-8' });
            } else {
                console.log(`${fileName} already exists.`);
                fs.writeFileSync(logFilePath, logData, { encoding: 'utf-8' });
            }
        } catch (error) {
            console.log(error);
        }
    }

    public sleep(ms: number): Promise<PromiseConstructor> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
