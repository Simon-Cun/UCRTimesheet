export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
}

export interface StoredAuth {
  isAuthenticated: boolean;
  username: string | null;
}

export interface StoredCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
}
