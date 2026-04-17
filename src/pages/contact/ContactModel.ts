export interface ContactModel {
    formData: {
        firstName: string;
        lastName: string;
        phone: string;
        email: string;
        message: string;
    };
    errors: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        email?: string;
        message?: string;
    };
    updateField: (field: keyof ContactModel['formData'], value: string) => void;
    submitForm: () => Promise<boolean>;
    isSubmitting: boolean;
    submitSuccess: boolean;
}

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

export interface ContactViewModelType {
    formData: FormData;
    errors: FormErrors;
    updateField: (field: keyof FormData, value: string) => void;
    submitForm: () => Promise<boolean>;
    isSubmitting: boolean;
    submitSuccess: boolean;
}