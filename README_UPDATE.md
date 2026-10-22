# إنجاز | شبكة مراسلي TRT — تحديث 2

## ماذا أُضيف؟
- إنشاء حساب بالبريد وكلمة المرور، وإرسال رسالة تحقق.
- تسجيل الدخول عبر حساب Google (بعد تفعيل Google من Firebase Authentication).
- الاحتفاظ بتسجيل الدخول بالبريد للمستخدمين الحاليين.
- تصدير ملف Word عبر قالب أصلي ضمن templates مع fallback مضمّن في template-base64.js.
- كل مستخدم يحتفظ بسجلاته في Firestore تحت users/{uid}/entries أو categories.

## للنشر من المتصفح دون برامج
افتح https://github.com/ibrsamsung-gif/enjaz-trt
ثم Add file > Upload files، وارفع ملفات الحزمة بعد فك الضغط؛ يجب أن تكون في جذر المستودع.
اضغط Commit changes. لا ترفع ملف ZIP نفسه.
إذا تعذر رفع مجلد templates، فوجود template-base64.js يكفي لتجاوز خطأ فقد القالب.
انتقل إلى Firebase Authentication > Sign-in method وفعّل Google مع اختيار بريد دعم المشروع.
في Authentication > Settings > Authorized domains أضف ibrsamsung-gif.github.io إن لم يكن موجودًا.
ثم جرّب من https://ibrsamsung-gif.github.io/enjaz-trt/ وتحقق من الحفظ الفعلي، وانعزال حسابين، وتصدير Word.
## تنبيه
التحديث لا ينشر نفسه على GitHub. لا يزيل أي سجلات سابقة من Firebase.
الأمان الحقيقي يعتمد على قواعد Firestore المنشورة واختبارها.
