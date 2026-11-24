// ============================================================
//  منصة أ / محمد موسى — التطبيق الكامل (لا حاجة لتعديل هذا الملف)
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, sendPasswordResetEmail, connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, increment, getCountFromServer, connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, TEACHER_EMAIL, SITE, STUDENT_DOMAIN } from "./config.js";
import { ELEMENTS, CATS } from "./elements.js";

// ---------- تهيئة ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// تطبيق ثانوي لإنشاء حسابات الطلاب دون تسجيل خروج المعلم
const creatorApp = initializeApp(firebaseConfig, "creator");
const creatorAuth = getAuth(creatorApp);
if (window.__EMU__) {           // للاختبار المحلي فقط
  connectAuthEmulator(auth, window.__EMU__.auth, { disableWarnings: true });
  connectAuthEmulator(creatorAuth, window.__EMU__.auth, { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", window.__EMU__.fsPort);
}

const S = { user: null, role: null, me: null, unsubs: [] };
const isTeacher = () => S.role === "teacher";
document.title = `${SITE.title} | ${SITE.teacher}`;

// ---------- أدوات ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
const ts = (t) => (t && t.toDate ? t.toDate() : t ? new Date(t) : null);
const fmt = (t, withTime = true) => {
  const d = ts(t); if (!d) return "—";
  return d.toLocaleString("ar-AE", withTime
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
};
const ago = (t) => {
  const d = ts(t); if (!d) return "لم يدخل بعد";
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 2) return "الآن"; if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.round(m / 60); if (h < 24) return `منذ ${h} ساعة`;
  const dd = Math.round(h / 24); return dd < 30 ? `منذ ${dd} يوم` : fmt(d, false);
};
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); }
function openModal(html) { $("#modal-body").innerHTML = html; $("#modal").classList.remove("hidden"); }
function closeModal() { $("#modal").classList.add("hidden"); $("#modal-body").innerHTML = ""; }
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
const forClass = (item) => !item.classes || !item.classes.length || (S.me && item.classes.includes(S.me.className));
const byDate = (a, b) => (ts(b.createdAt) || 0) - (ts(a.createdAt) || 0);
const list = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
const all = (name) => list(collection(db, name));
const col = (name) => collection(db, name);
const count = async (q) => { try { return (await getCountFromServer(q)).data().count; } catch (e) { console.warn(e); return 0; } };
// كتابة مجمّعة على دفعات (حد Firestore 500 عملية للدفعة)
async function commitChunks(ops) { for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach((f) => f(b)); await b.commit(); } }
// الصف المختارة في صفحات المعلم (تُحفظ على الجهاز)
const prefCls = (k, v) => { try { if (v !== undefined) localStorage.setItem("cls-" + k, v); const x = localStorage.getItem("cls-" + k); return x === null ? (SITE.classes[0] || "") : x; } catch { return SITE.classes[0] || ""; } };
const clsSelect = (id, sel, allLabel = "كل الصفوف") => `<select id="${id}" style="width:auto">${SITE.classes.map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("")}<option value="" ${sel === "" ? "selected" : ""}>${allLabel}</option></select>`;
// طلاب صفوف معيّنة فقط (بدل قراءة كل الطلاب)
const studentsIn = async (classes) => (classes?.length && classes.length <= 10 ? list(query(col("students"), where("className", "in", classes))) : all("students")).then((x) => x.filter((s) => s.name));
// رقم الهاتف ← معرّف دخول داخلي (لا يحتاج رسائل SMS)
const normPhone = (v) => {
  let d = String(v || "").replace(/[٠-٩]/g, (c) => "٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[۰-۹]/g, (c) => "۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("971")) d = "0" + d.slice(3);
  if (/^5\d{8}$/.test(d)) d = "0" + d;
  return /^0\d{8,11}$/.test(d) ? d : "";
};
const phoneEmail = (p) => `${p}@${STUDENT_DOMAIN}`;
// ما يُعرض للمعلم: رقم الهاتف (أو اسم الدخول) بدل البريد الداخلي
const loginId = (s) => { const e = s.email || ""; return e.endsWith("@" + STUDENT_DOMAIN) ? e.split("@")[0] : (e || s.username || ""); };
const errMsg = (e) => {
  const c = e?.code || "";
  if (c.includes("permission")) return "ليس لديك صلاحية لهذا الإجراء.";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "رقم الهاتف أو كلمة المرور غير صحيحة.";
  if (c.includes("invalid-email")) return "صيغة رقم الهاتف غير صحيحة.";
  if (c.includes("too-many-requests")) return "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.";
  if (c.includes("email-already-in-use")) return "هذا الرقم مسجل من قبل. جرّب تسجيل الدخول بدلاً من ذلك، أو تواصل مع المعلم.";
  if (c.includes("weak-password")) return "كلمة المرور ضعيفة: 6 أحرف على الأقل.";
  if (c.includes("operation-not-allowed")) return "التسجيل غير مفعّل في إعدادات Firebase.";
  if (c.includes("network")) return "تعذّر الاتصال بالإنترنت.";
  return "حدث خطأ: " + (e?.message || e);
};
const busy = (btn, on, label) => { if (!btn) return; if (on) { btn.dataset.l = btn.innerHTML; btn.disabled = true; btn.innerHTML = label || "جارٍ..."; } else { btn.disabled = false; btn.innerHTML = btn.dataset.l || btn.innerHTML; } };

// نص الدرس: ## عنوان، **غامق**، H_2O، Na^+ ، صور وروابط ويوتيوب
function ytId(u) { const m = String(u).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m ? m[1] : null; }
function driveEmbed(u) { const m = String(u).match(/drive\.google\.com\/file\/d\/([\w-]+)/); return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null; }
// الصيغ الكيميائية تُعزل باتجاه يسار←يمين حتى لا تنقلب الشحنة (SO₄²⁻) داخل النص العربي
const chem = (e) => e
  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
  .replace(/[^\s<>]*[_^][^\s<>]*/g, (t) => "⁦" + t.replace(/_(\d+)/g, "<sub>$1</sub>").replace(/\^(\d*[+\-]|\d+)/g, "<sup>$1</sup>") + "⁩");
// المعادلات والأرقام اللاتينية داخل النص العربي تُعزل يساراً←يميناً حتى لا ينقلب ترتيبها (Ag⁺ + e⁻ → Ag)
const ltrRuns = (e) => e.replace(/[A-Za-z0-9+\-−(\[|][^\u0600-\u06FF،؛؟]*[A-Za-z0-9)\]+\-−°|]/g, (r) => (/[\s→|=]/.test(r) || /^[+\-−]/.test(r) ? "\u2066" + r + "\u2069" : r));
function inline(s) {
  return String(s ?? "").split(/(https:\/\/[^\s]+)/g)
    .map((part, i) => (i % 2 ? `<a href="${esc(part)}" target="_blank" rel="noopener">${esc(part)}</a>` : chem(ltrRuns(esc(part))))).join("");
}
// نص السؤال: أسطر متعددة + صورة اختيارية (رابط https أو صورة داخل مجلد images في المنصة)
const imgSrc = (u) => { const v = String(u || "").trim(); return /^https:\/\//i.test(v) || /^images\/[\w.\-]+$/i.test(v) ? v : ""; };
const qText = (q) => String(q.text || "").split("\n").map((l) => inline(l)).join("<br>") + (imgSrc(q.image) ? `<div class="qimg"><img src="${esc(imgSrc(q.image))}" alt="" loading="lazy"></div>` : "");
function rich(text) {
  return String(text || "").split("\n").map((line) => {
    const L = line.trim();
    if (!L) return "<br>";
    if (L.startsWith("## ")) return `<h2>${inline(L.slice(3))}</h2>`;
    if (/^(img|صورة)\s*:\s*https:\/\//i.test(L)) { const u = safeUrl(L.replace(/^(img|صورة)\s*:\s*/i, "")); return u ? `<img src="${esc(u)}" alt="">` : ""; }
    if (/^https:\/\/\S+$/.test(L) && ytId(L)) return videoBox(L);
    return `<div>${inline(L)}</div>`;
  }).join("");
}
const videoBox = (u) => { const id = ytId(u); return id ? `<div class="video"><iframe src="https://www.youtube.com/embed/${id}" allowfullscreen></iframe></div>` : ""; };
const pdfBox = (u) => { const e = driveEmbed(u); const s = safeUrl(u); if (!s) return ""; return e ? `<div class="video" style="padding-top:120%"><iframe src="${esc(e)}"></iframe></div><a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(s)}">فتح الملف في نافذة جديدة</a>` : `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(s)}">📄 فتح الملف المرفق</a>`; };

function classPicker(selected = []) {
  return `<div class="field"><label>الصفوف المستهدفة <span class="muted">(اتركها كلها فارغة = جميع الطلاب)</span></label><div class="row">${
    SITE.classes.map((c) => `<label class="check"><input type="checkbox" name="cls" value="${esc(c)}" ${selected.includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")}</div></div>`;
}
const pickedClasses = (root) => $$('input[name=cls]:checked', root).map((i) => i.value);
const classLabel = (cl) => (!cl || !cl.length ? `<span class="pill gray">كل الصفوف</span>` : cl.map((c) => `<span class="pill gray">${esc(c)}</span>`).join(" "));
function downloadCSV(name, rows) {
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = name + ".csv"; a.click();
}

// ---------- الدخول ----------
// رقم التواصل كرابط اتصال مباشر من الهاتف
const phone = (cls = "") => (SITE.contact ? `<a class="${cls}" href="tel:${esc(String(SITE.contact).replace(/[^\d+]/g, ""))}" dir="ltr" style="color:inherit">📞 ${esc(SITE.contact)}</a>` : "");
const HEX = `<svg class="hex-bg" viewBox="0 0 200 200" fill="none" stroke="#fff" stroke-width="3"><polygon points="100,10 178,55 178,145 100,190 22,145 22,55"/><polygon points="100,40 152,70 152,130 100,160 48,130 48,70"/><line x1="100" y1="10" x2="100" y2="40"/><line x1="178" y1="145" x2="152" y2="130"/><line x1="22" y1="145" x2="48" y2="130"/></svg>`;
const hero = () => SITE.cover ? `<div class="login-hero has-cover">
      <div><div class="pill" style="background:rgba(255,255,255,.12);color:#fff">${esc(SITE.school)}</div></div>
      <div><img class="cover-img" src="${esc(SITE.cover)}" alt="${esc(SITE.title)}"><p style="margin-top:18px">دروس، اختبارات، وواجبات — في مكان واحد</p></div>
      <div class="who">${esc(SITE.teacher)}${SITE.contact ? " · " + phone() : ""}</div>
    </div>` : `<div class="login-hero">${HEX}
      <div><div class="pill" style="background:rgba(255,255,255,.18);color:#fff">${esc(SITE.school)}</div></div>
      <div><h1>${esc(SITE.title)}</h1><p>دروس، اختبارات، وواجبات — في مكان واحد</p></div>
      <div class="who">${esc(SITE.teacher)}${SITE.contact ? " · " + phone() : ""}</div>
    </div>`;
function renderLogin(error = "", mode = "login", note = "") {
  const reg = mode === "register";
  $("#app").innerHTML = `
  <div class="login-wrap">${hero()}
    <div class="login-form"><div class="login-card">
      <div class="tabs"><button type="button" class="${reg ? "" : "on"}" data-m="login">تسجيل الدخول</button><button type="button" class="${reg ? "on" : ""}" data-m="register">طالب جديد؟ أنشئ حساباً</button></div>
      ${error ? `<div class="err">${esc(error)}</div>` : ""}${note ? `<div class="note">${esc(note)}</div>` : ""}
      ${reg ? `<form id="regForm" autocomplete="on">
        <p class="sub">بعد التسجيل سيراجع المعلم طلبك ويفعّل حسابك.</p>
        <div class="field"><label>الاسم الكامل (ثلاثي)</label><input type="text" name="name" required minlength="3" maxlength="60"></div>
        <div class="field"><label>الصف</label><select name="cls" required><option value="">— اختر صفك —</option>${SITE.classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select></div>
        <div class="field"><label>رقم الهاتف</label><input type="tel" name="phone" dir="ltr" required inputmode="tel" autocomplete="tel" placeholder="05XXXXXXXX"><p class="hint">ستدخل به إلى المنصة في كل مرة. اكتب رقمك أنت (أو رقم ولي الأمر).</p></div>
        <div class="grid g2" style="gap:10px"><div class="field"><label>كلمة المرور</label><input type="password" name="p" dir="ltr" required minlength="6" autocomplete="new-password"></div>
        <div class="field"><label>تأكيد كلمة المرور</label><input type="password" name="p2" dir="ltr" required minlength="6" autocomplete="new-password"></div></div>
        <button class="btn block" type="submit">إنشاء الحساب</button></form>`
      : `<form id="loginForm" autocomplete="on">
        <div class="field"><label>رقم الهاتف</label><input type="text" name="u" dir="ltr" required inputmode="tel" autocomplete="username" placeholder="05XXXXXXXX"></div>
        <div class="field"><label>كلمة المرور</label><input type="password" name="p" dir="ltr" required autocomplete="current-password"></div>
        <button class="btn block" type="submit">دخول</button>
        <p style="text-align:center;margin-top:14px"><button type="button" class="btn link sm" id="forgot">نسيت كلمة المرور؟</button></p></form>`}
    </div></div>
  </div>`;
  $$(".tabs button").forEach((b) => (b.onclick = () => renderLogin("", b.dataset.m)));
  if (reg) {
    $("#regForm").onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, btn = $("button[type=submit]", f);
      const name = f.name.value.trim().replace(/\s+/g, " "), ph = normPhone(f.phone.value), email = phoneEmail(ph);
      if (!ph) return renderLoginErrKeep(f, "اكتب رقم هاتف صحيحاً، مثل 0501234567.");
      if (f.p.value !== f.p2.value) return renderLoginErrKeep(f, "كلمتا المرور غير متطابقتين.");
      if (!f.cls.value) return renderLoginErrKeep(f, "اختر صفك.");
      busy(btn, true, "جارٍ إنشاء الحساب...");
      S.registering = true;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, f.p.value);
        await setDoc(doc(db, "students", cred.user.uid), { name, className: f.cls.value, email, active: false, status: "pending", createdAt: serverTimestamp() });
        S.registering = false; handleUser(cred.user);
      } catch (err) {
        S.registering = false; if (auth.currentUser) await signOut(auth);
        renderLogin(errMsg(err), "register");
      }
    };
  } else {
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault(); const f = e.target; const btn = $("button[type=submit]", f);
      const u = f.u.value.trim().toLowerCase();
      const email = u.includes("@") ? u : normPhone(u) ? phoneEmail(normPhone(u)) : `${u}@${STUDENT_DOMAIN}`;
      busy(btn, true, "جارٍ الدخول...");
      try { await signInWithEmailAndPassword(auth, email, f.p.value); }
      catch (err) { renderLogin(errMsg(err)); }
    };
    $("#forgot").onclick = async () => {
      const u = $("#loginForm").u.value.trim().toLowerCase();
      if (!u.includes("@")) return renderLogin("", "login", "لاستعادة كلمة المرور تواصل مع المعلم" + (SITE.contact ? " على " + SITE.contact : "") + "، وسيعيد تفعيل حسابك.");
      try { await sendPasswordResetEmail(auth, u); } catch (e) {}
      renderLogin("", "login", "إذا كان هذا البريد مسجلاً، فستصلك رسالة لتغيير كلمة المرور. تفقّد البريد غير المرغوب (Spam) أيضاً.");
    };
  }
}
function renderLoginErrKeep(f, msg) {
  let box = $(".err", f.parentNode); if (!box) { box = document.createElement("div"); box.className = "err"; f.before(box); }
  box.textContent = msg;
}
function renderWaiting(st) {
  const msg = st.status === "pending"
    ? ["⏳ طلبك قيد المراجعة", `أهلاً ${st.name}، تم تسجيلك في الصف «${st.className}». سيفعّل المعلم حسابك قريباً، ثم تستطيع الدخول برقم هاتفك وكلمة المرور.`]
    : st.status === "rejected"
      ? ["لم تتم الموافقة على الطلب", "إذا كنت من طلاب المعلم، تواصل معه مباشرة."]
      : ["الحساب موقوف", "حسابك موقوف حالياً. تواصل مع المعلم."];
  $("#app").innerHTML = `<div class="login-wrap">${hero()}<div class="login-form"><div class="login-card" style="text-align:center">
    <h2>${esc(msg[0])}</h2><p class="sub" style="margin-top:10px">${esc(msg[1])}</p>${SITE.contact ? `<p class="muted">للتواصل مع المعلم: ${phone()}</p>` : ""}
    <div class="row" style="justify-content:center"><button class="btn" id="recheck">تحديث</button><button class="btn ghost" id="out">تسجيل الخروج</button></div></div></div></div>`;
  $("#recheck").onclick = () => handleUser(auth.currentUser);
  $("#out").onclick = () => signOut(auth);
}

async function handleUser(user) {
  S.unsubs.forEach((u) => { try { u(); } catch {} }); S.unsubs = [];
  stopBadges(); S.user = user; S.me = null; S.role = null; S.cat = null;
  if (!user) { if (location.hash) history.replaceState(null, "", location.pathname); return renderLogin(); }
  if ((user.email || "").toLowerCase() === TEACHER_EMAIL.toLowerCase()) { S.role = "teacher"; watchBadges(); return route(); }
  try {
    const snap = await getDoc(doc(db, "students", user.uid));
    if (!snap.exists()) { await signOut(auth); return renderLogin("لا يوجد ملف طالب لهذا الحساب. أنشئ حساباً جديداً أو تواصل مع المعلم."); }
    const st = snap.data();
    if (st.active !== true) return renderWaiting(st);
    S.me = { id: user.uid, ...st }; S.role = "student"; watchBadges();
    updateDoc(doc(db, "students", user.uid), { lastLogin: serverTimestamp() }).catch(() => {});
    route();
  } catch (e) { await signOut(auth); renderLogin(errMsg(e)); }
}
onAuthStateChanged(auth, (user) => { if (!S.registering) handleUser(user); });

// ---------- الهيكل والتنقل ----------
const TNAV = [["dash", "📊", "لوحة المتابعة"], ["students", "👥", "الطلاب"], ["attendance", "✅", "الحضور"], ["reports", "📑", "التقارير"], ["honor", "🏆", "لوحة الشرف"],
  ["-", "المحتوى"], ["lessons", "📘", "الدروس"], ["quizzes", "📝", "الاختبارات"], ["bank", "📚", "بنك الأسئلة"], ["labs", "🔬", "المختبر"], ["assignments", "📂", "الواجبات"], ["calendar", "📅", "التقويم"], ["announcements", "📢", "الإعلانات"],
  ["-", "التواصل والأدوات"], ["messages", "💬", "الرسائل"], ["periodic", "🧪", "الجدول الدوري"], ["calc", "🧮", "حاسبة الكيمياء"]];
const SNAV = [["home", "🏠", "الرئيسية"], ["progress", "📈", "تقدّمي"], ["honor", "🏆", "لوحة الشرف"],
  ["-", "التعلّم"], ["lessons", "📘", "الدروس"], ["quizzes", "📝", "الاختبارات"], ["bank", "📚", "بنك الأسئلة"], ["labs", "🔬", "المختبر"], ["assignments", "📂", "الواجبات"], ["calendar", "📅", "التقويم"],
  ["-", "الأدوات والتواصل"], ["periodic", "🧪", "الجدول الدوري"], ["calc", "🧮", "حاسبة الكيمياء"], ["messages", "💬", "رسائل المعلم"]];

