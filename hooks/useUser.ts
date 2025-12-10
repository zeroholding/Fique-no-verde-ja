"use client";

import { useAuth } from "@/contexts/AuthContext";

export function useUser() {
  const { user, loading, isAuthenticated } = useAuth();

  return {
    user,
    loading,
    isAuthenticated,
    isAdmin: user?.isAdmin || false,
    fullName: user ? `${user.firstName} ${user.lastName}` : "",
  };
}
