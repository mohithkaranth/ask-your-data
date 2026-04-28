"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);

  const [status, setStatus] = useState("");
  const [dataStatus, setDataStatus] = useState("");

  const [semanticJson, setSemanticJson] = useState("");
  const [semanticStatus, setSemanticStatus] = useState("");

  useEffect(() => {
    const email = localStorage.getItem("userEmail");

    if (!email) {
      window.location.href = "/login";
      return;
    }

    fetch(`/api/projects?email=${email}`)
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []));
  }, []);

  useEffect(() => {
  if (!selectedProject) return;

  setSemanticStatus("Checking existing semantic...");

  fetch(`/api/admin/get-semantic?projectId=${selectedProject}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.exists) {
        setSemanticJson(data.semantic);
        setSemanticStatus("Loaded existing semantic ✅");
      } else {
        setSemanticJson("");
        setSemanticStatus("No existing semantic found");
      }
    })
    .catch(() => {
      setSemanticStatus("Failed to load existing semantic ❌");
    });
}, [selectedProject]);

  // -------- SCHEMA --------
  const handleUpload = async () => {
    if (!file || !selectedProject) {
      setStatus("Select project and schema file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", selectedProject);

    const res = await fetch("/api/admin/upload-model", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setStatus(data.success ? "Schema created ✅" : "Failed ❌");
  };

  // -------- DATA --------
  const handleDataUpload = async () => {
    if (!dataFile || !selectedProject) {
      setDataStatus("Select project and data file");
      return;
    }

    const formData = new FormData();
    formData.append("file", dataFile);
    formData.append("projectId", selectedProject);

    const res = await fetch("/api/admin/upload-data", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setDataStatus(data.success ? "Data uploaded ✅" : "Failed ❌");
  };

  // -------- SEMANTIC --------
  const handleSemanticUpload = async () => {
    if (!semanticJson || !selectedProject) {
      setSemanticStatus("Select project and enter JSON");
      return;
    }

    try {
      const parsed = JSON.parse(semanticJson);

      const res = await fetch("/api/admin/upload-semantic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: selectedProject,
          semantic: parsed,
        }),
      });

      const data = await res.json();
      setSemanticStatus(data.success ? "Saved ✅" : "Failed ❌");
    } catch {
      setSemanticStatus("Invalid JSON ❌");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="w-full max-w-2xl bg-zinc-900 p-8 rounded-2xl border border-zinc-800">

        <h1 className="text-2xl font-semibold mb-6">Admin Setup</h1>

        {/* PROJECT */}
        <select
          className="w-full p-3 mb-6 bg-zinc-800 border border-zinc-700 rounded"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">-- Select Project --</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* SCHEMA */}
        <h2 className="mb-2 text-sm text-zinc-400">Schema Upload</h2>
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button
          onClick={handleUpload}
          className="w-full mt-2 mb-4 py-2 bg-white text-black rounded"
        >
          Create Tables
        </button>
        <div className="mb-6 text-sm text-zinc-400">{status}</div>

        {/* DATA */}
        <h2 className="mb-2 text-sm text-zinc-400">Data Upload</h2>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => setDataFile(e.target.files?.[0] || null)}
        />
        <button
          onClick={handleDataUpload}
          className="w-full mt-2 mb-4 py-2 bg-blue-500 text-black rounded"
        >
          Upload Data
        </button>
        <div className="mb-6 text-sm text-zinc-400">{dataStatus}</div>

        {/* SEMANTIC */}
        <h2 className="mb-2 text-sm text-zinc-400">Semantic Layer</h2>
        <textarea
          className="w-full h-40 p-3 bg-zinc-800 border border-zinc-700 rounded"
          value={semanticJson}
          onChange={(e) => setSemanticJson(e.target.value)}
        />
        <button
          onClick={handleSemanticUpload}
          className="w-full mt-2 py-2 bg-green-500 text-black rounded"
        >
          Save Semantic
        </button>
        <div className="mt-4 text-sm text-zinc-400">{semanticStatus}</div>

      </div>
    </div>
  );
}