function shell(active) {
  const nav = isTeacher() ? TNAV : SNAV;
  const who = isTeacher() ? `<b>${esc(SITE.teacher)}</b>المعلم` : `<b>${esc(S.me.name)}</b>${esc(S.me.className || "")}`;
  $("#app").innerHTML = `
  <div class="topbar"><b>${esc(SITE.title)}</b><button id="burger" aria-label="القائمة">☰</button></div>
  <div class="shell">
    <aside class="side" id="side">
      <div class="brand"><div class="logo">Chem</div><div><b>${esc(SITE.title)}</b><small>${esc(SITE.teacher)}</small></div></div>
      <nav class="nav">${nav.filter(([k]) => k !== "honor" || SITE.honor !== false || isTeacher()).map(([k, i, l]) => (k === "-" ? `<div class="nav-sec">${i}</div>` : `<a href="#/${k}" class="${active === k ? "on" : ""}" data-k="${k}">${i} ${l}<span class="badge hidden"></span></a>`)).join("")}</nav>
      <div class="me">${who}${!isTeacher() && SITE.contact ? `<br><small style="color:#8fb0c2">المعلم: ${phone()}</small>` : ""}<br><button class="btn link" id="logout" style="color:#8fb0c2;padding:4px 0">تسجيل الخروج ↩</button></div>
    </aside>
    <main class="main" id="main"><div class="splash" style="min-height:40vh"><div class="spinner"></div></div></main>
  </div>`;
  $("#logout").onclick = () => signOut(auth);
  $("#burger").onclick = () => $("#side").classList.toggle("open");
  $$(".nav a").forEach((a) => (a.onclick = () => $("#side").classList.remove("open")));
  Object.entries(S.badges || {}).forEach(([k, n]) => setBadge(k, n));
  return $("#main");
}
function setBadge(k, n) { (S.badges ||= {})[k] = n; const b = $(`.nav a[data-k="${k}"] .badge`); if (b) { b.textContent = n; b.classList.toggle("hidden", !n); } }
// مستمعات الشارات تعمل مرة واحدة لكل جلسة دخول (لا تُعاد مع كل صفحة)
function watchBadges() {
  stopBadges();
  if (isTeacher()) {
    S.badgeSubs.push(onSnapshot(query(col("threads"), where("teacherUnread", "==", true)), (s) => setBadge("messages", s.size), () => {}));
    S.badgeSubs.push(onSnapshot(query(col("students"), where("status", "==", "pending")), (s) => setBadge("students", s.size), () => {}));
  } else S.badgeSubs.push(onSnapshot(doc(db, "threads", S.me.id), (d) => setBadge("messages", d.exists() && d.data().studentUnread ? 1 : 0), () => {}));
}
function stopBadges() { (S.badgeSubs || []).forEach((u) => { try { u(); } catch {} }); S.badgeSubs = []; S.badges = {}; }
async function route() {
  S.unsubs.forEach((u) => { try { u(); } catch {} }); S.unsubs = [];
  if (!S.role) return;
  const [page, id] = (location.hash.replace(/^#\/?/, "") || (isTeacher() ? "dash" : "home")).split("/");
  const T = { dash: tDash, students: tStudents, lessons: tLessons, "lesson-edit": tLessonEdit, quizzes: tQuizzes, "quiz-edit": tQuizEdit, "quiz-results": tQuizResults,
    assignments: tAssignments, "assign-edit": tAssignEdit, "assign-subs": tAssignSubs, announcements: tAnnouncements, messages: tMessages, thread: tThread, lesson: sLesson,
    attendance: tAttendance, reports: tReports, report: tReport, honor: tHonor, bank: tBank, "bank-edit": tBankEdit, bankq: sBankQ, labs: tLabs, "lab-edit": tLabEdit, lab: sLab, calendar: pCalendar, periodic: pPeriodic, calc: pCalc };
  const St = { home: sHome, lessons: sLessons, lesson: sLesson, quizzes: sQuizzes, quiz: sQuiz, assignments: sAssignments, assign: sAssign, messages: sMessages,
    progress: sProgress, honor: sHonor, bank: sBank, bankq: sBankQ, labs: sLabs, lab: sLab, calendar: pCalendar, periodic: pPeriodic, calc: pCalc };
  const fn = (isTeacher() ? T : St)[page] || (isTeacher() ? tDash : sHome);
  const navKey = { "lesson-edit": "lessons", lesson: "lessons", "quiz-edit": "quizzes", "quiz-results": "quizzes", quiz: "quizzes", "assign-edit": "assignments", "assign-subs": "assignments", assign: "assignments", thread: "messages", report: "reports", "bank-edit": "bank", bankq: "bank", "lab-edit": "labs", lab: "labs" }[page] || page;
  const main = shell(navKey);
  try { await fn(main, id); } catch (e) { console.error(e); main.innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
const go = (h) => { if (location.hash === "#/" + h) route(); else location.hash = "#/" + h; };

// ---------- حساب الدرجات ----------
// إجابات الطالب محفوظة كخريطة {رقم السؤال: رقم الخيار}
const answersOf = (sub, n) => Array.from({ length: n }, (_, i) => (sub?.picks && sub.picks[i] != null ? sub.picks[i] : -1));
function scoreOf(sub, key) {
  if (!sub || !key) return null;
  const n = key.answers.length, a = answersOf(sub, n), pts = key.points || [];
  let right = 0, total = 0;
  key.answers.forEach((k, i) => { const p = +pts[i] || 1; total += p; if (a[i] === k) right += p; });
  return { right, total, pct: total ? Math.round((right / total) * 100) : 0 };
}
// تحديث ملخص كل طالب: يقرأ فقط السجلات الجديدة (كل سجل يُقرأ مرة واحدة فقط)
async function syncCounters() {
  const [subs, views, hws] = await Promise.all(["submissions:scored", "views:counted", "homework:counted"].map((x) => { const [c, f] = x.split(":"); return list(query(col(c), where(f, "==", false))); }));
  if (!subs.length && !views.length && !hws.length) return;
  const keys = {}; await Promise.all([...new Set(subs.map((x) => x.quizId))].map(async (q) => { const k = await getDoc(doc(db, "quizKeys", q)); if (k.exists()) keys[q] = k.data(); }));
  const ops = []; const inc = (sid, data) => (b) => b.set(doc(db, "students", sid), data, { merge: true });
  subs.forEach((x) => { const sc = scoreOf(x, keys[x.quizId]); if (!sc) return;
    ops.push((b) => b.update(doc(db, "submissions", x.id), { scored: true, score: sc.right, total: sc.total }), inc(x.studentId, { quizDone: increment(1), quizScore: increment(sc.right), quizQ: increment(sc.total) })); });
  views.forEach((v) => ops.push((b) => b.update(doc(db, "views", v.id), { counted: true }), inc(v.studentId, { lessonsSeen: increment(1) })));
  hws.forEach((h) => ops.push((b) => b.update(doc(db, "homework", h.id), { counted: true }), inc(h.studentId, { hwDone: increment(1) })));
  await commitChunks(ops);
  if (SITE.honor !== false) for (const c of new Set(subs.map((x) => x.className).filter(Boolean))) await rebuildHonor(c);
}
// فهرس واحد بكل المحتوى المنشور: الطالب يقرأ سجلاً واحداً بدل مئات السجلات
async function rebuildCatalog() {
  const [l, q, a, an, bk, lb, ev] = await Promise.all(["lessons", "quizzes", "assignments", "announcements", "banks", "labs", "events"].map(all));
  const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
  await setDoc(doc(db, "meta", "catalog"), {
    lessons: l.filter((x) => x.published).map((x) => ({ ...pick(x, ["id", "title", "unit", "order", "classes", "createdAt"]), v: !!x.videoUrl, p: !!x.pdfUrl })),
    quizzes: q.filter((x) => x.published).map((x) => pick(x, ["id", "title", "count", "classes", "open", "showResults", "timeLimit", "totalPoints", "createdAt"])),
    assignments: a.filter((x) => x.published).map((x) => pick(x, ["id", "title", "due", "maxGrade", "classes", "createdAt"])),
    announcements: an.sort(byDate).slice(0, 30).map((x) => pick(x, ["id", "title", "body", "classes", "createdAt"])),
    banks: bk.filter((x) => x.published).map((x) => pick(x, ["id", "title", "unit", "count", "classes", "createdAt"])),
    labs: lb.filter((x) => x.published).map((x) => ({ ...pick(x, ["id", "title", "unit", "classes", "createdAt"]), sim: !!x.simUrl })),
    events: ev.filter((x) => ts(x.date) > new Date(Date.now() - 100 * 864e5)).map((x) => pick(x, ["id", "title", "date", "type", "note", "classes"])),
    updatedAt: serverTimestamp() });
}
// عند حذف تسليم اختبار: نطرح ما سبق احتسابه من ملخص الطالب
const undoSub = (x) => (x.scored ? [(b) => b.set(doc(db, "students", x.studentId), { quizDone: increment(-1), quizScore: increment(-(x.score || 0)), quizQ: increment(-(x.total || 0)) }, { merge: true })] : []);
const pctPill = (p) => `<span class="pill ${p >= 85 ? "ok" : p >= 60 ? "warn" : "bad"}">${p}%</span>`;

// ============================================================
//                       صفحات المعلم
// ============================================================
async function tDash(main) {
  const sel = prefCls("dash");
  try { await syncCounters(); } catch (e) { console.warn("sync", e); }
  const [nActive, nPending, nHW, nUnread, lessons, quizzes, assigns, studs] = await Promise.all([
    count(query(col("students"), where("active", "==", true))), count(query(col("students"), where("status", "==", "pending"))),
    count(query(col("homework"), where("graded", "==", false))), count(query(col("threads"), where("teacherUnread", "==", true))),
    all("lessons"), all("quizzes"), all("assignments"),
    sel ? list(query(col("students"), where("className", "==", sel))) : all("students").then((x) => x.filter((s) => s.name))]);
  const pubL = lessons.filter((l) => l.published), pubQ = quizzes.filter((q) => q.published), pubA = assigns.filter((a) => a.published);
  const forC = (it, c) => !it.classes?.length || it.classes.includes(c);
  const rows = studs.filter((s) => s.active).map((s) => {
    const nL = pubL.filter((l) => forC(l, s.className)).length, nQ = pubQ.filter((q) => forC(q, s.className)).length, nA = pubA.filter((a) => forC(a, s.className)).length;
    return { s, seen: Math.min(s.lessonsSeen || 0, nL), nL, nQd: Math.min(s.quizDone || 0, nQ), nQ, avg: s.quizQ ? Math.round((s.quizScore / s.quizQ) * 100) : null, myHW: Math.min(s.hwDone || 0, nA), nA };
  }).sort((a, b) => (a.s.className || "").localeCompare(b.s.className || "") || a.s.name.localeCompare(b.s.name, "ar"));

  main.innerHTML = `
  <div class="page-head"><div><h1>لوحة المتابعة</h1><p class="sub">نظرة سريعة على تقدّم طلابك</p></div>
    <button class="btn ghost" id="csv">⬇ تصدير Excel</button></div>
  ${nPending ? `<a href="#/students" class="card row" style="text-decoration:none;color:inherit;border-inline-start:5px solid var(--accent)"><b>🔔 لديك ${nPending} طلب انضمام جديد بانتظار موافقتك</b><span class="spacer"></span><span class="btn sm">مراجعة</span></a>` : ""}
  <div class="grid g4" style="margin-bottom:16px">
    <div class="stat"><div class="n">${nActive}</div><div class="l">طالب مفعّل</div></div>
    <div class="stat"><div class="n">${pubL.length}</div><div class="l">درس منشور</div></div>
    <div class="stat"><div class="n">${nHW}</div><div class="l">واجب ينتظر التصحيح</div></div>
    <div class="stat"><div class="n">${nUnread}</div><div class="l">محادثة فيها رسالة جديدة</div></div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:10px"><h3 style="margin:0">تقدّم الطلاب</h3><span class="muted">(${rows.length})</span><span class="spacer"></span>
      <input type="text" id="sq" placeholder="بحث بالاسم..." style="max-width:180px">${clsSelect("fcls", sel, "كل الصفوف (أبطأ)")}</div>
    ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>الطالب</th><th>الصف</th><th>الدروس المفتوحة</th><th>الاختبارات</th><th>متوسط الدرجات</th><th>الواجبات</th><th>آخر دخول</th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-n="${esc(r.s.name)}"><td><b>${esc(r.s.name)}</b></td><td>${esc(r.s.className || "—")}</td>
      <td>${r.seen} من ${r.nL}</td><td>${r.nQd} من ${r.nQ}</td><td>${r.avg == null ? "—" : pctPill(r.avg)}</td><td>${r.myHW} من ${r.nA}</td>
      <td class="muted">${ago(r.s.lastLogin)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">لا يوجد طلاب مفعّلون في هذا الصف. أرسل <a href="#/students">رابط التسجيل</a> لطلابك.</div>`}
  </div>`;
  $("#fcls").onchange = (e) => { prefCls("dash", e.target.value); route(); };
  $("#sq").oninput = (e) => $$("tbody tr", main).forEach((tr) => tr.classList.toggle("hidden", !tr.dataset.n.includes(e.target.value.trim())));
  $("#csv").onclick = () => downloadCSV(`متابعة-${sel || "كل الصفوف"}`, [["الطالب", "الصف", "الدروس المفتوحة", "الاختبارات المنجزة", "متوسط الدرجات %", "الواجبات المسلمة", "آخر دخول"],
    ...rows.map((r) => [r.s.name, r.s.className, `${r.seen}/${r.nL}`, `${r.nQd}/${r.nQ}`, r.avg ?? "", `${r.myHW}/${r.nA}`, ts(r.s.lastLogin)?.toLocaleString("ar-AE") || ""])]);
}
// ---------- الطلاب ----------
const genPass = () => { const c = "abcdefghjkmnpqrstuvwxyz23456789"; let p = ""; const r = crypto.getRandomValues(new Uint32Array(7)); r.forEach((n) => (p += c[n % c.length])); return p; };
async function createStudent({ name, className, username, password }) {
  const email = `${username}@${STUDENT_DOMAIN}`;
  const cred = await createUserWithEmailAndPassword(creatorAuth, email, password);
  const sid = cred.user.uid; await signOut(creatorAuth);
  const b = writeBatch(db);
  b.set(doc(db, "students", sid), { name, className, username, active: true, status: "approved", createdAt: serverTimestamp() });
  b.set(doc(db, "credentials", sid), { username, password });
  await b.commit();
  return sid;
}
async function tStudents(main) {
  const sel = prefCls("students");
  const [pendingL, rejectedL, classL, creds] = await Promise.all([
    list(query(col("students"), where("status", "==", "pending"))), list(query(col("students"), where("status", "==", "rejected"))),
    sel ? list(query(col("students"), where("className", "==", sel))) : all("students"), all("credentials")]);
  const everyone = [...new Map([...pendingL, ...rejectedL, ...classL].map((x) => [x.id, x])).values()].filter((x) => x.name);
  const credMap = Object.fromEntries(creds.map((c) => [c.id, c]));
  const sortS = (a, b) => (a.className || "").localeCompare(b.className || "") || a.name.localeCompare(b.name, "ar");
  const pending = everyone.filter((s) => s.status === "pending").sort((a, b) => (ts(a.createdAt) || 0) - (ts(b.createdAt) || 0));
  const rejected = everyone.filter((s) => s.status === "rejected").sort(sortS);
  const students = everyone.filter((s) => s.status !== "pending" && s.status !== "rejected").sort(sortS);
  const used = new Set(everyone.map((s) => s.username).filter(Boolean));
  const nextUser = () => { let n = 101; while (used.has("s" + n)) n++; used.add("s" + n); return "s" + n; };
  const clsOpts = (sel) => SITE.classes.map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("");


  main.innerHTML = `
  <div class="page-head"><div><h1>الطلاب</h1><p class="sub">الطلاب يسجلون بأنفسهم، ولا يدخل أحد قبل موافقتك</p></div>
    <div class="row"><button class="btn" id="print">🔗 رابط التسجيل للطلاب</button><button class="btn ghost" id="add">+ إضافة طالب يدوياً</button></div></div>
  ${pending.length ? `<div class="card" style="border-inline-start:5px solid var(--accent)">
    <div class="row" style="margin-bottom:6px"><h3 style="margin:0">طلبات انضمام جديدة (${pending.length})</h3><span class="spacer"></span><button class="btn sm" id="approveAll">قبول الكل</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>الاسم</th><th>الصف</th><th>رقم الهاتف</th><th>وقت التسجيل</th><th></th></tr></thead><tbody>
    ${pending.map((s) => `<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.className || "—")}</td><td class="ltr">${esc(loginId(s))}</td><td class="muted">${ago(s.createdAt)}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-approve="${s.id}">قبول ✓</button> <button class="btn link sm danger" data-reject="${s.id}">رفض</button></td></tr>`).join("")}
    </tbody></table></div></div>` : ""}
  <div class="card">
    <div class="row" style="margin-bottom:8px"><h3 style="margin:0">الطلاب المقبولون</h3><span class="muted">(${students.length})</span><span class="spacer"></span><input type="text" id="sq" placeholder="بحث بالاسم أو الرقم..." style="max-width:220px">${clsSelect("fc", sel, "كل الصفوف (أبطأ)")}</div>
    ${students.length ? `<div class="tbl-wrap"><table><thead><tr><th>الاسم</th><th>الصف</th><th>بيانات الدخول</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead><tbody>
    ${students.map((s) => `<tr data-n="${esc(s.name + " " + loginId(s))}"><td><b>${esc(s.name)}</b></td><td>${esc(s.className || "—")}</td>
      <td class="ltr">${esc(loginId(s))}${credMap[s.id] ? ` <span class="pw" data-pw="${esc(credMap[s.id].password)}">••••</span> <button class="btn link sm" data-show>إظهار</button>` : ""}</td>
      <td>${s.active ? `<span class="pill ok">مفعّل</span>` : `<span class="pill bad">موقوف</span>`}</td><td class="muted">${ago(s.lastLogin)}</td>
      <td style="white-space:nowrap"><button class="btn link sm" data-edit="${s.id}">تعديل</button><button class="btn link sm ${s.active ? "danger" : ""}" data-toggle="${s.id}">${s.active ? "إيقاف" : "تفعيل"}</button><button class="btn link sm danger" data-del="${s.id}">حذف</button></td></tr>`).join("")}
  </tbody></table></div>` : `<div class="empty">لا يوجد طلاب مقبولون بعد. أرسل رابط المنصة لطلابك ليسجلوا، ثم اقبل طلباتهم من هنا.</div>`}</div>
  ${rejected.length ? `<details class="card"><summary class="muted" style="cursor:pointer">طلبات مرفوضة (${rejected.length})</summary>
    ${rejected.map((s) => `<div class="item"><div class="body"><div class="t">${esc(s.name)}</div><div class="m"><span class="ltr">${esc(loginId(s))}</span> · ${esc(s.className || "")}</div></div><button class="btn ghost sm" data-approve="${s.id}">قبول</button><button class="btn link sm danger" data-del="${s.id}">حذف</button></div>`).join("")}</details>` : ""}`;

  const approve = (id) => updateDoc(doc(db, "students", id), { active: true, status: "approved" });
  $$("[data-approve]", main).forEach((b) => (b.onclick = async () => { busy(b, true, "..."); await approve(b.dataset.approve); toast("تم قبول الطالب ✓"); route(); }));
  $$("[data-reject]", main).forEach((b) => (b.onclick = async () => { const s = everyone.find((x) => x.id === b.dataset.reject); if (!confirm(`رفض طلب "${s.name}"؟`)) return; await updateDoc(doc(db, "students", s.id), { active: false, status: "rejected" }); toast("تم رفض الطلب"); route(); }));
  if (pending.length) $("#approveAll").onclick = async () => { if (!confirm(`قبول جميع الطلبات (${pending.length})؟ تأكد أن الأسماء كلها لطلابك.`)) return; await commitChunks(pending.map((s) => (b) => b.update(doc(db, "students", s.id), { active: true, status: "approved" }))); toast("تم قبول الجميع ✓"); route(); };
  $("#fc").onchange = (e) => { prefCls("students", e.target.value); route(); };
  $("#sq").oninput = (e) => $$("tbody tr[data-n]", main).forEach((tr) => tr.classList.toggle("hidden", !tr.dataset.n.toLowerCase().includes(e.target.value.trim().toLowerCase())));
  $$("[data-show]", main).forEach((b) => (b.onclick = () => { const s = b.previousElementSibling; const shown = s.textContent !== "••••"; s.textContent = shown ? "••••" : s.dataset.pw; b.textContent = shown ? "إظهار" : "إخفاء"; }));
  $$("[data-toggle]", main).forEach((b) => (b.onclick = async () => { const s = students.find((x) => x.id === b.dataset.toggle); await updateDoc(doc(db, "students", s.id), { active: !s.active }); toast(s.active ? "تم إيقاف الحساب" : "تم تفعيل الحساب"); route(); }));
  $$("[data-del]", main).forEach((b) => (b.onclick = async () => {
    const s = students.find((x) => x.id === b.dataset.del);
    if (!confirm(`حذف الطالب "${s.name}" نهائياً من المنصة؟`)) return;
    await Promise.all([deleteDoc(doc(db, "students", s.id)), deleteDoc(doc(db, "credentials", s.id))]); toast("تم الحذف"); route();
  }));
  $$("[data-edit]", main).forEach((b) => (b.onclick = () => {
    const s = students.find((x) => x.id === b.dataset.edit);
    openModal(`<h2>تعديل بيانات الطالب</h2><form id="ef"><div class="field"><label>الاسم</label><input type="text" name="name" value="${esc(s.name)}" required></div>
      <div class="field"><label>الصف</label><select name="cls">${clsOpts(s.className)}</select></div>
      <p class="hint">لتغيير كلمة المرور: احذف الطالب وأضفه من جديد باسم دخول جديد.</p>
      <div class="row"><button class="btn">حفظ</button><button type="button" class="btn ghost" data-close>إلغاء</button></div></form>`);
    $("#ef").onsubmit = async (e) => { e.preventDefault(); await updateDoc(doc(db, "students", s.id), { name: e.target.name.value.trim(), className: e.target.cls.value }); closeModal(); toast("تم الحفظ"); route(); };
  }));
  $("#add").onclick = () => {
    openModal(`<h2>إضافة طالب</h2><form id="af">
      <div class="field"><label>اسم الطالب</label><input type="text" name="name" required></div>
      <div class="field"><label>الصف</label><select name="cls">${clsOpts()}</select></div>
      <div class="grid g2"><div class="field"><label>اسم الدخول (حروف إنجليزية وأرقام)</label><input type="text" name="u" dir="ltr" value="${nextUser()}" pattern="[a-z0-9_.]{3,30}" required></div>
      <div class="field"><label>كلمة المرور (6 أحرف على الأقل)</label><input type="text" name="p" dir="ltr" value="${genPass()}" minlength="6" required></div></div>
      <div id="aerr"></div><div class="row"><button class="btn">إنشاء الحساب</button><button type="button" class="btn ghost" data-close>إلغاء</button></div></form>`);
    $("#af").onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, btn = $("button", f); busy(btn, true);
      try { await createStudent({ name: f.name.value.trim(), className: f.cls.value, username: f.u.value.trim().toLowerCase(), password: f.p.value }); closeModal(); toast("تم إنشاء الحساب ✓"); route(); }
      catch (err) { busy(btn, false); $("#aerr").innerHTML = `<div class="err">${esc(errMsg(err))}</div>`; }
    };
  };
  if ($("#bulk")) $("#bulk").onclick = () => {
    openModal(`<h2>إضافة مجموعة طلاب</h2><form id="bf">
      <div class="field"><label>الصف</label><select name="cls">${clsOpts()}</select></div>
      <div class="field"><label>أسماء الطلاب — اسم في كل سطر</label><textarea name="names" style="min-height:200px" required placeholder="أحمد خالد&#10;سالم محمد&#10;..."></textarea>
      <p class="hint">سيتم إنشاء اسم دخول وكلمة مرور لكل طالب تلقائياً، ثم يمكنك طباعة البطاقات.</p></div>
      <div id="bprog"></div><div class="row"><button class="btn">إنشاء الحسابات</button><button type="button" class="btn ghost" data-close>إلغاء</button></div></form>`);
    $("#bf").onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, btn = $("button", f); busy(btn, true);
      const names = f.names.value.split("\n").map((n) => n.trim()).filter(Boolean); let ok = 0; const fails = [];
      for (const [i, name] of names.entries()) {
        $("#bprog").innerHTML = `<p class="muted">جارٍ إنشاء ${i + 1} من ${names.length}...</p>`;
        try { await createStudent({ name, className: f.cls.value, username: nextUser(), password: genPass() }); ok++; }
        catch (err) { fails.push(`${name}: ${errMsg(err)}`); }
      }
      closeModal(); toast(`تم إنشاء ${ok} حساب`); if (fails.length) alert("لم يتم إنشاء:\n" + fails.join("\n")); route();
    };
  };
  $("#print").onclick = () => {
    const link = location.origin + location.pathname;
    openModal(`<div class="row" style="margin-bottom:12px"><h2 style="margin:0">رابط التسجيل للطلاب</h2><span class="spacer"></span><button class="btn ghost sm" id="copy">نسخ الرابط</button><button class="btn sm" id="doprint">طباعة</button><button class="btn ghost sm" data-close>إغلاق</button></div>
      <div id="print-area"><div class="login-slip" style="font-size:16px;line-height:2">
        <b style="font-size:20px">${esc(SITE.title)} — ${esc(SITE.teacher)}</b><br>
        1) افتح الرابط: <span class="ltr"><b>${esc(link)}</b></span><br>
        2) اضغط «طالب جديد؟ أنشئ حساباً» واكتب اسمك الثلاثي وصفك ورقم هاتفك.<br>
        3) انتظر موافقة المعلم، ثم ادخل برقم هاتفك وكلمة المرور.<br>
        <small>لا تشارك كلمة المرور مع أحد.${SITE.contact ? " للاستفسار: " + phone() : ""}</small></div></div>`);
    $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("تم نسخ الرابط ✓"); } catch { prompt("انسخ الرابط:", link); } };
    $("#doprint").onclick = () => window.print();
  };
}

// ---------- الدروس ----------
async function tLessons(main) {
  const lessons = await all("lessons");
  lessons.sort((a, b) => (a.unit || "").localeCompare(b.unit || "", "ar") || (a.order ?? 0) - (b.order ?? 0) || (ts(a.createdAt) || 0) - (ts(b.createdAt) || 0));
  const views = await Promise.all(lessons.map((l) => count(query(col("views"), where("lessonId", "==", l.id)))));
  main.innerHTML = `<div class="page-head"><div><h1>الدروس</h1><p class="sub">${lessons.length} درس</p></div><a class="btn" href="#/lesson-edit/new">+ درس جديد</a></div>
  <div class="card">${lessons.length ? lessons.map((l, i) => `<div class="item"><div class="ic">📘</div><div class="body">
    <div class="t">${esc(l.title)}</div><div class="m">${esc(l.unit || "")} ${classLabel(l.classes)} · فتحه ${views[i]} طالب</div></div>
    <div class="row">${l.published ? `<span class="pill ok">منشور</span>` : `<span class="pill gray">مسودة</span>`}<a class="btn ghost sm" href="#/lesson/${l.id}">معاينة</a><a class="btn sm" href="#/lesson-edit/${l.id}">تعديل</a></div></div>`).join("")
  : `<div class="empty">لا توجد دروس بعد.</div>`}</div>`;
}
async function tLessonEdit(main, id) {
  const isNew = id === "new"; let l = { title: "", unit: "", body: "", videoUrl: "", pdfUrl: "", published: false, classes: [], order: 0 };
  if (!isNew) { const s = await getDoc(doc(db, "lessons", id)); if (!s.exists()) return go("lessons"); l = { ...l, ...s.data() }; }
  main.innerHTML = `<div class="page-head"><h1>${isNew ? "درس جديد" : "تعديل الدرس"}</h1><a class="btn ghost" href="#/lessons">رجوع</a></div>
  <form class="card" id="lf">
    <div class="grid g3"><div class="field" style="grid-column:span 2"><label>عنوان الدرس</label><input type="text" name="title" value="${esc(l.title)}" required></div>
      <div class="field"><label>الوحدة / الفصل</label><input type="text" name="unit" value="${esc(l.unit)}" placeholder="الوحدة 3: الغازات"></div></div>
    <div class="field"><label>محتوى الدرس</label><textarea name="body" style="min-height:260px">${esc(l.body)}</textarea>
      <p class="hint">تنسيقات سريعة: <b>## عنوان فرعي</b> · <b>**نص غامق**</b> · H_2O تُكتب H₂O · Na^+ تُكتب Na⁺ · <b>صورة: https://...</b> في سطر مستقل · رابط يوتيوب في سطر مستقل يظهر كفيديو</p></div>
    <div class="grid g2"><div class="field"><label>رابط فيديو يوتيوب (اختياري)</label><input type="url" name="video" dir="ltr" value="${esc(l.videoUrl)}" placeholder="https://youtu.be/..."></div>
      <div class="field"><label>رابط ملف PDF على Google Drive (اختياري)</label><input type="url" name="pdf" dir="ltr" value="${esc(l.pdfUrl)}" placeholder="https://drive.google.com/file/d/..."><p class="hint">اجعل مشاركة الملف «أي شخص لديه الرابط».</p></div></div>
    ${classPicker(l.classes)}
    <div class="row"><label class="check"><input type="checkbox" name="pub" ${l.published ? "checked" : ""}> نشر الدرس للطلاب</label>
      <span class="spacer"></span>${isNew ? "" : `<button type="button" class="btn ghost danger" id="del" style="color:var(--danger)">حذف</button>`}<button class="btn">حفظ</button></div>
  </form>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; busy($("button:last-child", f), true);
    const data = { title: f.title.value.trim(), unit: f.unit.value.trim(), body: f.body.value, videoUrl: f.video.value.trim(), pdfUrl: f.pdf.value.trim(), published: f.pub.checked, classes: pickedClasses(f), order: l.order || 0 };
    if (isNew) await addDoc(collection(db, "lessons"), { ...data, createdAt: serverTimestamp() }); else await updateDoc(doc(db, "lessons", id), data);
    await rebuildCatalog(); toast("تم حفظ الدرس ✓"); go("lessons");
  };
  if (!isNew) $("#del").onclick = async () => { if (confirm("حذف هذا الدرس؟")) { await deleteDoc(doc(db, "lessons", id)); await rebuildCatalog(); toast("تم الحذف"); go("lessons"); } };
}

