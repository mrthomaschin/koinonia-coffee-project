export interface User {
    firstName: string;
    lastName: string;
    email: string;
}

export interface Account {
    id: string;
    user: User;
    username: string;
    password: string;
}

export interface Subscription {
    itemId: string;
}