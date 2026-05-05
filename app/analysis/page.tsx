"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Message = {
  role: "user" | "system";
  content: string;
  answer?: string;
  sql?: string;
  semanticQuery?: any;
  data?: any[];
  warning?: string | null;
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

type Favourite = {
  id: string;
  question: string;
  created_at: string;
};

export default function AnalysisPage() {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [favouritesLoading, setFavouritesLoading] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
      router.push("/login");
      return;
    }

    const parsedUser: User = JSON.parse(storedUser);
    setUser(parsedUser);

    fetch(`/api/projects?email=${parsedUser.email}`)
      .then((res) => res.json())
      .then((data) => {
        const loadedProjects = data.projects || [];
        setProjects(loadedProjects);

        if (loadedProjects.length > 0) {
          setProjectId(loadedProjects[0].id);
        }
      });
  }, [router]);

  const loadFavourites = async (email: string, selectedProjectId: string) => {
    setFavouritesLoading(true);

    try {
      const res = await fetch(
        `/api/favourites?email=${email}&projectId=${selectedProjectId}`
      );

      const data = await res.json();
      setFavourites(data.favourites || []);
    } catch {
      setFavourites([]);
    }

    setFavouritesLoading(false);
  };

  useEffect(() => {
    if (!user?.email || !projectId) {
      setFavourites([]);
      return;
    }

    loadFavourites(user.email, projectId);
  }, [user?.email, projectId]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleSaveFavourite = async (question: string) => {
    if (!user?.email || !projectId || !question.trim()) return;

    try {
      const res = await fetch("/api/favourites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          projectId,
          question,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      await loadFavourites(user.email, projectId);
    } catch (err: any) {
      alert(err.message || "Could not save favourite");
    }
  };

  const handleDeleteFavourite = async (favouriteId: string) => {
    if (!user?.email) return;

    try {
      const res = await fetch("/api/favourites", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          favouriteId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setFavourites((prev) => prev.filter((fav) => fav.id !== favouriteId));
    } catch (err: any) {
      alert(err.message || "Could not delete favourite");
    }
  };

  const handleSend = async (questionOverride?: string) => {
    const questionToAsk = questionOverride || input;

    if (!questionToAsk.trim()) return;

    if (!projectId) {
      alert("Select a project first");
      return;
    }

    const userQuestion = questionToAsk;

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
          content: data.answer || data.sql || "Here’s your result:",
          answer: data.answer,
          sql: data.sql,
          semanticQuery: data.semanticQuery,
          data: data.data,
          warning: data.warning,
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

      {/* FAVOURITES */}
      {projectId && (
        <div className="border-b border-zinc-800 bg-zinc-950/40 px-6 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">Favourites</h2>
            {favouritesLoading && (
              <span className="text-xs text-zinc-500">Loading...</span>
            )}
          </div>

          {favourites.length === 0 && !favouritesLoading && (
            <p className="text-xs text-zinc-500">
              No favourites saved for this project yet.
            </p>
          )}

          {favourites.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {favourites.map((fav) => (
                <div
                  key={fav.id}
                  className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1"
                >
                  <button
                    onClick={() => handleSend(fav.question)}
                    disabled={loading}
                    className="max-w-xs truncate text-left text-xs text-zinc-200 hover:text-white disabled:opacity-50"
                    title={fav.question}
                  >
                    {fav.question}
                  </button>

                  <button
                    onClick={() => handleDeleteFavourite(fav.id)}
                    className="text-xs text-zinc-500 hover:text-red-400"
                    title="Delete favourite"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && !projectId && (
          <div className="text-sm text-zinc-400">
            Select a project to start asking questions.
          </div>
        )}

        {messages.length === 0 && projectId && (
          <div className="text-sm text-zinc-400">
            Ask a question about the selected project.
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`max-w-4xl ${
              msg.role === "user" ? "ml-auto text-right" : "mr-auto text-left"
            }`}
          >
            <div
              className={`p-3 rounded-lg ${
                msg.role === "user" ? "bg-blue-600" : "bg-zinc-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {msg.role === "user" && (
                <button
                  onClick={() => handleSaveFavourite(msg.content)}
                  className="mt-2 text-xs text-blue-100 hover:text-white"
                >
                  Save as favourite
                </button>
              )}

              {msg.warning && (
                <div className="mt-3 text-xs text-yellow-300">
                  Warning: {msg.warning}
                </div>
              )}

              {msg.semanticQuery && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-zinc-300">
                    Semantic Query
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
                    {JSON.stringify(msg.semanticQuery, null, 2)}
                  </pre>
                </details>
              )}

              {msg.sql && (
                <details className="mt-3 text-left" open>
                  <summary className="cursor-pointer text-sm text-zinc-300">
                    Generated SQL
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
                    {msg.sql}
                  </pre>
                </details>
              )}

              {msg.data && msg.data.length > 0 && (
                <details className="mt-3 text-left" open>
                  <summary className="cursor-pointer text-sm text-zinc-300">
                    Raw Result
                  </summary>

                  <div className="mt-2 overflow-x-auto">
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
                </details>
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
          onClick={() => handleSend()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </main>
  );
}