// ---------- الاختبارات ----------
// عدد الطلاب المفعّلين في كل صف (استعلامات عدّ رخيصة)
async function classSizes() {
  const n = await Promise.all(SITE.classes.map((c) => count(query(col("students"), where("className", "==", c), where("active", "==", true)))));
  const total = await count(query(col("students"), where("active", "==", true)));
  return { by: Object.fromEntries(SITE.classes.map((c, i) => [c, n[i]])), total };
}
const targetSize = (sz, classes) => (classes?.length ? classes.reduce((a, c) => a + (sz.by[c] || 0), 0) : sz.total);
async function tQuizzes(main) {
  const [quizzes, sz] = await Promise.all([all("quizzes"), classSizes()]);
  quizzes.sort(byDate);
  const done = await Promise.all(quizzes.map((q) => count(query(col("submissions"), where("quizId", "==", q.id)))));
  main.innerHTML = `<div class="page-head"><div><h1>الاختبارات</h1><p class="sub">تصحيح تلقائي — مفتاح الإجابات محمي ولا يصل للطالب قبل التسليم</p></div><a class="btn" href="#/quiz-edit/new">+ اختبار جديد</a></div>
  <div class="card">${quizzes.length ? quizzes.map((q, i) => `<div class="item"><div class="ic">📝</div><div class="body"><div class="t">${esc(q.title)}</div>
      <div class="m">${q.count || 0} سؤال · ${classLabel(q.classes)} · سلّمه ${done[i]} من ${targetSize(sz, q.classes)}</div></div>
      <div class="row">${!q.published ? `<span class="pill gray">مسودة</span>` : q.open ? `<span class="pill ok">مفتوح</span>` : `<span class="pill warn">مغلق</span>`}
      <a class="btn ghost sm" href="#/quiz-results/${q.id}">النتائج</a><a class="btn sm" href="#/quiz-edit/${q.id}">تعديل</a></div></div>`).join("")
  : `<div class="empty">لا توجد اختبارات بعد.</div>`}</div>`;
}
const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"];
function parseBulk(text) {
  const map = { "أ": 0, "ا": 0, "ب": 1, "ج": 2, "د": 3, "ه": 4, "هـ": 4, "و": 5, a: 0, b: 1, c: 2, d: 3, e: 4, f: 5 };
  const out = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean); if (!lines.length) continue;
    const q = { text: "", options: [], answer: -1, explanation: "", image: "", points: 1 };
    for (const line of lines) {
      let m;
      if ((m = line.match(/^(?:الإجابة|الاجابة|الجواب|answer)\s*[:：]\s*(\S+)/i))) { const k = m[1].replace(/[).\-]/g, "").toLowerCase(); if (k in map) q.answer = map[k]; }
      else if ((m = line.match(/^(?:الشرح|التفسير|explanation)\s*[:：]\s*(.+)/i))) q.explanation = m[1];
      else if ((m = line.match(/^(?:الدرجة|درجة|الدرجات|points?)\s*[:：]\s*(\d+(?:\.\d+)?)/i))) q.points = +m[1];
      else if ((m = line.match(/^(?:صورة|img|image)\s*[:：]\s*(\S+)/i)) && !q.options.length) q.image = m[1];
      else if ((m = line.match(/^(\*)?\s*(هـ|أ|ا|ب|ج|د|ه|و|[a-fA-F])\s*[)\-.:]\s*(.+)$/)) && q.text) { if (m[1]) q.answer = q.options.length; q.options.push(m[3].trim()); }
      else if (!q.options.length) q.text += (q.text ? "\n" : "") + (q.text ? line : line.replace(/^(?:س\s*\d*\s*[:：\-.)]|\d+\s*[\-.)]|q\d*[:.)])\s*/i, ""));
    }
    if (q.text && q.options.length >= 2) out.push(q);
  }
  return out;
}
async function tQuizEdit(main, id) {
  const isNew = id === "new";
  let q = { title: "", description: "", classes: [], published: false, open: true, showResults: true, timeLimit: 0, shuffle: false };
  let questions = [{ text: "", options: ["", "", "", ""], answer: 0, explanation: "", image: "", points: 1 }];
  if (!isNew) {
    const [qs, ks] = await Promise.all([getDoc(doc(db, "quizzes", id)), getDoc(doc(db, "quizKeys", id))]);
    if (!qs.exists()) return go("quizzes"); q = { ...q, ...qs.data() }; const key = ks.exists() ? ks.data() : { answers: [], explanations: [] };
    questions = (q.questions || []).map((x, i) => ({ text: x.text, options: x.options, image: x.image || "", points: x.points || 1, answer: key.answers[i] ?? 0, explanation: key.explanations?.[i] || "" }));
  }
  main.innerHTML = `<div class="page-head"><h1>${isNew ? "اختبار جديد" : "تعديل الاختبار"}</h1><div class="row">${isNew ? "" : `<a class="btn ghost" href="#/quiz-results/${id}">النتائج</a>`}<a class="btn ghost" href="#/quizzes">رجوع</a></div></div>
  <form id="qf">
  <div class="card">
    <div class="field"><label>عنوان الاختبار</label><input type="text" name="title" value="${esc(q.title)}" required></div>
    <div class="field"><label>تعليمات (اختياري)</label><input type="text" name="desc" value="${esc(q.description)}"></div>
    ${classPicker(q.classes)}
    <div class="grid g3"><div class="field"><label>زمن الاختبار بالدقائق <span class="muted">(0 = بدون وقت)</span></label><input type="number" name="time" min="0" max="600" value="${q.timeLimit || 0}"></div>
      <div class="field"><label>الدرجة الكلية</label><input type="text" id="totpts" disabled></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="shuffle" ${q.shuffle ? "checked" : ""}> ترتيب عشوائي للأسئلة لكل طالب</label></div></div>
    <div class="row" style="gap:22px"><label class="check"><input type="checkbox" name="pub" ${q.published ? "checked" : ""}> نشر للطلاب</label>
      <label class="check"><input type="checkbox" name="open" ${q.open ? "checked" : ""}> مفتوح لاستقبال الإجابات</label>
      <label class="check"><input type="checkbox" name="show" ${q.showResults ? "checked" : ""}> يرى الطالب درجته والحلول بعد التسليم</label></div>
  </div>
  <div class="card"><div class="row" style="margin-bottom:10px"><h3 style="margin:0">الأسئلة (<span id="qc"></span>)</h3><span class="spacer"></span><button type="button" class="btn ghost sm" id="paste">📋 لصق أسئلة جاهزة</button></div>
    <div id="qs"></div><button type="button" class="btn ghost" id="addq">+ إضافة سؤال</button></div>
  <div class="row"><span class="spacer"></span>${isNew ? "" : `<button type="button" class="btn ghost" id="del" style="color:var(--danger)">حذف الاختبار</button>`}<button class="btn" id="save">حفظ الاختبار</button></div>
  </form>`;

  const draw = () => {
    $("#qc").textContent = questions.length; $("#totpts").value = questions.reduce((a, x) => a + (+x.points || 1), 0) + " درجة";
    $("#qs").innerHTML = questions.map((x, i) => `<div class="qedit" data-i="${i}">
      <div class="row" style="margin-bottom:8px"><b>سؤال ${i + 1}</b><span class="spacer"></span><button type="button" class="btn link sm" data-up="${i}">↑</button><button type="button" class="btn link sm" data-dn="${i}">↓</button><button type="button" class="btn link sm danger" data-rm="${i}">حذف</button></div>
      <textarea data-f="text" style="min-height:60px" placeholder="نص السؤال (يمكن كتابة أكثر من سطر)">${esc(x.text)}</textarea>
      <div class="row" style="margin-top:6px;flex-wrap:nowrap"><label style="margin:0;white-space:nowrap">الدرجة</label><input type="number" data-f="points" min="0.5" step="0.5" value="${x.points || 1}" style="width:80px">
        <input type="text" data-f="image" dir="ltr" value="${esc(x.image || "")}" placeholder="رابط صورة للسؤال (اختياري) https://..." style="flex:1"></div>
      ${imgSrc(x.image) ? `<div class="qimg" style="margin-top:6px"><img src="${esc(imgSrc(x.image))}" alt=""></div>` : ""}
      <p class="hint" style="margin:6px 0">اختر الدائرة بجانب الإجابة الصحيحة:</p>
      <div class="opts">${x.options.map((o, j) => `<input type="radio" name="ans${i}" value="${j}" ${x.answer === j ? "checked" : ""} style="accent-color:var(--ok);width:18px;height:18px">
        <div class="row" style="flex-wrap:nowrap"><input type="text" data-o="${j}" value="${esc(o)}" placeholder="الخيار ${LETTERS[j]}">${x.options.length > 2 ? `<button type="button" class="btn link sm danger" data-ro="${j}">✕</button>` : ""}</div>`).join("")}</div>
      ${x.options.length < 6 ? `<button type="button" class="btn link sm" data-ao>+ خيار</button>` : ""}
      <input type="text" data-f="explanation" value="${esc(x.explanation)}" placeholder="شرح الإجابة (اختياري — يظهر للطالب بعد التسليم)" style="margin-top:8px">
    </div>`).join("");
  };
  const sync = () => $$(".qedit").forEach((el) => {
    const x = questions[+el.dataset.i]; x.text = $('[data-f=text]', el).value; x.explanation = $('[data-f=explanation]', el).value;
    x.points = +$('[data-f=points]', el).value || 1; x.image = $('[data-f=image]', el).value.trim();
    x.options = $$("[data-o]", el).map((i) => i.value); const r = $(`input[name=ans${el.dataset.i}]:checked`, el); x.answer = r ? +r.value : 0;
  });
  draw();
  $("#qs").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return; sync(); const qi = +b.closest(".qedit").dataset.i;
    if (b.dataset.rm != null) questions.splice(qi, 1);
    else if (b.dataset.up != null && qi > 0) [questions[qi - 1], questions[qi]] = [questions[qi], questions[qi - 1]];
    else if (b.dataset.dn != null && qi < questions.length - 1) [questions[qi + 1], questions[qi]] = [questions[qi], questions[qi + 1]];
    else if (b.dataset.ao != null) questions[qi].options.push("");
    else if (b.dataset.ro != null) { const j = +b.dataset.ro; questions[qi].options.splice(j, 1); if (questions[qi].answer >= questions[qi].options.length) questions[qi].answer = 0; else if (questions[qi].answer > j) questions[qi].answer--; }
    draw();
  };
  $("#qs").onchange = () => { sync(); $("#totpts").value = questions.reduce((a, x) => a + (+x.points || 1), 0) + " درجة"; };
  $("#addq").onclick = () => { sync(); questions.push({ text: "", options: ["", "", "", ""], answer: 0, explanation: "", image: "", points: 1 }); draw(); $$(".qedit").pop().scrollIntoView({ behavior: "smooth" }); };
  $("#paste").onclick = () => {
    openModal(`<h2>لصق أسئلة جاهزة</h2><p class="muted">اكتب أو الصق الأسئلة بهذا الشكل، مع ترك سطر فارغ بين كل سؤال والآخر:</p>
      <pre style="background:#f4f6fa;padding:10px;border-radius:10px;font-family:inherit;white-space:pre-wrap">1- ما عدد مولات الأكسجين في 32 g من O_2 ؟
أ) 0.5
ب) 1
ج) 2
د) 4
الإجابة: ب
الدرجة: 3
الشرح: الكتلة المولية لـ O_2 = 32 g/mol</pre><p class="hint">اختياري: سطر «الدرجة: 4» لدرجة السؤال، وسطر «صورة: رابط» لإرفاق صورة.</p>
      <textarea id="bulkq" style="min-height:220px"></textarea><div id="perr"></div>
      <div class="row"><button class="btn" id="doparse">إضافة الأسئلة</button><button class="btn ghost" data-close>إلغاء</button></div>`);
    $("#doparse").onclick = () => {
      const got = parseBulk($("#bulkq").value);
      if (!got.length) { $("#perr").innerHTML = `<div class="err">لم أتعرف على أي سؤال. تأكد من الشكل وأن بين الأسئلة سطراً فارغاً.</div>`; return; }
      sync(); questions = questions.filter((x) => x.text.trim() || x.options.some((o) => o.trim())); questions.push(...got.map((g) => ({ ...g, answer: g.answer < 0 ? 0 : g.answer })));
      closeModal(); draw(); const miss = got.filter((g) => g.answer < 0).length;
      toast(`تمت إضافة ${got.length} سؤال` + (miss ? ` — ${miss} بدون إجابة محددة، راجعها` : ""));
    };
  };
  $("#qf").onsubmit = async (e) => {
    e.preventDefault(); sync(); const f = e.target;
    const clean = questions.map((x) => ({ ...x, text: x.text.trim(), options: x.options.map((o) => o.trim()) }));
    const bad = clean.findIndex((x) => !x.text || x.options.some((o) => !o));
    if (!clean.length) return toast("أضف سؤالاً واحداً على الأقل");
    if (bad >= 0) { toast(`أكمل نص السؤال ${bad + 1} وجميع خياراته`); $$(".qedit")[bad].scrollIntoView({ behavior: "smooth" }); return; }
    busy($("#save"), true);
    const points = clean.map((x) => +x.points || 1);
    const pub = { title: f.title.value.trim(), description: f.desc.value.trim(), classes: pickedClasses(f), published: f.pub.checked, open: f.open.checked, showResults: f.show.checked,
      timeLimit: Math.max(0, Math.round(+f.time.value || 0)), shuffle: f.shuffle.checked, totalPoints: points.reduce((a, b) => a + b, 0),
      questions: clean.map((x, i) => ({ text: x.text, options: x.options, points: points[i], ...(x.image ? { image: x.image } : {}) })), count: clean.length };
    const key = { answers: clean.map((x) => x.answer), explanations: clean.map((x) => x.explanation.trim()), points };
    try {
      let qid = id;
      if (isNew) { const r = doc(collection(db, "quizzes")); qid = r.id; pub.createdAt = serverTimestamp(); }
      const b = writeBatch(db); b.set(doc(db, "quizzes", qid), pub, { merge: true }); b.set(doc(db, "quizKeys", qid), key); await b.commit();
      await rebuildCatalog(); toast("تم حفظ الاختبار ✓"); go("quizzes");
    } catch (err) { busy($("#save"), false); toast(errMsg(err)); }
  };
  if (!isNew) $("#del").onclick = async () => {
    if (!confirm("حذف الاختبار وجميع إجابات الطلاب عليه؟")) return;
    const subs = await list(query(col("submissions"), where("quizId", "==", id)));
    await commitChunks(subs.flatMap((x) => [(b) => b.delete(doc(db, "submissions", x.id)), (b) => b.delete(doc(db, "starts", x.id)), ...undoSub(x)]));
    const b = writeBatch(db); b.delete(doc(db, "quizzes", id)); b.delete(doc(db, "quizKeys", id)); await b.commit();
    await rebuildCatalog(); toast("تم الحذف"); go("quizzes");
  };
}
async function tQuizResults(main, id) {
  const [qs, ks, subs] = await Promise.all([getDoc(doc(db, "quizzes", id)), getDoc(doc(db, "quizKeys", id)), list(query(col("submissions"), where("quizId", "==", id)))]);
  if (!qs.exists()) return go("quizzes");
  const q = qs.data(), key = ks.data() || { answers: [] }, n = (q.questions || []).length;
  const students = await studentsIn(q.classes);
  const target = students.filter((s) => s.active && (!q.classes?.length || q.classes.includes(s.className)));
  const sMap = Object.fromEntries(students.map((s) => [s.id, s]));
  const rows = subs.map((x) => ({ x, s: sMap[x.studentId] || { name: "(طالب من صف آخر أو محذوف)" }, sc: scoreOf(x, key) })).sort((a, b) => b.sc.pct - a.sc.pct);
  const missing = target.filter((s) => !subs.some((x) => x.studentId === s.id));
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.sc.pct, 0) / rows.length) : 0;
  const qStats = (q.questions || []).map((qq, i) => (subs.length ? Math.round((subs.filter((x) => answersOf(x, n)[i] === key.answers[i]).length / subs.length) * 100) : 0));

  main.innerHTML = `<div class="page-head"><div><h1>نتائج: ${esc(q.title)}</h1><p class="sub">${q.count} سؤال · سلّمه ${subs.length} من ${target.length}</p></div>
    <div class="row"><button class="btn ghost" id="csv">⬇ تصدير Excel</button><button class="btn ghost" id="tog">${q.open ? "إغلاق الاختبار" : "فتح الاختبار"}</button><a class="btn ghost" href="#/quizzes">رجوع</a></div></div>
  <div class="grid g3" style="margin-bottom:16px"><div class="stat"><div class="n">${avg}%</div><div class="l">متوسط الدرجات</div></div>
    <div class="stat"><div class="n">${subs.length}</div><div class="l">سلّموا</div></div><div class="stat"><div class="n">${missing.length}</div><div class="l">لم يسلّموا</div></div></div>
  <div class="card"><div class="row" style="margin-bottom:8px"><h3 style="margin:0">الدرجات</h3><span class="spacer"></span><input type="text" id="sq" placeholder="بحث بالاسم..." style="max-width:200px"></div>
    ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>الطالب</th><th>الصف</th><th>الدرجة</th><th>النسبة</th><th>وقت التسليم</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-n="${esc(r.s.name)}"><td><b>${esc(r.s.name)}</b></td><td>${esc(r.s.className || "")}</td><td>${r.sc.right} من ${r.sc.total}</td><td>${pctPill(r.sc.pct)}</td><td class="muted">${fmt(r.x.submittedAt)}</td>
    <td style="white-space:nowrap"><button class="btn link sm" data-view="${r.x.id}">الإجابات</button><button class="btn link sm danger" data-redo="${r.x.id}">السماح بإعادة الحل</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">لا توجد تسليمات بعد.</p>`}</div>
  ${missing.length ? `<details class="card"><summary style="cursor:pointer"><b>لم يسلّموا بعد (${missing.length})</b></summary><div class="row" style="margin-top:10px">${missing.map((s) => `<span class="pill gray">${esc(s.name)}</span>`).join("")}</div></details>` : ""}
  ${subs.length ? `<div class="card"><h3>تحليل الأسئلة — نسبة الإجابات الصحيحة</h3>${(q.questions || []).map((qq, i) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span style="display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--brand-soft);color:var(--brand);font-size:13px">${i + 1}</span><span style="flex:1">${inline(String(qq.text).split("\n")[0])}</span>${pctPill(qStats[i])}</div>`).join("")}</div>` : ""}`;

  $("#tog").onclick = async () => { await updateDoc(doc(db, "quizzes", id), { open: !q.open }); await rebuildCatalog(); toast(q.open ? "تم إغلاق الاختبار" : "تم فتح الاختبار"); route(); };
  if ($("#sq")) $("#sq").oninput = (e) => $$("tbody tr[data-n]", main).forEach((tr) => tr.classList.toggle("hidden", !tr.dataset.n.includes(e.target.value.trim())));
  $$("[data-redo]", main).forEach((b) => (b.onclick = async () => {
    if (!confirm("حذف إجابة هذا الطالب ليتمكن من حل الاختبار مرة أخرى؟")) return;
    const x = subs.find((y) => y.id === b.dataset.redo);
    await commitChunks([(wb) => wb.delete(doc(db, "submissions", x.id)), (wb) => wb.delete(doc(db, "starts", x.id)), ...undoSub(x)]); toast("يمكن للطالب إعادة الحل الآن"); route();
  }));
  $$("[data-view]", main).forEach((b) => (b.onclick = () => { const r = rows.find((r) => r.x.id === b.dataset.view); openModal(`<h2>${esc(r.s.name)} — ${r.sc.right} من ${r.sc.total}</h2>${reviewHTML(q, key, answersOf(r.x, n))}<button class="btn ghost" data-close>إغلاق</button>`); }));
  $("#csv").onclick = () => downloadCSV(`نتائج-${q.title}`, [["الطالب", "الصف", "الدرجة", "من", "النسبة %", "وقت التسليم"], ...rows.map((r) => [r.s.name, r.s.className, r.sc.right, r.sc.total, r.sc.pct, ts(r.x.submittedAt)?.toLocaleString("ar-AE")]), ...missing.map((s) => [s.name, s.className, "لم يسلّم", "", "", ""])]);
}
function reviewHTML(q, key, answers) {
  return (q.questions || []).map((qq, i) => `<div class="q"><div class="qt"><span class="qn">${i + 1}</span><div style="flex:1">${qText(qq)}</div>${qq.points ? `<span class="pts">${qq.points} درجات</span>` : ""}</div>
    ${qq.options.map((o, j) => `<div class="opt ${j === key.answers[i] ? "right" : answers[i] === j ? "wrong" : ""}">${j === key.answers[i] ? "✔" : answers[i] === j ? "✘" : "○"} ${"ABCDEF"[j]}) ${inline(o)}</div>`).join("")}
    ${answers[i] == null || answers[i] < 0 ? `<p class="hint">لم تتم الإجابة على هذا السؤال</p>` : ""}
    ${key.explanations?.[i] ? `<div class="expl">💡 ${inline(key.explanations[i])}</div>` : ""}</div>`).join("");
}
// ---------- الواجبات ----------
async function tAssignments(main) {
  const as = (await all("assignments")).sort(byDate);
  const cnt = await Promise.all(as.map((a) => Promise.all([count(query(col("homework"), where("assignmentId", "==", a.id))), count(query(col("homework"), where("assignmentId", "==", a.id), where("graded", "==", false)))])));
  main.innerHTML = `<div class="page-head"><div><h1>الواجبات</h1></div><a class="btn" href="#/assign-edit/new">+ واجب جديد</a></div>
  <div class="card">${as.length ? as.map((a, i) => { const [tot, pend] = cnt[i];
    return `<div class="item"><div class="ic">📂</div><div class="body"><div class="t">${esc(a.title)}</div><div class="m">التسليم حتى: ${a.due ? fmt(a.due) : "مفتوح"} · ${classLabel(a.classes)} · ${tot} تسليم${pend ? ` · <b style="color:var(--accent)">${pend} بانتظار التصحيح</b>` : ""}</div></div>
    <div class="row">${a.published ? `<span class="pill ok">منشور</span>` : `<span class="pill gray">مسودة</span>`}<a class="btn ghost sm" href="#/assign-subs/${a.id}">التسليمات</a><a class="btn sm" href="#/assign-edit/${a.id}">تعديل</a></div></div>`; }).join("")
  : `<div class="empty">لا توجد واجبات بعد.</div>`}</div>`;
}
async function tAssignEdit(main, id) {
  const isNew = id === "new"; let a = { title: "", body: "", link: "", due: "", published: false, classes: [], maxGrade: 10 };
  if (!isNew) { const s = await getDoc(doc(db, "assignments", id)); if (!s.exists()) return go("assignments"); a = { ...a, ...s.data() }; }
  const dueVal = a.due ? new Date(ts(a.due).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  main.innerHTML = `<div class="page-head"><h1>${isNew ? "واجب جديد" : "تعديل الواجب"}</h1><a class="btn ghost" href="#/assignments">رجوع</a></div>
  <form class="card" id="af"><div class="field"><label>عنوان الواجب</label><input type="text" name="title" value="${esc(a.title)}" required></div>
    <div class="field"><label>المطلوب</label><textarea name="body">${esc(a.body)}</textarea></div>
    <div class="grid g3"><div class="field"><label>رابط ملف مرفق (اختياري)</label><input type="url" name="link" dir="ltr" value="${esc(a.link)}"></div>
      <div class="field"><label>آخر موعد للتسليم</label><input type="datetime-local" name="due" value="${dueVal}"></div>
      <div class="field"><label>الدرجة العظمى</label><input type="number" name="max" min="1" value="${a.maxGrade}"></div></div>
    ${classPicker(a.classes)}
    <div class="row"><label class="check"><input type="checkbox" name="pub" ${a.published ? "checked" : ""}> نشر للطلاب</label><span class="spacer"></span>
    ${isNew ? "" : `<button type="button" class="btn ghost" id="del" style="color:var(--danger)">حذف</button>`}<button class="btn">حفظ</button></div></form>`;
  $("#af").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    const data = { title: f.title.value.trim(), body: f.body.value, link: f.link.value.trim(), due: f.due.value ? new Date(f.due.value) : null, maxGrade: +f.max.value || 10, published: f.pub.checked, classes: pickedClasses(f) };
    if (isNew) await addDoc(collection(db, "assignments"), { ...data, createdAt: serverTimestamp() }); else await updateDoc(doc(db, "assignments", id), data);
    await rebuildCatalog(); toast("تم الحفظ ✓"); go("assignments");
  };
  if (!isNew) $("#del").onclick = async () => { if (confirm("حذف الواجب؟")) { await deleteDoc(doc(db, "assignments", id)); await rebuildCatalog(); go("assignments"); } };
}
async function tAssignSubs(main, id) {
  const [as, hw] = await Promise.all([getDoc(doc(db, "assignments", id)), list(query(col("homework"), where("assignmentId", "==", id)))]);
  if (!as.exists()) return go("assignments"); const a = as.data();
  const students = await studentsIn(a.classes);
  const sMap = Object.fromEntries(students.map((s) => [s.id, s]));
  const missing = students.filter((s) => s.active && (!a.classes?.length || a.classes.includes(s.className)) && !hw.some((h) => h.studentId === s.id));
  hw.sort((x, y) => (x.graded === true) - (y.graded === true) || (ts(x.submittedAt) || 0) - (ts(y.submittedAt) || 0));
  main.innerHTML = `<div class="page-head"><div><h1>تسليمات: ${esc(a.title)}</h1><p class="sub">${hw.length} تسليم · ${missing.length} لم يسلّم</p></div><a class="btn ghost" href="#/assignments">رجوع</a></div>
  ${hw.map((h) => { const s = sMap[h.studentId] || { name: "(طالب محذوف)" }; const late = a.due && ts(h.submittedAt) > ts(a.due);
    return `<div class="card"><div class="row"><b>${esc(s.name)}</b><span class="muted">${esc(s.className || "")}</span>${late ? `<span class="pill bad">متأخر</span>` : ""}<span class="spacer"></span><span class="muted">${fmt(h.submittedAt)}</span></div>
    <div class="content" style="margin:10px 0;font-size:16px">${rich(h.text)}</div>${safeUrl(h.link) ? `<a target="_blank" rel="noopener" href="${esc(safeUrl(h.link))}">🔗 الملف المرفق</a>` : ""}
    <form class="row" data-g="${h.id}" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px"><input type="number" name="g" min="0" max="${a.maxGrade}" step="0.5" value="${h.grade ?? ""}" placeholder="الدرجة" style="width:100px" required> <span class="muted">من ${a.maxGrade}</span>
    <input type="text" name="fb" value="${esc(h.feedback || "")}" placeholder="ملاحظة للطالب (اختياري)" style="flex:1;min-width:180px"><button class="btn sm">${h.grade != null ? "تحديث" : "حفظ الدرجة"}</button></form></div>`; }).join("") || `<div class="card empty">لا توجد تسليمات بعد.</div>`}
  ${missing.length ? `<details class="card"><summary style="cursor:pointer"><b>لم يسلّموا (${missing.length})</b></summary><div class="row" style="margin-top:10px">${missing.map((s) => `<span class="pill gray">${esc(s.name)}</span>`).join("")}</div></details>` : ""}`;
  $$("[data-g]", main).forEach((f) => (f.onsubmit = async (e) => { e.preventDefault(); await updateDoc(doc(db, "homework", f.dataset.g), { grade: +f.g.value, feedback: f.fb.value.trim(), graded: true, gradedAt: serverTimestamp() }); toast("تم حفظ الدرجة ✓"); }));
}

