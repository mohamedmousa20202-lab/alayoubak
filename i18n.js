// ============================================================
//  تبديل لغة الواجهة عربي / English (مثل منصة التدريب على الاختبارات)
//  يُترجم نصوص الواجهة فقط؛ محتوى الدروس والأسئلة يبقى كما كتبه المعلم
// ============================================================
const KEY = "zec.lang";
export const uiLang = () => { try { return localStorage.getItem(KEY) === "en" ? "en" : "ar"; } catch { return "ar"; } };
export function setUiLang(l) { try { localStorage.setItem(KEY, l); } catch {} applyDir(); }
function applyDir() { const en = uiLang() === "en"; document.documentElement.lang = en ? "en" : "ar"; document.documentElement.dir = en ? "ltr" : "rtl"; document.body?.classList.toggle("en", en); }

const D = {
  // التنقل
  "لوحة المتابعة": "Dashboard", "الطلاب": "Students", "الحضور": "Attendance", "التقارير": "Reports", "لوحة الشرف": "Honor Board", "الدروس": "Lessons", "الاختبارات": "Exams",
  "بنك الأسئلة": "Question Bank", "المختبر": "Lab", "الواجبات": "Assignments", "التقويم": "Calendar", "الإعلانات": "Announcements", "الرسائل": "Messages", "الجدول الدوري": "Periodic Table",
  "حاسبة الكيمياء": "Chemistry Calculator", "الرئيسية": "Home", "تقدّمي": "My Progress", "سجل التدريب": "Practice Record", "رسائل المعلم": "Teacher Messages", "تسجيل الخروج": "Sign out", "المعلم": "Teacher", "طالب": "Student",
  // عام
  "رجوع": "Back", "حفظ": "Save", "إلغاء": "Cancel", "إغلاق": "Close", "حذف": "Delete", "تعديل": "Edit", "تأكيد": "Confirm", "بحث بالاسم...": "Search by name...", "عرض": "View", "طباعة": "Print",
  "مسودة": "Draft", "منشور": "Published", "مفتوح": "Open", "مغلق": "Closed", "الكل": "All", "كل الصفوف": "All classes", "مشترك لجميع الصفوف": "Shared with all classes", "جارٍ التحميل...": "Loading...",
  "لا توجد اختبارات.": "No exams yet.", "لا توجد اختبارات بعد.": "No exams yet.", "لا توجد واجبات.": "No assignments.", "لا توجد إعلانات.": "No announcements.", "النتائج": "Results", "نشر للطلاب": "Publish to students",
  "الإعلانات الأخيرة": "Latest announcements", "أحدث الدروس": "Latest lessons", "ابدأ": "Start", "تم التسليم": "Submitted", "مطلوب": "Due", "انتهى الموعد": "Past due", "متأخر": "Late",
  // الاختبارات
  "ابدأ الاختبار": "Start exam", "متابعة الاختبار": "Continue exam", "عرض النتيجة": "View result", "محاولة جديدة": "New attempt", "محاولات غير محدودة": "Unlimited attempts", "سؤال": "questions", "درجة": "marks", "دقيقة": "min",
  "الآلة الحاسبة": "Calculator", "محاولاتي:": "My attempts:", "أفضل نتيجة:": "Best score:", "ناجح": "Pass", "راسب": "Fail", "لم ينجح": "Not passed", "النتيجة لم تُعلن بعد": "Result not released yet",
  "عدد الأسئلة": "Questions", "الدرجة الكلية": "Total marks", "زمن الاختبار": "Duration", "درجة النجاح": "Pass mark", "الوقت المستغرق": "Time taken", "الدرجة": "Score", "النتيجة": "Result",
  "النقاط المكتسبة:": "Points earned:", "النقاط الفائتة:": "Points missed:", "عنوان السؤال": "Question", "الأداء حسب ناتج التعلم": "Performance by learning outcome", "مراجعة الإجابات التفصيلية": "Detailed answer review",
  "إجابتك": "Your answer", "لم تتم الإجابة على هذا السؤال": "This question was not answered", "العودة إلى الاختبارات": "Back to exams", "تسليم": "Submit", "تعليمات القسم": "Section instructions",
  "فيما يلي تعليمات هذا القسم.": "Below are the instructions for this section.", "إعدادات سهولة الوصول": "Accessibility settings", "حجم الخط": "Font size", "الوضع الليلي": "Dark mode", "إعادة ضبط": "Reset",
  "تلميح": "Hint", "إخفاء التلميح": "Hide hint", "تحذير": "Warning", "لا يمكنك التسليم قبل الاطلاع على جميع الأسئلة": "You cannot submit before viewing all questions", "جارٍ التسليم...": "Submitting...",
  "أنت على وشك تسليم التقييم. إذا تابعت فلن تتمكن من تغيير أي إجابة في هذه المحاولة. هل تريد المتابعة؟": "You are about to submit this assessment. You will not be able to change any answer in this attempt. Continue?",
  "قائمة الأسئلة": "Question list", "معلومات السؤال": "Question info", "التعليمات": "Instructions", "علامة للمراجعة": "Flag for review", "السابق": "Previous", "التالي": "Next", "شطب الخيارات": "Strike out options", "لغة الأسئلة": "Question language",
  "خطأ في الصيغة": "Syntax error", "معروضة": "Shown", "المحاولة": "Attempt", "التاريخ": "Date", "النسبة": "Percent", "الاختبار": "Exam", "الفصل": "Term", "كل الفصول الدراسية": "All terms",
  "اختبار تدرّبت عليه": "Exams practised", "محاولة": "Attempts", "مرة": "times",
  "سجل التدريب كل محاولاتك في الاختبارات التدريبية — تُحتسب أفضل نتيجة لكل اختبار": "All your practice attempts — best score counts",
  "كل محاولاتك في الاختبارات التدريبية — تُحتسب أفضل نتيجة لكل اختبار": "All your practice-exam attempts — the best score counts for each exam",
  "الطالب": "Student", "الصف": "Class", "أفضل درجة": "Best score", "المحاولات": "Attempts", "أول محاولة": "First attempt", "آخر تسليم": "Last submission", "الإجابات": "Answers", "حذف المحاولات": "Delete attempts",
  "سلّموا": "Submitted", "لم يسلّموا": "Not submitted", "متوسط أفضل الدرجات": "Average best score", "إغلاق الاختبار": "Close exam", "فتح الاختبار": "Open exam", "الدرجات": "Scores",
  // الدخول
  "تسجيل الدخول": "Sign in", "طالب جديد؟ أنشئ حساباً": "New student? Create an account", "رقم الهاتف": "Phone number", "كلمة المرور": "Password", "دخول": "Sign in", "نسيت كلمة المرور؟": "Forgot password?",
  "الاسم الكامل (ثلاثي)": "Full name", "تأكيد كلمة المرور": "Confirm password", "إنشاء الحساب": "Create account", "— اختر صفك —": "— Choose your class —",
  "بعد التسجيل سيراجع المعلم طلبك ويفعّل حسابك.": "After registering, your teacher will review and activate your account.", "دروس، اختبارات، وواجبات — في مكان واحد": "Lessons, exams and assignments — in one place",
  // المعلم - المحرر
  "اختبار جديد": "New exam", "تعديل الاختبار": "Edit exam", "عنوان الاختبار": "Exam title", "تعليمات (اختياري)": "Instructions (optional)", "الدرجة الكلية ": "Total marks", "حفظ الاختبار": "Save exam", "حذف الاختبار": "Delete exam",
  "+ إضافة سؤال": "+ Add question", "+ اختبار جديد": "+ New exam", "📥 رفع من ملف Excel": "📥 Upload from Excel", "⬇ قالب Excel": "⬇ Excel template", "📋 لصق أسئلة جاهزة": "📋 Paste questions",
  "نسبة النجاح %": "Passing %", "الفصل الدراسي": "Term", "مفتوح لاستقبال الإجابات": "Open for submissions", "يرى الطالب درجته والحلول بعد التسليم": "Show score & review after submit",
  "ترتيب عشوائي للخيارات": "Shuffle options", "ترتيب عشوائي للأسئلة لكل طالب": "Shuffle questions", "السماح بالرجوع للأسئلة السابقة": "Allow backtrack", "يجب الاطلاع على كل الأسئلة قبل التسليم": "Require all questions seen",
  "الآلة الحاسبة مسموحة": "Calculator allowed", "محاولات غير محدودة (تُحتسب أفضل نتيجة)": "Unlimited attempts (best score counts)", "اختر الدائرة بجانب الإجابة الصحيحة:": "Select the circle next to the correct answer:",
  "+ خيار": "+ Option", "الصفوف المستهدفة": "Target classes",
};
const P = [
  [/^(\d+) سؤال$/, "$1 questions"], [/^(\d+) درجة$/, "$1 marks"], [/^(\d+) دقيقة$/, "$1 min"], [/^(\d+) درجات$/, "$1 marks"], [/^سؤال (\d+)$/, "Question $1"], [/^المحاولة رقم (\d+)$/, "Attempt #$1"],
  [/^درجة النجاح \((\d+)%\)$/, "Pass mark ($1%)"], [/^ناجح \((\d+)%\)$/, "Passed ($1%)"], [/^محاولاتك \((\d+)\) — تُحتسب أفضل نتيجة$/, "Your attempts ($1) — best score counts"],
  [/^النتيجة · المحاولة (\d+)$/, "Result · attempt $1"], [/^(\d+) اختبار$/, "$1 exams"], [/^متوسط أفضل النتائج · نجحت في (\d+)$/, "Average best score · passed $1"], [/^من (\d+)$/, "of $1"],
];
const tr = (t) => { const k = t.trim(); if (!k || !/[؀-ۿ]/.test(k)) return null; if (D[k]) return t.replace(k, D[k]); for (const [re, to] of P) if (re.test(k)) return t.replace(k, k.replace(re, to)); return null; };
const SKIP = new Set(["TEXTAREA", "SCRIPT", "STYLE", "INPUT", "SELECT"]);
function walk(root) {
  if (uiLang() !== "en" || !root) return;
  if (root.nodeType === 3) { const p = root.parentNode; if (p && !SKIP.has(p.nodeName) && !p.closest?.(".content,.sa-stem,.sa-t,.ot,.bi,.qtext,.chat,[data-noi18n]")) { const v = tr(root.nodeValue); if (v != null) root.nodeValue = v; } return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName) && root.nodeName !== "INPUT" && root.nodeName !== "SELECT") return;
  const els = root.querySelectorAll ? [root, ...root.querySelectorAll("[placeholder],[title],option,button,a,label,h1,h2,h3,th,td,span,div,p,small,b,li,summary")] : [root];
  for (const el of els) {
    if (el.closest?.(".content,.sa-stem,.sa-t,.ot,.bi,.qtext,.chat,[data-noi18n]")) continue;
    for (const a of ["placeholder", "title"]) if (el.getAttribute?.(a)) { const v = tr(el.getAttribute(a)); if (v != null) el.setAttribute(a, v); }
    if (SKIP.has(el.nodeName) && el.nodeName !== "SELECT") continue;
    for (const n of el.childNodes) if (n.nodeType === 3) { const v = tr(n.nodeValue); if (v != null) n.nodeValue = v; }
  }
}
export function initI18n() {
  applyDir();
  new MutationObserver((ms) => { if (uiLang() !== "en") return; for (const m of ms) { if (m.type === "characterData") walk(m.target); else m.addedNodes.forEach(walk); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
  walk(document.body);
}
