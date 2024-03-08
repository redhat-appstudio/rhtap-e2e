import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';

export function generateRandomName(): string {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals,],
        separator: '-'
    })
}