// ---------- الإعلانات ----------
async function tAnnouncements(main) {
  const an = (await all("announcements")).sort(byDate);
  main.innerHTML = `<div class="page-head"><h1>الإعلانات</h1></div>
  <form class="card" id="nf"><div class="field"><label>إعلان جديد</label><input type="text" name="title" placeholder="العنوان" required style="margin-bottom:8px"><textarea name="body" placeholder="نص الإعلان" style="min-height:80px"></textarea></div>
    ${classPicker([])}<button class="btn">نشر الإعلان</button></form>
  <div class="card">${an.map((x) => `<div class="item"><div class="ic">📢</div><div class="body"><div class="t">${esc(x.title)}</div><div class="m">${fmt(x.createdAt)} ${classLabel(x.classes)}</div><div style="margin-top:6px">${rich(x.body)}</div></div><button class="btn link sm danger" data-del="${x.id}">حذف</button></div>`).join("") || `<div class="empty">لا توجد إعلانات.</div>`}</div>`;
  $("#nf").onsubmit = async (e) => { e.preventDefault(); const f = e.target; await addDoc(collection(db, "announcements"), { title: f.title.value.trim(), body: f.body.value, classes: pickedClasses(f), createdAt: serverTimestamp() }); await rebuildCatalog(); toast("تم النشر ✓"); route(); };
  $$("[data-del]", main).forEach((b) => (b.onclick = async () => { if (confirm("حذف الإعلان؟")) { await deleteDoc(doc(db, "announcements", b.dataset.del)); await rebuildCatalog(); route(); } }));
}

