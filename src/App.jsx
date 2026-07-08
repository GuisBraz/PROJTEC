import React, { useState, useEffect, useMemo, useRef } from "react";
import { Settings, HelpCircle, Printer, Plus, Trash2, Calculator, X, ClipboardPaste, ArrowLeft, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// PROJTEC 1D — Otimizador de aproveitamento de corte linear
// ---------------------------------------------------------------------------

const FONT_LINK_ID = "projtec-fonts";

function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

let uid = 1;
const nextId = () => uid++;

const emptyPiece = () => ({
  id: nextId(),
  desenho: "",
  posicao: "",
  comprimento: "",
  quantidade: "",
});

const DEFAULT_HEADER = {
  commessa: "",
  codRC: "",
  material: "",
  descricao: "",
  barLength: "6000",
};

const DEFAULT_SETTINGS = {
  kerf: 5,
  sobraInicial: 10,
  corteMinimo: 0,
  sobraMaxima: 300,
};

// ---------------------------------------------------------------------------
// Optimization: First-Fit-Decreasing bin packing for 1D bar cutting
// ---------------------------------------------------------------------------
function optimizeCuts(pieces, barLength, kerf, sobraInicial) {
  const items = [];
  pieces.forEach((p) => {
    const len = parseFloat(p.comprimento);
    const qty = parseInt(p.quantidade, 10);
    if (!len || !qty) return;
    for (let i = 0; i < qty; i++) {
      items.push({ desenho: p.desenho, posicao: p.posicao, comprimento: len });
    }
  });
  items.sort((a, b) => b.comprimento - a.comprimento);

  const usable = barLength - sobraInicial;
  const bars = [];

  items.forEach((item) => {
    let placed = false;
    for (const bar of bars) {
      const needed = item.comprimento + (bar.items.length > 0 ? kerf : 0);
      if (bar.remaining >= needed) {
        bar.items.push(item);
        bar.remaining -= needed;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bars.push({ items: [item], remaining: usable - item.comprimento });
    }
  });

  // group identical cut sequences
  const groups = [];
  const map = new Map();
  bars.forEach((bar) => {
    const key = bar.items.map((i) => i.comprimento).join("-");
    if (map.has(key)) {
      map.get(key).qty += 1;
    } else {
      const g = { items: bar.items, remaining: bar.remaining, qty: 1 };
      map.set(key, g);
      groups.push(g);
    }
  });

  groups.sort((a, b) => b.items.length - a.items.length || b.qty - a.qty);

  const barsUsed = groups.reduce((s, g) => s + g.qty, 0);
  const totalPieces = items.length;
  const totalPiecesLength = items.reduce((s, i) => s + i.comprimento, 0);
  const totalBarLength = barsUsed * barLength;
  const yieldPct = totalBarLength > 0 ? (totalPiecesLength / totalBarLength) * 100 : 0;

  return { groups, barsUsed, totalPieces, totalPiecesLength, totalBarLength, yieldPct };
}

// ---------------------------------------------------------------------------
// Cut diagram — technical/dimensioned bar rendering
// ---------------------------------------------------------------------------
function BarDiagram({ group, index, barLength, kerf, sobraInicial, settings }) {
  const W = 860;
  const H = 92;
  const padX = 10;
  const scale = (W - padX * 2) / barLength;

  let cursor = 0;
  const segments = [];

  if (sobraInicial > 0) {
    segments.push({ type: "waste", length: sobraInicial, start: cursor });
    cursor += sobraInicial;
  }

  group.items.forEach((it, i) => {
    if (i > 0) {
      segments.push({ type: "kerf", length: kerf, start: cursor });
      cursor += kerf;
    }
    segments.push({ type: "piece", length: it.comprimento, start: cursor, label: it.comprimento });
    cursor += it.comprimento;
  });

  const finalSobra = barLength - cursor;
  if (finalSobra > 0.01) {
    segments.push({ type: "waste", length: finalSobra, start: cursor });
  }

  const reusable = finalSobra >= settings.sobraMaxima;
  const barY = 34;
  const barH = 26;

  const colors = ["#1E5A73", "#2D7A8C", "#3F7D53", "#7A5C9E", "#4B6E8C", "#6B8E9E"];

  return (
    <div className="ptc-bar-row">
      <div className="ptc-bar-meta">
        <div className="ptc-bar-num">{String(index + 1).padStart(2, "0")}</div>
        <div className="ptc-bar-qty">
          <span className="ptc-bar-qty-num">{group.qty}×</span>
          <span className="ptc-bar-qty-lbl">barra{group.qty > 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="ptc-bar-svg-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="ptc-bar-svg" preserveAspectRatio="none">
          <defs>
            <pattern id={`hatch-${index}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#B9B2A0" strokeWidth="1.6" />
            </pattern>
          </defs>

          {/* dimension line + full bar length label */}
          <line x1={padX} y1="10" x2={W - padX} y2="10" stroke="#9AA5AC" strokeWidth="1" />
          <text x={W / 2} y="8" textAnchor="middle" className="ptc-dim-text">
            {barLength} mm
          </text>

          {segments.map((seg, i) => {
            const x = padX + seg.start * scale;
            const w = Math.max(seg.length * scale, 0.6);
            if (seg.type === "kerf") {
              return <rect key={i} x={x} y={barY} width={Math.max(w, 1.4)} height={barH} fill="#23272B" />;
            }
            if (seg.type === "waste") {
              return (
                <g key={i}>
                  <rect x={x} y={barY} width={w} height={barH} fill={`url(#hatch-${index})`} stroke="#B9B2A0" strokeWidth="1" />
                </g>
              );
            }
            const color = colors[i % colors.length];
            return (
              <g key={i}>
                <rect x={x} y={barY} width={w} height={barH} fill={color} rx="1.5" />
                {w > 30 && (
                  <text x={x + w / 2} y={barY + barH / 2 + 4} textAnchor="middle" className="ptc-seg-text">
                    {seg.label}
                  </text>
                )}
              </g>
            );
          })}

          <rect x={padX} y={barY} width={W - padX * 2} height={barH} fill="none" stroke="#23272B" strokeWidth="1.2" />
        </svg>
      </div>
      <div className="ptc-bar-sobra">
        <span className={"ptc-tag " + (finalSobra < settings.corteMinimo ? "ptc-tag-waste" : reusable ? "ptc-tag-reuse" : "ptc-tag-neutral")}>
          {finalSobra < settings.corteMinimo ? "descarte" : reusable ? "retalho" : "sobra"}
        </span>
        <span className="ptc-bar-sobra-val">{finalSobra.toFixed(0)} mm</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings modal (centralized)
// ---------------------------------------------------------------------------
function SettingsModal({ settings, onChange, onClose }) {
  const [local, setLocal] = useState(settings);
  const set = (k, v) => setLocal((s) => ({ ...s, [k]: v }));

  return (
    <div className="ptc-modal-overlay no-print" onClick={onClose}>
      <div className="ptc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ptc-modal-head">
          <h2>Configurações</h2>
          <button className="ptc-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ptc-modal-body">
          <label className="ptc-field">
            <span>Espessura da serra — kerf (mm)</span>
            <input type="number" value={local.kerf} onChange={(e) => set("kerf", e.target.value)} />
            <small>Descontada entre cada corte. Padrão de oficina: 5 mm.</small>
          </label>

          <label className="ptc-field">
            <span>Sobra inicial (mm)</span>
            <input type="number" value={local.sobraInicial} onChange={(e) => set("sobraInicial", e.target.value)} />
            <small>Margem reservada no início de cada barra (esquadrejamento).</small>
          </label>

          <label className="ptc-field">
            <span>Tamanho mínimo do corte final (mm)</span>
            <input type="number" value={local.corteMinimo} onChange={(e) => set("corteMinimo", e.target.value)} />
            <small>Sobras menores que isso são tratadas como descarte.</small>
          </label>

          <label className="ptc-field">
            <span>Tamanho máximo de sobra (mm)</span>
            <input type="number" value={local.sobraMaxima} onChange={(e) => set("sobraMaxima", e.target.value)} />
            <small>Acima disso a sobra é marcada como retalho reaproveitável.</small>
          </label>
        </div>
        <div className="ptc-modal-foot">
          <button className="ptc-btn" onClick={onClose}>Cancelar</button>
          <button
            className="ptc-btn ptc-btn-primary"
            onClick={() => {
              onChange({
                ...local,
                kerf: parseFloat(local.kerf) || 0,
                sobraInicial: parseFloat(local.sobraInicial) || 0,
                corteMinimo: parseFloat(local.corteMinimo) || 0,
                sobraMaxima: parseFloat(local.sobraMaxima) || 0,
              });
              onClose();
            }}
          >
            Salvar configurações
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }) {
  return (
    <div className="ptc-modal-overlay no-print" onClick={onClose}>
      <div className="ptc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ptc-modal-head">
          <h2>Ajuda</h2>
          <button className="ptc-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ptc-modal-body ptc-help-body">
          <p><strong>1. Preencha o cabeçalho</strong> — commessa, código do RC e o comprimento da barra padrão (mm).</p>
          <p><strong>2. Insira as peças</strong> — digite manualmente ou cole direto do Excel (selecione as células e Ctrl+V numa linha da tabela). Colunas esperadas, nessa ordem: Descrição, Desenho, Posição, Comprimento (mm), Quantidade.</p>
          <p><strong>3. Ajuste as configurações</strong> — espessura da serra, sobra inicial e limites de sobra, no botão Configurações.</p>
          <p><strong>4. Clique em Calcular</strong> — o sistema agrupa as barras com sequência de corte idêntica e gera o relatório visual.</p>
          <p><strong>5. Imprimir / PDF</strong> — no relatório, use o botão Imprimir e escolha "Salvar como PDF" na janela de impressão do navegador.</p>
        </div>
        <div className="ptc-modal-foot">
          <button className="ptc-btn ptc-btn-primary" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input view
// ---------------------------------------------------------------------------
function InputView({ header, setHeader, pieces, setPieces, onCalcular, onClear, settings }) {
  const tableRef = useRef(null);

  const updatePiece = (id, field, value) => {
    setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const addRow = () => setPieces((ps) => [...ps, emptyPiece()]);
  const removeRow = (id) => setPieces((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));

  const handlePasteOnRow = (rowId, e) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return; // let default single-cell paste happen
    e.preventDefault();
    const rows = text.trim().split("\n").map((r) => r.split("\t"));
    setPieces((ps) => {
      const idx = ps.findIndex((p) => p.id === rowId);
      const before = ps.slice(0, idx);
      const after = ps.slice(idx + 1);
      const newRows = rows.map((cols) => {
        // aceita tanto colar com 5 colunas (Descrição, Desenho, Posição, Compr., Qtd — ignora a 1ª)
        // quanto 4 colunas (Desenho, Posição, Compr., Qtd)
        const c = cols.length >= 5 ? cols.slice(1) : cols;
        return {
          id: nextId(),
          desenho: c[0]?.trim() ?? "",
          posicao: c[1]?.trim() ?? "",
          comprimento: c[2]?.trim() ?? "",
          quantidade: c[3]?.trim() ?? "",
        };
      });
      return [...before, ...newRows, ...after];
    });
  };

  const validCount = pieces.filter((p) => p.comprimento && p.quantidade).length;

  return (
    <div className="ptc-view">
      <div className="ptc-card">
        <div className="ptc-card-head">
          <h3>Dados gerais</h3>
          <button className="ptc-icon-btn ptc-icon-btn-danger" title="Limpar tudo e começar um novo trabalho" onClick={onClear}>
            <Trash2 size={15} />
          </button>
        </div>
        <div className="ptc-header-grid">
          <label className="ptc-field">
            <span>Commessa</span>
            <input value={header.commessa} onChange={(e) => setHeader((h) => ({ ...h, commessa: e.target.value }))} placeholder="2025-036" />
          </label>
          <label className="ptc-field">
            <span>Cód. RC</span>
            <input value={header.codRC} onChange={(e) => setHeader((h) => ({ ...h, codRC: e.target.value }))} placeholder="1" />
          </label>
          <label className="ptc-field">
            <span>Material</span>
            <input value={header.material} onChange={(e) => setHeader((h) => ({ ...h, material: e.target.value }))} placeholder="SAE 1020" />
          </label>
          <label className="ptc-field">
            <span>Comprimento da barra (mm)</span>
            <input
              type="number"
              value={header.barLength}
              onChange={(e) => setHeader((h) => ({ ...h, barLength: e.target.value }))}
              placeholder="6000"
            />
          </label>
        </div>
        <label className="ptc-field ptc-field-full">
          <span>Descrição do projeto</span>
          <input
            value={header.descricao}
            onChange={(e) => setHeader((h) => ({ ...h, descricao: e.target.value }))}
            placeholder='Ex: B.CHATA 1.1/2" X 1/4" - SAE 1020'
          />
        </label>
      </div>

      <div className="ptc-card">
        <div className="ptc-card-head">
          <h3>Peças para cortar</h3>
          <span className="ptc-hint"><ClipboardPaste size={14} /> cole os dados do Excel em qualquer célula</span>
        </div>
        <div className="ptc-table-wrap" ref={tableRef}>
          <table className="ptc-table">
            <thead>
              <tr>
                <th className="ptc-col-n">N°</th>
                <th>Desenho</th>
                <th className="ptc-col-sm">Posição</th>
                <th className="ptc-col-sm">Compr. (mm)</th>
                <th className="ptc-col-sm">Qtd.</th>
                <th className="ptc-col-icon"></th>
              </tr>
            </thead>
            <tbody>
              {pieces.map((p, i) => (
                <tr key={p.id}>
                  <td className="ptc-col-n">{i + 1}</td>
                  <td>
                    <input value={p.desenho} onPaste={(e) => handlePasteOnRow(p.id, e)} onChange={(e) => updatePiece(p.id, "desenho", e.target.value)} />
                  </td>
                  <td className="ptc-col-sm">
                    <input value={p.posicao} onPaste={(e) => handlePasteOnRow(p.id, e)} onChange={(e) => updatePiece(p.id, "posicao", e.target.value)} />
                  </td>
                  <td className="ptc-col-sm">
                    <input type="number" value={p.comprimento} onPaste={(e) => handlePasteOnRow(p.id, e)} onChange={(e) => updatePiece(p.id, "comprimento", e.target.value)} />
                  </td>
                  <td className="ptc-col-sm">
                    <input type="number" value={p.quantidade} onPaste={(e) => handlePasteOnRow(p.id, e)} onChange={(e) => updatePiece(p.id, "quantidade", e.target.value)} />
                  </td>
                  <td className="ptc-col-icon">
                    <button className="ptc-icon-btn ptc-icon-btn-danger" onClick={() => removeRow(p.id)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="ptc-btn ptc-btn-ghost ptc-add-row" onClick={addRow}><Plus size={15} /> adicionar linha</button>
      </div>

      <div className="ptc-calc-bar">
        <span className="ptc-hint">{validCount} peça{validCount !== 1 ? "s" : ""} pronta{validCount !== 1 ? "s" : ""} para calcular</span>
        <button className="ptc-btn ptc-btn-primary ptc-btn-lg" onClick={onCalcular} disabled={!header.barLength || validCount === 0}>
          <Calculator size={17} /> Calcular
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report view
// ---------------------------------------------------------------------------
function ReportView({ header, settings, result, pieces, onBack }) {
  const { groups, barsUsed, totalPieces, totalPiecesLength, totalBarLength, yieldPct } = result;

  return (
    <div className="ptc-view">
      <div className="no-print ptc-report-toolbar">
        <button className="ptc-btn ptc-btn-ghost" onClick={onBack}><ArrowLeft size={15} /> voltar</button>
        <button className="ptc-btn ptc-btn-primary" onClick={() => window.print()}><Printer size={15} /> Imprimir / Exportar PDF</button>
      </div>

      <div className="ptc-card ptc-report-sheet">
        <div className="ptc-report-head">
          <div>
            <div className="ptc-report-eyebrow">Relatório de Corte 1D</div>
            <div className="ptc-report-title">RC {header.codRC || "—"} <ChevronRight size={16} /> {header.commessa || "sem commessa"}</div>
            {header.descricao && <div className="ptc-report-desc">{header.descricao}</div>}
          </div>
          <div className="ptc-report-summary">
            <div><span>Material</span><b>{header.material || "—"}</b></div>
            <div><span>Barras utilizadas</span><b>{barsUsed}</b></div>
            <div><span>Compr. total</span><b>{totalBarLength.toLocaleString("pt-BR")} mm</b></div>
            <div><span>Peças cortadas</span><b>{totalPieces}</b></div>
            <div><span>Rendimento geral</span><b className="ptc-yield">{yieldPct.toFixed(1)}%</b></div>
          </div>
        </div>

        <div className="ptc-report-section">
          <h4>Peças para cortar</h4>
          <table className="ptc-table ptc-table-static">
            <thead>
              <tr>
                <th>N°</th><th>Desenho</th><th>Posição</th><th>Compr. (mm)</th><th>Qtd.</th>
              </tr>
            </thead>
            <tbody>
              {pieces.filter(p => p.comprimento && p.quantidade).map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td><td>{p.desenho}</td><td>{p.posicao}</td><td>{p.comprimento}</td><td>{p.quantidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ptc-report-section">
          <h4>Aproveitamento 1D</h4>
          <div className="ptc-bars-list">
            {groups.map((g, i) => (
              <BarDiagram key={i} group={g} index={i} barLength={parseFloat(header.barLength)} kerf={settings.kerf} sobraInicial={settings.sobraInicial} settings={settings} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------
export default function App() {
  useFonts();
  const [view, setView] = useState("input");
  const [header, setHeader] = useState(DEFAULT_HEADER);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [pieces, setPieces] = useState([emptyPiece(), emptyPiece(), emptyPiece()]);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [result, setResult] = useState(null);

  const handleCalcular = () => {
    const barLength = parseFloat(header.barLength);
    if (!barLength) return;
    const r = optimizeCuts(pieces, barLength, settings.kerf, settings.sobraInicial);
    setResult(r);
    setView("report");
  };

  const handleClear = () => {
    setHeader(DEFAULT_HEADER);
    setPieces([emptyPiece(), emptyPiece(), emptyPiece()]);
    setResult(null);
    setView("input");
  };

  return (
    <div className="ptc-app">
      <style>{CSS}</style>

      <div className="ptc-topbar no-print">
        <div className="ptc-brand">
          <span className="ptc-brand-mark">1D</span>
          <div>
            <div className="ptc-brand-title">PROJTEC</div>
            <div className="ptc-brand-sub">aproveitamento de corte linear</div>
          </div>
        </div>
        <div className="ptc-topbar-actions">
          <button className="ptc-icon-btn" onClick={() => setShowSettings(true)} title="Configurações"><Settings size={18} /></button>
          <button className="ptc-icon-btn" onClick={() => setShowHelp(true)} title="Ajuda"><HelpCircle size={18} /></button>
        </div>
      </div>

      {view === "input" ? (
        <InputView header={header} setHeader={setHeader} pieces={pieces} setPieces={setPieces} onCalcular={handleCalcular} onClear={handleClear} settings={settings} />
      ) : (
        <ReportView header={header} settings={settings} result={result} pieces={pieces} onBack={() => setView("input")} />
      )}

      {showSettings && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — technical / blueprint-inspired design system
// ---------------------------------------------------------------------------
const CSS = `
:root{
  --paper: #F3F1EA;
  --paper-line: #D9D4C4;
  --ink: #1E2126;
  --ink-soft: #565B60;
  --steel: #1E5A73;
  --steel-soft: #E4EEF1;
  --rust: #C4622D;
  --rust-soft: #F5E2D6;
  --green: #3F7D53;
  --green-soft: #E4EFE6;
  --white: #FFFFFF;
}

* { box-sizing: border-box; }

.ptc-app{
  font-family: 'Inter', sans-serif;
  background: var(--paper);
  color: var(--ink);
  min-height: 100%;
  padding: 0 0 48px 0;
}

.ptc-topbar{
  display:flex; align-items:center; justify-content:space-between;
  padding: 18px 28px; border-bottom: 1px solid var(--paper-line);
  background: var(--paper);
  position: sticky; top:0; z-index: 5;
}
.ptc-brand{ display:flex; align-items:center; gap:12px; }
.ptc-brand-mark{
  font-family:'IBM Plex Mono', monospace; font-weight:600; font-size:13px;
  background: var(--steel); color: var(--white); padding: 6px 9px; border-radius:4px; letter-spacing: 0.5px;
}
.ptc-brand-title{ font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:17px; letter-spacing: 0.5px; }
.ptc-brand-sub{ font-size:11.5px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.6px; }
.ptc-topbar-actions{ display:flex; gap:8px; }

.ptc-icon-btn{
  border:1px solid var(--paper-line); background: var(--white); border-radius:8px;
  width:36px; height:36px; display:flex; align-items:center; justify-content:center;
  cursor:pointer; color: var(--ink); transition: all .12s ease;
}
.ptc-icon-btn:hover{ border-color: var(--steel); color: var(--steel); }
.ptc-icon-btn-danger:hover{ border-color:#B4432A; color:#B4432A; }

.ptc-view{ max-width: 980px; margin: 0 auto; padding: 24px 24px 0; display:flex; flex-direction:column; gap:18px; }

.ptc-card{
  background: var(--white); border:1px solid var(--paper-line); border-radius:12px;
  padding: 20px 22px;
}
.ptc-card-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; }
.ptc-card-head h3{ font-family:'Space Grotesk', sans-serif; font-size:15px; margin:0; }
.ptc-hint{ font-size:12px; color: var(--ink-soft); display:flex; align-items:center; gap:5px; }

.ptc-header-grid{ display:grid; grid-template-columns: 1fr 1fr 1.2fr 1.2fr; gap:16px; }
.ptc-field-full{ margin-top:16px; }

.ptc-field{ display:flex; flex-direction:column; gap:6px; font-size:12.5px; color: var(--ink-soft); }
.ptc-field span{ font-weight:600; color: var(--ink); text-transform: uppercase; font-size:11px; letter-spacing:0.4px; }
.ptc-field input{
  font-family:'IBM Plex Mono', monospace; font-size:14px; padding:9px 10px;
  border:1px solid var(--paper-line); border-radius:7px; background: var(--paper); color: var(--ink);
}
.ptc-field input:focus{ outline:2px solid var(--steel); outline-offset:1px; background: var(--white); }
.ptc-field small{ font-size:11px; color: var(--ink-soft); font-weight:400; }

.ptc-table-wrap{ overflow-x:auto; border:1px solid var(--paper-line); border-radius:8px; }
.ptc-table{ width:100%; border-collapse: collapse; font-size:13px; }
.ptc-table thead th{
  text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:0.5px;
  color: var(--ink-soft); background: var(--paper); padding:9px 10px; border-bottom:1px solid var(--paper-line);
}
.ptc-table td{ padding:4px 6px; border-bottom:1px solid var(--paper-line); }
.ptc-table tbody tr:last-child td{ border-bottom:none; }
.ptc-table input{
  width:100%; border:1px solid transparent; background:transparent; padding:7px 8px; border-radius:6px;
  font-family:'IBM Plex Mono', monospace; font-size:13px; color: var(--ink);
}
.ptc-table input:focus{ outline:none; border-color: var(--steel); background: var(--steel-soft); }
.ptc-col-n{ width:36px; color: var(--ink-soft); font-family:'IBM Plex Mono', monospace; font-size:12px; text-align:center; }
.ptc-col-sm{ width:96px; }
.ptc-col-icon{ width:36px; }

.ptc-add-row{ margin-top:10px; }

.ptc-btn{
  display:inline-flex; align-items:center; gap:7px; font-family:'Inter',sans-serif; font-weight:600; font-size:13px;
  padding:9px 15px; border-radius:8px; border:1px solid var(--paper-line); background: var(--white); color: var(--ink);
  cursor:pointer; transition: all .12s ease;
}
.ptc-btn:hover{ border-color: var(--ink); }
.ptc-btn-ghost{ background:transparent; border-color: var(--paper-line); }
.ptc-btn-primary{ background: var(--steel); border-color: var(--steel); color: var(--white); }
.ptc-btn-primary:hover{ background:#164a5e; }
.ptc-btn-primary:disabled{ background:#9AB2BC; border-color:#9AB2BC; cursor:not-allowed; }
.ptc-btn-lg{ padding:12px 22px; font-size:14px; }

.ptc-calc-bar{ display:flex; align-items:center; justify-content:space-between; padding: 4px 4px 20px; }

.ptc-modal-overlay{
  position:fixed; inset:0; background: rgba(30,33,38,0.45); backdrop-filter: blur(2px);
  display:flex; align-items:center; justify-content:center; z-index:50; padding:20px;
}
.ptc-modal{ background: var(--white); border-radius:14px; width:100%; max-width:440px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.ptc-modal-head{ display:flex; align-items:center; justify-content:space-between; padding:18px 20px; border-bottom:1px solid var(--paper-line); }
.ptc-modal-head h2{ font-family:'Space Grotesk', sans-serif; font-size:16px; margin:0; }
.ptc-modal-body{ padding:20px; display:flex; flex-direction:column; gap:16px; max-height:60vh; overflow-y:auto; }
.ptc-help-body p{ font-size:13.5px; line-height:1.5; margin:0 0 4px; color: var(--ink); }
.ptc-modal-foot{ display:flex; justify-content:flex-end; gap:10px; padding:16px 20px; border-top:1px solid var(--paper-line); }

.ptc-report-toolbar{ display:flex; justify-content:space-between; }

.ptc-report-sheet{ padding: 30px 32px; }
.ptc-report-head{ display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:18px; border-bottom: 2px solid var(--ink); gap: 24px; flex-wrap: wrap; }
.ptc-report-eyebrow{ font-size:11px; text-transform:uppercase; letter-spacing:0.8px; color: var(--rust); font-weight:700; }
.ptc-report-title{ font-family:'Space Grotesk', sans-serif; font-size:22px; font-weight:700; display:flex; align-items:center; gap:4px; margin-top:2px; }
.ptc-report-desc{ font-size:13px; color: var(--ink-soft); margin-top:6px; }
.ptc-report-summary{ display:grid; grid-template-columns: repeat(3, auto); gap: 14px 26px; }
.ptc-report-summary div{ display:flex; flex-direction:column; gap:2px; }
.ptc-report-summary span{ font-size:10.5px; text-transform:uppercase; letter-spacing:0.4px; color: var(--ink-soft); }
.ptc-report-summary b{ font-family:'IBM Plex Mono', monospace; font-size:15px; }
.ptc-yield{ color: var(--green); }

.ptc-report-section{ margin-top: 26px; }
.ptc-report-section h4{ font-family:'Space Grotesk', sans-serif; font-size:14px; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid var(--paper-line); padding-bottom:8px; margin-bottom:12px; }
.ptc-table-static th, .ptc-table-static td{ font-size:12.5px; }

.ptc-bars-list{ display:flex; flex-direction:column; gap:14px; }
.ptc-bar-row{ display:grid; grid-template-columns: 90px 1fr 110px; align-items:center; gap:14px; }
.ptc-bar-meta{ display:flex; flex-direction:column; gap:2px; }
.ptc-bar-num{ font-family:'IBM Plex Mono', monospace; font-size:11px; color: var(--ink-soft); }
.ptc-bar-qty{ display:flex; align-items:baseline; gap:4px; }
.ptc-bar-qty-num{ font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:16px; color: var(--steel); }
.ptc-bar-qty-lbl{ font-size:11px; color: var(--ink-soft); }
.ptc-bar-svg-wrap{ width:100%; }
.ptc-bar-svg{ width:100%; height:70px; display:block; }
.ptc-dim-text{ font-family:'IBM Plex Mono', monospace; font-size:9px; fill: var(--ink-soft); }
.ptc-seg-text{ font-family:'IBM Plex Mono', monospace; font-size:11px; fill: var(--white); font-weight:600; }
.ptc-bar-sobra{ display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
.ptc-bar-sobra-val{ font-family:'IBM Plex Mono', monospace; font-size:13px; }
.ptc-tag{ font-size:10px; text-transform:uppercase; letter-spacing:0.4px; font-weight:700; padding:2px 8px; border-radius:20px; }
.ptc-tag-waste{ background:#EFE9DD; color:#8A8371; }
.ptc-tag-neutral{ background: var(--rust-soft); color: var(--rust); }
.ptc-tag-reuse{ background: var(--green-soft); color: var(--green); }

@media print{
  .no-print{ display:none !important; }
  .ptc-app{ padding:0; background: var(--white); }
  .ptc-view{ max-width:none; padding:0; }
  .ptc-card{ border:none; border-radius:0; padding:0; }
  .ptc-report-sheet{ padding:0; }
}
`;
