import { useState, useRef, useLayoutEffect } from "react";

const CATEGORIES = ["한식", "양식", "중식", "일식", "분식", "디저트", "음료", "기타"];
const DIFFICULTIES = ["쉬움", "보통", "어려움"];
const STEPS = ["대표 사진 + 제목", "설명", "카테고리", "난이도", "소요시간", "재료 목록", "조리 순서", "제출"];
const TEXT_PAGES = new Set([0, 1, 5, 6]);

// ── 샘플 원본 레시피 ─────────────────────────────────────────
const ORIGINAL = {
  photo: null,
  title: "간단 김치볶음밥",
  description: "냉장고 속 자투리 재료로 만드는 간단하고 맛있는 김치볶음밥입니다.",
  category: "한식", difficulty: "쉬움", cookingTime: "15",
  ingredients: [
    { id: 1, name: "밥", amount: "1공기" },
    { id: 2, name: "김치[1]", amount: "100g" },
    { id: 3, name: "참기름", amount: "1큰술" },
  ],
  steps: [
    { id: 1, content: "팬을 달군 후 기름을 두릅니다.", images: [] },
    { id: 2, content: "김치를 넣고 볶습니다.", images: [] },
    { id: 3, content: "밥을 넣고 잘 섞어 볶아줍니다.", images: [] },
  ],
};
const ORIGINAL_FOOTNOTES = {
  5: [{ id: "orig-1", num: 1, text: "신김치를 사용하면 더 맛있습니다." }],
};

