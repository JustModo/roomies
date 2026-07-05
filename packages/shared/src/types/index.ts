export interface JWTPayload {
  userId: string;
  email: string;
  role?: string;
}

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
}
