# نشر الباك اند على Replit

## الخطوة 1: إنشاء Repl جديد

1. اذهب إلى [replit.com](https://replit.com) وسجّل الدخول
2. اضغط **+ Create Repl**
3. اختر **Import from GitHub** (إن كان المشروع على GitHub)
   - أو اختر **Blank Repl** ورفع الملفات يدوياً
4. اسم الـ Repl: مثلاً `rolet-backend`

---

## الخطوة 2: رفع ملفات الباك اند

### إذا استخدمت Import من GitHub:
- تأكد أن مجلد `back-end` هو المجلد الرئيسي، أو انسخ محتوياته للجذر

### إذا استخدمت Blank Repl:
انسخ كل محتويات مجلد `back-end` إلى Replit:
- `app.js`
- `package.json`
- مجلدات: `authGoogle`, `routes`, `models`, `middleware`, `uploads` (إن وجدت)
- **لا تنقل ملف `.env`** — سنستخدم Secrets بدلاً منه

---

## الخطوة 3: إضافة Environment Variables (Secrets)

1. في Replit، اضغط على أيقونة **Secrets** (القفل 🔒) في الشريط الجانبي
2. أو من **Tools → Secrets**
3. أضف المتغيرات التالية واحدةً واحدة:

| الاسم | القيمة |
|------|--------|
| `MONGODB_URI` | رابط MongoDB Atlas الكامل |
| `JWT_SECRET` | مفتاح JWT سري |
| `BREVO_API_KEY` | مفتاح Brevo API |
| `BREVO_FROM_EMAIL` | البريد المرسل |
| `LIVEKIT_WS_URL` | wss://xxx.livekit.cloud |
| `LIVEKIT_API_KEY` | مفتاح LiveKit |
| `LIVEKIT_API_SECRET` | سر LiveKit |
| `NODE_ENV` | production |

---

## الخطوة 4: تعديل MongoDB Atlas

1. ادخل [MongoDB Atlas](https://cloud.mongodb.com)
2. **Network Access** → **Add IP Address**
3. اختر **Allow Access from Anywhere** (0.0.0.0/0) — لأن IP Replit يتغيّر
   - أو أضف نطاق IP Replit إن وجد في التوثيق

---

## الخطوة 5: ملف .replit (اختياري)

إن لم يكتشف Replit المشروع تلقائياً، أنشئ ملف `.replit` في الجذر:

```toml
run = "npm start"
language = "nodejs"
```

---

## الخطوة 6: التشغيل

1. اضغط **Run** (أو Ctrl+Enter)
2. انتظر حتى تظهر الرسالة: `Server running on port 3000` (أو المنفذ الذي يحدده Replit)
3. سيعطيك Replit رابطاً مثل:
   ```
   https://xxxxx-xxxxx.xxxxx.replit.dev
   ```

---

## الخطوة 7: التجربة

افتح في المتصفح:
```
https://رابطك.replit.dev/health
```

يجب أن ترى:
```json
{"status":"OK","timestamp":"..."}
```

---

## تحديث رابط الباك اند في التطبيق

في تطبيق React Native (`rolet`)، غيّر `API_URL` أو `BASE_URL` إلى:

```
https://رابطك.replit.dev/api
```

---

## ملاحظات مهمة

| النقطة | التوضيح |
|--------|---------|
| **Sleep Mode** | Replit يوقف المشروع بعد فترة عدم استخدام — أول طلب قد يأخذ 30–60 ثانية |
| **الروابط** | الرابط قد يتغيّر عند إعادة النشر — احفظ الرابط الجديد |
| **المجلد uploads** | الملفات المرفوعة قد تُفقد عند إعادة التشغيل — استخدم خدمة تخزين خارجية (مثل Cloudinary) للإنتاج |
| **المجاني** | الخطة المجانية كافية للتجربة، لكن قد تواجه حدود استخدام |

---

## استكشاف الأخطاء

| المشكلة | الحل |
|---------|------|
| 404 Not Found | تأكد أن الخادم يعمل (Run) وأن الرابط صحيح |
| MongoDB connection error | تحقق من MONGODB_URI و Network Access في Atlas |
| CORS errors | الكود يدعم `origin: "*"` — تأكد من إعدادات التطبيق |
