"use client";

import { useEffect, useState } from "react";

interface StoredUser {
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}

export const useAdminGuard = () => {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const token = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");

      if (!token || !storedUser) {
        window.location.href = "/login";
        return;
      }

      try {
        const parsedUser = JSON.parse(storedUser);

        if (!parsedUser.isAdmin) {
          window.location.href = "/dashboard";
          return;
        }

        setUser(parsedUser);
        setIsAuthorized(true);
      } catch {
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  return { user, isAuthorized };
};
