// ============================================================
//  قراءة ملف Excel بقالب منصة التدريب على الاختبارات (STEM / English / Arabic)
//  الأوراق: Exam_Info + Passages + Questions — مع استخراج الصور تلقائياً:
//   1) صور عائمة فوق الخلية   2) صور «Place in Cell» في Excel 365
//   3) صور WPS ‎(=DISPIMG)‎      4) رابط https مكتوب في خلية Image
// ============================================================
let zipLib = null;
export async function JSZipLib() {
  if (window.JSZip) return window.JSZip;
  if (!zipLib) zipLib = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"; s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error("تعذّر تحميل قارئ ملفات Excel — تحقق من الاتصال بالإنترنت")); document.head.appendChild(s); });
  return zipLib;
}
const norm = (h) => String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
const X = (txt) => new DOMParser().parseFromString(txt, "application/xml");
const tags = (node, name) => (node ? [...node.getElementsByTagNameNS("*", name)] : []);
const tag = (node, name) => tags(node, name)[0] || null;
const attr = (el, name) => (el ? el.getAttribute(name) ?? [...el.attributes].find((a) => a.localName === name)?.value ?? null : null);
const RID = (el, name = "id") => { if (!el) return null; for (const a of el.attributes) if (a.localName === name && /relationships/.test(a.namespaceURI || "")) return a.value; return el.getAttribute("r:" + name); };
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const joinPath = (base, rel) => { if (rel.startsWith("/")) return rel.slice(1); const out = []; for (const s of (base ? base + "/" : "").concat(rel).split("/")) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); } return out.join("/"); };
const relsPathOf = (p) => `${dirOf(p) ? dirOf(p) + "/" : ""}_rels/${p.split("/").pop()}.rels`;
const colIdx = (ref) => { const m = String(ref).match(/^([A-Z]+)(\d+)$/); if (!m) return [0, 0]; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [c - 1, +m[2] - 1]; };
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", emf: "image/emf", wmf: "image/wmf" };

async function readRels(zip, path) {
  const f = zip.file(relsPathOf(path)); if (!f) return {};
  const d = X(await f.async("string")), out = {};
  tags(d, "Relationship").forEach((r) => { out[r.getAttribute("Id")] = { target: joinPath(dirOf(path), r.getAttribute("Target")), type: r.getAttribute("Type") || "", external: r.getAttribute("TargetMode") === "External" }; });
  return out;
}
async function media(zip, path) {
  const f = zip.file(path); if (!f) return null;
  const ext = (path.split(".").pop() || "png").toLowerCase();
  return { blob: new Blob([await f.async("uint8array")], { type: MIME[ext] || "application/octet-stream" }), ext, name: path.split("/").pop() };
}

