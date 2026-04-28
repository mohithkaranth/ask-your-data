"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem("user", JSON.stringify(data.user));

        // ✅ KEEP ORIGINAL FLOW
        window.location.href = "/";
      } else {
        alert("User not found");
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white flex">

      {/* LEFT SIDE */}
      <div className="hidden md:flex w-1/2 relative">
        <img
          src="/login-bg.jpg"
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />

        <div className="relative z-10 flex flex-col justify-center p-12">
          <h1 className="text-4xl font-bold mb-4">
            Ask Your Data
          </h1>
          <p className="text-zinc-300">
            Turn raw data into insights using natural language.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="flex w-full md:w-1/2 items-center justify-center">

        <div className="bg-zinc-800 p-8 rounded-xl w-[320px] shadow-lg">
          <h2 className="text-xl mb-6 text-center">Login</h2>

          <input
            type="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 mb-4 bg-zinc-700 rounded outline-none"
          />

          <button
            onClick={handleLogin}
            className="w-full py-2 bg-blue-600 rounded hover:bg-blue-700 transition"
          >
            Login
          </button>
        </div>

      </div>
    </main>
  );
}