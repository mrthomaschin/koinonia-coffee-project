export interface FormData {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    message: string;
}

export interface FormErrors {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    message?: string;
}