export async function parseExamXlsx(buf) {
  const JSZip = await JSZipLib();
  const zip = await JSZip.loadAsync(buf);
  const errors = [], warnings = [];
  const wbPath = "xl/workbook.xml";
  if (!zip.file(wbPath)) throw new Error("الملف ليس ملف Excel صالحاً (xlsx)");
  const wb = X(await zip.file(wbPath).async("string")), wbRels = await readRels(zip, wbPath);
  const sheets = tags(wb, "sheet").map((s) => ({ name: s.getAttribute("name"), path: wbRels[RID(s)]?.target }));
  // النصوص المشتركة
  let shared = [];
  if (zip.file("xl/sharedStrings.xml")) shared = tags(X(await zip.file("xl/sharedStrings.xml").async("string")), "si").map((si) => tags(si, "t").filter((t) => t.parentNode.localName !== "rPh").map((t) => t.textContent).join(""));
  // صور Excel 365 داخل الخلية (vm)
  const cellImgByVm = await richCellImages(zip);
  // صور WPS
  const wpsImgs = await wpsCellImages(zip);

  async function readSheet(sh) {
    const d = X(await zip.file(sh.path).async("string"));
    const rows = []; const vmAt = {}; const dispAt = {};
    tags(d, "row").forEach((r) => tags(r, "c").forEach((c) => {
      const [ci, ri] = colIdx(c.getAttribute("r")); const t = c.getAttribute("t"); let v = tag(c, "v")?.textContent ?? "";
      if (t === "s") v = shared[+v] ?? ""; else if (t === "inlineStr") v = tags(tag(c, "is"), "t").map((x) => x.textContent).join(""); else if (t === "b") v = v === "1" ? "TRUE" : "FALSE";
      const f = tag(c, "f")?.textContent || "";
      const dm = f.match(/DISPIMG\(\s*"([^"]+)"/i); if (dm) { dispAt[`${ri}:${ci}`] = dm[1]; v = ""; }
      if (c.getAttribute("vm")) { vmAt[`${ri}:${ci}`] = +c.getAttribute("vm"); if (/^#VALUE!?$/.test(v)) v = ""; }
      (rows[ri] ||= [])[ci] = v;
    }));
    // صور عائمة
    const floatAt = {}; const rels = await readRels(zip, sh.path);
    for (const dr of tags(d, "drawing")) {
      const dp = rels[RID(dr)]?.target; if (!dp || !zip.file(dp)) continue;
      const dd = X(await zip.file(dp).async("string")), drels = await readRels(zip, dp);
      for (const an of [...tags(dd, "twoCellAnchor"), ...tags(dd, "oneCellAnchor"), ...tags(dd, "absoluteAnchor")]) {
        const from = tag(an, "from"); const blip = tag(an, "blip"); if (!from || !blip) continue;
        const r = +tag(from, "row").textContent, c = +tag(from, "col").textContent, target = drels[RID(blip, "embed")]?.target;
        if (target) (floatAt[r] ||= []).push({ c, target });
      }
    }
    return { rows, vmAt, dispAt, floatAt };
  }
  const find = (re) => sheets.find((s) => re.test(norm(s.name)));
  const infoSh = find(/^exam_?info|معلومات/), qSh = find(/^questions?$|^الأسئلة|^اسئلة|^أسئلة/) || sheets.find((s) => !/info|passage|instruction|تعليمات|نص/i.test(s.name)), pSh = find(/^passages?$|النصوص/);
  if (!qSh) throw new Error("لم أجد ورقة الأسئلة (Questions) في الملف");

  // معلومات الاختبار
  const info = {};
  if (infoSh) { const { rows } = await readSheet(infoSh); rows.forEach((r, i) => { if (!r || !i) return; const k = norm(r[0]); if (k && k !== "field") info[k] = String(r[1] ?? "").trim(); }); }
  // النصوص (Passages)
  const passages = {};
  if (pSh) { const { rows } = await readSheet(pSh); const H = (rows[0] || []).map(norm); const ix = (n) => H.indexOf(n);
    rows.slice(1).forEach((r) => { if (!r) return; const id = String(r[ix("passage_id")] ?? "").trim(); if (!id) return; passages[id] = { title: String(r[ix("passage_title")] ?? ""), en: String(r[ix("passage_en")] ?? r[ix("passage")] ?? ""), ar: String(r[ix("passage_ar")] ?? "") }; }); }

  // الأسئلة
  const S = await readSheet(qSh);
  const H = (S.rows[0] || []).map(norm); const ix = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; } return -1; };
  const C = { num: ix("q_num", "q_no", "no", "#"), part: ix("section_part", "section", "part"), topic: ix("topic"), oc: ix("outcome_code", "lo_code"), ol: ix("outcome_label", "outcome", "learning_outcome"), pid: ix("passage_id"),
    en: ix("question_en", "question"), ar: ix("question_ar", "السؤال"), img: ix("image", "question_image", "image_url"), correct: ix("correct_option", "correct", "answer"), marks: ix("marks", "points", "mark"), fb: ix("feedback", "explanation"), hint: ix("hint") };
  const L = ["a", "b", "c", "d", "e", "f"];
  const optE = L.map((l) => ix("option_" + l, "option_" + l + "_en")), optA = L.map((l) => ix("option_" + l + "_ar")), optI = L.map((l) => ix("image_" + l, "option_" + l + "_image"));
  if (C.en < 0 && C.ar < 0) throw new Error("لم أجد عمود نص السؤال (Question_EN أو Question_AR) في الصف الأول من ورقة الأسئلة");
  const images = {}; let imgN = 0;
  const imgFor = async (ri, ci) => {
    const key = `${ri}:${ci}`;
    if (S.vmAt[key] && cellImgByVm[S.vmAt[key]]) { const m = await media(zip, cellImgByVm[S.vmAt[key]]); if (m) { const k = "img" + ++imgN; images[k] = m; return "@" + k; } }
    if (S.dispAt[key] && wpsImgs[S.dispAt[key]]) { const m = await media(zip, wpsImgs[S.dispAt[key]]); if (m) { const k = "img" + ++imgN; images[k] = m; return "@" + k; } }
    const fl = (S.floatAt[ri] || []).find((f) => f.c === ci); if (fl) { const m = await media(zip, fl.target); if (m) { const k = "img" + ++imgN; images[k] = m; return "@" + k; } }
    const txt = String(S.rows[ri]?.[ci] ?? "").trim(); if (/^https:\/\//i.test(txt)) return txt;
    return "";
  };
  const questions = [];
  for (let ri = 1; ri < S.rows.length; ri++) {
    const r = S.rows[ri]; if (!r) continue; const g = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const en = g(C.en), ar = g(C.ar);
    const oe = optE.map(g), oa = optA.map(g);
    let n = 0; for (let j = 0; j < 6; j++) if (oe[j] || oa[j] || (optI[j] >= 0 && (S.vmAt[`${ri}:${optI[j]}`] || S.dispAt[`${ri}:${optI[j]}`] || (S.floatAt[ri] || []).some((f) => f.c === optI[j])))) n = j + 1;
    if (!en && !ar && !n) continue;
    const row = ri + 1;
    if (!en && !ar) { errors.push(`الصف ${row}: لا يوجد نص للسؤال`); continue; }
    if (n < 2) { errors.push(`الصف ${row}: يجب وجود خيارين على الأقل`); continue; }
    const cr = g(C.correct).toUpperCase().replace(/[^A-Fأبجدهـ1-6]/g, "");
    const ans = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, "أ": 0, "ب": 1, "ج": 2, "د": 3, "ه": 4, "هـ": 4, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }[cr.slice(0, cr.startsWith("هـ") ? 2 : 1)];
    if (ans == null || ans >= n) { errors.push(`الصف ${row}: الإجابة الصحيحة (Correct_Option) غير صحيحة «${g(C.correct)}»`); continue; }
    const optImgs = []; for (let j = 0; j < n; j++) optImgs.push(optI[j] >= 0 ? await imgFor(ri, optI[j]) : "");
    let qimg = C.img >= 0 ? await imgFor(ri, C.img) : "";
    // صورة عائمة في عمود آخر غير أعمدة الخيارات → تُعتبر صورة السؤال
    if (!qimg && (S.floatAt[ri] || []).length) { const used = new Set([C.img, ...optI]); const fl = S.floatAt[ri].find((f) => !used.has(f.c)); if (fl) { const m = await media(zip, fl.target); if (m) { const k = "img" + ++imgN; images[k] = m; qimg = "@" + k; } } }
    const marks = parseFloat(g(C.marks)) || 1;
    const pid = g(C.pid);
    if (pid && !passages[pid]) warnings.push(`الصف ${row}: النص ${pid} غير موجود في ورقة Passages`);
    if (!g(C.oc) && !g(C.ol)) warnings.push(`الصف ${row}: لا يوجد ناتج تعلم`);
    questions.push({ row, text: ar || en, text_en: ar && en ? en : "", options: Array.from({ length: n }, (_, j) => oa[j] || oe[j] || (optImgs[j] ? "" : "—")), options_en: oa.slice(0, n).some(Boolean) ? oe.slice(0, n) : [],
      optionImages: optImgs.some(Boolean) ? optImgs : [], image: qimg, answer: ans, points: marks, outcome: g(C.ol), ocode: g(C.oc), topic: g(C.topic), section: g(C.part), passage: pid && passages[pid] ? pid : "", explanation: g(C.fb), hint: g(C.hint) });
  }
  if (!questions.length && !errors.length) errors.push("لا توجد أسئلة في الملف");
  const yes = (k, d) => { const v = norm(info[k]); return !v ? d : /^(yes|y|true|1|نعم)$/.test(v); };
  const config = {
    title: info.exam_title || "", subject: info.subject || "", grade: info.grade || "", track: info.track || "", term: info.term || "", teacher: info.teacher_name || "", code: info.exam_code || "",
    duration: parseInt(info.duration_minutes) || 0, passPct: Math.min(100, Math.max(0, parseInt(info.passing_percent) || 50)),
    calculator: yes("calculator_allowed", true), backtrack: yes("allow_backtrack", true), shuffle: yes("shuffle_questions", false), shuffleOpts: yes("shuffle_options", false),
    seenAll: yes("require_seen_all", true), review: yes("show_review_after_submit", true), lang: /^ar/i.test(info.default_language || "") ? "ar" : info.default_language ? "en" : "", extra: info.extra_instructions || "",
  };
  return { config, passages, questions, images, errors, warnings };
}

