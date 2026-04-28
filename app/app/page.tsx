"use client";

import { useEffect, useState } from "react";

export default function AppPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchProjects() {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    }

    fetchProjects();
  }, []);

  async function runQuery() {
    if (!projectId) return alert("Select a project");

    setLoading(true);

    const res = await fetch("/api/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        query: question || "test",
      }),
    });

    const data = await res.json();

    setResult(data.data || []);
    setLoading(false);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Ask Your Data</h1>

      {/* Project Selector */}
      <div style={{ marginBottom: 20 }}>
        <label>Select Project:</label>
        <br />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">-- Select --</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Question Input */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Ask a question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{ width: 400 }}
        />
        <button onClick={runQuery} style={{ marginLeft: 10 }}>
          Run
        </button>
      </div>

      {/* Loading */}
      {loading && <p>Loading...</p>}

      {/* Results */}
      {result.length > 0 && (
        <table border={1} cellPadding={8}>
          <thead>
            <tr>
              {Object.keys(result[0]).map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((val: any, j) => (
                  <td key={j}>{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}