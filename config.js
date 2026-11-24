// ============================================================
//  إعدادات المنصة — هذا هو الملف الوحيد الذي تعدّله
// ============================================================

// 1) الصق هنا الإعدادات التي ينسخها لك Firebase (من: Project settings → Your apps → Web app)
export const firebaseConfig = {
  apiKey: "AIzaSyDwsJSVZutAR58myPFu8lNHVSkc7tGN0pk",
  authDomain: "alayoubak-platform.firebaseapp.com",
  projectId: "alayoubak-platform",
  storageBucket: "alayoubak-platform.firebasestorage.app",
  messagingSenderId: "74149091270",
  appId: "1:74149091270:web:85c244f1ea7d1ded91c4c7"
};

// 2) بريدك أنت (حساب المعلم) — نفس البريد المكتوب في firestore.rules
export const TEACHER_EMAIL = "mohamedmousa20202@gmail.com";

// 3) بيانات تظهر على المنصة
export const SITE = {
  title: "منصة الأيوباك",
  teacher: "أ / محمد موسى",
  school: "مجمع زايد التعليمي - سهيلة",
  contact: "0526917425",             // رقم التواصل (يظهر في صفحة الدخول والتقارير)
  classes: [
    "الصف التاسع العام",
    "الصف العاشر المتقدم", "الصف العاشر العام",
    "الصف الحادي عشر المتقدم", "الصف الحادي عشر العام",
    "الصف الثاني عشر المتقدم", "الصف الثاني عشر العام"
  ],   // أسماء الصفوف (أضف أو احذف كما تريد)
  cover: "cover.jpg",                // صورة الغلاف (اتركها "" لإلغائها)
  honor: true                        // لوحة الشرف: اجعلها false لإخفائها عن الطلاب
};

// لا تغيّر هذا السطر (نطاق وهمي لأسماء دخول الطلاب)
export const STUDENT_DOMAIN = "students.mousa-platform.app";