// صور Excel 365 «وضع في الخلية»: vm → metadata → richValue → richValueRel → media
async function richCellImages(zip) {
  const out = {};
  try {
    const md = zip.file("xl/metadata.xml"), rv = zip.file("xl/richData/rdrichvalue.xml"), rr = zip.file("xl/richData/richValueRel.xml");
    if (!md || !rv || !rr) return out;
    const M = X(await md.async("string"));
    const types = tags(tag(M, "metadataTypes"), "metadataType").map((t) => t.getAttribute("name"));
    const fut = tags(M, "futureMetadata").find((f) => f.getAttribute("name") === "XLRICHVALUE");
    const futBk = fut ? tags(fut, "bk").map((b) => +attr(tag(b, "rvb"), "i")) : [];
    const vBk = tags(tag(M, "valueMetadata"), "bk").map((b) => { const rc = tag(b, "rc"); return { t: +rc.getAttribute("t"), v: +rc.getAttribute("v") }; });
    const RV = X(await rv.async("string"));
    const rvList = tags(RV, "rv").map((r) => tags(r, "v").map((v) => v.textContent));
    // ترتيب الحقول في هيكل الـ rich value (للعثور على _rvRel:LocalImageIdentifier)
    let relKeyPos = {};
    const st = zip.file("xl/richData/rdrichvaluestructure.xml");
    if (st) { const SD = X(await st.async("string")); tags(SD, "s").forEach((s, si) => { const ks = tags(s, "k").map((k) => k.getAttribute("n")); relKeyPos[si] = Math.max(0, ks.indexOf("_rvRel:LocalImageIdentifier")); }); }
    const rvS = tags(RV, "rv").map((r) => +r.getAttribute("s") || 0);
    const RR = X(await rr.async("string"));
    const relIds = tags(RR, "rel").map((r) => RID(r));
    const rels = await readRels(zip, "xl/richData/richValueRel.xml");
    vBk.forEach((b, i) => {
      if (types[b.t - 1] !== "XLRICHVALUE" && types.length) return;
      const rvIdx = futBk[b.v] ?? b.v; const vals = rvList[rvIdx]; if (!vals) return;
      const relIdx = +vals[relKeyPos[rvS[rvIdx]] ?? 0]; const target = rels[relIds[relIdx]]?.target;
      if (target) out[i + 1] = target;   // vm يبدأ من 1
    });
  } catch (e) { console.warn("rich images", e); }
  return out;
}
// صور WPS: xl/cellimages.xml (name = ID المستخدم في DISPIMG)
async function wpsCellImages(zip) {
  const out = {}; const f = zip.file("xl/cellimages.xml"); if (!f) return out;
  try { const d = X(await f.async("string")), rels = await readRels(zip, "xl/cellimages.xml");
    tags(d, "pic").forEach((p) => { const nm = attr(tag(p, "cNvPr"), "name"), blip = tag(p, "blip"); const t = rels[RID(blip, "embed")]?.target; if (nm && t) out[nm] = t; }); } catch {}
  return out;
}
