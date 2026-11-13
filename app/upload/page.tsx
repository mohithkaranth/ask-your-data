"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
};

type User = {
  email: string;
};

export default function UploadPage() {
  const router = useRouter();

  const [workflow, setWorkflow] = useState<"scan" | "import">("scan");
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [semanticDraft, setSemanticDraft] = useState<any>(null);
  const [existingSemanticDraft, setExistingSemanticDraft] = useState<any>(null);
  const [hasExistingSemantic, setHasExistingSemantic] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      router.push("/login");
      return;
    }

    const user: User = JSON.parse(storedUser);

    fetch(`/api/projects?email=${user.email}`)
      .then((res) => res.json())
      .then((data) => setProjects(data.projects));
  }, [router]);

  useEffect(() => {
    if (!selectedProject) {
      setLoadingModel(false);
      setSemanticDraft(null);
      setExistingSemanticDraft(null);
      setHasExistingSemantic(false);
      return;
    }

    setSemanticDraft(null);
    setExistingSemanticDraft(null);
    setHasExistingSemantic(false);

    setLoadingModel(true);
    const controller = new AbortController();
    fetch(`/api/admin/get-semantic?projectId=${encodeURIComponent(selectedProject)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load the published model.");
        return res.json();
      })
      .then((data) => {
        if (data.exists && !controller.signal.aborted) {
          const parsedSemantic =
            typeof data.semantic === "string"
              ? JSON.parse(data.semantic)
              : data.semantic;

          setExistingSemanticDraft(parsedSemantic);
          setHasExistingSemantic(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage("Could not load the published model.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingModel(false);
      });
    return () => controller.abort();
  }, [selectedProject]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  const uploadModel = async () => {
    if (!modelFile || !selectedProject) {
      alert("Missing model file or project");
      return;
    }

    if (!window.confirm("Replace the workbook’s tables in this project? Existing rows in those tables will be deleted.")) return;

    const formData = new FormData();
    formData.append("file", modelFile);
    formData.append("projectId", selectedProject);

    setBusy(true);
    try {
      const res = await fetch("/api/admin/upload-model", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setMessage("Model uploaded.");
      setSemanticDraft(null);
    } catch {
      setMessage("Model upload failed. Check the project database before retrying.");
    } finally {
      setBusy(false);
    }
  };

  const uploadData = async () => {
    if (!dataFile || !selectedProject) {
      alert("Missing data file or project");
      return;
    }

    const formData = new FormData();
    formData.append("file", dataFile);
    formData.append("projectId", selectedProject);

    setBusy(true);
    try {
      const res = await fetch("/api/admin/upload-data", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setMessage("Data uploaded.");
    } catch {
      setMessage("Data upload failed. Check the project database before retrying.");
    } finally {
      setBusy(false);
    }
  };

  const generateSemantic = async () => {
    setBusy(true);
    setMessage("Scanning PostgreSQL and drafting business terms…");
    try {
      const user: User = JSON.parse(localStorage.getItem("user") || "null");
      const res = await fetch("/api/generate-semantic-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject, email: user.email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not generate a draft.");
      const draft = data.semanticDraft;
      const prior = semanticDraft || existingSemanticDraft;
      if (prior) {
        const labelKeys = ["businessName", "description", "synonyms"] as const;
        const preserveLabels = (target: any, source: any) => {
          for (const key of labelKeys) {
            if (source?.[key] !== undefined) target[key] = source[key];
          }
        };
        for (const entity of draft.entities) {
          const previous = prior.entities.find((item: any) => item.name === entity.name);
          preserveLabels(entity, previous);
          for (const column of entity.columns) {
            preserveLabels(column, previous?.columns.find((item: any) => item.name === column.name));
          }
        }
        draft.metrics = [
          ...prior.metrics,
          ...draft.metrics.filter((metric: any) => !prior.metrics.some((item: any) => item.name === metric.name)),
        ];
        const currentFields = new Set(draft.entities.flatMap((entity: any) =>
          entity.columns.map((column: any) => entity.name + "." + column.name)
        ));
        const removed = prior.entities.flatMap((entity: any) =>
          entity.columns.map((column: any) => entity.name + "." + column.name)
        ).filter((field: string) => !currentFields.has(field));
        setMessage(removed.length
          ? `Draft ready. ${removed.length} previous fields are absent from this scan. Review saved metric formulas before publishing.`
          : `Draft ready. Found ${draft.entities.length} tables and views.`);
      } else {
        setMessage(`Draft ready. Found ${draft.entities.length} tables and views.`);
      }
      setSemanticDraft(draft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate a draft.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-900 text-white flex flex-col items-center py-10">
      <div className="w-full max-w-3xl flex justify-between items-center mb-6">
        <h1 className="text-2xl">Semantic Model</h1>

        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded"
        >
          Logout
        </button>
      </div>

      {/* TOP */}
      <div className="w-full max-w-xl bg-zinc-800 p-6 rounded-xl mb-6">
        <select
          aria-label="Project"
          value={selectedProject}
          disabled={busy}
          onChange={(e) => {
            setMessage("");
            setModelFile(null);
            setDataFile(null);
            setSelectedProject(e.target.value);
          }}
          className="w-full px-4 py-2 mb-4 rounded bg-zinc-700"
        >
          <option value="">Select Project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <fieldset disabled={busy} className="mb-5">
          <legend className="mb-3 font-medium">Does this project already have database tables?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded bg-zinc-700 p-3">
              <input type="radio" name="workflow" checked={workflow === "scan"} onChange={() => { setWorkflow("scan"); setModelFile(null); setDataFile(null); setMessage(""); }} />
              Yes, use existing tables
            </label>
            <label className="flex items-center gap-2 rounded bg-zinc-700 p-3">
              <input type="radio" name="workflow" checked={workflow === "import"} onChange={() => { setWorkflow("import"); setMessage(""); }} />
              Import model and data
            </label>
          </div>
        </fieldset>

        {workflow === "scan" ? (
          <section aria-label="Use existing tables">
            <button
              onClick={generateSemantic}
              disabled={!selectedProject || busy || loadingModel}
              className="w-full py-2 bg-blue-600 rounded disabled:opacity-50"
            >
              {hasExistingSemantic ? "Rescan and Generate Draft" : "Scan Database and Generate Draft"}
            </button>
            {hasExistingSemantic && (
              <button
                disabled={busy}
                onClick={() => {
                  setSemanticDraft(structuredClone(existingSemanticDraft));
                  setMessage("Published model loaded.");
                }}
                className="mt-3 w-full py-2 bg-zinc-700 rounded disabled:opacity-50"
              >
                Open Published Model
              </button>
            )}
          </section>
        ) : (
          <section aria-label="Import model and data" key={selectedProject}>
            <p className="mb-3 text-sm text-zinc-300">Upload the model first to create its tables, then upload data to populate them.</p>
            <p className="mb-4 text-sm text-amber-300">Uploading a model replaces matching tables and deletes their existing rows.</p>
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
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
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) setModelFile(e.target.files[0]);
                    }}
                  />
                </label>
    
                <button
                  onClick={uploadModel}
                  disabled={!selectedProject || !modelFile || busy}
                  className="w-full py-2 bg-blue-600 rounded disabled:opacity-50"
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
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) setDataFile(e.target.files[0]);
                    }}
                  />
                </label>
    
                <button
                  onClick={uploadData}
                  disabled={!selectedProject || !dataFile || busy}
                  className="w-full py-2 bg-green-600 rounded disabled:opacity-50"
                >
                  Upload Data
                </button>
              </div>
            </div>
          </section>
        )}
        <p className="mt-3 text-sm text-zinc-300" role="status">{message}</p>
      </div>

      {/* SEMANTIC */}
      {workflow === "scan" && semanticDraft && (
        <div className="w-full max-w-3xl bg-zinc-800 p-6 rounded-xl">
          <h2 className="text-lg mb-4 text-center">Review Semantic Model</h2>
          <fieldset disabled={busy}>

          {/* ENTITIES */}
          {semanticDraft.entities.map((entity: any) => (
            <div key={entity.name} className="mb-4">
              <h3 className="text-blue-400 mb-2">{entity.name}</h3>
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                {(["businessName", "description", "synonyms"] as const).map((key) => (
                  <input
                    key={key}
                    aria-label={entity.name + " " + key}
                    placeholder={{ businessName: "Table business name", description: "Table description", synonyms: "Table synonyms, comma separated" }[key]}
                    value={key === "synonyms" ? (entity[key] || []).join(",") : entity[key] || ""}
                    onChange={(e) => {
                      const updated = structuredClone(semanticDraft);
                      const target = updated.entities.find((item: any) => item.name === entity.name);
                      target[key] = key === "synonyms" ? e.target.value.split(",") : e.target.value;
                      setSemanticDraft(updated);
                    }}
                    className="min-w-0 px-3 py-1 bg-zinc-700 rounded"
                  />
                ))}
              </div>

              {entity.columns.map((col: any, i: number) => (
                <div key={col.name} className="grid gap-2 mb-2 md:grid-cols-4">
                  <span className="break-all text-zinc-400">{col.name} <small>{col.dataType}{col.primaryKey ? " · PK" : ""}</small></span>

                  <input
                    aria-label={`Business name of ${entity.name}.${col.name}`}
                    placeholder="Business name"
                    value={col.businessName || ""}
                    onChange={(e) => {
                      const updated = structuredClone(semanticDraft);

                      updated.entities
                        .find((e: any) => e.name === entity.name)
                        .columns[i].businessName = e.target.value;

                      setSemanticDraft(updated);
                    }}
                    className="flex-1 px-3 py-1 bg-zinc-700 rounded"
                  />
                  <input
                    aria-label={`Description of ${entity.name}.${col.name}`}
                    placeholder="Description"
                    value={col.description || ""}
                    onChange={(e) => {
                      const updated = structuredClone(semanticDraft);
                      updated.entities.find((item: any) => item.name === entity.name).columns[i].description = e.target.value;
                      setSemanticDraft(updated);
                    }}
                    className="flex-1 min-w-0 px-3 py-1 bg-zinc-700 rounded"
                  />
                  <input
                    aria-label={`Synonyms for ${entity.name}.${col.name}`}
                    placeholder="Synonyms, comma separated"
                    value={(col.synonyms || []).join(",")}
                    onChange={(e) => {
                      const updated = structuredClone(semanticDraft);
                      updated.entities.find((item: any) => item.name === entity.name).columns[i].synonyms = e.target.value.split(",");
                      setSemanticDraft(updated);
                    }}
                    className="min-w-0 px-3 py-1 bg-zinc-700 rounded"
                  />
                </div>
              ))}
            </div>
          ))}

          <details className="my-4">
            <summary className="cursor-pointer">Database relationships</summary>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {semanticDraft.relationships.map((rel: any, index: number) => (
                <li key={index}>
                  {(rel.pairs || [rel]).map((pair: any) =>
                    `${rel.from_table}.${pair.from_column} → ${rel.to_table}.${pair.to_column}`
                  ).join(" and ")}
                </li>
              ))}
            </ul>
          </details>

          {/* METRICS */}
          <h2 className="text-lg mt-6 mb-2 text-center">Metrics</h2>

          {semanticDraft.metrics.map((m: any, i: number) => (
            <div key={i} className="mb-4">
              <div className="flex gap-4 items-center">
                <input
                  placeholder="Metric name"
                  value={m.name || ""}
                  onChange={(e) => {
                    const updated = structuredClone(semanticDraft);
                    updated.metrics[i].name = e.target.value;
                    setSemanticDraft(updated);
                  }}
                  className="w-[180px] px-3 py-1 bg-zinc-700 rounded"
                />

                <input
                  placeholder="Business name"
                  value={m.businessName || ""}
                  onChange={(e) => {
                    const updated = structuredClone(semanticDraft);
                    updated.metrics[i].businessName = e.target.value;
                    setSemanticDraft(updated);
                  }}
                  className="flex-1 px-3 py-1 bg-zinc-700 rounded"
                />

                <button
                  onClick={() => {
                    const updated = structuredClone(semanticDraft);
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
                  const updated = structuredClone(semanticDraft);
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
              setBusy(true);
              try {
                const res = await fetch("/api/admin/upload-semantic", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ projectId: selectedProject, semantic: semanticDraft }),
                });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error("Publish failed.");
                setExistingSemanticDraft(structuredClone(semanticDraft));
                setHasExistingSemantic(true);
                setMessage("Semantic model published.");
              } catch {
                setMessage("Could not publish the semantic model.");
              } finally {
                setBusy(false);
              }
            }}
            className="mt-6 ml-3 px-4 py-2 bg-purple-600 rounded"
          >
            Publish Semantic Model
          </button>
          </fieldset>
        </div>
      )}
    </main>
  );
}