// ── diff 유틸 ─────────────────────────────────────────────────
function diffWords(a, b) {
  a = (a || "").split(/(\s+)/); b = (b || "").split(/(\s+)/);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const res = []; let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) { res.unshift({ type: "same", text: a[i-1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { res.unshift({ type: "add", text: b[j-1] }); j--; }
    else { res.unshift({ type: "del", text: a[i-1] }); i--; }
  }
  return res;
}
function DiffText({ oldStr, newStr }) {
  return (
    <span>
      {diffWords(oldStr, newStr).map((p, i) =>
        p.type === "same" ? <span key={i}>{p.text}</span>
        : p.type === "add" ? <span key={i} style={{ background: "#c6f6c6" }}>{p.text}</span>
        : <span key={i} style={{ background: "#ffc6c6", textDecoration: "line-through" }}>{p.text}</span>
      )}
    </span>
  );
}

// ── 전체 각주 병합: 페이지 순 → 페이지 내 num 순 → globalNum 부여 ──
const mergeAllFns = (fnMap) => {
  const all = Object.entries(fnMap)
    .flatMap(([p, fns]) => fns.map(f => ({ ...f, pageIndex: Number(p) })))
    .sort((a, b) => a.pageIndex - b.pageIndex || a.num - b.num);
  return all.map((f, i) => ({ ...f, globalNum: i + 1 }));
};

// 특정 페이지의 [N] → globalNum 매핑
const buildGlobalMap = (merged, pageIndex) => {
  const map = {};
  merged.filter(f => f.pageIndex === pageIndex).forEach(f => { map[f.num] = f.globalNum; });
  return map;
};

// 텍스트의 [N]을 globalNum으로 치환
const applyGlobalMap = (text, map) =>
  (text || "").replace(/\[(\d+)\]/g, (_, n) => map[Number(n)] ? `[${map[Number(n)]}]` : `[${n}]`);

// ── syncPage (작성 프로토타입과 동일) ────────────────────────
const syncPage = (p, nextFns, nextForm) => {
  let texts = [];
  if (p === 0) texts = [nextForm.title];
  if (p === 1) texts = [nextForm.description];
  if (p === 5) texts = nextForm.ingredients.flatMap(i => [i.name, i.amount]);
  if (p === 6) texts = nextForm.steps.map(s => s.content);
  const combined = texts.join("\n");
  let fns = [...nextFns];

  if (TEXT_PAGES.has(p)) {
    const used = new Set();
    for (const m of combined.matchAll(/\[(\d+)\]/g)) used.add(Number(m[1]));
    fns = fns.filter(f => used.has(f.num));
    const ordered = []; const seen = new Set();
    for (const m of combined.matchAll(/\[(\d+)\]/g)) { const n = Number(m[1]); if (!seen.has(n)) { seen.add(n); ordered.push(n); } }
    fns.sort((a, b) => ordered.indexOf(a.num) - ordered.indexOf(b.num));
    const mapping = new Map(); fns.forEach((f, i) => mapping.set(f.num, i + 1));
    if (mapping.size > 0) {
      const applyMap = (t) => {
        if (!t) return t;
        mapping.forEach((_, o) => { t = t.replace(new RegExp(`\\[${o}\\]`, "g"), `{{${o}}}`); });
        mapping.forEach((n, o) => { t = t.replace(new RegExp(`\\{\\{${o}\\}\\}`, "g"), `[${n}]`); });
        return t;
      };
      if (p === 0) nextForm = { ...nextForm, title: applyMap(nextForm.title) };
      if (p === 1) nextForm = { ...nextForm, description: applyMap(nextForm.description) };
      if (p === 5) nextForm = { ...nextForm, ingredients: nextForm.ingredients.map(i => ({ ...i, name: applyMap(i.name), amount: applyMap(i.amount) })) };
      if (p === 6) nextForm = { ...nextForm, steps: nextForm.steps.map(s => ({ ...s, content: applyMap(s.content) })) };
      fns = fns.map(f => ({ ...f, num: mapping.get(f.num) }));
    }
  } else {
    const mapping = new Map(); fns.forEach((f, i) => mapping.set(f.num, i + 1));
    fns = fns.map(f => ({ ...f, num: mapping.get(f.num) }));
  }
  const nextCounter = fns.length > 0 ? Math.max(...fns.map(f => f.num)) + 1 : 1;
  return { fns, nextForm, nextCounter };
};

// ── Diff 확인 페이지 ─────────────────────────────────────────
function DiffPage({ original, edited, fnMap, onConfirm, onBack }) {
  const o = original, e = edited;
  const editMerged = mergeAllFns(fnMap);
  const origMerged = mergeAllFns(ORIGINAL_FOOTNOTES);

  const rEdit = (text, pi) => applyGlobalMap(text, buildGlobalMap(editMerged, pi));
  const rOrig = (text, pi) => applyGlobalMap(text, buildGlobalMap(origMerged, pi));

  // 각주 diff
  const fnDiff = () => {
    const result = [];
    // 원본 각주
    origMerged.forEach(of => {
      const ef = editMerged.find(f => f.pageIndex === of.pageIndex && f.id === of.id);
      if (!ef) result.push({ num: of.globalNum, pageIndex: of.pageIndex, origText: of.text, editText: null, status: "deleted" });
      else if (ef.text !== of.text) result.push({ num: ef.globalNum, pageIndex: of.pageIndex, origText: of.text, editText: ef.text, status: "modified" });
      else result.push({ num: ef.globalNum, pageIndex: of.pageIndex, origText: of.text, editText: ef.text, status: "same" });
    });
    // 신규 각주
    editMerged.forEach(ef => {
      const inOrig = origMerged.some(of => of.pageIndex === ef.pageIndex && of.id === ef.id);
      if (!inOrig) result.push({ num: ef.globalNum, pageIndex: ef.pageIndex, origText: null, editText: ef.text, status: "added" });
    });
    return result.sort((a, b) => a.num - b.num);
  };

  const rowBg = (s) => ({ added: "#efffef", deleted: "#fff0f0", modified: "#fffbe6", same: "" }[s]);

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <h2>[모두의 레시피] 편집 내용 확인</h2><hr />
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <span style={{ background: "#c6f6c6", padding: "2px 6px", marginRight: 8 }}>추가됨</span>
        <span style={{ background: "#ffc6c6", padding: "2px 6px", textDecoration: "line-through", marginRight: 8 }}>삭제됨</span>
        <span style={{ background: "#f5f5f5", padding: "2px 6px" }}>변경 없음</span>
      </div>

      <fieldset style={{ marginBottom: 14 }}>
        <legend><b>기본 정보</b></legend>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead><tr>
            <th style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f0f0f0", width: 90 }}>항목</th>
            <th style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f0f0f0" }}>변경 내용</th>
          </tr></thead>
          <tbody>
            {[
              ["제목",    rOrig(o.title, 0),       rEdit(e.title, 0)],
              ["설명",    rOrig(o.description, 1), rEdit(e.description, 1)],
              ["카테고리", o.category,              e.category],
              ["난이도",  o.difficulty,            e.difficulty],
              ["소요시간", o.cookingTime ? o.cookingTime+"분" : "(없음)", e.cookingTime ? e.cookingTime+"분" : "(없음)"],
              ["대표 사진", o.photo ? o.photo.name : "(없음)", e.photo ? e.photo.name : "(없음)"],
            ].map(([label, ov, ev]) => (
              <tr key={label} style={{ background: ov === ev ? "" : "#fffbe6" }}>
                <td style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f9f9f9" }}>{label}</td>
                <td style={{ border: "1px solid #ccc", padding: "3px 8px" }}>
                  {ov === ev ? <span style={{ color: "#888" }}>{ov}</span> : <DiffText oldStr={ov} newStr={ev} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      <fieldset style={{ marginBottom: 14 }}>
        <legend><b>재료 목록</b></legend>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead><tr>
            <th style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f0f0f0", width: 36 }}>#</th>
            <th style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f0f0f0" }}>재료명</th>
            <th style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f0f0f0", width: 120 }}>양</th>
            <th style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f0f0f0", width: 60 }}>상태</th>
          </tr></thead>
          <tbody>
            {Array.from({ length: Math.max(o.ingredients.length, e.ingredients.length) }, (_, i) => {
              const orig = o.ingredients[i], edit = e.ingredients[i];
              const on = rOrig(orig?.name, 5), oa = rOrig(orig?.amount, 5);
              const en = rEdit(edit?.name, 5), ea = rEdit(edit?.amount, 5);
              const bg = !orig ? "#efffef" : !edit ? "#fff0f0" : "";
              const status = !orig ? "추가" : !edit ? "삭제" : (on+oa === en+ea) ? "—" : "수정";
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={{ border: "1px solid #ccc", padding: "3px 8px", textAlign: "center" }}>{i+1}</td>
                  <td style={{ border: "1px solid #ccc", padding: "3px 8px" }}>
                    {!orig ? <span style={{ background: "#c6f6c6" }}>{en}</span>
                    : !edit ? <span style={{ background: "#ffc6c6", textDecoration: "line-through" }}>{on}</span>
                    : <DiffText oldStr={on} newStr={en} />}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "3px 8px" }}>
                    {!orig ? <span style={{ background: "#c6f6c6" }}>{ea}</span>
                    : !edit ? <span style={{ background: "#ffc6c6", textDecoration: "line-through" }}>{oa}</span>
                    : <DiffText oldStr={oa} newStr={ea} />}
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "3px 8px", textAlign: "center", fontSize: 11 }}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>

      <fieldset style={{ marginBottom: 14 }}>
        <legend><b>조리 순서</b></legend>
        {Array.from({ length: Math.max(o.steps.length, e.steps.length) }, (_, i) => {
          const orig = o.steps[i], edit = e.steps[i];
          const oc = rOrig(orig?.content, 6), ec = rEdit(edit?.content, 6);
          const isAdded = !orig, isDeleted = !edit, isChanged = orig && edit && oc !== ec;
          return (
            <div key={i} style={{ marginBottom: 10, border: "1px solid #ccc", padding: 8, background: isAdded ? "#efffef" : isDeleted ? "#fff0f0" : "" }}>
              <div style={{ marginBottom: 4, fontSize: 12, fontWeight: "bold" }}>
                Step {i+1}
                {isAdded && <span style={{ color: "green", marginLeft: 8 }}>[추가됨]</span>}
                {isDeleted && <span style={{ color: "red", marginLeft: 8 }}>[삭제됨]</span>}
                {isChanged && <span style={{ color: "#996600", marginLeft: 8 }}>[수정됨]</span>}
              </div>
              <div style={{ fontSize: 13 }}>
                {isAdded ? <span style={{ background: "#c6f6c6" }}>{ec}</span>
                : isDeleted ? <span style={{ background: "#ffc6c6", textDecoration: "line-through" }}>{oc}</span>
                : <DiffText oldStr={oc} newStr={ec} />}
              </div>
            </div>
          );
        })}
      </fieldset>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={onBack}>← 편집으로 돌아가기</button>
        <button onClick={onConfirm}>수정 제출</button>
      </div>

      {fnDiff().length > 0 && (
        <div style={{ borderTop: "1px solid #000", paddingTop: 8 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}><b>각주 전체 목록</b></div>
          {fnDiff().map((item, i) => {
            const label = { added: <span style={{ color: "green", marginRight: 4 }}>[추가]</span>, deleted: <span style={{ color: "red", marginRight: 4 }}>[삭제]</span>, modified: <span style={{ color: "#996600", marginRight: 4 }}>[수정]</span> }[item.status];
            return (
              <div key={i} style={{ display: "flex", gap: 6, fontSize: 13, marginBottom: 4, background: rowBg(item.status), padding: "2px 4px" }}>
                <span style={{ minWidth: 28 }}>[{item.num}]</span>
                <span style={{ color: "#555", marginRight: 4 }}>(p.{item.pageIndex+1} {STEPS[item.pageIndex]})</span>
                {label}
                {item.status === "modified" ? <DiffText oldStr={item.origText} newStr={item.editText} />
                : item.status === "deleted" ? <span style={{ textDecoration: "line-through" }}>{item.origText}</span>
                : <span>{(item.editText ?? item.origText) || <i style={{ color: "#aaa" }}>(내용 없음)</i>}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 메인 앱 ──────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState("select");
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [fnMap, setFnMap] = useState({});
  const [fnCounters, setFnCounters] = useState({});

  const fieldRefs = useRef({});
  const lastFocus = useRef(null);
  const pendingCaret = useRef(null);

  useLayoutEffect(() => {
    if (!pendingCaret.current) return;
    const { key, pos } = pendingCaret.current;
    pendingCaret.current = null;
    const el = fieldRefs.current[key]?.current;
    if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });

  const startEdit = () => {
    setForm(JSON.parse(JSON.stringify({
      ...ORIGINAL,
      ingredients: ORIGINAL.ingredients.map(i => ({ ...i })),
      steps: ORIGINAL.steps.map(s => ({ ...s, images: [...s.images] })),
    })));
    const initCounters = {};
    Object.entries(ORIGINAL_FOOTNOTES).forEach(([p, fns]) => {
      initCounters[Number(p)] = Math.max(...fns.map(f => f.num)) + 1;
    });
    setFnMap(JSON.parse(JSON.stringify(ORIGINAL_FOOTNOTES)));
    setFnCounters(initCounters);
    setPage(0); setError("");
    setMode("edit");
  };

  // ── 각주 헬퍼 ────────────────────────────────────────────
  const pageFns = (p) => fnMap[p] ?? [];
  const pageCounter = (p) => fnCounters[p] ?? 1;

  const applyFormUpdate = (p, nextForm, caretKey) => {
    const { fns, nextForm: nf, nextCounter } = syncPage(p, pageFns(p), nextForm);
    setForm(nf);
    setFnMap(m => ({ ...m, [p]: fns }));
    setFnCounters(c => ({ ...c, [p]: nextCounter }));
    if (caretKey && lastFocus.current?.key === caretKey)
      pendingCaret.current = { key: caretKey, pos: lastFocus.current.pos };
  };

  const setField = (k, v, ck) => applyFormUpdate(page, { ...form, [k]: v }, ck);
  const trackCaret = (key) => (e) => { lastFocus.current = { key, pos: e.target.selectionStart }; };
  const setRef = (key) => (el) => { if (!fieldRefs.current[key]) fieldRefs.current[key] = {}; fieldRefs.current[key].current = el; };

  const addIng = () => setForm(f => ({ ...f, ingredients: [...f.ingredients, { id: Date.now(), name: "", amount: "" }] }));
  const removeIng = (id) => applyFormUpdate(page, { ...form, ingredients: form.ingredients.filter(i => i.id !== id) }, null);
  const updateIng = (id, k, v, ck) => applyFormUpdate(page, { ...form, ingredients: form.ingredients.map(i => i.id === id ? { ...i, [k]: v } : i) }, ck);
  const addStep = () => setForm(f => ({ ...f, steps: [...f.steps, { id: Date.now(), content: "", images: [] }] }));
  const removeStep = (id) => applyFormUpdate(page, { ...form, steps: form.steps.filter(s => s.id !== id) }, null);
  const updateStep = (id, v, ck) => applyFormUpdate(page, { ...form, steps: form.steps.map(s => s.id === id ? { ...s, content: v } : s) }, ck);
  const addStepImgs = (id, files) => setForm(f => ({ ...f, steps: f.steps.map(s => s.id === id ? { ...s, images: [...s.images, ...Array.from(files)] } : s) }));
  const removeStepImg = (sid, idx) => setForm(f => ({ ...f, steps: f.steps.map(s => s.id === sid ? { ...s, images: s.images.filter((_, i) => i !== idx) } : s) }));

  const addFootnote = () => {
    const num = pageCounter(page);
    const tag = `[${num}]`;
    let nextForm = { ...form };

    if (lastFocus.current && TEXT_PAGES.has(page)) {
      const { key, pos } = lastFocus.current;
      const el = fieldRefs.current[key]?.current;
      if (el) {
        const newVal = el.value.slice(0, pos) + tag + el.value.slice(pos);
        lastFocus.current = { key, pos: pos + tag.length };
        if (key === "title") nextForm = { ...nextForm, title: newVal };
        else if (key === "description") nextForm = { ...nextForm, description: newVal };
        else if (key.startsWith("ing-name-")) { const id = Number(key.split("-")[2]); nextForm = { ...nextForm, ingredients: nextForm.ingredients.map(i => i.id === id ? { ...i, name: newVal } : i) }; }
        else if (key.startsWith("ing-amount-")) { const id = Number(key.split("-")[2]); nextForm = { ...nextForm, ingredients: nextForm.ingredients.map(i => i.id === id ? { ...i, amount: newVal } : i) }; }
        else if (key.startsWith("step-")) { const id = Number(key.split("-")[1]); nextForm = { ...nextForm, steps: nextForm.steps.map(s => s.id === id ? { ...s, content: newVal } : s) }; }
      }
    }

    const newFn = { id: `fn-${Date.now()}`, num, text: "" };
    const merged = [...pageFns(page), newFn];
    const { fns, nextForm: nf, nextCounter } = syncPage(page, merged, nextForm);
    setForm(nf);
    setFnMap(m => ({ ...m, [page]: fns }));
    setFnCounters(c => ({ ...c, [page]: nextCounter }));
    if (lastFocus.current) pendingCaret.current = { key: lastFocus.current.key, pos: lastFocus.current.pos };
  };

  const updateFnText = (id, v) => setFnMap(m => ({ ...m, [page]: (m[page] ?? []).map(f => f.id === id ? { ...f, text: v } : f) }));

  const removeFn = (id) => {
    const saved = lastFocus.current ? { ...lastFocus.current } : null;
    const { fns, nextForm: nf, nextCounter } = syncPage(page, pageFns(page).filter(f => f.id !== id), form);
    setForm(nf); setFnMap(m => ({ ...m, [page]: fns })); setFnCounters(c => ({ ...c, [page]: nextCounter }));
    if (saved) pendingCaret.current = { key: saved.key, pos: saved.pos };
  };

  // ── 네비 ─────────────────────────────────────────────────
  const validate = () => {
    if (page === 0 && !form.title.trim()) return "제목을 입력하세요.";
    if (page === 2 && !form.category) return "카테고리를 선택하세요.";
    if (page === 3 && !form.difficulty) return "난이도를 선택하세요.";
    if (page === 5 && form.ingredients.some(i => !i.name.trim())) return "재료명을 모두 입력하세요.";
    if (page === 6 && form.steps.some(s => !s.content.trim())) return "조리 순서를 모두 입력하세요.";
    return "";
  };
  const next = () => {
    const e = validate(); if (e) { setError(e); return; }
    setError(""); lastFocus.current = null;
    if (page === STEPS.length - 1) { setMode("diff"); return; }
    setPage(p => p + 1);
  };
  const prev = () => { setError(""); lastFocus.current = null; setPage(p => p - 1); };
  const progress = form ? (page / (STEPS.length - 1)) * 100 : 0;
  const curFns = form ? pageFns(page) : [];
  const curCounter = form ? pageCounter(page) : 1;

  // ── 모드 렌더 ─────────────────────────────────────────────
  if (mode === "select") {
    const origMerged = mergeAllFns(ORIGINAL_FOOTNOTES);
    return (
      <div style={{ fontFamily: "monospace", maxWidth: 600, margin: "0 auto", padding: 24 }}>
        <h2>[모두의 레시피] 레시피 편집</h2><hr />
        <p>아래 레시피를 편집합니다.</p>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginBottom: 16 }}>
          <tbody>
            {[
              ["제목", ORIGINAL.title], ["카테고리", ORIGINAL.category],
              ["난이도", ORIGINAL.difficulty], ["소요시간", ORIGINAL.cookingTime + "분"],
              ["재료 수", ORIGINAL.ingredients.length + "개"], ["조리 단계", ORIGINAL.steps.length + "단계"],
              ["각주 수", origMerged.length + "개"],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", width: 100 }}>{k}</td>
                <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {origMerged.length > 0 && (
          <div style={{ borderTop: "1px solid #000", paddingTop: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}><b>각주 목록</b></div>
            {origMerged.map(f => (
              <div key={f.id} style={{ display: "flex", gap: 6, fontSize: 13, marginBottom: 4 }}>
                <span style={{ minWidth: 28 }}>[{f.globalNum}]</span>
                <span style={{ color: "#555", marginRight: 4 }}>(p.{f.pageIndex+1} {STEPS[f.pageIndex]})</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={startEdit}>편집 시작</button>
      </div>
    );
  }

  if (mode === "diff") return <DiffPage original={ORIGINAL} edited={form} fnMap={fnMap} onBack={() => { setMode("edit"); setPage(STEPS.length - 1); }} onConfirm={() => setMode("done")} />;

  if (mode === "done") {
    const merged = mergeAllFns(fnMap);
    return (
      <div style={{ fontFamily: "monospace", maxWidth: 600, margin: "0 auto", padding: 24 }}>
        <h2>[모두의 레시피] 수정 제출 완료</h2><hr />
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <tbody>
            {[
              ["제목", form.title], ["카테고리", form.category],
              ["난이도", form.difficulty], ["소요시간", form.cookingTime ? form.cookingTime + "분" : "(미입력)"],
              ["재료 수", form.ingredients.length + "개"], ["조리 단계", form.steps.length + "단계"],
              ["상태", "● PENDING — 승인 대기 중"],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ border: "1px solid #ccc", padding: "4px 8px", background: "#f5f5f5", width: 100 }}>{k}</td>
                <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <br /><button onClick={() => setMode("select")}>처음으로</button>
      </div>
    );
  }

  // ── 편집 폼 ──────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "monospace", maxWidth: 600, margin: "0 auto", padding: 24 }}>
      <h2>[모두의 레시피] 레시피 편집</h2><hr />
      <div style={{ marginBottom: 4, fontSize: 12 }}>{STEPS[page]} ({page + 1} / {STEPS.length})</div>
      <div style={{ background: "#ddd", height: 8, borderRadius: 4, marginBottom: 20 }}>
        <div style={{ background: "#000", height: 8, borderRadius: 4, width: progress + "%", transition: "width 0.2s" }} />
      </div>

      <fieldset style={{ minHeight: 180, marginBottom: 8 }}>
        <legend><b>{STEPS[page]}</b></legend>

        {page === 0 && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4 }}>대표 사진</label>
              <input type="file" accept="image/*" onChange={e => setField("photo", e.target.files[0] || null)} />
              <span style={{ fontSize: 11, color: "#555", marginLeft: 6 }}>(더미)</span>
              {form.photo && <div style={{ fontSize: 12, marginTop: 4 }}>선택됨: {form.photo.name}</div>}
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4 }}>제목 *</label>
              <input type="text" value={form.title} ref={setRef("title")}
                onChange={e => { lastFocus.current = { key: "title", pos: e.target.selectionStart }; setField("title", e.target.value, "title"); }}
                onSelect={trackCaret("title")} onKeyUp={trackCaret("title")} onClick={trackCaret("title")}
                style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
        )}

        {page === 1 && (
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>설명</label>
            <textarea value={form.description} ref={setRef("description")}
              onChange={e => { lastFocus.current = { key: "description", pos: e.target.selectionStart }; setField("description", e.target.value, "description"); }}
              onSelect={trackCaret("description")} onKeyUp={trackCaret("description")} onClick={trackCaret("description")}
              rows={5} style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
        )}

        {page === 2 && (
          <div>
            <label style={{ display: "block", marginBottom: 8 }}>카테고리 *</label>
            {CATEGORIES.map(c => <label key={c} style={{ display: "block", marginBottom: 6 }}><input type="radio" name="category" value={c} checked={form.category === c} onChange={() => setField("category", c)} />{" "}{c}</label>)}
          </div>
        )}

        {page === 3 && (
          <div>
            <label style={{ display: "block", marginBottom: 8 }}>난이도 *</label>
            {DIFFICULTIES.map(d => <label key={d} style={{ display: "block", marginBottom: 6 }}><input type="radio" name="difficulty" value={d} checked={form.difficulty === d} onChange={() => setField("difficulty", d)} />{" "}{d}</label>)}
          </div>
        )}

        {page === 4 && (
          <div>
            <label style={{ display: "block", marginBottom: 8 }}>소요시간 <span style={{ fontSize: 12, color: "#555" }}>(선택)</span></label>
            <input type="number" min={1} value={form.cookingTime} onChange={e => setField("cookingTime", e.target.value)} style={{ width: 100 }} />{" "}분
          </div>
        )}

        {page === 5 && (
          <div>
            <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 8 }}>
              <thead><tr>
                <th style={{ border: "1px solid #ccc", padding: 4, width: 36 }}>#</th>
                <th style={{ border: "1px solid #ccc", padding: 4 }}>재료명 *</th>
                <th style={{ border: "1px solid #ccc", padding: 4, width: 110 }}>양</th>
                <th style={{ border: "1px solid #ccc", padding: 4, width: 44 }}>삭제</th>
              </tr></thead>
              <tbody>
                {form.ingredients.map((ing, idx) => {
                  const nk = `ing-name-${ing.id}`, ak = `ing-amount-${ing.id}`;
                  return (
                    <tr key={ing.id}>
                      <td style={{ border: "1px solid #ccc", padding: 4, textAlign: "center" }}>{idx+1}</td>
                      <td style={{ border: "1px solid #ccc", padding: 4 }}>
                        <input type="text" value={ing.name} ref={setRef(nk)}
                          onChange={e => { lastFocus.current = { key: nk, pos: e.target.selectionStart }; updateIng(ing.id, "name", e.target.value, nk); }}
                          onSelect={trackCaret(nk)} onKeyUp={trackCaret(nk)} onClick={trackCaret(nk)}
                          style={{ width: "100%", boxSizing: "border-box" }} />
                      </td>
                      <td style={{ border: "1px solid #ccc", padding: 4 }}>
                        <input type="text" value={ing.amount} ref={setRef(ak)}
                          onChange={e => { lastFocus.current = { key: ak, pos: e.target.selectionStart }; updateIng(ing.id, "amount", e.target.value, ak); }}
                          onSelect={trackCaret(ak)} onKeyUp={trackCaret(ak)} onClick={trackCaret(ak)}
                          style={{ width: "100%", boxSizing: "border-box" }} />
                      </td>
                      <td style={{ border: "1px solid #ccc", padding: 4, textAlign: "center" }}>
                        <button onClick={() => removeIng(ing.id)} disabled={form.ingredients.length === 1}>X</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button onClick={addIng}>+ 재료 추가</button>
          </div>
        )}

        {page === 6 && (
          <div>
            {form.steps.map((step, idx) => {
              const sk = `step-${step.id}`;
              return (
                <div key={step.id} style={{ border: "1px solid #ccc", padding: 8, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ minWidth: 54, paddingTop: 4 }}>Step {idx+1}</span>
                    <textarea value={step.content} ref={setRef(sk)}
                      onChange={e => { lastFocus.current = { key: sk, pos: e.target.selectionStart }; updateStep(step.id, e.target.value, sk); }}
                      onSelect={trackCaret(sk)} onKeyUp={trackCaret(sk)} onClick={trackCaret(sk)}
                      rows={2} style={{ flex: 1 }} />
                    <button onClick={() => removeStep(step.id)} disabled={form.steps.length === 1} style={{ marginTop: 4 }}>X</button>
                  </div>
                  <div style={{ marginLeft: 62 }}>
                    <label style={{ fontSize: 12 }}>이미지 추가{" "}
                      <input type="file" accept="image/*" multiple style={{ fontSize: 12 }} onChange={e => { addStepImgs(step.id, e.target.files); e.target.value = ""; }} />
                    </label>
                    <span style={{ fontSize: 11, color: "#555", marginLeft: 4 }}>(더미)</span>
                    {step.images.map((img, i) => (
                      <div key={i} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                        <span>📷 {img.name}</span>
                        <button style={{ fontSize: 11 }} onClick={() => removeStepImg(step.id, i)}>삭제</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <button onClick={addStep}>+ 단계 추가</button>
          </div>
        )}

        {page === 7 && (() => {
          const merged = mergeAllFns(fnMap);
          return (
            <div>
              <p style={{ marginTop: 0 }}>편집을 완료하고 변경 내용을 확인합니다.</p>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <tbody>
                  {[
                    ["제목", form.title], ["설명", form.description || "(없음)"],
                    ["카테고리", form.category], ["난이도", form.difficulty],
                    ["소요시간", form.cookingTime ? form.cookingTime + "분" : "(미입력)"],
                    ["재료 수", form.ingredients.length + "개"],
                    ["조리 단계", form.steps.length + "단계"],
                    ["각주 수", merged.length + "개"],
                  ].map(([k, v]) => (
                    <tr key={k}><td style={{ border: "1px solid #ccc", padding: "3px 8px", background: "#f5f5f5", width: 100 }}>{k}</td><td style={{ border: "1px solid #ccc", padding: "3px 8px" }}>{v}</td></tr>
                  ))}
                </tbody>
              </table>
              {merged.length > 0 && (
                <div style={{ borderTop: "1px solid #000", marginTop: 12, paddingTop: 8 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><b>각주 전체 목록</b></div>
                  {merged.map(f => (
                    <div key={f.id} style={{ display: "flex", gap: 6, fontSize: 13, marginBottom: 4 }}>
                      <span style={{ minWidth: 28 }}>[{f.globalNum}]</span>
                      <span style={{ color: "#555", marginRight: 4 }}>(p.{f.pageIndex+1} {STEPS[f.pageIndex]})</span>
                      <span>{f.text || <i style={{ color: "#aaa" }}>(내용 없음)</i>}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 12, marginTop: 10 }}>다음을 누르면 변경 내용 diff 화면으로 이동합니다.</p>
            </div>
          );
        })()}
      </fieldset>

      {page < 7 && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={addFootnote}>+ 각주 추가</button>
          {TEXT_PAGES.has(page)
            ? <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>커서 위치에 태그 삽입</span>
            : <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>푸터에 각주만 추가됩니다</span>}
        </div>
      )}

      {error && <div style={{ color: "red", fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={page === 0 ? () => setMode("select") : prev}>← {page === 0 ? "목록으로" : "이전"}</button>
        <button onClick={next}>{page === STEPS.length - 1 ? "변경 내용 확인 →" : "다음 →"}</button>
      </div>

      {curFns.length > 0 && (
        <div style={{ borderTop: "1px solid #000", paddingTop: 8 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}><b>이 페이지 각주</b></div>
          {curFns.map(f => (
            <div key={f.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6, fontSize: 13 }}>
              <span style={{ minWidth: 28, paddingTop: 2 }}>[{f.num}]</span>
              <input type="text" value={f.text} onChange={e => updateFnText(f.id, e.target.value)} placeholder="각주 내용을 입력하세요" style={{ flex: 1 }} />
              <button style={{ fontSize: 11 }} onClick={() => removeFn(f.id)}>삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}