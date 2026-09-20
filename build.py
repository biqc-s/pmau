#!/usr/bin/env python3
"""يدمج الملفات المنفصلة في ملف index.html واحد مكتفٍ ذاتيًا داخل dist/.
كل ملف في assets/ يُشار إليه من HTML أو CSS يُضمَّن تلقائيًا كـ data URI.
الاستخدام:  python3 build.py
"""
import base64, pathlib, re

root = pathlib.Path(__file__).parent
dist = root / "dist"; dist.mkdir(exist_ok=True)

MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif",
}

def data_uri(rel):
    path = root / rel
    mime = MIME.get(path.suffix.lower())
    if mime is None:
        raise SystemExit(f"نوع غير مدعوم: {rel}")
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode()

html = (root / "index.html").read_text(encoding="utf-8")
css  = (root / "src/styles.css").read_text(encoding="utf-8")
data = (root / "src/data.js").read_text(encoding="utf-8")
game = (root / "src/game.js").read_text(encoding="utf-8")

html = html.replace('<link rel="stylesheet" href="src/styles.css">',
                    "<style>\n" + css + "\n</style>")
html = html.replace('<script src="src/data.js"></script>\n'
                    '<script src="src/game.js"></script>',
                    "<script>\n" + data + "\n" + game + "\n</script>")

# تضمين كل صورة مشار إليها، بعد دمج التنسيقات حتى تشمل صور CSS أيضًا.
# مراجع CSS تبدأ بـ ../ لأنها تُحلّ نسبةً إلى src/، وتُستبدل كاملةً هنا.
refs = sorted(set(re.findall(r"(?:\.\./)?assets/[\w.\-]+", html)))
for ref in refs:
    rel = ref[3:] if ref.startswith("../") else ref
    if not (root / rel).is_file():
        raise SystemExit(f"مرجع مفقود: {rel}")
    html = html.replace(ref, data_uri(rel))

out = dist / "index.html"
out.write_text(html, encoding="utf-8")
assert "assets/" not in html and "src/" not in html, "بقيت مراجع خارجية"
print(f"تم البناء: {out}  ({out.stat().st_size/1024:.0f} كيلوبايت)")
print(f"صور مضمّنة: {len(refs)} — " + "، ".join(r.split('/')[-1] for r in refs))
