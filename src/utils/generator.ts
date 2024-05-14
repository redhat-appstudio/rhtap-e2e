import { uniqueNamesGenerator, animals } from 'unique-names-generator';

export function generateRandomName(): string {
    return uniqueNamesGenerator({
        dictionaries: [animals,],
        separator: '-'
    })
}
