export interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  code: string;
  adminId: string;
  role: string;
}

export interface FieldErrors {
  fullName?: string;
  email?: string;
  password?: string;
  code?: string;
  adminId?: string;
  role?: string;
}

export const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function validateCreateUser(input: Partial<CreateUserInput>): FieldErrors {
  const errors: FieldErrors = {};

  const fullName = input.fullName?.trim() ?? '';
  const email = input.email?.trim().toLowerCase() ?? '';
  const password = input.password ?? '';

  if (!fullName) errors.fullName = 'Full name is required';
  else if (fullName.length < 2) errors.fullName = 'Name must be at least 2 characters';

  if (!email) errors.email = 'Email is required';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';

  if (!password) errors.password = 'Password is required';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  else if (!/[A-Z]/.test(password)) errors.password = 'Password must contain an uppercase letter';
  else if (!/[a-z]/.test(password)) errors.password = 'Password must contain a lowercase letter';
  else if (!/\d/.test(password)) errors.password = 'Password must contain a number';

  if (!input.adminId) errors.adminId = 'Assigned admin is required';

  return errors;
}
