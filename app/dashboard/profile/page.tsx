"use client";

import { useEffect, useState } from "react";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-8">Meu Perfil</h1>

      <div
        className="max-w-2xl p-8 rounded-2xl backdrop-blur-3xl bg-white/10 border border-white/20"
        style={{
          boxShadow:
            "0 0 6px rgba(0,0,0,0.03), 0 2px 6px rgba(0,0,0,0.08), inset 3px 3px 0.5px -3px rgba(255,255,255,0.4), inset -3px -3px 0.5px -3px rgba(255,255,255,0.35), inset 0 0 6px 6px rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-6 mb-8">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <span className="text-4xl text-white font-bold">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-gray-300">{user.email}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Nome
            </label>
            <input
              type="text"
              value={user.firstName}
              disabled
              className="w-full px-4 py-3 bg-white/5 backdrop-blur-md text-white rounded-lg border border-white/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Sobrenome
            </label>
            <input
              type="text"
              value={user.lastName}
              disabled
              className="w-full px-4 py-3 bg-white/5 backdrop-blur-md text-white rounded-lg border border-white/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-4 py-3 bg-white/5 backdrop-blur-md text-white rounded-lg border border-white/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Telefone
            </label>
            <input
              type="tel"
              value={user.phone}
              disabled
              className="w-full px-4 py-3 bg-white/5 backdrop-blur-md text-white rounded-lg border border-white/20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