// ---------- الرسائل ----------
async function tMessages(main) {
  const threads = await list(query(col("threads"), orderBy("lastAt", "desc"), limit(80)));
  const names = {}; await Promise.all(threads.map(async (t) => { const s = await getDoc(doc(db, "students", t.id)); names[t.id] = s.exists() ? s.data() : { name: "(طالب محذوف)" }; }));
  main.innerHTML = `<div class="page-head"><div><h1>الرسائل</h1><p class="sub">أحدث المحادثات أولاً</p></div><button class="btn" id="newc">+ محادثة جديدة</button></div>
  <div class="card thread-list">${threads.map((t) => `<div class="item clickable ${t.teacherUnread ? "unread" : ""}" data-sid="${t.id}"><div class="ic">👤</div><div class="body"><div class="t">${esc(names[t.id].name)} <span class="muted" style="font-weight:400;font-size:13px">${esc(names[t.id].className || "")}</span></div><div class="m">${t.lastFrom === "teacher" ? "أنت: " : ""}${esc(t.lastText || "")} · ${ago(t.lastAt)}</div></div></div>`).join("") || `<div class="empty">لا توجد محادثات بعد.</div>`}</div>`;
  $$("[data-sid]", main).forEach((el) => (el.onclick = () => go("thread/" + el.dataset.sid)));
  $("#newc").onclick = () => {
    openModal(`<h2>محادثة جديدة</h2><div class="row" style="margin-bottom:10px">${clsSelect("nc", prefCls("students"), "كل الصفوف")}<input type="text" id="ns" placeholder="اسم الطالب..." style="flex:1"></div><div id="nl" class="thread-list"></div><button class="btn ghost" data-close>إغلاق</button>`);
    let pool = [];
    const draw = () => { const qv = $("#ns").value.trim(); $("#nl").innerHTML = pool.filter((s) => s.active && s.name.includes(qv)).slice(0, 40).map((s) => `<div class="item clickable" data-to="${s.id}"><div class="body"><div class="t">${esc(s.name)}</div><div class="m">${esc(s.className || "")}</div></div></div>`).join("") || `<p class="muted">لا نتائج</p>`;
      $$("[data-to]").forEach((el) => (el.onclick = () => { closeModal(); go("thread/" + el.dataset.to); })); };
    const load = async () => { const c = $("#nc").value; pool = (c ? await list(query(col("students"), where("className", "==", c))) : await all("students")).filter((x) => x.name); pool.sort((a, b) => a.name.localeCompare(b.name, "ar")); draw(); };
    $("#nc").onchange = load; $("#ns").oninput = draw; load();
  };
}
async function tThread(main, sid) {
  const s = await getDoc(doc(db, "students", sid)); if (!s.exists()) return go("messages");
  chatView(main, sid, `محادثة مع ${s.data().name}`, "#/messages");
}
function chatView(main, sid, title, back) {
  const mine = isTeacher() ? "teacher" : "student";
  main.innerHTML = `<div class="page-head"><h1>${esc(title)}</h1>${back ? `<a class="btn ghost" href="${back}">رجوع</a>` : ""}</div>
  <div class="card"><div class="chat" id="chat"><div class="empty">جارٍ التحميل...</div></div>
  <form id="mf" class="row" style="margin-top:10px;flex-wrap:nowrap"><textarea name="t" placeholder="اكتب رسالتك..." style="min-height:48px;height:48px" maxlength="2000" required></textarea><button class="btn">إرسال</button></form></div>`;
  const tRef = doc(db, "threads", sid);
  S.unsubs.push(onSnapshot(query(collection(db, "threads", sid, "msgs"), orderBy("at")), (snap) => {
    const box = $("#chat"); if (!box) return;
    box.innerHTML = snap.docs.map((d) => { const m = d.data(); return `<div class="bubble ${m.from === mine ? "me" : "them"}">${esc(m.text)}<small>${fmt(m.at)}</small></div>`; }).join("") || `<div class="empty">ابدأ المحادثة</div>`;
    box.scrollTop = box.scrollHeight;
    const flag = isTeacher() ? "teacherUnread" : "studentUnread";
    if (snap.size && (S.badges?.messages || isTeacher())) setDoc(tRef, { [flag]: false }, { merge: true }).catch(() => {});
  }, (e) => { $("#chat").innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }));
  $("#mf").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; const text = f.t.value.trim(); if (!text) return; const btn = $("button", f); busy(btn, true, "...");
    try {
      await addDoc(collection(db, "threads", sid, "msgs"), { from: mine, text, at: serverTimestamp() });
      await setDoc(tRef, { lastAt: serverTimestamp(), lastFrom: mine, lastText: text.slice(0, 120), [isTeacher() ? "studentUnread" : "teacherUnread"]: true }, { merge: true });
      f.t.value = "";
    } catch (err) { toast(errMsg(err)); }
    busy(btn, false);
  };
  $("#mf").t.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#mf").requestSubmit(); } });
}

// ============================================================
//                       صفحات الطالب
// ============================================================
const myQ = async (col, field = "studentId") => list(query(collection(db, col), where(field, "==", S.me.id)));
async function catalog() {
  if (S.cat && Date.now() - S.catAt < 60000) return S.cat;   // يُعاد استخدامه أثناء التنقل لمدة دقيقة
  const d = await getDoc(doc(db, "meta", "catalog"));
  S.cat = d.exists() ? d.data() : {}; S.catAt = Date.now(); return S.cat;
}
const pubQ = async (k) => ((await catalog())[k] || []).filter(forClass).map((x) => ({ ...x }));

