import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import {
  FolderOpen, Save, FilePlus2, FileSpreadsheet, Undo2, Redo2,
  Plus, Trash2, Copy, Wand2, Search, Columns, CheckSquare
} from "lucide-react";
import { ParseOutcome } from "./types/adif";
import { COMMON_ADIF_FIELDS } from "./utils/hamUtils";
import {
  apply,
  duplicateIds,
  emptyLog,
  fromAdifDocument,
  Log,
  logStats,
  logWithQsos,
  matchesSearch,
  parseSearch,
  Qso,
  QsoId,
  toAdifDocument,
} from "./logbook/log";
import "./App.css";

type Scope = "FILTERED" | "SELECTED" | "ALL";
type Tool = "FILL" | "REPLACE" | "COLUMN" | "DERIVE" | "TOOLS" | null;

const RECENT_KEY = "adif-forge-recent";

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rememberRecent(path: string): string[] {
  const next = [path, ...readRecent().filter((item) => item !== path)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export default function App() {
  const [log, setLog] = useState<Log>(emptyLog);
  const [history, setHistory] = useState<Log[]>([]);
  const [future, setFuture] = useState<Log[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<Record<QsoId, boolean>>({});
  const [editingCell, setEditingCell] = useState<{ id: QsoId; field: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [splitSeparator, setSplitSeparator] = useState(" ");
  const [splitInto, setSplitInto] = useState("SIG_INFO");
  const [targetScope, setTargetScope] = useState<Scope>("FILTERED");
  const [targetCol, setTargetCol] = useState("MY_GRIDSQUARE");
  const [sourceCol, setSourceCol] = useState("TIME_ON");
  const [fillValue, setFillValue] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [newColName, setNewColName] = useState("");
  const [overwriteBand, setOverwriteBand] = useState(false);

  const parsedFilter = parseSearch(globalFilter);
  const filterError = parsedFilter.kind === "invalid" ? parsedFilter.message : null;

  const visibleQsos = useMemo(
    () => log.qsos.filter((qso) => matchesSearch(qso.fields, globalFilter)),
    [log.qsos, globalFilter],
  );

  const positionOf = useMemo(() => {
    const positions = new Map<QsoId, number>();
    log.qsos.forEach((qso, index) => positions.set(qso.id, index + 1));
    return positions;
  }, [log.qsos]);

  const commit = (next: Log) => {
    if (next === log) return;
    setHistory((h) => [...h.slice(-29), log]);
    setFuture([]);
    setLog(next);
  };

  const applyEdit = (scope: ReadonlySet<QsoId>, edit: Parameters<typeof apply>[2]) => {
    const result = apply(log, scope, edit);
    if (result.error) {
      setEditError(result.error);
      return;
    }
    setEditError(null);
    commit(result.log);
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture((f) => [log, ...f]);
    setHistory((h) => h.slice(0, -1));
    setLog(previous);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((h) => [...h, log]);
    setFuture((f) => f.slice(1));
    setLog(next);
  };

  const scopeIds = (): Set<QsoId> => {
    if (targetScope === "ALL") return new Set(log.qsos.map((qso) => qso.id));
    if (targetScope === "SELECTED") {
      return new Set(
        Object.entries(selected)
          .filter(([, on]) => on)
          .map(([id]) => Number(id)),
      );
    }
    return new Set(visibleQsos.map((qso) => qso.id));
  };

  const handleOpenPath = async (chosen: string, merge = false) => {
    const loaded = await invoke<ParseOutcome>("load_adif_file", { path: chosen });
    setWarnings(loaded.warnings);
    setRecent(rememberRecent(chosen));
    if (merge) {
      applyEdit(new Set(), { type: "MERGE", incoming: loaded.document });
      return;
    }
    setLog(fromAdifDocument(loaded.document));
    setHistory([]);
    setFuture([]);
    setFilePath(chosen);
    setSelected({});
    setEditError(null);
  };

  const handleOpen = async (merge = false) => {
    const chosen = await open({
      multiple: false,
      filters: [{ name: "ADIF Log", extensions: ["adi", "adif"] }],
    });
    if (!chosen || typeof chosen !== "string") return;
    await handleOpenPath(chosen, merge);
  };

  const handleReload = async () => {
    if (!filePath) return;
    const loaded = await invoke<ParseOutcome>("load_adif_file", { path: filePath });
    setWarnings(loaded.warnings);
    commit(fromAdifDocument(loaded.document));
    setSelected({});
  };

  const saveDocument = async (doc: ReturnType<typeof toAdifDocument>, defaultPath: string) => {
    const chosen = await save({
      filters: [{ name: "ADIF Log", extensions: ["adi", "adif"] }],
      defaultPath,
    });
    if (!chosen) return null;
    await invoke("save_adif_file", { path: chosen, doc });
    setRecent(rememberRecent(chosen));
    return chosen;
  };

  const handleSaveSelected = async (splitOff: boolean) => {
    const ids = scopeIdsOf(selected);
    if (ids.size === 0) {
      setEditError("Select one or more QSOs");
      return;
    }
    const chosen = await saveDocument(toAdifDocument(logWithQsos(log, ids)), "selected.adi");
    if (chosen && splitOff) applyEdit(ids, { type: "DELETE" });
  };

  const handleCopy = async (kind: "adif" | "csv") => {
    try {
      const ids = scopeIdsOf(selected);
      const source = ids.size === 0 ? log : logWithQsos(log, ids);
      const command = kind === "adif" ? "render_adif" : "render_csv";
      const text = await invoke<string>(command, { doc: toAdifDocument(source) });
      await navigator.clipboard.writeText(text);
      setEditError(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not copy");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const loaded = await invoke<ParseOutcome>("parse_adif_text", { text });
      setWarnings(loaded.warnings);
      applyEdit(new Set(), { type: "MERGE", incoming: loaded.document });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not paste");
    }
  };

  const handleFindAll = () => {
    const parsed = parseSearch(globalFilter);
    if (parsed.kind === "invalid") {
      setEditError(parsed.message);
      return;
    }
    const next: Record<QsoId, boolean> = {};
    if (parsed.kind !== "empty") {
      for (const qso of log.qsos) {
        if (matchesSearch(qso.fields, globalFilter)) next[qso.id] = true;
      }
    }
    setSelected(next);
    setEditError(null);
  };

  const handleSave = async (saveAs = false) => {
    let target = filePath;
    if (!target || saveAs) {
      const chosen = await save({
        filters: [{ name: "ADIF Log", extensions: ["adi", "adif"] }],
        defaultPath: "logbook_edited.adi",
      });
      if (!chosen) return;
      target = chosen;
      setFilePath(chosen);
      setRecent(rememberRecent(chosen));
    }
    await invoke("save_adif_file", { path: target, doc: toAdifDocument(log) });
  };

  const handleExportCsv = async () => {
    const chosen = await save({
      filters: [{ name: "CSV File", extensions: ["csv"] }],
      defaultPath: "logbook_export.csv",
    });
    if (!chosen) return;
    await invoke("export_csv_file", { path: chosen, doc: toAdifDocument(log) });
  };

  const columns = useMemo<ColumnDef<Qso>[]>(() => {
    const visibleIds = visibleQsos.map((qso) => qso.id);
    const selectCol: ColumnDef<Qso> = {
      id: "__select",
      header: () => (
        <input
          type="checkbox"
          checked={visibleIds.length > 0 && visibleIds.every((id) => selected[id])}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setSelected((prev) => {
              const next = { ...prev };
              if (e.target.checked) {
                for (const id of visibleIds) next[id] = true;
              } else {
                for (const id of visibleIds) delete next[id];
              }
              return next;
            });
          }}
        />
      ),
      cell: ({ row }) => (
        <div className="row-index-cell">
          <input
            type="checkbox"
            checked={!!selected[row.original.id]}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              setSelected((prev) => ({ ...prev, [row.original.id]: e.target.checked }))
            }
          />
          <span>{positionOf.get(row.original.id)}</span>
        </div>
      ),
      size: 65,
    };

    const dataCols: ColumnDef<Qso>[] = log.fields.map((field) => ({
      id: field,
      accessorFn: (row) => row.fields[field] ?? "",
      header: () => (
        <div className="col-header">
          <span>{field}</span>
        </div>
      ),
      cell: ({ row, getValue }) => {
        const val = String(getValue() ?? "");
        const isEditing = editingCell?.id === row.original.id && editingCell.field === field;
        if (isEditing) {
          return (
            <input
              autoFocus
              className="cell-input"
              defaultValue={val}
              onBlur={(e) => {
                if (e.currentTarget.dataset.cancel === "1") {
                  setEditingCell(null);
                  return;
                }
                if (e.target.value !== val) {
                  applyEdit(new Set([row.original.id]), {
                    type: "SET_CELL",
                    field,
                    value: e.target.value,
                  });
                }
                setEditingCell(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  e.currentTarget.dataset.cancel = "1";
                  e.currentTarget.blur();
                }
              }}
            />
          );
        }
        return (
          <div
            className="cell-display"
            onDoubleClick={() => setEditingCell({ id: row.original.id, field })}
          >
            {val || "\u00A0"}
          </div>
        );
      },
    }));

    return [selectCol, ...dataCols];
  }, [log, visibleQsos, editingCell, selected, positionOf]);

  const table = useReactTable({
    data: visibleQsos,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => String(row.id),
  });

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const fieldChoices = Array.from(new Set([...log.fields, ...COMMON_ADIF_FIELDS]));

  return (
    <div className="app-shell">
      <header className="toolbar">
        <div className="toolbar-group">
          <button onClick={() => handleOpen(false)} title="Open ADIF">
            <FolderOpen size={16} /> Open
          </button>
          <button onClick={() => handleOpen(true)} title="Merge ADIF into current log">
            <FilePlus2 size={16} /> Merge
          </button>
          <button onClick={() => handleSave(false)} title="Save ADIF">
            <Save size={16} /> Save
          </button>
          <button onClick={handleExportCsv} title="Export CSV">
            <FileSpreadsheet size={16} /> CSV
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button onClick={undo} disabled={history.length === 0} title="Undo">
            <Undo2 size={16} />
          </button>
          <button onClick={redo} disabled={future.length === 0} title="Redo">
            <Redo2 size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button onClick={() => applyEdit(new Set(), { type: "NEW_QSO", now: new Date() })}>
            <Plus size={16} /> New QSO
          </button>
          <button
            onClick={() => {
              const next: Record<QsoId, boolean> = {};
              for (const id of duplicateIds(log)) next[id] = true;
              setSelected(next);
            }}
            title="Highlight duplicate QSOs"
          >
            <CheckSquare size={16} /> Find Dupes
          </button>
          <button
            onClick={() => {
              const ids = scopeIdsOf(selected);
              applyEdit(ids, { type: "DELETE" });
              setSelected((prev) => {
                const next = { ...prev };
                for (const id of ids) delete next[id];
                return next;
              });
            }}
            disabled={selectedCount === 0}
            className="danger-btn"
          >
            <Trash2 size={16} /> Delete ({selectedCount})
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            className={activeTool === "FILL" ? "active-tool" : ""}
            onClick={() => setActiveTool(activeTool === "FILL" ? null : "FILL")}
          >
            <Wand2 size={16} /> Fill / Case
          </button>
          <button
            className={activeTool === "REPLACE" ? "active-tool" : ""}
            onClick={() => setActiveTool(activeTool === "REPLACE" ? null : "REPLACE")}
          >
            <Copy size={16} /> Find & Replace
          </button>
          <button
            className={activeTool === "DERIVE" ? "active-tool" : ""}
            onClick={() => setActiveTool(activeTool === "DERIVE" ? null : "DERIVE")}
          >
            Derive / Copy Field
          </button>
          <button
            className={activeTool === "COLUMN" ? "active-tool" : ""}
            onClick={() => setActiveTool(activeTool === "COLUMN" ? null : "COLUMN")}
          >
            <Columns size={16} /> Columns
          </button>
        </div>

        <div className="search-box">
          <Search size={15} />
          <input
            placeholder="Filter QSOs, or /pattern/"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
        </div>
      </header>

      {(editError || filterError || warnings.length > 0) && (
        <div className="notice">
          {editError && <div>{editError}</div>}
          {filterError && <div>{filterError}</div>}
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
          ))}
        </div>
      )}

      {activeTool && (
        <section className="bulk-drawer">
          <div className="drawer-row">
            <label>
              Scope:
              <select
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value as Scope)}
              >
                <option value="FILTERED">Filtered Rows ({visibleQsos.length})</option>
                <option value="SELECTED">Selected Rows ({selectedCount})</option>
                <option value="ALL">All Rows ({log.qsos.length})</option>
              </select>
            </label>

            {activeTool !== "TOOLS" && (
              <label>
                Target Field:
                <select value={targetCol} onChange={(e) => setTargetCol(e.target.value)}>
                  {fieldChoices.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}

            {activeTool === "FILL" && (
              <>
                <input
                  placeholder="New value (e.g., EM77)"
                  value={fillValue}
                  onChange={(e) => setFillValue(e.target.value)}
                />
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={onlyEmpty}
                    onChange={(e) => setOnlyEmpty(e.target.checked)}
                  />
                  Only empty cells
                </label>
                <button className="primary-btn" onClick={() => applyEdit(scopeIds(), {
                  type: "FILL", field: targetCol, value: fillValue, onlyEmpty,
                })}>Apply Fill</button>
                <button onClick={() => applyEdit(scopeIds(), { type: "CASE", field: targetCol, mode: "UPPER" })}>UPPERCASE</button>
                <button onClick={() => applyEdit(scopeIds(), { type: "CASE", field: targetCol, mode: "LOWER" })}>lowercase</button>
              </>
            )}

            {activeTool === "REPLACE" && (
              <>
                <input
                  placeholder="Find text or /pattern/"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                />
                <input
                  placeholder="Replace with..."
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                />
                <button className="primary-btn" onClick={() => applyEdit(scopeIds(), {
                  type: "REPLACE", field: targetCol, find: findText, replace: replaceText,
                })}>Replace All</button>
              </>
            )}

            {activeTool === "DERIVE" && (
              <>
                <button className="primary-btn" onClick={() => applyEdit(scopeIds(), {
                  type: "DERIVE_BAND", overwrite: overwriteBand,
                })}>
                  Make BAND from FREQ
                </button>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={overwriteBand}
                    onChange={(e) => setOverwriteBand(e.target.checked)}
                  />
                  Overwrite existing BAND
                </label>
                <span className="toolbar-divider" />
                <span>Copy from:</span>
                <select value={sourceCol} onChange={(e) => setSourceCol(e.target.value)}>
                  {log.fields.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button onClick={() => applyEdit(scopeIds(), {
                  type: "COPY", targetField: targetCol, sourceField: sourceCol,
                })}>Copy to {targetCol}</button>
                <span className="toolbar-divider" />
                <button onClick={() => applyEdit(scopeIds(), { type: "TIME_OFF_FROM_ON" })}>TIME_OFF = TIME_ON</button>
                <button onClick={() => applyEdit(scopeIds(), { type: "FIX_TIME" })}>Fix time</button>
                <button onClick={() => applyEdit(scopeIds(), { type: "FREQ_FROM_BAND", overwrite: overwriteBand })}>
                  Make FREQ from BAND
                </button>
              </>
            )}

            {activeTool === "COLUMN" && (
              <>
                <input
                  list="adif-fields"
                  placeholder="Add fields, separated by commas"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                />
                <datalist id="adif-fields">
                  {COMMON_ADIF_FIELDS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
                <button className="primary-btn" onClick={() => {
                  const next = apply(log, new Set(), { type: "ADD_FIELD", name: newColName });
                  if (next.log === log) return;
                  const added = next.log.fields.find((field) => !log.fields.includes(field));
                  commit(next.log);
                  if (added) setTargetCol(added);
                  setNewColName("");
                }}>Add Columns</button>
                <button onClick={() => applyEdit(new Set(), { type: "MOVE_FIELD", name: targetCol, direction: "left" })}>Move left</button>
                <button onClick={() => applyEdit(new Set(), { type: "MOVE_FIELD", name: targetCol, direction: "right" })}>Move right</button>
                <input
                  placeholder="Split on"
                  value={splitSeparator}
                  onChange={(e) => setSplitSeparator(e.target.value)}
                />
                <input
                  placeholder="Into field"
                  value={splitInto}
                  onChange={(e) => setSplitInto(e.target.value)}
                />
                <button onClick={() => applyEdit(scopeIds(), {
                  type: "SPLIT_FIELD", field: targetCol, separator: splitSeparator, into: splitInto,
                })}>Split {targetCol}</button>
                <span className="toolbar-divider" />
                <span>Remove Column:</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) applyEdit(new Set(), { type: "DROP_FIELD", name: e.target.value });
                  }}
                >
                  <option value="">Select column to drop...</option>
                  {log.fields.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </>
            )}

            {activeTool === "TOOLS" && (
              <>
                <button onClick={() => applyEdit(new Set(), { type: "SORT_BY_TIME" })}>Sort by date and time</button>
                <button onClick={() => applyEdit(scopeIdsOf(selected), { type: "DUPLICATE" })}>Duplicate</button>
                <button onClick={() => applyEdit(scopeIdsOf(selected), { type: "MOVE_QSO", direction: "up" })}>Move up</button>
                <button onClick={() => applyEdit(scopeIdsOf(selected), { type: "MOVE_QSO", direction: "down" })}>Move down</button>
                <button onClick={handleFindAll}>Find all</button>
                <button onClick={() => handleSaveSelected(false)}>Save selected</button>
                <button onClick={() => handleSaveSelected(true)}>Split off selected</button>
                <button onClick={() => handleCopy("adif")}>Copy ADIF</button>
                <button onClick={() => handleCopy("csv")}>Copy CSV</button>
                <button onClick={handlePaste}>Paste ADIF</button>
                <button onClick={handleReload} disabled={!filePath}>Reload</button>
              </>
            )}
          </div>
          {activeTool === "TOOLS" && (
            <div className="stats">
              <span>{logStats(log).qsos} QSOs</span>
              <span>{logStats(log).calls} callsigns</span>
              {logStats(log).byBand.map((item) => (
                <span key={`band-${item.name}`}>{item.name}: {item.count}</span>
              ))}
              {logStats(log).byMode.map((item) => (
                <span key={`mode-${item.name}`}>{item.name}: {item.count}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <main className="grid-container">
        <table className="adif-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={selected[row.original.id] ? "selected-row" : ""}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      <footer className="status-bar">
        <span>File: {filePath ?? "Unsaved Logbook"}</span>
        <span>
          Showing {visibleQsos.length} of {log.qsos.length} QSOs
        </span>
        <span>Selected: {selectedCount}</span>
        <span>Double-click any cell to edit</span>
        <button
          className={activeTool === "TOOLS" ? "active-tool" : ""}
          onClick={() => setActiveTool(activeTool === "TOOLS" ? null : "TOOLS")}
        >
          Tools
        </button>
        {recent.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleOpenPath(e.target.value);
            }}
          >
            <option value="">Recent</option>
            {recent.map((path) => (
              <option key={path} value={path}>{path.split(/[/\\]/).pop()}</option>
            ))}
          </select>
        )}
      </footer>
    </div>
  );
}

function scopeIdsOf(selected: Record<QsoId, boolean>): Set<QsoId> {
  return new Set(
    Object.entries(selected)
      .filter(([, on]) => on)
      .map(([id]) => Number(id)),
  );
}
