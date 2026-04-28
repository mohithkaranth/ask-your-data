"use client";

import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
};

type User = {
  email: string;
};

export default function UploadPage() {
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [semanticDraft, setSemanticDraft] = useState<any>(null);
  const [existingSemanticDraft, setExistingSemanticDraft] = useState<any>(null);
  const [hasExistingSemantic, setHasExistingSemantic] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) return;

    const user: User = JSON.parse(storedUser);

    fetch(`/api/projects?email=${user.email}`)
      .then((res) => res.json())
      .then((data) => setProjects(data.projects));
  }, []);

  useEffect(() => {
    if (!selectedProject) {
      setSemanticDraft(null);
      setExistingSemanticDraft(null);
      setHasExistingSemantic(false);
      return;
    }

    setSemanticDraft(null);
    setExistingSemanticDraft(null);
    setHasExistingSemantic(false);

    fetch(`/api/admin/get-semantic?projectId=${selectedProject}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.exists) {
          const parsedSemantic =
            typeof data.semantic === "string"
              ? JSON.parse(data.semantic)
              : data.semantic;

          setExistingSemanticDraft(parsedSemantic);
          setHasExistingSemantic(true);
        }
      })
      .catch(() => {
        setExistingSemanticDraft(null);
        setHasExistingSemantic(false);
      });
  }, [selectedProject]);

  const uploadModel = async () => {
    if (!modelFile || !selectedProject) {
      alert("Missing model file or project");
      return;
    }

    const formData = new FormData();
    formData.append("file", modelFile);
    formData.append("projectId", selectedProject);

    const res = await fetch("/api/admin/upload-model", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    alert(data.success ? "Model success" : "Model failed");
  };

  const uploadData = async () => {
    if (!dataFile || !selectedProject) {
      alert("Missing data file or project");
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
    alert(data.success ? "Data success" : "Data failed");
  };

  const generateSemantic = async () => {
    if (!selectedProject) {
      alert("Select project");
      return;
    }

    const res = await fetch("/api/generate-semantic-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId: selectedProject }),
    });

    const data = await res.json();

    if (data.success) {
      setSemanticDraft(data.semanticDraft);
    } else {
      alert("Failed to generate semantic");
    }
  };

  const handleSemanticButtonClick = async () => {
    if (!selectedProject) {
      alert("Select project");
      return;
    }

    if (hasExistingSemantic) {
      setSemanticDraft(existingSemanticDraft);
      return;
    }

    await generateSemantic();
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white flex flex-col items-center py-10">
      <h1 className="text-2xl mb-6">Upload Center</h1>

      {/* TOP */}
      <div className="w-full max-w-xl bg-zinc-800 p-6 rounded-xl mb-6">
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="w-full px-4 py-2 mb-4 rounded bg-zinc-700"
        >
          <option value="">Select Project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* MODEL */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Model File</label>

            <label className="flex items-center justify-between px-3 py-2 bg-zinc-700 rounded cursor-pointer">
              <span className="text-sm text-zinc-300 truncate">
                {modelFile ? modelFile.name : "Select file"}
              </span>
              <span className="text-xs bg-zinc-600 px-2 py-1 rounded">
                Browse
              </span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setModelFile(e.target.files[0]);
                }}
              />
            </label>

            <button
              onClick={uploadModel}
              className="w-full py-2 bg-blue-600 rounded"
            >
              Upload Model
            </button>
          </div>

          {/* DATA */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Data File</label>

            <label className="flex items-center justify-between px-3 py-2 bg-zinc-700 rounded cursor-pointer">
              <span className="text-sm text-zinc-300 truncate">
                {dataFile ? dataFile.name : "Select file"}
              </span>
              <span className="text-xs bg-zinc-600 px-2 py-1 rounded">
                Browse
              </span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setDataFile(e.target.files[0]);
                }}
              />
            </label>

            <button
              onClick={uploadData}
              className="w-full py-2 bg-green-600 rounded"
            >
              Upload Data
            </button>
          </div>
        </div>

        <button
          onClick={handleSemanticButtonClick}
          className="w-full py-2 bg-yellow-600 rounded"
        >
          {hasExistingSemantic
            ? "Show Current Semantic Layer"
            : "Generate Semantic Layer"}
        </button>
      </div>

      {/* SEMANTIC */}
      {semanticDraft && (
        <div className="w-full max-w-3xl bg-zinc-800 p-6 rounded-xl">
          <h2 className="text-lg mb-4 text-center">Semantic Layer</h2>

          {/* ENTITIES */}
          {semanticDraft.entities.map((entity: any) => (
            <div key={entity.name} className="mb-4">
              <h3 className="text-blue-400 mb-2">{entity.name}</h3>

              {entity.columns.map((col: any, i: number) => (
                <div key={i} className="flex gap-4 mb-2">
                  <span className="w-[180px] text-zinc-400">{col.name}</span>

                  <input
                    placeholder="Business name"
                    value={col.businessName || ""}
                    onChange={(e) => {
                      const updated = { ...semanticDraft };

                      updated.entities
                        .find((e: any) => e.name === entity.name)
                        .columns[i].businessName = e.target.value;

                      setSemanticDraft(updated);
                    }}
                    className="flex-1 px-3 py-1 bg-zinc-700 rounded"
                  />
                </div>
              ))}
            </div>
          ))}

          {/* METRICS */}
          <h2 className="text-lg mt-6 mb-2 text-center">Metrics</h2>

          {semanticDraft.metrics.map((m: any, i: number) => (
            <div key={i} className="mb-4">
              <div className="flex gap-4 items-center">
                <input
                  placeholder="Metric name"
                  value={m.name || ""}
                  onChange={(e) => {
                    const updated = { ...semanticDraft };
                    updated.metrics[i].name = e.target.value;
                    setSemanticDraft(updated);
                  }}
                  className="w-[180px] px-3 py-1 bg-zinc-700 rounded"
                />

                <input
                  placeholder="Business name"
                  value={m.businessName || ""}
                  onChange={(e) => {
                    const updated = { ...semanticDraft };
                    updated.metrics[i].businessName = e.target.value;
                    setSemanticDraft(updated);
                  }}
                  className="flex-1 px-3 py-1 bg-zinc-700 rounded"
                />

                <button
                  onClick={() => {
                    const updated = { ...semanticDraft };
                    updated.metrics.splice(i, 1);
                    setSemanticDraft(updated);
                  }}
                  className="px-2 bg-red-600 rounded"
                >
                  X
                </button>
              </div>

              <input
                placeholder="Formula e.g. sum(CAST(holdings.quantity AS numeric) * CAST(holdings.avg_price AS numeric))"
                value={m.formula || ""}
                onChange={(e) => {
                  const updated = { ...semanticDraft };
                  updated.metrics[i].formula = e.target.value;
                  setSemanticDraft(updated);
                }}
                className="ml-[180px] mt-2 w-[calc(100%-180px)] px-3 py-1 bg-zinc-700 rounded text-xs"
              />
            </div>
          ))}

          <button
            onClick={() => {
              const updated = {
                ...semanticDraft,
                metrics: [
                  ...(semanticDraft.metrics || []),
                  {
                    name: "new_metric",
                    table: "",
                    formula: "",
                    businessName: "",
                  },
                ],
              };

              setSemanticDraft(updated);
            }}
            className="mt-4 px-4 py-2 bg-zinc-700 rounded"
          >
            + Add Metric
          </button>

          <button
            onClick={async () => {
              const res = await fetch("/api/admin/upload-semantic", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  projectId: selectedProject,
                  semantic: semanticDraft,
                }),
              });

              const data = await res.json();
              alert(data.success ? "Semantic saved" : "Failed");
            }}
            className="mt-6 ml-3 px-4 py-2 bg-purple-600 rounded"
          >
            Save Semantic Layer
          </button>
        </div>
      )}
    </main>
  );
}