async function sHome(main) {
  const [an, quizzes, subs, assigns, hw, lessons] = await Promise.all([pubQ("announcements"), pubQ("quizzes"), myQ("submissions"), pubQ("assignments"), myQ("homework"), pubQ("lessons")]);
  const pendQ = quizzes.filter((q) => q.open && !subs.some((s) => s.quizId === q.id));
  const pendA = assigns.filter((a) => !hw.some((h) => h.assignmentId === a.id) && (!a.due || ts(a.due) > new Date()));
  const news = an.sort(byDate).slice(0, 8);
  const latest = lessons.sort(byDate).slice(0, 3);
  main.innerHTML = `${SITE.cover ? `<div class="home-cover"><img src="${esc(SITE.cover)}" alt="${esc(SITE.title)}"></div>` : ""}<div class="page-head"><div><h1>أهلاً ${esc(S.me.name.split(" ")[0])} 👋</h1><p class="sub">${esc(S.me.className || "")}</p></div></div>
  <div class="grid g2">
    <div class="card"><h3>📝 اختبارات بانتظارك</h3>${pendQ.map((q) => `<div class="item clickable" onclick="location.hash='#/quiz/${q.id}'"><div class="body"><div class="t">${esc(q.title)}</div><div class="m">${q.count} سؤال</div></div><span class="btn sm">ابدأ</span></div>`).join("") || `<p class="muted">لا توجد اختبارات جديدة 👍</p>`}</div>
    <div class="card"><h3>📂 واجبات مطلوبة</h3>${pendA.map((a) => `<div class="item clickable" onclick="location.hash='#/assign/${a.id}'"><div class="body"><div class="t">${esc(a.title)}</div><div class="m">${a.due ? "حتى " + fmt(a.due) : ""}</div></div><span class="btn sm">سلّم</span></div>`).join("") || `<p class="muted">لا توجد واجبات مطلوبة 👍</p>`}</div>
  </div>
  ${latest.length ? `<div class="card"><h3>📘 أحدث الدروس</h3>${latest.map((l) => `<div class="item clickable" onclick="location.hash='#/lesson/${l.id}'"><div class="ic">📘</div><div class="body"><div class="t">${esc(l.title)}</div><div class="m">${esc(l.unit || "")}</div></div></div>`).join("")}</div>` : ""}
  <div class="card"><h3>📢 الإعلانات</h3>${news.map((x) => `<div class="item"><div class="body"><div class="t">${esc(x.title)}</div><div class="m">${fmt(x.createdAt)}</div><div style="margin-top:4px">${rich(x.body)}</div></div></div>`).join("") || `<p class="muted">لا توجد إعلانات.</p>`}</div>`;
}
async function sLessons(main) {
  const lessons = await pubQ("lessons");
  const units = {}; lessons.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (ts(a.createdAt) || 0) - (ts(b.createdAt) || 0)).forEach((l) => (units[l.unit || "دروس عامة"] ||= []).push(l));
  main.innerHTML = `<div class="page-head"><h1>الدروس</h1></div>` + (Object.entries(units).map(([u, ls]) => `<div class="card"><h3>${esc(u)}</h3>${ls.map((l) => `<div class="item clickable" onclick="location.hash='#/lesson/${l.id}'"><div class="ic">📘</div><div class="body"><div class="t">${esc(l.title)}</div><div class="m">${l.v ? "🎬 فيديو " : ""}${l.p ? "📄 ملف" : ""}</div></div></div>`).join("")}</div>`).join("") || `<div class="card empty">لم تُنشر دروس بعد.</div>`);
}
async function sLesson(main, id) {
  const s = await getDoc(doc(db, "lessons", id)); if (!s.exists()) return go("lessons"); const l = s.data();
  main.innerHTML = `<div class="page-head"><div><p class="sub">${esc(l.unit || "")}</p><h1>${esc(l.title)}</h1></div><a class="btn ghost" href="#/lessons">رجوع</a></div>
  <div class="card">${l.videoUrl ? videoBox(l.videoUrl) : ""}<div class="content">${rich(l.body)}</div>${l.pdfUrl ? `<div style="margin-top:14px">${pdfBox(l.pdfUrl)}</div>` : ""}</div>`;
  if (!isTeacher()) { const vr = doc(db, "views", `${id}_${S.me.id}`); getDoc(vr).then((v) => { if (!v.exists()) return setDoc(vr, { lessonId: id, studentId: S.me.id, viewedAt: serverTimestamp(), counted: false }); }).catch(() => {}); }
}
async function sQuizzes(main) {
  const [quizzes, subs] = await Promise.all([pubQ("quizzes"), myQ("submissions")]); quizzes.sort(byDate);
  main.innerHTML = `<div class="page-head"><h1>الاختبارات</h1></div><div class="card">${quizzes.map((q) => { const done = subs.find((s) => s.quizId === q.id);
    return `<div class="item clickable" onclick="location.hash='#/quiz/${q.id}'"><div class="ic">📝</div><div class="body"><div class="t">${esc(q.title)}</div><div class="m">${q.count} سؤال${q.timeLimit ? ` · ⏱ ${q.timeLimit} دقيقة` : ""}${q.totalPoints ? ` · ${q.totalPoints} درجة` : ""}</div></div>
    ${done ? `<span class="pill ok">تم التسليم</span>` : q.open ? `<span class="btn sm">ابدأ</span>` : `<span class="pill gray">مغلق</span>`}</div>`; }).join("") || `<div class="empty">لا توجد اختبارات.</div>`}</div>`;
}
async function sQuiz(main, id) {
  const qs = await getDoc(doc(db, "quizzes", id)); if (!qs.exists()) return go("quizzes"); const q = qs.data();
  const sub = (await myQ("submissions")).find((s) => s.quizId === id);
  const head = `<div class="page-head"><div><h1>${esc(q.title)}</h1><p class="sub">${q.count} سؤال${q.totalPoints ? ` · ${q.totalPoints} درجة` : ""}${q.timeLimit ? ` · ${q.timeLimit} دقيقة` : ""}</p></div><a class="btn ghost" href="#/quizzes">رجوع</a></div>`;
  if (sub) {
    if (!q.showResults) { main.innerHTML = head + `<div class="card empty">✅ تم تسليم إجاباتك بتاريخ ${fmt(sub.submittedAt)}.<br>سيعلن المعلم النتائج لاحقاً.</div>`; return; }
    const ks = await getDoc(doc(db, "quizKeys", id)); const key = ks.data(); const sc = scoreOf(sub, key);
    main.innerHTML = head + `<div class="card" style="text-align:center"><div class="score-big">${sc.right} من ${sc.total}</div><div>${pctPill(sc.pct)}</div><p class="muted">${sc.pct >= 85 ? "ممتاز! أحسنت 🌟" : sc.pct >= 60 ? "جيد — راجع الأسئلة الخاطئة 💪" : "راجع الدرس ثم الحلول بالأسفل 📘"}</p></div>${reviewHTML(q, key, answersOf(sub, key.answers.length))}`;
    return;
  }
  if (!q.open) { main.innerHTML = head + `<div class="card empty">هذا الاختبار مغلق حالياً.</div>`; return; }
  const N = q.questions.length, total = q.totalPoints || N;
  const startRef = doc(db, "starts", `${id}_${S.me.id}`);
  let started = null; try { const st = await getDoc(startRef); if (st.exists()) started = ts(st.data().startedAt); } catch {}
  const intro = () => {
    main.innerHTML = head + `<div class="card exam-intro">
      <div class="grid g4" style="margin-bottom:14px">
        <div class="stat"><div class="n">${N}</div><div class="l">عدد الأسئلة</div></div>
        <div class="stat"><div class="n">${total}</div><div class="l">الدرجة الكلية</div></div>
        <div class="stat"><div class="n">${q.timeLimit ? q.timeLimit + " د" : "مفتوح"}</div><div class="l">زمن الاختبار</div></div>
        <div class="stat"><div class="n">مرة واحدة</div><div class="l">عدد المحاولات</div></div></div>
      ${q.description ? `<p>${esc(q.description)}</p>` : ""}
      <ul class="rules"><li>يظهر سؤال واحد في كل مرة، وتتنقل بين الأسئلة بأزرار «التالي» و«السابق» أو من لوحة الأسئلة.</li>
        <li>يمكنك وضع علامة 🚩 على أي سؤال للعودة إليه قبل التسليم.</li>
        ${q.timeLimit ? `<li>يبدأ العدّ التنازلي عند الضغط على «ابدأ الاختبار»، ولا يتوقف إذا أغلقت الصفحة. عند انتهاء الوقت تُسلَّم إجاباتك تلقائياً.</li>` : ""}
        <li>إجاباتك تُحفظ على جهازك أثناء الحل، ولا يمكن تعديلها بعد التسليم النهائي.</li></ul>
      <div class="row"><span class="spacer"></span><button class="btn" id="go" style="padding:13px 34px;font-size:17px">${started ? "متابعة الاختبار" : "ابدأ الاختبار"}</button></div></div>`;
    $("#go").onclick = async (e) => {
      busy(e.target, true);
      if (!started) { try { await setDoc(startRef, { quizId: id, studentId: S.me.id, startedAt: serverTimestamp() }); const st = await getDoc(startRef); started = ts(st.data().startedAt) || new Date(); } catch (err) { busy(e.target, false); return toast(errMsg(err)); } }
      exam();
    };
  };
  const exam = () => {
    const sk = `exam-${id}-${S.me.id}`; let st = {}; try { st = JSON.parse(localStorage.getItem(sk) || "{}"); } catch {}
    const ans = st.ans || {}, flags = st.flags || {};
    let order = st.order; if (!order || order.length !== N) { order = [...Array(N).keys()]; if (q.shuffle) order = shuffle(order); }
    let cur = Math.min(st.cur || 0, N - 1), submitting = false, timer = null;
    const save = () => { try { localStorage.setItem(sk, JSON.stringify({ ans, flags, order, cur })); } catch {} };
    const deadline = q.timeLimit && started ? started.getTime() + q.timeLimit * 60000 : 0;
    main.innerHTML = `<div class="exam">
      <div class="exam-top"><div><b>${esc(q.title)}</b><div class="muted" style="font-size:13px">${esc(S.me.name)}</div></div><span class="spacer"></span>
        <div class="exam-prog"><span id="pdone">0</span> / ${N} <small>تمت الإجابة</small><div class="bar"><i id="pbar"></i></div></div>
        ${deadline ? `<div class="timer" id="timer">--:--</div>` : ""}</div>
      <div class="exam-body"><div class="exam-main" id="qbox"></div>
        <aside class="exam-nav"><div class="row" style="margin-bottom:8px"><b>الأسئلة</b><span class="spacer"></span><span class="muted" style="font-size:12px">● مُجاب 🚩 للمراجعة</span></div>
          <div class="navgrid" id="navg"></div><button class="btn block" id="toreview" style="margin-top:12px">مراجعة وإنهاء</button></aside></div></div>`;
    const answered = () => Object.keys(ans).filter((k) => ans[k] >= 0).length;
    const nav = () => {
      $("#navg").innerHTML = order.map((qi, p) => `<button type="button" class="nb ${ans[qi] >= 0 ? "done" : ""} ${p === cur ? "cur" : ""} ${flags[qi] ? "flag" : ""}" data-p="${p}">${p + 1}</button>`).join("");
      $$("#navg .nb").forEach((b) => (b.onclick = () => { cur = +b.dataset.p; show(); }));
      $("#pdone").textContent = answered(); $("#pbar").style.width = (answered() / N) * 100 + "%";
    };
    const show = () => {
      const qi = order[cur], qq = q.questions[qi]; save();
      $("#qbox").innerHTML = `<div class="qcard"><div class="row qhead"><span class="qnum">السؤال ${cur + 1} من ${N}</span>${qq.points ? `<span class="pts">${qq.points} درجات</span>` : ""}<span class="spacer"></span>
          <button type="button" class="btn ghost sm flagbtn ${flags[qi] ? "on" : ""}" id="flag">${flags[qi] ? "🚩 مُعلَّم للمراجعة" : "🏳 علّم للمراجعة"}</button></div>
        <div class="qtext">${qText(qq)}</div>
        <div class="choices">${qq.options.map((o, j) => `<button type="button" class="choice ${ans[qi] === j ? "sel" : ""}" data-j="${j}"><span class="lt">${["A", "B", "C", "D", "E", "F"][j]}</span><span class="ct">${inline(o)}</span></button>`).join("")}</div>
        ${ans[qi] >= 0 ? `<button type="button" class="btn link sm" id="clr" style="margin-top:6px">مسح الإجابة</button>` : ""}
        <div class="row qfoot"><button type="button" class="btn ghost" id="prev" ${cur === 0 ? "disabled" : ""}>→ السابق</button><span class="spacer"></span>
          ${cur < N - 1 ? `<button type="button" class="btn" id="next">التالي ←</button>` : `<button type="button" class="btn" id="fin">مراجعة وإنهاء</button>`}</div></div>`;
      $$(".choice", main).forEach((b) => (b.onclick = () => { ans[qi] = +b.dataset.j; save(); show(); }));
      if ($("#clr")) $("#clr").onclick = () => { delete ans[qi]; save(); show(); };
      $("#flag").onclick = () => { flags[qi] = !flags[qi]; save(); show(); };
      $("#prev").onclick = () => { if (cur > 0) { cur--; show(); } };
      if ($("#next")) $("#next").onclick = () => { cur++; show(); };
      if ($("#fin")) $("#fin").onclick = review;
      nav(); if (window.innerWidth < 900) $("#qbox").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const review = () => {
      const un = order.map((qi, p) => [qi, p]).filter(([qi]) => !(ans[qi] >= 0)), fl = order.map((qi, p) => [qi, p]).filter(([qi]) => flags[qi]);
      openModal(`<h2>مراجعة قبل التسليم</h2>
        <div class="grid g3" style="margin-bottom:12px"><div class="stat"><div class="n" style="color:var(--ok)">${answered()}</div><div class="l">تمت الإجابة</div></div>
          <div class="stat"><div class="n" style="color:${un.length ? "var(--danger)" : "inherit"}">${un.length}</div><div class="l">بدون إجابة</div></div>
          <div class="stat"><div class="n" style="color:#d98a00">${fl.length}</div><div class="l">مُعلَّمة للمراجعة</div></div></div>
        ${un.length ? `<p><b>أسئلة بدون إجابة:</b> ${un.map(([, p]) => `<button class="nb" data-jump="${p}">${p + 1}</button>`).join(" ")}</p>` : ""}
        ${fl.length ? `<p><b>أسئلة مُعلَّمة:</b> ${fl.map(([, p]) => `<button class="nb flag" data-jump="${p}">${p + 1}</button>`).join(" ")}</p>` : ""}
        <p class="muted">بعد التسليم النهائي لا يمكن تعديل الإجابات.</p>
        <div class="row"><button class="btn ghost" data-close>العودة للاختبار</button><span class="spacer"></span><button class="btn" id="final">تسليم نهائي</button></div>`);
      $$("[data-jump]").forEach((b) => (b.onclick = () => { closeModal(); cur = +b.dataset.jump; show(); }));
      $("#final").onclick = () => { closeModal(); submit(false); };
    };
    const submit = async (auto) => {
      if (submitting) return; submitting = true; clearInterval(timer);
      const picks = Object.fromEntries(Object.entries(ans).filter(([, v]) => v >= 0).map(([k, v]) => [String(k), v]));
      $("#qbox").innerHTML = `<div class="qcard empty"><div class="spinner" style="margin:0 auto 12px"></div>${auto ? "انتهى الوقت — جارٍ تسليم إجاباتك..." : "جارٍ التسليم..."}</div>`;
      try {
        await setDoc(doc(db, "submissions", `${id}_${S.me.id}`), { quizId: id, studentId: S.me.id, className: S.me.className || "", picks, scored: false, submittedAt: serverTimestamp() });
        try { localStorage.removeItem(sk); } catch {} toast(auto ? "انتهى الوقت وتم تسليم إجاباتك ✓" : "تم التسليم ✓"); route();
      } catch (err) {
        if (deadline && Date.now() > deadline + 90000) { try { localStorage.removeItem(sk); } catch {} $("#qbox").innerHTML = `<div class="qcard empty">⏰ انتهى وقت الاختبار قبل التسليم، فلم تُقبل الإجابات.<br>تواصل مع المعلم إذا كان هناك عذر.</div>`; return; }
        submitting = false; toast(errMsg(err)); show();
      }
    };
    $("#toreview").onclick = review;
    if (deadline) {
      const tick = () => {
        const left = Math.max(0, deadline - Date.now()), m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000), t = $("#timer");
        if (!t) return clearInterval(timer);
        t.textContent = `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; t.classList.toggle("low", left < 5 * 60000);
        if (left <= 0) submit(true);
      };
      timer = setInterval(tick, 1000); S.unsubs.push(() => clearInterval(timer)); tick();
    }
    show();
  };
  if (started && q.timeLimit) exam(); else intro();
}
async function sAssignments(main) {
  const [as, hw] = await Promise.all([pubQ("assignments"), myQ("homework")]); as.sort(byDate);
  main.innerHTML = `<div class="page-head"><h1>الواجبات</h1></div><div class="card">${as.map((a) => { const h = hw.find((x) => x.assignmentId === a.id); const late = a.due && ts(a.due) < new Date();
    return `<div class="item clickable" onclick="location.hash='#/assign/${a.id}'"><div class="ic">📂</div><div class="body"><div class="t">${esc(a.title)}</div><div class="m">${a.due ? "حتى " + fmt(a.due) : "بدون موعد"}</div></div>
    ${h ? (h.graded ? `<span class="pill ok">${h.grade} من ${a.maxGrade}</span>` : `<span class="pill">تم التسليم</span>`) : late ? `<span class="pill bad">انتهى الموعد</span>` : `<span class="pill warn">مطلوب</span>`}</div>`; }).join("") || `<div class="empty">لا توجد واجبات.</div>`}</div>`;
}
async function sAssign(main, id) {
  const as = await getDoc(doc(db, "assignments", id)); if (!as.exists()) return go("assignments"); const a = as.data();
  const h = (await myQ("homework")).find((x) => x.assignmentId === id);
  const graded = h && h.graded === true;
  main.innerHTML = `<div class="page-head"><div><h1>${esc(a.title)}</h1><p class="sub">${a.due ? "آخر موعد: " + fmt(a.due) : ""} · الدرجة من ${a.maxGrade}</p></div><a class="btn ghost" href="#/assignments">رجوع</a></div>
  <div class="card"><div class="content">${rich(a.body)}</div>${safeUrl(a.link) ? pdfBox(a.link) : ""}</div>
  ${graded ? `<div class="card" style="border-inline-start:5px solid var(--ok)"><h3>الدرجة: ${h.grade} من ${a.maxGrade}</h3>${h.feedback ? `<p>ملاحظة المعلم: ${esc(h.feedback)}</p>` : ""}</div>` : ""}
  <form class="card" id="hf"><h3>${h ? "إجابتك" : "تسليم الواجب"}</h3>
    <div class="field"><label>الإجابة</label><textarea name="text" maxlength="5000" ${graded ? "disabled" : ""}>${esc(h?.text || "")}</textarea></div>
    <div class="field"><label>رابط ملف (اختياري) — مثل صورة الحل على Google Drive</label><input type="url" name="link" dir="ltr" maxlength="500" value="${esc(h?.link || "")}" ${graded ? "disabled" : ""}></div>
    ${graded ? "" : `<div class="row"><button class="btn">${h ? "تحديث التسليم" : "تسليم"}</button>${h ? `<span class="muted">آخر تسليم: ${fmt(h.submittedAt)}</span>` : ""}</div>`}</form>`;
  if (graded) return;
  $("#hf").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; const text = f.text.value.trim(), link = f.link.value.trim();
    if (!text && !link) return toast("اكتب إجابة أو أضف رابطاً");
    if (link && !safeUrl(link)) return toast("الرابط يجب أن يبدأ بـ https://");
    busy($("button", f), true);
    try {
      const ref = doc(db, "homework", `${id}_${S.me.id}`);
      if (h) await updateDoc(ref, { text, link, submittedAt: serverTimestamp() });
      else await setDoc(ref, { assignmentId: id, studentId: S.me.id, text, link, submittedAt: serverTimestamp(), graded: false, counted: false });
      toast("تم التسليم ✓"); route();
    } catch (err) { busy($("button", f), false); toast(errMsg(err)); }
  };
}
function sMessages(main) { chatView(main, S.me.id, `رسائل مع ${SITE.teacher}`, null); }

// ============================================================
//                 الأقسام الإضافية (مشتركة ومعلم وطالب)
// ============================================================
const EL = Object.fromEntries(ELEMENTS.map((e) => [e.s, e]));
const num = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d });
const sci = (x) => {
  if (!isFinite(x)) return "—";
  if (x !== 0 && (Math.abs(x) >= 1e5 || Math.abs(x) < 1e-3)) { const [m, e] = x.toExponential(3).split("e"); return `<span dir="ltr">${m} × 10<sup>${+e}</sup></span>`; }
  return `<span dir="ltr">${num(x, 4)}</span>`;
};
const cfHTML = (cf) => `<span dir="ltr">${esc(cf).replace(/([spdf])(\d+)/g, "$1<sup>$2</sup>")}</span>`;
const fHTML = (f) => `<span dir="ltr">${esc(f).replace(/([A-Za-z\)\]])(\d+)/g, "$1<sub>$2</sub>").replace(/[.*•∙]/g, "·")}</span>`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayKey = (t) => { const d = ts(t); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : ""; };
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const firstNames = (n) => String(n || "").split(" ").slice(0, 2).join(" ");

// ---------- الجدول الدوري ----------
function elPos(e) { if (e.z >= 57 && e.z <= 71) return [9, e.z - 57 + 3]; if (e.z >= 89 && e.z <= 103) return [10, e.z - 89 + 3]; return [e.p, e.g]; }
function pPeriodic(main) {
  main.innerHTML = `<div class="page-head"><div><h1>الجدول الدوري التفاعلي</h1><p class="sub">اضغط على أي عنصر لعرض خصائصه</p></div><input type="text" id="els" placeholder="ابحث: Fe أو حديد أو 26" style="max-width:240px"></div>
  <div class="card"><div class="ptable-wrap"><div class="ptable">
    ${ELEMENTS.map((e) => { const [r, c] = elPos(e); return `<button type="button" class="el c-${e.c}" style="grid-row:${r};grid-column:${c}" data-z="${e.z}" title="${esc(e.ar)}"><small>${e.z}</small><b>${e.s}</b><i>${e.x ? `(${e.m})` : num(e.m, 2)}</i></button>`; }).join("")}
    <div class="el ph c-ln" style="grid-row:6;grid-column:3">57–71</div><div class="el ph c-ac" style="grid-row:7;grid-column:3">89–103</div>
    <div style="grid-row:8;grid-column:1/19;height:10px"></div>
    ${Array.from({ length: 18 }, (_, i) => `<div class="gnum" style="grid-row:0;grid-column:${i + 1}">${i + 1}</div>`).join("")}
  </div></div>
  <div class="legend">${Object.entries(CATS).map(([k, v]) => `<button type="button" class="lg c-${k}" data-c="${k}">${esc(v)}</button>`).join("")}</div></div>
  <div class="card" id="eld"><p class="muted">اختر عنصراً لعرض تفاصيله.</p></div>`;
  const show = (z) => {
    const e = ELEMENTS[z - 1]; $$(".el.sel").forEach((x) => x.classList.remove("sel")); $(`.el[data-z="${z}"]`)?.classList.add("sel");
    const rows = [["العدد الذري", e.z], ["الكتلة الذرية", e.x ? `${e.m} <span class="muted">(العدد الكتلي لأكثر النظائر استقراراً)</span>` : `<span dir="ltr">${e.m} g/mol</span>`],
      ["الدورة", e.p], ["المجموعة", (e.z >= 57 && e.z <= 71) || (e.z >= 89 && e.z <= 103) ? "عناصر المستوى f (اللانثانيدات / الأكتينيدات)" : e.g], ["التوزيع الإلكتروني", cfHTML(e.cf)], ["الكهروسالبية (باولنغ)", e.eneg ?? "—"]];
    $("#eld").innerHTML = `<div class="eldet"><div class="bigel c-${e.c}"><small>${e.z}</small><b>${e.s}</b><i>${e.x ? `(${e.m})` : e.m}</i></div>
      <div style="flex:1;min-width:240px"><h2 style="margin:0">${esc(e.ar)} <span class="muted" style="font-size:16px" dir="ltr">${e.en}</span></h2><p class="muted" style="margin:2px 0 10px">${esc(CATS[e.c] || "")}</p>
      <table>${rows.map(([k, v]) => `<tr><th style="width:170px">${k}</th><td>${v}</td></tr>`).join("")}</table>
      <a class="btn ghost sm" style="margin-top:10px" href="#/calc" id="tocalc">احسب الكتلة المولية لمركّب فيه ${e.s}</a></div></div>`;
    $("#tocalc").onclick = () => { S.calcPrefill = e.s; };
    if (window.innerWidth < 900) $("#eld").scrollIntoView({ behavior: "smooth" });
  };
  $$(".el[data-z]", main).forEach((b) => (b.onclick = () => show(+b.dataset.z)));
  let catOn = "";
  const dim = (fn) => $$(".el[data-z]", main).forEach((b) => b.classList.toggle("dim", !fn(ELEMENTS[b.dataset.z - 1])));
  $$(".lg", main).forEach((b) => (b.onclick = () => { catOn = catOn === b.dataset.c ? "" : b.dataset.c; $$(".lg").forEach((x) => x.classList.toggle("on", x.dataset.c === catOn)); dim((e) => !catOn || e.c === catOn); }));
  $("#els").oninput = (ev) => {
    const q = ev.target.value.trim().toLowerCase(); if (!q) return dim(() => true);
    dim((e) => e.s.toLowerCase() === q || e.ar.includes(q) || e.en.toLowerCase().startsWith(q) || String(e.z) === q);
    const hit = ELEMENTS.find((e) => e.s.toLowerCase() === q || String(e.z) === q || e.ar === q); if (hit) show(hit.z);
  };
}

// ---------- حاسبة الكيمياء ----------
function parseGroup(s) {
  let i = 0; const stack = [{}];
  while (i < s.length) {
    const ch = s[i];
    if (ch === "(" || ch === "[") { stack.push({}); i++; }
    else if (ch === ")" || ch === "]") {
      if (stack.length < 2) throw new Error("يوجد قوس مغلق بدون قوس مفتوح."); i++;
      let n = ""; while (/\d/.test(s[i] || "")) n += s[i++];
      const g = stack.pop(), k = n ? +n : 1, top = stack[stack.length - 1]; for (const e in g) top[e] = (top[e] || 0) + g[e] * k;
    } else if (/[A-Z]/.test(ch)) {
      let sym = ch; i++; while (/[a-z]/.test(s[i] || "")) sym += s[i++];
      if (!EL[sym]) throw new Error(`«${sym}» ليس رمز عنصر. انتبه للحروف الكبيرة والصغيرة: Co (كوبلت) غير CO (كربون + أكسجين).`);
      let n = ""; while (/\d/.test(s[i] || "")) n += s[i++];
      const top = stack[stack.length - 1]; top[sym] = (top[sym] || 0) + (n ? +n : 1);
    } else if (/[a-z]/.test(ch)) throw new Error(`رمز العنصر يبدأ بحرف كبير: اكتب «${ch.toUpperCase()}» بدل «${ch}».`);
    else throw new Error(`رمز غير مفهوم: «${ch}»`);
  }
  if (stack.length !== 1) throw new Error("يوجد قوس لم يُغلق.");
  return stack[0];
}
function parseFormula(str) {
  const s0 = String(str).replace(/\s+/g, "").replace(/[·•∙*]/g, ".");
  if (!s0) throw new Error("اكتب صيغة كيميائية.");
  const total = {};
  for (const part of s0.split(".").filter(Boolean)) {
    const m = part.match(/^(\d+)(.+)$/); let mult = 1, body = part;
    if (m && /^[A-Z(\[]/.test(m[2])) { mult = +m[1]; body = m[2]; }
    const c = parseGroup(body); for (const k in c) total[k] = (total[k] || 0) + c[k] * mult;
  }
  return total;
}
function pCalc(main) {
  const ex = ["H2O", "NaCl", "CO2", "H2SO4", "Ca(OH)2", "Al2(SO4)3", "C6H12O6", "CuSO4·5H2O"];
  main.innerHTML = `<div class="page-head"><div><h1>حاسبة الكيمياء</h1><p class="sub">الكتلة المولية والتحويل بين الكتلة والمول وعدد الجسيمات والحجم</p></div></div>
  <div class="card"><div class="field"><label>الصيغة الكيميائية</label><input type="text" id="fx" dir="ltr" placeholder="H2SO4" style="font-size:20px;font-family:ui-monospace,Consolas,monospace" autocomplete="off" spellcheck="false"></div>
    <div class="row">${ex.map((x) => `<button type="button" class="btn ghost sm" data-ex="${esc(x)}">${fHTML(x)}</button>`).join("")}</div>
    <p class="hint">الأقواس مسموحة: Ca(OH)2 — وللأملاح المائية استخدم نقطة: CuSO4.5H2O</p></div>
  <div id="mmout"></div><div id="convout"></div>`;
  let M = 0, atomsPer = 0;
  const conv = () => {
    if (!M) { $("#convout").innerHTML = ""; return; }
    const kind = $("#ck")?.value || "m", v = parseFloat($("#cv")?.value);
    let n = NaN;
    if (isFinite(v)) n = kind === "m" ? v / M : kind === "n" ? v : kind === "N" ? v / 6.022e23 : v / 22.4;
    const out = [["الكتلة (g)", n * M, "m = n × M"], ["عدد المولات (mol)", n, kind === "m" ? "n = m ÷ M" : kind === "N" ? "n = N ÷ Nₐ" : kind === "V" ? "n = V ÷ 22.4" : "—"],
      ["عدد الجسيمات (جزيئات / وحدات صيغة)", n * 6.022e23, "N = n × Nₐ"], ["عدد الذرات الكلي", n * 6.022e23 * atomsPer, `= N × ${atomsPer}`], ["حجم الغاز في الظروف القياسية STP (L)", n * 22.4, "V = n × 22.4"]];
    $("#cres").innerHTML = isFinite(n) ? `<table>${out.map(([k, x, f]) => `<tr><th>${k}</th><td style="font-size:17px"><b>${sci(x)}</b></td><td class="muted" dir="ltr" style="text-align:left">${f}</td></tr>`).join("")}</table>` : `<p class="muted">اكتب قيمة لحساب الباقي.</p>`;
  };
  const calc = () => {
    const f = $("#fx").value.trim(); if (!f) { $("#mmout").innerHTML = ""; M = 0; conv(); return; }
    try {
      const c = parseFormula(f); M = 0; atomsPer = 0; const rows = Object.entries(c).map(([s, k]) => { const e = EL[s]; M += e.m * k; atomsPer += k; return { e, k, sub: e.m * k }; });
      $("#mmout").innerHTML = `<div class="card"><div class="row" style="align-items:baseline"><span class="muted">الكتلة المولية لـ ${fHTML(f)}</span><span class="spacer"></span><span class="score-big" dir="ltr" style="font-size:38px">${num(M, 2)} <small style="font-size:18px">g/mol</small></span></div>
        <div class="tbl-wrap"><table><thead><tr><th>العنصر</th><th>عدد الذرات</th><th>الكتلة الذرية</th><th>المجموع</th><th>النسبة المئوية بالكتلة</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><b dir="ltr">${r.e.s}</b> ${esc(r.e.ar)}</td><td>${r.k}</td><td dir="ltr">${r.e.m}</td><td dir="ltr">${num(r.sub, 3)}</td><td>${num((r.sub / M) * 100, 2)}%</td></tr>`).join("")}
        </tbody></table></div>${rows.some((r) => r.e.x) ? `<p class="hint">تنبيه: الصيغة تحتوي عنصراً مشعاً؛ استُخدم العدد الكتلي لأكثر نظائره استقراراً.</p>` : ""}</div>`;
      if (!$("#ck")) {
        $("#convout").innerHTML = `<div class="card"><h3>التحويلات</h3><div class="row"><label style="margin:0">المعطى:</label><select id="ck" style="width:auto"><option value="m">كتلة (g)</option><option value="n">عدد مولات (mol)</option><option value="N">عدد جسيمات</option><option value="V">حجم غاز عند STP (L)</option></select>
          <input type="text" id="cv" dir="ltr" placeholder="مثال: 49 أو 3.01e23" style="max-width:220px"></div><div id="cres" style="margin-top:12px"></div>
          <p class="hint">الثوابت: عدد أفوجادرو Nₐ = 6.022 × 10²³ ، الحجم المولي للغاز عند STP = 22.4 L/mol</p></div>`;
        $("#ck").onchange = conv; $("#cv").oninput = conv;
      }
      conv();
    } catch (e) { M = 0; $("#mmout").innerHTML = `<div class="err">${esc(e.message)}</div>`; $("#convout").innerHTML = ""; }
  };
  $("#fx").oninput = calc;
  $$("[data-ex]", main).forEach((b) => (b.onclick = () => { $("#fx").value = b.dataset.ex; calc(); }));
  if (S.calcPrefill) { $("#fx").value = S.calcPrefill; S.calcPrefill = null; calc(); }
  $("#fx").focus();
}

