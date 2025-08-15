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

export const getConcatenatedListFromGroupMap = (groupMap: Record<string, string[]>, selectedRecipientGroupNumbers: number[] | undefined): string[] => {
    if (!selectedRecipientGroupNumbers || selectedRecipientGroupNumbers.length === 0) {
        return defaultJidsAll;
    }
    const concatenatedList: string[] = [];
    const groupMapKeys = Object.keys(groupMap);
    selectedRecipientGroupNumbers.forEach(index => {
        if (index >= 0 && index < groupMapKeys.length) {
            const groupName = groupMapKeys[index];
            const jids = groupMap[groupName] || [];
            concatenatedList.push(...jids);
        }
    });
    // Remove duplicates
    return Array.from(new Set(concatenatedList));  
};