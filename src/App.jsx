import { useState, useRef } from 'react';

const CATEGORIES = [
  '한식',
  '양식',
  '중식',
  '일식',
  '분식',
  '디저트',
  '음료',
  '기타',
];
const DIFFICULTIES = ['쉬움', '보통', '어려움'];
const STEPS = [
  '대표 사진 + 제목',
  '설명',
  '카테고리',
  '난이도',
  '소요시간',
  '재료 목록',
  '조리 순서',
  '제출',
];
// 텍스트 커서 삽입 가능한 페이지
const TEXT_PAGES = new Set([0, 1, 5, 6]);

const initial = {
  photo: null,
  title: '',
  description: '',
  category: '',
  difficulty: '',
  cookingTime: '',
  ingredients: [{ id: 1, name: '', amount: '' }],
  steps: [{ id: 1, content: '', images: [] }],
};

export default function App() {
  const [page, setPage] = useState(0);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // 페이지별 독립 각주: { [pageIndex]: [{id, num, text}] }
  const [fnMap, setFnMap] = useState({});
  // 페이지별 카운터 (다음 번호)
  const [fnCounters, setFnCounters] = useState({});

  const activeRef = useRef(null);
  const caretRef = useRef(null);

  // ── 각주 헬퍼 ────────────────────────────────────────────────
  const pageFns = (p) => fnMap[p] ?? [];
  const pageCounter = (p) => fnCounters[p] ?? 1;

  // 텍스트에서 [N] 태그 존재 여부로 해당 페이지 각주 정리 + 재번호
  const syncPage = (p, nextFns, nextForm) => {
    // 해당 페이지의 텍스트 수집
    let texts = [];
    if (p === 0) texts = [nextForm.title];
    if (p === 1) texts = [nextForm.description];
    if (p === 5)
      texts = nextForm.ingredients.flatMap((i) => [i.name, i.amount]);
    if (p === 6) texts = nextForm.steps.map((s) => s.content);
    const combined = texts.join('\n');

    let fns = nextFns;
    if (TEXT_PAGES.has(p)) {
      // 태그 없는 각주 제거
      const used = new Set();
      for (const m of combined.matchAll(/\[(\d+)\]/g)) used.add(Number(m[1]));
      fns = fns.filter((f) => used.has(f.num));

      // 본문 등장 순서로 정렬
      const ordered = [];
      const seen = new Set();
      for (const m of combined.matchAll(/\[(\d+)\]/g)) {
        const n = Number(m[1]);
        if (!seen.has(n)) {
          seen.add(n);
          ordered.push(n);
        }
      }
      fns.sort((a, b) => ordered.indexOf(a.num) - ordered.indexOf(b.num));

      // 재번호 매핑
      const mapping = new Map();
      fns.forEach((f, i) => mapping.set(f.num, i + 1));

      if (mapping.size > 0) {
        // 본문 치환 (임시 토큰)
        const applyMap = (text) => {
          if (!text) return text;
          let t = text;
          mapping.forEach((_, oldN) => {
            t = t.replace(new RegExp(`\\[${oldN}\\]`, 'g'), `{{${oldN}}}`);
          });
          mapping.forEach((newN, oldN) => {
            t = t.replace(new RegExp(`\\{\\{${oldN}\\}\\}`, 'g'), `[${newN}]`);
          });
          return t;
        };
        if (p === 0)
          nextForm = { ...nextForm, title: applyMap(nextForm.title) };
        if (p === 1)
          nextForm = {
            ...nextForm,
            description: applyMap(nextForm.description),
          };
        if (p === 5)
          nextForm = {
            ...nextForm,
            ingredients: nextForm.ingredients.map((i) => ({
              ...i,
              name: applyMap(i.name),
              amount: applyMap(i.amount),
            })),
          };
        if (p === 6)
          nextForm = {
            ...nextForm,
            steps: nextForm.steps.map((s) => ({
              ...s,
              content: applyMap(s.content),
            })),
          };
        fns = fns.map((f) => ({ ...f, num: mapping.get(f.num) }));
      }
    } else {
      // 비텍스트 페이지: 그냥 순서대로 재번호
      const mapping = new Map();
      fns.forEach((f, i) => mapping.set(f.num, i + 1));
      fns = fns.map((f) => ({ ...f, num: mapping.get(f.num) }));
    }

    // 다음 카운터 = 현재 최대 번호 + 1
    const nextCounter =
      fns.length > 0 ? Math.max(...fns.map((f) => f.num)) + 1 : 1;
    return { fns, nextForm, nextCounter };
  };

  const applyFormUpdate = (p, nextForm) => {
    const {
      fns,
      nextForm: nf,
      nextCounter,
    } = syncPage(p, pageFns(p), nextForm);
    setForm(nf);
    setFnMap((m) => ({ ...m, [p]: fns }));
    setFnCounters((c) => ({ ...c, [p]: nextCounter }));
  };

  // ── 필드 업데이트 ─────────────────────────────────────────────
  const setField = (k, v) => applyFormUpdate(page, { ...form, [k]: v });

  const addIng = () =>
    setForm((f) => ({
      ...f,
      ingredients: [...f.ingredients, { id: Date.now(), name: '', amount: '' }],
    }));
  const removeIng = (id) =>
    applyFormUpdate(page, {
      ...form,
      ingredients: form.ingredients.filter((i) => i.id !== id),
    });
  const updateIng = (id, k, v) =>
    applyFormUpdate(page, {
      ...form,
      ingredients: form.ingredients.map((i) =>
        i.id === id ? { ...i, [k]: v } : i
      ),
    });

  const addStep = () =>
    setForm((f) => ({
      ...f,
      steps: [...f.steps, { id: Date.now(), content: '', images: [] }],
    }));
  const removeStep = (id) =>
    applyFormUpdate(page, {
      ...form,
      steps: form.steps.filter((s) => s.id !== id),
    });
  const updateStep = (id, v) =>
    applyFormUpdate(page, {
      ...form,
      steps: form.steps.map((s) => (s.id === id ? { ...s, content: v } : s)),
    });
  const addStepImgs = (id, files) =>
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s) =>
        s.id === id ? { ...s, images: [...s.images, ...Array.from(files)] } : s
      ),
    }));
  const removeStepImg = (sid, idx) =>
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s) =>
        s.id === sid
          ? { ...s, images: s.images.filter((_, i) => i !== idx) }
          : s
      ),
    }));

  // ── 각주 추가 ─────────────────────────────────────────────────
  const trackCaret = (e) => {
    activeRef.current = e.target;
    caretRef.current = {
      start: e.target.selectionStart,
      end: e.target.selectionEnd,
    };
  };

  const addFootnote = () => {
    const num = pageCounter(page);
    const tag = `[${num}]`;
    let nextForm = { ...form };

    if (
      activeRef.current &&
      caretRef.current !== null &&
      TEXT_PAGES.has(page)
    ) {
      const el = activeRef.current;
      const { start, end } = caretRef.current;
      const val = el.value;
      const newVal = val.slice(0, start) + tag + val.slice(end);
      const fieldKey = el.dataset.fieldkey;
      const stepId = el.dataset.stepid ? Number(el.dataset.stepid) : null;
      const ingId = el.dataset.ingid ? Number(el.dataset.ingid) : null;
      const ingField = el.dataset.ingfield;

      if (fieldKey) nextForm = { ...nextForm, [fieldKey]: newVal };
      else if (stepId)
        nextForm = {
          ...nextForm,
          steps: nextForm.steps.map((s) =>
            s.id === stepId ? { ...s, content: newVal } : s
          ),
        };
      else if (ingId)
        nextForm = {
          ...nextForm,
          ingredients: nextForm.ingredients.map((i) =>
            i.id === ingId ? { ...i, [ingField]: newVal } : i
          ),
        };

      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    }

    const newFn = { id: Date.now(), num, text: '' };
    const merged = [...pageFns(page), newFn];
    const { fns, nextForm: nf, nextCounter } = syncPage(page, merged, nextForm);
    setForm(nf);
    setFnMap((m) => ({ ...m, [page]: fns }));
    setFnCounters((c) => ({ ...c, [page]: nextCounter }));
  };

  const updateFnText = (id, v) =>
    setFnMap((m) => ({
      ...m,
      [page]: (m[page] ?? []).map((f) => (f.id === id ? { ...f, text: v } : f)),
    }));

  const removeFn = (id) => {
    const remaining = pageFns(page).filter((f) => f.id !== id);
    const { fns, nextForm: nf, nextCounter } = syncPage(page, remaining, form);
    setForm(nf);
    setFnMap((m) => ({ ...m, [page]: fns }));
    setFnCounters((c) => ({ ...c, [page]: nextCounter }));
  };

  // ── 마지막 페이지 전체 각주 합산 (페이지 순서대로 재번호) ──────
  const mergedFns = () => {
    let counter = 1;
    const result = [];
    for (let p = 0; p < STEPS.length - 1; p++) {
      (fnMap[p] ?? []).forEach((f) => {
        result.push({ ...f, globalNum: counter++, pageIndex: p });
      });
    }
    return result;
  };

  // ── 네비 ──────────────────────────────────────────────────────
  const validate = () => {
    if (page === 0 && !form.title.trim()) return '제목을 입력하세요.';
    if (page === 2 && !form.category) return '카테고리를 선택하세요.';
    if (page === 3 && !form.difficulty) return '난이도를 선택하세요.';
    if (page === 5 && form.ingredients.some((i) => !i.name.trim()))
      return '재료명을 모두 입력하세요.';
    if (page === 6 && form.steps.some((s) => !s.content.trim()))
      return '조리 순서를 모두 입력하세요.';
    return '';
  };
  const next = () => {
    const e = validate();
    if (e) {
      setError(e);
      return;
    }
    setError('');
    activeRef.current = null;
    caretRef.current = null;
    setPage((p) => p + 1);
  };
  const prev = () => {
    setError('');
    activeRef.current = null;
    caretRef.current = null;
    setPage((p) => p - 1);
  };

  const progress = (page / (STEPS.length - 1)) * 100;
  const curFns = pageFns(page);
  const curCounter = pageCounter(page);

  // ── 제출 완료 ─────────────────────────────────────────────────
  if (submitted) {
    const mfns = mergedFns();
    return (
      <div
        style={{
          fontFamily: 'monospace',
          maxWidth: 600,
          margin: '0 auto',
          padding: 24,
        }}
      >
        <h2>[모두의 레시피] 제출 완료</h2>
        <hr />
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {[
              ['제목', form.title],
              ['설명', form.description || '(없음)'],
              ['카테고리', form.category],
              ['난이도', form.difficulty],
              [
                '소요시간',
                form.cookingTime ? form.cookingTime + '분' : '(미입력)',
              ],
              ['대표 사진', form.photo ? form.photo.name : '(없음)'],
              ['재료 수', form.ingredients.length + '개'],
              ['조리 단계', form.steps.length + '단계'],
              ['각주 수', mfns.length + '개'],
              ['상태', '● PENDING — 승인 대기 중'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td
                  style={{
                    border: '1px solid #ccc',
                    padding: '4px 8px',
                    background: '#f5f5f5',
                    width: 110,
                  }}
                >
                  {k}
                </td>
                <td style={{ border: '1px solid #ccc', padding: '4px 8px' }}>
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {mfns.length > 0 && (
          <div
            style={{
              marginTop: 16,
              borderTop: '1px solid #000',
              paddingTop: 8,
            }}
          >
            <b>각주 전체 목록</b>
            {mfns.map((f) => (
              <div key={f.id} style={{ fontSize: 12, marginTop: 4 }}>
                [{f.globalNum}] (p.{f.pageIndex + 1} {STEPS[f.pageIndex]}){' '}
                {f.text || <i style={{ color: '#888' }}>(내용 없음)</i>}
              </div>
            ))}
          </div>
        )}
        <br />
        <button
          onClick={() => {
            setForm(initial);
            setPage(0);
            setSubmitted(false);
            setFnMap({});
            setFnCounters({});
          }}
        >
          새 레시피 작성
        </button>
      </div>
    );
  }

  // ── 메인 ─────────────────────────────────────────────────────
  return (
    <div
      style={{
        fontFamily: 'monospace',
        maxWidth: 600,
        margin: '0 auto',
        padding: 24,
      }}
    >
      <h2>[모두의 레시피] 레시피 작성</h2>
      <hr />

      <div style={{ marginBottom: 4, fontSize: 12 }}>
        {STEPS[page]} ({page + 1} / {STEPS.length})
      </div>
      <div
        style={{
          background: '#ddd',
          height: 8,
          borderRadius: 4,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: '#000',
            height: 8,
            borderRadius: 4,
            width: progress + '%',
            transition: 'width 0.2s',
          }}
        />
      </div>

      <fieldset style={{ minHeight: 180, marginBottom: 8 }}>
        <legend>
          <b>{STEPS[page]}</b>
        </legend>

        {page === 0 && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>
                대표 사진
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setField('photo', e.target.files[0] || null)}
              />
              <span style={{ fontSize: 11, color: '#555', marginLeft: 6 }}>
                (더미)
              </span>
              {form.photo && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  선택됨: {form.photo.name}
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>
                제목 *
              </label>
              <input
                type="text"
                value={form.title}
                data-fieldkey="title"
                onChange={(e) => setField('title', e.target.value)}
                onSelect={trackCaret}
                onKeyUp={trackCaret}
                onClick={trackCaret}
                placeholder="레시피 제목을 입력하세요"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        )}

        {page === 1 && (
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>
              설명 <span style={{ fontSize: 12, color: '#555' }}>(선택)</span>
            </label>
            <textarea
              value={form.description}
              data-fieldkey="description"
              onChange={(e) => setField('description', e.target.value)}
              onSelect={trackCaret}
              onKeyUp={trackCaret}
              onClick={trackCaret}
              placeholder="레시피에 대한 간단한 설명을 입력하세요"
              rows={5}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {page === 2 && (
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>
              카테고리 *
            </label>
            {CATEGORIES.map((c) => (
              <label key={c} style={{ display: 'block', marginBottom: 6 }}>
                <input
                  type="radio"
                  name="category"
                  value={c}
                  checked={form.category === c}
                  onChange={() => setField('category', c)}
                />{' '}
                {c}
              </label>
            ))}
          </div>
        )}

        {page === 3 && (
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>
              난이도 *
            </label>
            {DIFFICULTIES.map((d) => (
              <label key={d} style={{ display: 'block', marginBottom: 6 }}>
                <input
                  type="radio"
                  name="difficulty"
                  value={d}
                  checked={form.difficulty === d}
                  onChange={() => setField('difficulty', d)}
                />{' '}
                {d}
              </label>
            ))}
          </div>
        )}

        {page === 4 && (
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>
              소요시간{' '}
              <span style={{ fontSize: 12, color: '#555' }}>(선택)</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.cookingTime}
              onChange={(e) => setField('cookingTime', e.target.value)}
              placeholder="예: 30"
              style={{ width: 100 }}
            />{' '}
            분
          </div>
        )}

        {page === 5 && (
          <div>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                marginBottom: 8,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{ border: '1px solid #ccc', padding: 4, width: 36 }}
                  >
                    #
                  </th>
                  <th style={{ border: '1px solid #ccc', padding: 4 }}>
                    재료명 *
                  </th>
                  <th
                    style={{ border: '1px solid #ccc', padding: 4, width: 110 }}
                  >
                    양
                  </th>
                  <th
                    style={{ border: '1px solid #ccc', padding: 4, width: 44 }}
                  >
                    삭제
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.ingredients.map((ing, idx) => (
                  <tr key={ing.id}>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: 4,
                        textAlign: 'center',
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: 4 }}>
                      <input
                        type="text"
                        value={ing.name}
                        data-ingid={ing.id}
                        data-ingfield="name"
                        onChange={(e) =>
                          updateIng(ing.id, 'name', e.target.value)
                        }
                        onSelect={trackCaret}
                        onKeyUp={trackCaret}
                        onClick={trackCaret}
                        placeholder="예: 달걀"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: 4 }}>
                      <input
                        type="text"
                        value={ing.amount}
                        data-ingid={ing.id}
                        data-ingfield="amount"
                        onChange={(e) =>
                          updateIng(ing.id, 'amount', e.target.value)
                        }
                        onSelect={trackCaret}
                        onKeyUp={trackCaret}
                        onClick={trackCaret}
                        placeholder="예: 2개"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                      />
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: 4,
                        textAlign: 'center',
                      }}
                    >
                      <button
                        onClick={() => removeIng(ing.id)}
                        disabled={form.ingredients.length === 1}
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addIng}>+ 재료 추가</button>
          </div>
        )}

        {page === 6 && (
          <div>
            {form.steps.map((step, idx) => (
              <div
                key={step.id}
                style={{
                  border: '1px solid #ccc',
                  padding: 8,
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ minWidth: 54, paddingTop: 4 }}>
                    Step {idx + 1}
                  </span>
                  <textarea
                    value={step.content}
                    data-stepid={step.id}
                    onChange={(e) => updateStep(step.id, e.target.value)}
                    onSelect={trackCaret}
                    onKeyUp={trackCaret}
                    onClick={trackCaret}
                    placeholder={`${idx + 1}번째 조리 단계`}
                    rows={2}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => removeStep(step.id)}
                    disabled={form.steps.length === 1}
                    style={{ marginTop: 4 }}
                  >
                    X
                  </button>
                </div>
                <div style={{ marginLeft: 62 }}>
                  <label style={{ fontSize: 12 }}>
                    이미지 추가{' '}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ fontSize: 12 }}
                      onChange={(e) => {
                        addStepImgs(step.id, e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>
                    (더미)
                  </span>
                  {step.images.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {step.images.map((img, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: 12,
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                            marginBottom: 2,
                          }}
                        >
                          <span>📷 {img.name}</span>
                          <button
                            style={{ fontSize: 11 }}
                            onClick={() => removeStepImg(step.id, i)}
                          >
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <button onClick={addStep}>+ 단계 추가</button>
          </div>
        )}

        {page === 7 && (
          <div>
            <p style={{ marginTop: 0 }}>아래 내용으로 레시피를 제출합니다.</p>
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: 13,
              }}
            >
              <tbody>
                {[
                  ['제목', form.title],
                  ['설명', form.description || '(없음)'],
                  ['카테고리', form.category],
                  ['난이도', form.difficulty],
                  [
                    '소요시간',
                    form.cookingTime ? form.cookingTime + '분' : '(미입력)',
                  ],
                  ['대표 사진', form.photo ? form.photo.name : '(없음)'],
                  ['재료 수', form.ingredients.length + '개'],
                  ['조리 단계', form.steps.length + '단계'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 8px',
                        background: '#f5f5f5',
                        width: 100,
                      }}
                    >
                      {k}
                    </td>
                    <td
                      style={{ border: '1px solid #ccc', padding: '3px 8px' }}
                    >
                      {v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 12, marginTop: 10 }}>
              제출 후 상태: <b>PENDING — 승인 대기 중</b>
            </p>
          </div>
        )}
      </fieldset>

      {/* 각주 추가 버튼 */}
      {page < 7 && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={addFootnote}>+ 각주 추가 [{curCounter}]</button>
          {TEXT_PAGES.has(page) ? (
            <span style={{ fontSize: 11, color: '#555', marginLeft: 8 }}>
              커서 위치에 [{curCounter}] 삽입 후 아래에 내용 입력
            </span>
          ) : (
            <span style={{ fontSize: 11, color: '#555', marginLeft: 8 }}>
              푸터에 각주만 추가됩니다
            </span>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: 'red', fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <button onClick={prev} disabled={page === 0}>
          ← 이전
        </button>
        {page < STEPS.length - 1 ? (
          <button onClick={next}>다음 →</button>
        ) : (
          <button onClick={() => setSubmitted(true)}>레시피 제출</button>
        )}
      </div>

      {/* 푸터 각주 — 제출 페이지는 mergedFns 표시 */}
      {page === 7
        ? mergedFns().length > 0 && (
            <div style={{ borderTop: '1px solid #000', paddingTop: 8 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <b>각주 전체 목록</b>
              </div>
              {mergedFns().map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    gap: 6,
                    fontSize: 13,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ minWidth: 28 }}>[{f.globalNum}]</span>
                  <span style={{ color: '#555', marginRight: 4 }}>
                    (p.{f.pageIndex + 1} {STEPS[f.pageIndex]})
                  </span>
                  <span>
                    {f.text || <i style={{ color: '#aaa' }}>(내용 없음)</i>}
                  </span>
                </div>
              ))}
            </div>
          )
        : curFns.length > 0 && (
            <div style={{ borderTop: '1px solid #000', paddingTop: 8 }}>
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                <b>이 페이지 각주</b>
              </div>
              {curFns.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'flex-start',
                    marginBottom: 6,
                    fontSize: 13,
                  }}
                >
                  <span style={{ minWidth: 28, paddingTop: 2 }}>[{f.num}]</span>
                  <input
                    type="text"
                    value={f.text}
                    onChange={(e) => updateFnText(f.id, e.target.value)}
                    placeholder="각주 내용을 입력하세요"
                    style={{ flex: 1 }}
                  />
                  <button
                    style={{ fontSize: 11 }}
                    onClick={() => removeFn(f.id)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}