// ---------- بنك الأسئلة (تدريب غير محسوب) ----------
async function tBank(main) {
  const banks = (await all("banks")).sort((a, b) => (a.unit || "").localeCompare(b.unit || "", "ar") || byDate(a, b));
  main.innerHTML = `<div class="page-head"><div><h1>بنك الأسئلة</h1><p class="sub">تدريب حر للطلاب مع الحل الفوري — لا يُحسب في الدرجات</p></div><a class="btn" href="#/bank-edit/new">+ مجموعة أسئلة</a></div>
  <div class="card">${banks.map((b) => `<div class="item"><div class="ic">📚</div><div class="body"><div class="t">${esc(b.title)}</div><div class="m">${esc(b.unit || "")} · ${b.count || 0} سؤال · ${classLabel(b.classes)}</div></div>
    <div class="row">${b.published ? `<span class="pill ok">منشور</span>` : `<span class="pill gray">مسودة</span>`}<a class="btn ghost sm" href="#/bankq/${b.id}">تجربة</a><a class="btn sm" href="#/bank-edit/${b.id}">تعديل</a></div></div>`).join("") || `<div class="empty">لا توجد مجموعات بعد. أضف أسئلة ملازمك هنا ليتدرب عليها الطلاب.</div>`}</div>`;
}
async function tBankEdit(main, id) {
  const isNew = id === "new"; let b = { title: "", unit: "", src: "", classes: [], published: false };
  if (!isNew) { const s = await getDoc(doc(db, "banks", id)); if (!s.exists()) return go("bank"); b = { ...b, ...s.data() }; }
  main.innerHTML = `<div class="page-head"><h1>${isNew ? "مجموعة أسئلة جديدة" : "تعديل مجموعة الأسئلة"}</h1><a class="btn ghost" href="#/bank">رجوع</a></div>
  <form class="card" id="bf"><div class="grid g2"><div class="field"><label>العنوان</label><input type="text" name="title" value="${esc(b.title)}" required placeholder="مراجعة الغازات – الجزء 1"></div>
    <div class="field"><label>الوحدة</label><input type="text" name="unit" value="${esc(b.unit)}" placeholder="الوحدة 3: الغازات"></div></div>
    <div class="field"><label>الأسئلة <span class="muted">(نفس شكل لصق الاختبارات، وسطر فارغ بين كل سؤال)</span></label>
    <textarea name="src" dir="auto" style="min-height:380px;font-size:15px" placeholder="1- ما عدد مولات O_2 في 32 g ؟&#10;أ) 0.5&#10;ب) 1&#10;ج) 2&#10;د) 4&#10;الإجابة: ب&#10;الشرح: الكتلة المولية 32 g/mol">${esc(b.src)}</textarea><p class="hint" id="pc"></p></div>
    ${classPicker(b.classes)}
    <div class="row"><label class="check"><input type="checkbox" name="pub" ${b.published ? "checked" : ""}> نشر للطلاب</label><span class="spacer"></span>${isNew ? "" : `<button type="button" class="btn ghost" id="del" style="color:var(--danger)">حذف</button>`}<button class="btn" id="save">حفظ</button></div></form>`;
  const f = $("#bf");
  const check = () => { const qs = parseBulk(f.src.value); const miss = qs.map((q, i) => (q.answer < 0 ? i + 1 : 0)).filter(Boolean);
    $("#pc").innerHTML = `تم التعرف على <b>${qs.length}</b> سؤال${miss.length ? ` — <span style="color:var(--danger)">بدون إجابة محددة: ${miss.join("، ")}</span>` : ""}`; return { qs, miss }; };
  f.src.oninput = check; check();
  f.onsubmit = async (e) => {
    e.preventDefault(); const { qs, miss } = check();
    if (!qs.length) return toast("لم أتعرف على أي سؤال"); if (miss.length) return toast(`حدّد الإجابة للأسئلة: ${miss.join("، ")}`);
    busy($("#save"), true);
    const data = { title: f.title.value.trim(), unit: f.unit.value.trim(), src: f.src.value, classes: pickedClasses(f), published: f.pub.checked,
      questions: qs.map((q) => ({ text: q.text, options: q.options, answer: q.answer, explanation: q.explanation || "" })), count: qs.length };
    if (isNew) await addDoc(col("banks"), { ...data, createdAt: serverTimestamp() }); else await updateDoc(doc(db, "banks", id), data);
    await rebuildCatalog(); toast("تم الحفظ ✓"); go("bank");
  };
  if (!isNew) $("#del").onclick = async () => { if (confirm("حذف المجموعة؟")) { await deleteDoc(doc(db, "banks", id)); await rebuildCatalog(); go("bank"); } };
}
async function sBank(main) {
  const banks = await pubQ("banks"); const units = {}; banks.forEach((b) => (units[b.unit || "عام"] ||= []).push(b));
  main.innerHTML = `<div class="page-head"><div><h1>بنك الأسئلة</h1><p class="sub">تدرّب كما تشاء — الحل يظهر فوراً ولا يُحسب في درجاتك</p></div></div>` +
    (Object.entries(units).map(([u, bs]) => `<div class="card"><h3>${esc(u)}</h3>${bs.map((b) => `<div class="item clickable" onclick="location.hash='#/bankq/${b.id}'"><div class="ic">📚</div><div class="body"><div class="t">${esc(b.title)}</div><div class="m">${b.count} سؤال</div></div><span class="btn sm">تدرّب</span></div>`).join("")}</div>`).join("") || `<div class="card empty">لا توجد أسئلة تدريب بعد.</div>`);
}
async function sBankQ(main, id) {
  const s = await getDoc(doc(db, "banks", id)); if (!s.exists()) return go("bank"); const b = s.data();
  const back = isTeacher() ? "#/bank" : "#/bank";
  let n = Math.min(10, b.questions.length);
  const start = () => {
    const set = shuffle(b.questions.map((q, i) => ({ ...q, i }))).slice(0, n); let right = 0, done = 0;
    main.innerHTML = `<div class="page-head"><div><h1>${esc(b.title)}</h1><p class="sub">${esc(b.unit || "")} · ${b.questions.length} سؤال في المجموعة</p></div><a class="btn ghost" href="${back}">رجوع</a></div>
    <div class="card row sticky-score"><span>عدد الأسئلة:</span><select id="bn" style="width:auto">${[5, 10, 20, 30].filter((x) => x < b.questions.length).map((x) => `<option ${x === n ? "selected" : ""}>${x}</option>`).join("")}<option value="${b.questions.length}" ${n === b.questions.length ? "selected" : ""}>الكل (${b.questions.length})</option></select>
      <button class="btn ghost sm" id="again">🔀 أسئلة جديدة</button><span class="spacer"></span><b id="sc">صحيح 0 من 0</b></div>
    ${set.map((q, k) => `<div class="q" data-k="${k}"><div class="qt"><span class="qn">${k + 1}</span>${inline(q.text)}</div>
      ${q.options.map((o, j) => `<button type="button" class="opt" data-j="${j}" style="width:100%;text-align:right;background:#fff;font:inherit">${LETTERS[j]}) ${inline(o)}</button>`).join("")}<div class="fb"></div></div>`).join("")}`;
    $$(".q[data-k]", main).forEach((qd) => {
      const q = set[+qd.dataset.k];
      $$(".opt", qd).forEach((ob) => (ob.onclick = () => {
        if (qd.dataset.done) return; qd.dataset.done = 1; done++; const j = +ob.dataset.j, ok = j === q.answer; if (ok) right++;
        $$(".opt", qd).forEach((x) => { const jj = +x.dataset.j; x.disabled = true; if (jj === q.answer) x.classList.add("right"); else if (jj === j) x.classList.add("wrong"); });
        $(".fb", qd).innerHTML = `<p style="margin:8px 0 0;font-weight:700;color:${ok ? "var(--ok)" : "var(--danger)"}">${ok ? "✔ إجابة صحيحة" : `✘ الإجابة الصحيحة: ${LETTERS[q.answer]}`}</p>${q.explanation ? `<div class="expl">💡 ${inline(q.explanation)}</div>` : ""}`;
        $("#sc").textContent = `صحيح ${right} من ${done}` + (done === set.length ? ` — ${Math.round((right / set.length) * 100)}%` : "");
        if (done === set.length) toast(right / set.length >= 0.85 ? "ممتاز! 🌟" : "انتهيت — جرّب مجموعة جديدة 💪");
      }));
    });
    $("#bn").onchange = (e) => { n = +e.target.value; start(); };
    $("#again").onclick = () => { start(); window.scrollTo(0, 0); };
  };
  start();
}

// ---------- المختبر الافتراضي ----------
async function tLabs(main) {
  const labs = (await all("labs")).sort(byDate);
  main.innerHTML = `<div class="page-head"><div><h1>المختبر الافتراضي</h1><p class="sub">تجارب محاكاة (مثل PhET) وفيديوهات مع أسئلة قبل التجربة وبعدها</p></div><a class="btn" href="#/lab-edit/new">+ تجربة جديدة</a></div>
  <div class="card">${labs.map((l) => `<div class="item"><div class="ic">🔬</div><div class="body"><div class="t">${esc(l.title)}</div><div class="m">${esc(l.unit || "")} ${classLabel(l.classes)}</div></div>
    <div class="row">${l.published ? `<span class="pill ok">منشور</span>` : `<span class="pill gray">مسودة</span>`}<a class="btn ghost sm" href="#/lab/${l.id}">معاينة</a><a class="btn sm" href="#/lab-edit/${l.id}">تعديل</a></div></div>`).join("") || `<div class="empty">لا توجد تجارب بعد.</div>`}</div>`;
}
async function tLabEdit(main, id) {
  const isNew = id === "new"; let l = { title: "", unit: "", body: "", simUrl: "", videoUrl: "", pre: "", post: "", classes: [], published: false };
  if (!isNew) { const s = await getDoc(doc(db, "labs", id)); if (!s.exists()) return go("labs"); l = { ...l, ...s.data() }; }
  main.innerHTML = `<div class="page-head"><h1>${isNew ? "تجربة جديدة" : "تعديل التجربة"}</h1><a class="btn ghost" href="#/labs">رجوع</a></div>
  <form class="card" id="lf"><div class="grid g2"><div class="field"><label>عنوان التجربة</label><input type="text" name="title" value="${esc(l.title)}" required placeholder="قانون بويل"></div>
    <div class="field"><label>الوحدة</label><input type="text" name="unit" value="${esc(l.unit)}"></div></div>
    <div class="field"><label>الهدف وخطوات التجربة</label><textarea name="body">${esc(l.body)}</textarea></div>
    <div class="field"><label>رابط المحاكاة (اختياري)</label><input type="url" name="sim" dir="ltr" value="${esc(l.simUrl)}" placeholder="https://phet.colorado.edu/sims/html/gas-properties/latest/gas-properties_ar_SA.html">
      <p class="hint">من موقع phet.colorado.edu افتح التجربة، ثم انسخ رابط تشغيلها (ينتهي بـ .html). اختر النسخة العربية إن وُجدت.</p></div>
    <div class="field"><label>رابط فيديو يوتيوب (اختياري)</label><input type="url" name="video" dir="ltr" value="${esc(l.videoUrl)}"></div>
    <div class="grid g2"><div class="field"><label>أسئلة قبل التجربة</label><textarea name="pre">${esc(l.pre)}</textarea></div><div class="field"><label>أسئلة بعد التجربة</label><textarea name="post">${esc(l.post)}</textarea></div></div>
    ${classPicker(l.classes)}
    <div class="row"><label class="check"><input type="checkbox" name="pub" ${l.published ? "checked" : ""}> نشر للطلاب</label><span class="spacer"></span>${isNew ? "" : `<button type="button" class="btn ghost" id="del" style="color:var(--danger)">حذف</button>`}<button class="btn">حفظ</button></div></form>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; if (f.sim.value.trim() && !safeUrl(f.sim.value)) return toast("رابط المحاكاة يجب أن يبدأ بـ https://");
    const data = { title: f.title.value.trim(), unit: f.unit.value.trim(), body: f.body.value, simUrl: f.sim.value.trim(), videoUrl: f.video.value.trim(), pre: f.pre.value, post: f.post.value, classes: pickedClasses(f), published: f.pub.checked };
    if (isNew) await addDoc(col("labs"), { ...data, createdAt: serverTimestamp() }); else await updateDoc(doc(db, "labs", id), data);
    await rebuildCatalog(); toast("تم الحفظ ✓"); go("labs");
  };
  if (!isNew) $("#del").onclick = async () => { if (confirm("حذف التجربة؟")) { await deleteDoc(doc(db, "labs", id)); await rebuildCatalog(); go("labs"); } };
}
async function sLabs(main) {
  const labs = (await pubQ("labs")).sort(byDate);
  main.innerHTML = `<div class="page-head"><div><h1>المختبر الافتراضي</h1><p class="sub">جرّب بنفسك، ثم أجب عن الأسئلة</p></div></div>
  <div class="grid g2">${labs.map((l) => `<a class="card lab-card" href="#/lab/${l.id}"><div style="font-size:30px">🔬</div><h3>${esc(l.title)}</h3><p class="muted" style="margin:0">${esc(l.unit || "")}${l.sim ? " · محاكاة تفاعلية" : ""}</p></a>`).join("") || `<div class="card empty" style="grid-column:1/-1">لا توجد تجارب بعد.</div>`}</div>`;
}
async function sLab(main, id) {
  const s = await getDoc(doc(db, "labs", id)); if (!s.exists()) return go("labs"); const l = s.data(); const sim = safeUrl(l.simUrl);
  main.innerHTML = `<div class="page-head"><div><p class="sub">${esc(l.unit || "")}</p><h1>🔬 ${esc(l.title)}</h1></div><a class="btn ghost" href="#/labs">رجوع</a></div>
  ${l.body ? `<div class="card"><div class="content">${rich(l.body)}</div></div>` : ""}
  ${l.pre ? `<div class="card" style="border-inline-start:5px solid var(--accent)"><h3>🤔 قبل التجربة</h3><div class="content">${rich(l.pre)}</div></div>` : ""}
  ${sim ? `<div class="card"><div class="row" style="margin-bottom:8px"><h3 style="margin:0">المحاكاة</h3><span class="spacer"></span><a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(sim)}">فتح بملء الشاشة ↗</a></div><div class="sim"><iframe src="${esc(sim)}" allowfullscreen loading="lazy"></iframe></div></div>` : ""}
  ${l.videoUrl ? `<div class="card">${videoBox(l.videoUrl)}</div>` : ""}
  ${l.post ? `<div class="card" style="border-inline-start:5px solid var(--brand)"><h3>📝 بعد التجربة</h3><div class="content">${rich(l.post)}</div></div>` : ""}`;
}

// ---------- التقويم ----------
const EVT = { exam: ["اختبار", "#c43d3d"], hw: ["واجب", "#d98a00"], activity: ["نشاط", "#2563c9"], holiday: ["عطلة", "#1f8a4c"] };
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
async function pCalendar(main, ym) {
  const now = new Date(); let [y, m] = (ym || "").split("-").map(Number); if (!y) { y = now.getFullYear(); m = now.getMonth() + 1; }
  const [evs, asg] = isTeacher() ? await Promise.all([all("events"), all("assignments")]) : await Promise.all([pubQ("events"), pubQ("assignments")]);
  const items = [...evs.map((e) => ({ ...e, kind: "event" })), ...asg.filter((a) => a.due && (isTeacher() ? a.published : true)).map((a) => ({ id: a.id, title: a.title, date: a.due, type: "hw", kind: "assign", classes: a.classes }))];
  const byDay = {}; items.forEach((it) => (byDay[dayKey(it.date)] ||= []).push(it));
  const first = new Date(y, m - 1, 1), off = (first.getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${m - 1}`, next = m === 12 ? `${y + 1}-1` : `${y}-${m + 1}`;
  const tk = today(); const cells = [];
  for (let i = 0; i < off; i++) cells.push(`<div class="cal-d empty"></div>`);
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push(`<div class="cal-d ${k === tk ? "today" : ""}"><span class="dn">${d}</span>${(byDay[k] || []).map((it) => `<button type="button" class="chip" style="--c:${EVT[it.type]?.[1] || "#666"}" data-it="${it.kind}:${it.id}">${esc(it.title)}</button>`).join("")}</div>`);
  }
  const upcoming = items.filter((it) => ts(it.date) >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => ts(a.date) - ts(b.date)).slice(0, 12);
  main.innerHTML = `<div class="page-head"><div><h1>التقويم</h1><p class="sub">مواعيد الاختبارات وتسليم الواجبات والأنشطة</p></div>${isTeacher() ? `<button class="btn" id="addev">+ إضافة موعد</button>` : ""}</div>
  <div class="card"><div class="row" style="margin-bottom:10px"><a class="btn ghost sm" href="#/calendar/${prev}">→ السابق</a><span class="spacer"></span><h3 style="margin:0">${MONTHS[m - 1]} ${y}</h3><span class="spacer"></span><a class="btn ghost sm" href="#/calendar/${next}">التالي ←</a></div>
    <div class="cal">${["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت", "الأحد"].map((d) => `<div class="cal-h">${d}</div>`).join("")}${cells.join("")}</div>
    <div class="row" style="margin-top:10px;gap:14px">${Object.values(EVT).map(([l, c]) => `<span class="muted" style="font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c}"></span> ${l}</span>`).join("")}</div></div>
  <div class="card"><h3>القادم</h3>${upcoming.map((it) => `<div class="item"><div class="ic" style="background:${EVT[it.type][1]}1a;color:${EVT[it.type][1]}">${it.type === "exam" ? "📝" : it.type === "hw" ? "📂" : it.type === "holiday" ? "🌴" : "📌"}</div><div class="body"><div class="t">${esc(it.title)}</div><div class="m">${EVT[it.type][0]} · ${ts(it.date).toLocaleDateString("ar-AE", { weekday: "long", day: "numeric", month: "long" })} ${isTeacher() ? classLabel(it.classes) : ""}</div></div></div>`).join("") || `<p class="muted">لا توجد مواعيد قادمة.</p>`}</div>`;
  const find = (key) => { const [k, id] = key.split(":"); return items.find((it) => it.kind === k && it.id === id); };
  $$("[data-it]", main).forEach((b) => (b.onclick = () => {
    const it = find(b.dataset.it); if (!it) return;
    openModal(`<h2>${esc(it.title)}</h2><p><span class="pill" style="background:${EVT[it.type][1]}1a;color:${EVT[it.type][1]}">${EVT[it.type][0]}</span> ${ts(it.date).toLocaleDateString("ar-AE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      ${it.note ? `<div class="content">${rich(it.note)}</div>` : ""}${isTeacher() ? `<p>${classLabel(it.classes)}</p>` : ""}
      <div class="row" style="margin-top:12px">${it.kind === "assign" ? `<a class="btn" href="#/${isTeacher() ? "assign-subs" : "assign"}/${it.id}" data-close>فتح الواجب</a>` : ""}${isTeacher() && it.kind === "event" ? `<button class="btn danger" id="delev">حذف الموعد</button>` : ""}<button class="btn ghost" data-close>إغلاق</button></div>`);
    if ($("#delev")) $("#delev").onclick = async () => { await deleteDoc(doc(db, "events", it.id)); await rebuildCatalog(); closeModal(); toast("تم الحذف"); route(); };
  }));
  if (isTeacher()) $("#addev").onclick = () => {
    openModal(`<h2>إضافة موعد</h2><form id="ef"><div class="field"><label>العنوان</label><input type="text" name="title" required placeholder="اختبار قصير – الوحدة 3"></div>
      <div class="grid g2"><div class="field"><label>التاريخ</label><input type="datetime-local" name="date" required value="${today()}T08:00"></div><div class="field"><label>النوع</label><select name="type">${Object.entries(EVT).filter(([k]) => k !== "hw").map(([k, [l]]) => `<option value="${k}">${l}</option>`).join("")}</select></div></div>
      <div class="field"><label>ملاحظة (اختياري)</label><textarea name="note" style="min-height:70px"></textarea></div>${classPicker([])}
      <p class="hint">مواعيد تسليم الواجبات تظهر في التقويم تلقائياً.</p><div class="row"><button class="btn">حفظ</button><button type="button" class="btn ghost" data-close>إلغاء</button></div></form>`);
    $("#ef").onsubmit = async (e) => { e.preventDefault(); const f = e.target; await addDoc(col("events"), { title: f.title.value.trim(), date: new Date(f.date.value), type: f.type.value, note: f.note.value, classes: pickedClasses(f), createdAt: serverTimestamp() }); await rebuildCatalog(); closeModal(); toast("تمت الإضافة ✓"); const d = new Date(f.date.value); go(`calendar/${d.getFullYear()}-${d.getMonth() + 1}`); };
  };
}

