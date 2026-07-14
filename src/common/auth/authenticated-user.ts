export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}
