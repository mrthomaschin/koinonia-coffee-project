export interface FormData {
    firstName: string;
    lastName: string;
    email: string;
    subject: string;
    phone: string;
    message: string;
}

export interface FormErrors {
    firstName?: string;
    lastName?: string;
    email?: string;
    subject?: string;
    phone?: string;
    message?: string;
}