// ---------- لوحة الشرف ----------
async function rebuildHonor(c) {
  const st = (await list(query(col("students"), where("className", "==", c)))).filter((s) => s.active && s.quizQ > 0);
  const top = st.map((s) => ({ id: s.id, n: firstNames(s.name), a: Math.round((s.quizScore / s.quizQ) * 100), q: s.quizDone || 0 })).sort((x, y) => y.a - x.a || y.q - x.q).slice(0, 10);
  await setDoc(doc(db, "meta", "honor"), { byClass: { [c]: top }, updatedAt: serverTimestamp() }, { merge: true });
}
const honorList = (top, meId) => (top?.length ? `<div class="honor">${top.map((t, i) => `<div class="hrow ${t.id === meId ? "me" : ""}"><span class="rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span><b>${esc(t.n)}${t.id === meId ? " (أنت)" : ""}</b><span class="spacer"></span><span class="muted" style="font-size:13px">${t.q} اختبار</span>${pctPill(t.a)}</div>`).join("")}</div>` : `<p class="muted">لا توجد نتائج بعد.</p>`);
async function sHonor(main) {
  if (SITE.honor === false) { main.innerHTML = `<div class="card empty">لوحة الشرف غير مفعّلة.</div>`; return; }
  const h = await getDoc(doc(db, "meta", "honor")); const top = h.exists() ? h.data().byClass?.[S.me.className] : null;
  main.innerHTML = `<div class="page-head"><div><h1>🏆 لوحة الشرف</h1><p class="sub">أفضل 10 طلاب في ${esc(S.me.className)} حسب متوسط الاختبارات</p></div></div><div class="card">${honorList(top, S.me.id)}</div>
  <p class="hint">تُحدَّث اللوحة عند مراجعة المعلم للنتائج.</p>`;
}
async function tHonor(main) {
  const h = await getDoc(doc(db, "meta", "honor")); const by = h.exists() ? h.data().byClass || {} : {};
  main.innerHTML = `<div class="page-head"><div><h1>🏆 لوحة الشرف</h1><p class="sub">تتحدث تلقائياً عند فتح لوحة المتابعة إذا وُجدت نتائج جديدة ${h.exists() ? "· آخر تحديث " + fmt(h.data().updatedAt) : ""}</p></div><button class="btn" id="rh">تحديث الآن</button></div>
  ${SITE.honor === false ? `<div class="err">لوحة الشرف مخفية عن الطلاب (honor: false في config.js).</div>` : ""}
  <div class="grid g2">${SITE.classes.map((c) => `<div class="card"><h3>${esc(c)}</h3>${honorList(by[c])}</div>`).join("")}</div>`;
  $("#rh").onclick = async (e) => { busy(e.target, true); await syncCounters(); for (const c of SITE.classes) await rebuildHonor(c); toast("تم التحديث ✓"); route(); };
}

// ---------- تقدّمي (للطالب) ----------
function progressChart(pts) {
  if (pts.length < 2) return "";
  const W = 640, H = 230, L = 40, R = 16, T = 14, B = 34, x = (i) => L + (i * (W - L - R)) / (pts.length - 1), y = (v) => T + ((100 - v) * (H - T - B)) / 100;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="pchart" role="img" aria-label="منحنى درجات الاختبارات">
    ${[0, 50, 85, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="${v === 85 ? "g85" : "grid"}"/><text x="${L - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}%</text>`).join("")}
    <path d="${line}" class="pl"/>
    ${pts.map((p, i) => `<g class="pt" data-i="${i}"><circle cx="${x(i)}" cy="${y(p.pct)}" r="14" class="hit"/><circle cx="${x(i)}" cy="${y(p.pct)}" r="5" class="dot"/><text x="${x(i)}" y="${H - 12}" class="ax" text-anchor="middle">${i + 1}</text></g>`).join("")}
  </svg><div class="tip hidden" id="ptip"></div></div>`;
}
async function sProgress(main) {
  const [quizzes, subs, lessons, views, hw, assigns] = await Promise.all([pubQ("quizzes"), myQ("submissions"), pubQ("lessons"), myQ("views"), myQ("homework"), pubQ("assignments")]);
  const qMap = Object.fromEntries(quizzes.map((q) => [q.id, q]));
  const mine = subs.filter((s) => qMap[s.quizId]).sort((a, b) => ts(a.submittedAt) - ts(b.submittedAt));
  const rows = await Promise.all(mine.map(async (s) => {
    const q = qMap[s.quizId]; let sc = s.scored ? { right: s.score, total: s.total, pct: s.total ? Math.round((s.score / s.total) * 100) : 0 } : null;
    if (!sc && q.showResults) { try { const k = await getDoc(doc(db, "quizKeys", q.id)); if (k.exists()) sc = scoreOf(s, k.data()); } catch {} }
    return { q, s, sc };
  }));
  const pts = rows.filter((r) => r.sc).map((r) => ({ pct: r.sc.pct, title: r.q.title, d: r.s.submittedAt }));
  const avg = pts.length ? Math.round(pts.reduce((a, p) => a + p.pct, 0) / pts.length) : null, best = pts.length ? Math.max(...pts.map((p) => p.pct)) : null;
  const seen = new Set(views.map((v) => v.lessonId)); const unseen = lessons.filter((l) => !seen.has(l.id));
  const aMap = Object.fromEntries(assigns.map((a) => [a.id, a]));
  main.innerHTML = `<div class="page-head"><div><h1>📈 تقدّمي</h1><p class="sub">${esc(S.me.name)} · ${esc(S.me.className || "")}</p></div></div>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="stat"><div class="n">${avg == null ? "—" : avg + "%"}</div><div class="l">متوسط درجاتي</div></div>
    <div class="stat"><div class="n">${best == null ? "—" : best + "%"}</div><div class="l">أفضل درجة</div></div>
    <div class="stat"><div class="n">${mine.length} <small class="muted" style="font-size:15px">من ${quizzes.length}</small></div><div class="l">اختبارات أنجزتها</div></div>
    <div class="stat"><div class="n">${lessons.length - unseen.length} <small class="muted" style="font-size:15px">من ${lessons.length}</small></div><div class="l">دروس فتحتها</div></div></div>
  <div class="card"><h3>درجاتي في الاختبارات</h3>${progressChart(pts)}
    ${rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>الاختبار</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><a href="#/quiz/${r.q.id}">${esc(r.q.title)}</a></td><td>${r.sc ? `${r.sc.right} من ${r.sc.total} ${pctPill(r.sc.pct)}` : `<span class="pill gray">بانتظار التصحيح</span>`}</td><td class="muted">${fmt(r.s.submittedAt, false)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">لم تحل أي اختبار بعد.</p>`}</div>
  <div class="grid g2"><div class="card"><h3>📘 دروس لم تفتحها بعد</h3>${unseen.map((l) => `<div class="item clickable" onclick="location.hash='#/lesson/${l.id}'"><div class="body"><div class="t">${esc(l.title)}</div><div class="m">${esc(l.unit || "")}</div></div></div>`).join("") || `<p class="muted">فتحت كل الدروس 👏</p>`}</div>
  <div class="card"><h3>📂 درجات الواجبات</h3>${hw.filter((h) => aMap[h.assignmentId]).map((h) => `<div class="item"><div class="body"><div class="t">${esc(aMap[h.assignmentId].title)}</div><div class="m">${h.feedback ? esc(h.feedback) : ""}</div></div>${h.graded ? `<span class="pill ok">${h.grade} من ${aMap[h.assignmentId].maxGrade}</span>` : `<span class="pill gray">بانتظار التصحيح</span>`}</div>`).join("") || `<p class="muted">لا توجد واجبات مسلّمة.</p>`}</div></div>`;
  const tip = $("#ptip");
  $$(".pt", main).forEach((g) => { g.onmouseenter = g.onclick = () => { const p = pts[+g.dataset.i]; const c = $(".dot", g).getBoundingClientRect(), w = $(".chart-wrap").getBoundingClientRect();
    tip.innerHTML = `<b>${esc(p.title)}</b><br>${p.pct}% · ${fmt(p.d, false)}`; const lx = c.left - w.left; tip.style.left = (lx > w.width - 200 ? lx - 190 : lx + 8) + "px"; tip.style.top = c.top - w.top - 52 + "px"; tip.classList.remove("hidden"); }; g.onmouseleave = () => tip.classList.add("hidden"); });
}

// ---------- الحضور ----------
const ATT = { p: ["حاضر", "ok"], a: ["غائب", "bad"], l: ["متأخر", "warn"], e: ["بعذر", "gray"] };
async function attendanceOf(c) { return (await list(query(col("attendance"), where("className", "==", c)))).sort((a, b) => (a.date + (a.period || "")).localeCompare(b.date + (b.period || ""))); }
function attStats(sessions, sid) {
  const r = { p: 0, a: 0, l: 0, e: 0, n: 0 }; sessions.forEach((s) => { const v = s.records?.[sid]; if (v) { r[v]++; r.n++; } });
  const base = r.n - r.e; r.pct = base > 0 ? Math.round(((r.p + r.l) / base) * 100) : null; return r;
}
async function tAttendance(main) {
  const sel = prefCls("att") || SITE.classes[0];
  const [studs, sessions] = await Promise.all([list(query(col("students"), where("className", "==", sel))), attendanceOf(sel)]);
  const st = studs.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const date = S.attDate || today(), period = S.attPeriod || "1";
  const cur = sessions.find((s) => s.date === date && String(s.period || "1") === period);
  const rec = { ...(cur?.records || {}) };
  main.innerHTML = `<div class="page-head"><div><h1>الحضور</h1><p class="sub">${sessions.length} حصة مسجّلة في ${esc(sel)}</p></div>
    <div class="row">${clsSelect("ac", sel, "").replace(/<option value="" [^>]*>[^<]*<\/option>/, "")}<input type="date" id="ad" value="${date}" style="width:auto"><select id="ap" style="width:auto">${[1, 2, 3, 4, 5, 6, 7, 8].map((p) => `<option value="${p}" ${String(p) === period ? "selected" : ""}>الحصة ${p}</option>`).join("")}</select></div></div>
  <div class="card"><div class="row" style="margin-bottom:8px"><h3 style="margin:0">${cur ? "تعديل حضور" : "تسجيل حضور"} — ${new Date(date + "T12:00").toLocaleDateString("ar-AE", { weekday: "long", day: "numeric", month: "long" })}</h3><span class="spacer"></span><button class="btn ghost sm" id="allp">الكل حاضر</button></div>
    ${st.length ? `<div class="tbl-wrap"><table><thead><tr><th>الطالب</th><th>الحالة</th><th>نسبة الحضور</th><th>الغياب</th></tr></thead><tbody>
    ${st.map((s) => { const a = attStats(sessions, s.id); return `<tr><td><b>${esc(s.name)}</b></td><td><div class="seg" data-s="${s.id}">${Object.entries(ATT).map(([k, [l, c]]) => `<button type="button" data-v="${k}" class="${rec[s.id] === k ? "on " + c : ""}">${l}</button>`).join("")}</div></td>
      <td>${a.pct == null ? "—" : pctPill(a.pct)}</td><td class="muted">${a.a} غياب · ${a.l} تأخر</td></tr>`; }).join("")}</tbody></table></div>
    <div class="row" style="margin-top:12px"><span class="muted" id="cnt"></span><span class="spacer"></span>${cur ? `<button class="btn ghost" id="delatt" style="color:var(--danger)">حذف هذه الحصة</button>` : ""}<button class="btn" id="saveatt">حفظ الحضور</button></div>`
    : `<div class="empty">لا يوجد طلاب مفعّلون في هذا الصف.</div>`}</div>`;
  const upd = () => { const c = { p: 0, a: 0, l: 0, e: 0 }; Object.values(rec).forEach((v) => c[v]++); if ($("#cnt")) $("#cnt").textContent = `حاضر ${c.p} · غائب ${c.a} · متأخر ${c.l} · بعذر ${c.e} · لم يُحدد ${st.length - Object.keys(rec).filter((k) => st.some((s) => s.id === k)).length}`; };
  const paint = (sid) => $$(`.seg[data-s="${sid}"] button`, main).forEach((b) => { b.className = rec[sid] === b.dataset.v ? "on " + ATT[b.dataset.v][1] : ""; });
  $$(".seg", main).forEach((sg) => $$("button", sg).forEach((b) => (b.onclick = () => { rec[sg.dataset.s] = b.dataset.v; paint(sg.dataset.s); upd(); })));
  upd();
  $("#ac").onchange = (e) => { prefCls("att", e.target.value); route(); };
  $("#ad").onchange = (e) => { S.attDate = e.target.value; route(); };
  $("#ap").onchange = (e) => { S.attPeriod = e.target.value; route(); };
  if ($("#allp")) $("#allp").onclick = () => { st.forEach((s) => { rec[s.id] = "p"; paint(s.id); }); upd(); };
  if ($("#saveatt")) $("#saveatt").onclick = async (e) => {
    const missing = st.filter((s) => !rec[s.id]).length; if (missing && !confirm(`${missing} طالب بدون حالة. حفظ على أي حال؟`)) return;
    busy(e.target, true); const records = Object.fromEntries(Object.entries(rec).filter(([k]) => st.some((s) => s.id === k)));
    if (cur) await updateDoc(doc(db, "attendance", cur.id), { records, updatedAt: serverTimestamp() });
    else await addDoc(col("attendance"), { className: sel, date, period, records, createdAt: serverTimestamp() });
    toast("تم حفظ الحضور ✓"); route();
  };
  if ($("#delatt")) $("#delatt").onclick = async () => { if (confirm("حذف سجل هذه الحصة؟")) { await deleteDoc(doc(db, "attendance", cur.id)); toast("تم الحذف"); route(); } };
}

// ---------- التقارير ----------
async function tReports(main) {
  const sel = prefCls("rep") || SITE.classes[0];
  try { await syncCounters(); } catch {}
  const [studs, sessions, lessons, quizzes, assigns] = await Promise.all([list(query(col("students"), where("className", "==", sel))), attendanceOf(sel), all("lessons"), all("quizzes"), all("assignments")]);
  const forC = (it) => it.published && (!it.classes?.length || it.classes.includes(sel));
  const nL = lessons.filter(forC).length, nQ = quizzes.filter(forC).length, nA = assigns.filter(forC).length;
  const rows = studs.filter((s) => s.active).map((s) => {
    const avg = s.quizQ ? Math.round((s.quizScore / s.quizQ) * 100) : null, at = attStats(sessions, s.id), qd = Math.min(s.quizDone || 0, nQ), hd = Math.min(s.hwDone || 0, nA);
    const flags = []; if (avg != null && avg < 60) flags.push("درجات منخفضة"); if (at.pct != null && at.pct < 80) flags.push("غياب متكرر"); if (nQ - qd >= 2) flags.push(`${nQ - qd} اختبار لم يحلّه`); if (nA - hd >= 2) flags.push(`${nA - hd} واجب لم يسلّمه`);
    return { s, avg, at, qd, hd, ls: Math.min(s.lessonsSeen || 0, nL), flags };
  }).sort((a, b) => b.flags.length - a.flags.length || a.s.name.localeCompare(b.s.name, "ar"));
  const flagged = rows.filter((r) => r.flags.length).length;
  main.innerHTML = `<div class="page-head no-print"><div><h1>التقارير</h1><p class="sub">تقرير الصف قابل للطباعة أو الحفظ PDF — اضغط اسم الطالب لتقريره الفردي</p></div>
    <div class="row">${clsSelect("rc", sel, "").replace(/<option value="" [^>]*>[^<]*<\/option>/, "")}<button class="btn ghost" id="csv">⬇ Excel</button><button class="btn" id="pr">🖨 طباعة / PDF</button></div></div>
  <div id="print-area"><div class="card report">
    ${repHead(`تقرير ${sel}`)}
    <div class="grid g4" style="margin:12px 0"><div class="stat"><div class="n">${rows.length}</div><div class="l">طالب</div></div><div class="stat"><div class="n">${(() => { const v = rows.filter((r) => r.avg != null); return v.length ? Math.round(v.reduce((a, r) => a + r.avg, 0) / v.length) + "%" : "—"; })()}</div><div class="l">متوسط الصف</div></div>
      <div class="stat"><div class="n">${sessions.length}</div><div class="l">حصة مسجّلة</div></div><div class="stat"><div class="n" style="color:${flagged ? "var(--danger)" : "inherit"}">${flagged}</div><div class="l">يحتاجون متابعة</div></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>الطالب</th><th>متوسط الاختبارات</th><th>الاختبارات</th><th>الواجبات</th><th>الدروس</th><th>الحضور</th><th>ملاحظات</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><a href="#/report/${r.s.id}"><b>${esc(r.s.name)}</b></a></td><td>${r.avg == null ? "—" : pctPill(r.avg)}</td><td>${r.qd} من ${nQ}</td><td>${r.hd} من ${nA}</td><td>${r.ls} من ${nL}</td><td>${r.at.pct == null ? "—" : pctPill(r.at.pct)}</td>
      <td>${r.flags.map((f) => `<span class="pill bad" style="margin:1px">${f}</span>`).join(" ") || `<span class="pill ok">جيد</span>`}</td></tr>`).join("")}</tbody></table></div></div></div>`;
  $("#rc").onchange = (e) => { prefCls("rep", e.target.value); route(); };
  $("#pr").onclick = () => window.print();
  $("#csv").onclick = () => downloadCSV(`تقرير-${sel}`, [["الطالب", "متوسط الاختبارات %", "الاختبارات", "الواجبات", "الدروس", "نسبة الحضور %", "غياب", "ملاحظات"], ...rows.map((r) => [r.s.name, r.avg ?? "", `${r.qd}/${nQ}`, `${r.hd}/${nA}`, `${r.ls}/${nL}`, r.at.pct ?? "", r.at.a, r.flags.join("، ")])]);
}
const repHead = (title) => `<div class="rep-head"><div><div class="muted">${esc(SITE.school)}</div><h2 style="margin:2px 0">${esc(title)}</h2><div class="muted">مادة الكيمياء · ${esc(SITE.teacher)}${SITE.contact ? " · " + phone() : ""}</div></div><div class="muted" style="text-align:left">${new Date().toLocaleDateString("ar-AE", { day: "numeric", month: "long", year: "numeric" })}</div></div>`;
async function tReport(main, sid) {
  const ss = await getDoc(doc(db, "students", sid)); if (!ss.exists()) return go("reports"); const s = { id: sid, ...ss.data() };
  const [subs, hw, sessions, quizzes, assigns] = await Promise.all([list(query(col("submissions"), where("studentId", "==", sid))), list(query(col("homework"), where("studentId", "==", sid))), attendanceOf(s.className), all("quizzes"), all("assignments")]);
  const qMap = Object.fromEntries(quizzes.map((q) => [q.id, q])), aMap = Object.fromEntries(assigns.map((a) => [a.id, a]));
  const keys = {}; await Promise.all(subs.filter((x) => !x.scored).map(async (x) => { const k = await getDoc(doc(db, "quizKeys", x.quizId)); if (k.exists()) keys[x.quizId] = k.data(); }));
  const qrows = subs.filter((x) => qMap[x.quizId]).map((x) => ({ q: qMap[x.quizId], x, sc: x.scored ? { right: x.score, total: x.total, pct: x.total ? Math.round((x.score / x.total) * 100) : 0 } : scoreOf(x, keys[x.quizId]) })).sort((a, b) => ts(a.x.submittedAt) - ts(b.x.submittedAt));
  const forC = (it) => it.published && (!it.classes?.length || it.classes.includes(s.className));
  const missingQ = quizzes.filter((q) => forC(q) && !subs.some((x) => x.quizId === q.id));
  const at = attStats(sessions, sid); const absences = sessions.filter((x) => ["a", "l"].includes(x.records?.[sid]));
  const v = qrows.filter((r) => r.sc); const avg = v.length ? Math.round(v.reduce((a, r) => a + r.sc.pct, 0) / v.length) : null;
  main.innerHTML = `<div class="page-head no-print"><h1>تقرير طالب</h1><div class="row"><a class="btn ghost" href="#/reports">رجوع</a><button class="btn" id="pr">🖨 طباعة / PDF</button></div></div>
  <div id="print-area"><div class="card report">${repHead(`تقرير الطالب: ${s.name}`)}<p class="muted">${esc(s.className || "")}${loginId(s) ? ` · <span dir="ltr">${esc(loginId(s))}</span>` : ""}</p>
    <div class="grid g4" style="margin:12px 0"><div class="stat"><div class="n">${avg == null ? "—" : avg + "%"}</div><div class="l">متوسط الاختبارات</div></div><div class="stat"><div class="n">${at.pct == null ? "—" : at.pct + "%"}</div><div class="l">نسبة الحضور</div></div>
      <div class="stat"><div class="n">${hw.filter((h) => aMap[h.assignmentId]).length}</div><div class="l">واجبات مسلّمة</div></div><div class="stat"><div class="n">${s.lessonsSeen || 0}</div><div class="l">دروس فتحها</div></div></div>
    <h3>الاختبارات</h3>${qrows.length ? `<table><thead><tr><th>الاختبار</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${qrows.map((r) => `<tr><td>${esc(r.q.title)}</td><td>${r.sc ? `${r.sc.right} من ${r.sc.total} ${pctPill(r.sc.pct)}` : "—"}</td><td class="muted">${fmt(r.x.submittedAt, false)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">لا يوجد.</p>`}
    ${missingQ.length ? `<p><b>لم يحل:</b> ${missingQ.map((q) => esc(q.title)).join("، ")}</p>` : ""}
    <h3>الواجبات</h3>${hw.filter((h) => aMap[h.assignmentId]).map((h) => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(aMap[h.assignmentId].title)}</span><span class="spacer"></span>${h.graded ? `${h.grade} من ${aMap[h.assignmentId].maxGrade}` : "لم يُصحح"}</div>`).join("") || `<p class="muted">لا يوجد.</p>`}
    <h3>الحضور</h3><p>${at.n} حصة مسجلة: حاضر ${at.p} · غائب ${at.a} · متأخر ${at.l} · بعذر ${at.e}</p>
    ${absences.length ? `<p class="muted">أيام الغياب والتأخر: ${absences.map((x) => `${new Date(x.date + "T12:00").toLocaleDateString("ar-AE", { day: "numeric", month: "short" })} (${ATT[x.records[sid]][0]})`).join("، ")}</p>` : ""}
    <div class="row" style="margin-top:30px"><span>توقيع المعلم: ....................</span><span class="spacer"></span><span>توقيع ولي الأمر: ....................</span></div></div></div>`;
  $("#pr").onclick = () => window.print();
}
