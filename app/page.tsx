"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  email: string;
  role: "admin" | "user";
};

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      router.push("/login");
      return;
    }

    const parsedUser: User = JSON.parse(storedUser);
    setUser(parsedUser);

    // 🚀 Role-based routing
    if (parsedUser.role === "user") {
      router.push("/analysis");
    }

    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  // 👇 Only admin reaches here
  if (user?.role === "admin") {
    return (
      <main className="min-h-screen bg-zinc-900 text-white flex flex-col items-center justify-center gap-6">
        <button
          onClick={handleLogout}
          className="absolute top-6 right-6 px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
        >
          Logout
        </button>

        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>

        <div className="flex gap-4">
          <button
            onClick={() => router.push("/upload")}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Upload Data
          </button>

          <button
            onClick={() => router.push("/analysis")}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg"
          >
            Go to Analysis
          </button>
        </div>
      </main>
    );
  }

  return null;
}