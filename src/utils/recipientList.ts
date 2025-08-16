import { get } from "http";

interface RecipientGroup {
    name: string;
    jids: string[];
}

export const recipientListFixed: RecipientGroup[] = [
    {
        name: 'All Contacts ',
        jids: ['0123456789@s.whatsapp.net']
    },
    {
        name: 'Family',
        jids: []
    },
    {
        name: 'Friends',
        jids: []
    }
]

export const defaultJidsAll = [
    '0123456789@s.whatsapp.net'
];

export const getRecipientList = (): RecipientGroup[] => {
    return recipientListFixed;
};

export const getConcatenatedList = (selectedRecipientGroupNumbers: number[] | undefined): string[] => {
    // number based on index of recipientListFixed
    if (!selectedRecipientGroupNumbers || selectedRecipientGroupNumbers.length === 0) {
        return defaultJidsAll;
    }
    const concatenatedList: string[] = [];
    selectedRecipientGroupNumbers.forEach(index => {
        if (index >= 0 && index < recipientListFixed.length) {
            const group = recipientListFixed[index];
            concatenatedList.push(...group.jids);
        }
    }
    );
    // Remove duplicates
    return Array.from(new Set(concatenatedList));
};

export const getConcatenatedListFromGroupMap = (groupMap: Record<string, string[]>, selectedRecipientGroup: number[] | string[] | undefined): string[] => {
    if (!selectedRecipientGroup || selectedRecipientGroup.length === 0) {
        return defaultJidsAll;
    }

    // Check if the array is of type string[]
    if (selectedRecipientGroup.every(item => typeof item === 'string')) {
        // It's a list of JIDs, so we can return it directly.
        // Remove duplicates
        return Array.from(new Set(selectedRecipientGroup as string[]));
    }

    // Check if the array is of type number[]
    if (selectedRecipientGroup.every(item => typeof item === 'number')) {
        const selectedRecipientGroupNumbers = selectedRecipientGroup as number[];
        const concatenatedList: string[] = [];
        const groupMapKeys = Object.keys(groupMap);
        selectedRecipientGroupNumbers.forEach(index => {
            // Adjust index to be 0-based if your API uses 1-based indexing
            const adjustedIndex = index - 1;
            if (adjustedIndex >= 0 && adjustedIndex < groupMapKeys.length) {
                const groupName = groupMapKeys[adjustedIndex];
                const jids = groupMap[groupName] || [];
                concatenatedList.push(...jids);
            }
        });
        // Remove duplicates
        return Array.from(new Set(concatenatedList));
    }

    // If the array is mixed or of an unsupported type, handle appropriately.
    // For now, returning default or throwing an error might be options.
    // Returning defaultJidsAll for safety.
    return defaultJidsAll;
};