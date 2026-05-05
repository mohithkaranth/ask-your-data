"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Message = {
  role: "user" | "system";
  content: string;
  data?: any[];
};

type Project = {
  id: string;
  name: string;
};

type User = {
  id?: string;
  email: string;
  role?: "admin" | "user";
};

export default function AnalysisPage() {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      router.push("/login");
      return;
    }

    const user: User = JSON.parse(storedUser);

    fetch(`/api/projects?email=${user.email}`)
      .then((res) => res.json())
      .then((data) => {
        const loadedProjects = data.projects || [];
        setProjects(loadedProjects);

        if (loadedProjects.length > 0) {
          setProjectId(loadedProjects[0].id);
        }
      });
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    if (!projectId) {
      alert("Select a project first");
      return;
    }

    const userQuestion = input;

    setMessages((prev) => [...prev, { role: "user", content: userQuestion }]);

    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          query: userQuestion,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: data.sql || "Here’s your result:",
          data: data.data,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: err.message || "Error fetching data",
        },
      ]);
    }

    setLoading(false);
    setInput("");
  };

  return (
    <main className="h-screen bg-zinc-900 text-white flex flex-col">
      {/* HEADER */}
      <div className="border-b border-zinc-800 p-4 flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Analysis</h1>
          <p className="text-xs text-zinc-400">
            Ask questions against the selected project
          </p>
        </div>

        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setMessages([]);
          }}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
        >
          <option value="">Select Project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm"
        >
          Logout
        </button>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-400">
            Select a project and ask something like:{" "}
            <span className="text-zinc-200">
              total revenue by studio room
            </span>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`max-w-xl ${
              msg.role === "user" ? "ml-auto text-right" : "mr-auto text-left"
            }`}
          >
            <div
              className={`p-3 rounded-lg ${
                msg.role === "user" ? "bg-blue-600" : "bg-zinc-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {msg.data && msg.data.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="text-sm border border-zinc-700">
                    <thead>
                      <tr>
                        {Object.keys(msg.data[0]).map((key) => (
                          <th
                            key={key}
                            className="px-3 py-1 border border-zinc-700 text-left"
                          >
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {msg.data.map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((val, j) => (
                            <td
                              key={j}
                              className="px-3 py-1 border border-zinc-700"
                            >
                              {String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {msg.data && msg.data.length === 0 && (
                <p className="mt-3 text-sm text-zinc-400">No rows returned.</p>
              )}
            </div>
          </div>
        ))}

        {loading && <p className="text-zinc-400">Thinking...</p>}
      </div>

      {/* INPUT */}
      <div className="p-4 border-t border-zinc-800 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
          placeholder="Ask your data..."
          className="flex-1 px-4 py-2 bg-zinc-800 rounded"
        />

        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </main>
  );
}