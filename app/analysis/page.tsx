"use client";

import { useEffect, useState } from "react";

type Message = {
  role: "user" | "system";
  content: string;
  data?: any[];
};

type Project = {
  id: string;
  name: string;
};

export default function AnalysisPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  // ✅ AUTO LOAD PROJECT
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    const user = JSON.parse(storedUser);

    fetch(`/api/projects?email=${user.email}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.projects.length > 0) {
          setProjectId(data.projects[0].id); // ✅ auto pick first project
        }
      });
  }, []);

  const handleSend = async () => {
    if (!input) return;

    if (!projectId) {
      alert("Project not loaded yet");
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: "user", content: input },
    ]);

    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          query: input,
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
      
      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`max-w-xl ${
              msg.role === "user"
                ? "ml-auto text-right"
                : "mr-auto text-left"
            }`}
          >
            <div
              className={`p-3 rounded-lg ${
                msg.role === "user"
                  ? "bg-blue-600"
                  : "bg-zinc-800"
              }`}
            >
              <p>{msg.content}</p>

              {msg.data && msg.data.length > 0 && (
                <table className="mt-3 text-sm border border-zinc-700">
                  <thead>
                    <tr>
                      {Object.keys(msg.data[0]).map((key) => (
                        <th key={key} className="px-3 py-1 border border-zinc-700">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {msg.data.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-1 border border-zinc-700">
                            {String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          placeholder="Ask your data..."
          className="flex-1 px-4 py-2 bg-zinc-800 rounded"
        />

        <button
          onClick={handleSend}
          className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </main>
  );
}