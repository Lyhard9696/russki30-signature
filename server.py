#!/usr/bin/env python3
"""RUSSKI 30 SIGNATURE : site + professeur IA sur un domaine unique.
Connexion web adaptée à Safari installé sur iPhone, session signée et cookie.
Authentification HTTP Basic conservée pour compatibilité.
Clé API uniquement côté serveur. Publier derrière HTTPS (Render).
"""
from __future__ import annotations
import json
import os
import base64
import hmac
import hashlib
import html
import time
from collections import defaultdict, deque
from threading import Lock
from urllib.parse import unquote, urlsplit, parse_qs
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE = Path(__file__).resolve().parent
KEY = os.getenv("OPENAI_API_KEY", "").strip()
MODEL = os.getenv("RUSSKI_MODEL", "gpt-4.1-mini")
TTS_MODEL = os.getenv("RUSSKI_TTS_MODEL", "gpt-4o-mini-tts")
HOST = os.getenv("RUSSKI_HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", os.getenv("RUSSKI_PORT", "8765")))
ACCESS_CODE = os.getenv("RUSSKI_ACCESS_CODE", "").strip()
ACCESS_USER = "russki"
SESSION_AGE = 30 * 24 * 3600
PER_HOUR = max(10,min(200,int(os.getenv("RUSSKI_AI_LIMIT_HOUR","50"))))
PER_DAY = max(10,min(400,int(os.getenv("RUSSKI_AI_LIMIT_DAY","120"))))
VOICE_DAY = max(5,min(200,int(os.getenv("RUSSKI_VOICE_LIMIT_DAY","60"))))
COUNTERS = defaultdict(deque)
COUNTER_LOCK = Lock()
PUBLIC_FILES = {
    "/", "/index.html", "/styles.css", "/app.js", "/lessons.js", "/accents.js",
    "/extra.js", "/bonus.js", "/icon-192.png", "/icon-512.png",
    "/manifest.webmanifest", "/sw.js", "/recordings.json", "/favicon.ico"
}


SYS = """Tu es un professeur de russe expérimenté pour un adulte francophone de niveau débutant A1.
Accompagne l'élève pour comprendre et parler le russe. Tu dois :
- répondre en français pour les explications, avec des phrases courtes en russe cyrillique,
- faire une seule question à la fois et garder une progression simple,
- corriger délicatement et précisément ses erreurs de sens, de cas, de genre et de conjugaison,
- éviter de marquer fausse une formulation alternative correcte,
- indiquer si une phrase est grammaticalement possible mais peu naturelle,
- ne jamais prétendre évaluer les phonèmes ou l'accent d'un enregistrement à partir de sa transcription,
- rester concis (4 à 7 lignes), annoncer au plus 2 corrections à la fois,
- après une réponse, proposer une question pour poursuivre l'échange,
- ne jamais demander de données sensibles ou d'identifiants.
Ta réponse est du texte brut, sans markdown complexe. Exemple de structure :
« En russe : ... »
« En français : ... »
« Correction : ... »
« À toi : ... »
Attention aux accents toniques : indique-les au besoin sans les imposer en orthographe courante.
"""

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE), **kwargs)

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _session_signature(self, stamp: str) -> str:
        # Signature persistante entre redémarrages Render, sans conserver de session serveur.
        key = hmac.new(ACCESS_CODE.encode("utf-8"), b"russki-session-v1", hashlib.sha256).digest()
        return hmac.new(key, stamp.encode("ascii"), hashlib.sha256).hexdigest()

    def _cookie_authenticated(self) -> bool:
        cookie = self.headers.get("Cookie", "")
        value = next((part.strip().split("=", 1)[1] for part in cookie.split(";")
                      if part.strip().startswith("russki_session=")), "")
        if not value or len(value) > 160:
            return False
        stamp, sep, signature = value.partition(".")
        if not sep or not stamp.isdigit() or len(signature) != 64:
            return False
        issued = int(stamp)
        if issued > int(time.time()) + 60 or issued < int(time.time()) - SESSION_AGE:
            return False
        return hmac.compare_digest(signature, self._session_signature(stamp))

    def _authenticated(self):
        # Safari et une app web installée ne partagent pas nécessairement leurs
        # identifiants HTTP Basic. La session cookie fonctionne dans les deux.
        if self._cookie_authenticated():
            return True
        value = self.headers.get("Authorization", "")
        if not value.startswith("Basic "):
            return False
        try:
            raw = base64.b64decode(value[6:].strip(), validate=True).decode("utf-8")
            name, sep, password = raw.partition(":")
            return bool(sep and hmac.compare_digest(name, ACCESS_USER) and hmac.compare_digest(password, ACCESS_CODE))
        except (ValueError, UnicodeError):
            return False

    def _login_page(self, error: str = "", status: int = 200):
        warning = f'<div class="warn" role="alert">{html.escape(error)}</div>' if error else ''
        body = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#081524">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Russki Signature">
<title>Connexion — RUSSKI 30 SIGNATURE</title><style>
:root{{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
*{{box-sizing:border-box}}body{{margin:0;min-height:100svh;display:grid;place-items:center;color:#f4fbff;
background:radial-gradient(circle at 20% 15%,#184e57 0%,transparent 45%),linear-gradient(135deg,#081320,#102039)}}
main{{width:min(410px,calc(100% - 36px));padding:32px 24px;border:1px solid #ffffff24;border-radius:28px;
background:linear-gradient(140deg,#21384cb8,#102239d4);box-shadow:0 25px 70px #02081399}}
.mark{{width:68px;height:68px;border-radius:21px;display:grid;place-items:center;color:#0b2530;font-size:42px;font-weight:900;
background:linear-gradient(135deg,#9df9d7,#92cdff);box-shadow:0 14px 34px #6de5d622;margin-bottom:22px}}
.kicker{{color:#9cf7d8;font-size:11px;letter-spacing:2px;font-weight:850}}h1{{font-size:31px;line-height:1.12;letter-spacing:-1px;margin:8px 0}}
p{{color:#b7c9d8;font-size:14px;line-height:1.55}}label{{display:block;color:#d8e7f2;font-size:13px;font-weight:700;margin:23px 0 9px}}
input{{width:100%;border:1px solid #8db4c14d;border-radius:14px;padding:15px 16px;background:#071828;color:white;font-size:16px;outline:none}}
input:focus{{border-color:#9af1d8;box-shadow:0 0 0 4px #9af1d820}}
button{{border:0;width:100%;padding:16px;border-radius:14px;background:linear-gradient(135deg,#b3ffe7,#77dfc9);
font-size:15px;font-weight:800;color:#0e332b;margin-top:14px;cursor:pointer}}
.warn{{padding:12px 13px;border:1px solid #eab88570;background:#b45f3433;color:#ffddb8;border-radius:12px;font-size:13px}}
.fine{{margin-top:20px;color:#8facbc;font-size:11px;text-align:center}}
</style></head><body><main><div class="mark">Я</div><div class="kicker">RUSSKI 30 SIGNATURE</div>
<h1>Content de te retrouver.</h1><p>Connecte-toi pour retrouver tes leçons, tes révisions et ton professeur de russe.</p>
{warning}<form action="/login" method="post"><label for="password">Ton mot de passe RUSSKI</label>
<input id="password" name="code" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Ouvrir mon application →</button></form>
<div class="fine">Le mot de passe est celui configuré dans Render.</div></main></body></html>'''
        encoded = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','text/html; charset=utf-8')
        self.send_header('Cache-Control','no-store, private')
        self.send_header('Vary','Cookie')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Content-Length',str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _guard(self):
        if self._authenticated():
            return True
        return self._json(401, {"error": "Session expirée. Recharge la page pour te connecter."}) or False

    def _login(self):
        if not self._quota('login:' + self.client_address[0], 12, 600):
            return self._login_page('Trop de tentatives. Réessaie dans dix minutes.', 429)
        try:
            length = int(self.headers.get('Content-Length','0'))
            if length < 1 or length > 2000:
                return self._login_page('Formulaire invalide.', 400)
            form = parse_qs(self.rfile.read(length).decode('utf-8'))
            code = (form.get('code') or [''])[0]
        except (ValueError, UnicodeError):
            return self._login_page('Formulaire invalide.', 400)
        if not hmac.compare_digest(code, ACCESS_CODE):
            return self._login_page('Mot de passe incorrect. Vérifie la valeur définie sur Render.')
        timestamp = str(int(time.time()))
        token = timestamp + '.' + self._session_signature(timestamp)
        self.send_response(303)
        self.send_header('Location','/')
        self.send_header('Set-Cookie', f'russki_session={token}; Max-Age={SESSION_AGE}; Path=/; Secure; HttpOnly; SameSite=Lax')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length','0')
        self.end_headers()

    def _static_allowed(self):
        target = unquote(urlsplit(self.path).path)
        return target in PUBLIC_FILES or (target.startswith("/audio/") and target.lower().endswith((".mp3", ".ogg", ".wav")) and ".." not in target)

    def _quota(self, scope, limit, period):
        # Quotas en mémoire : protection raisonnable contre les abus accidentels,
        # pas une garantie financière absolue (remis à zéro lors des redémarrages).
        moment = time.monotonic()
        with COUNTER_LOCK:
            seq = COUNTERS[scope]
            while seq and seq[0] <= moment - period:
                seq.popleft()
            if len(seq) >= limit:
                return False
            seq.append(moment)
            return True

    def do_GET(self):
        path = urlsplit(self.path).path
        if not self._authenticated() and path in ('/', '/index.html', '/login'):
            return self._login_page()
        if not self._guard():
            return
        if path == '/login':
            self.send_response(303)
            self.send_header('Location','/')
            self.send_header('Content-Length','0')
            self.end_headers()
            return
        if path == '/api/status':
            return self._json(200, {'enabled': bool(KEY), 'tutor': bool(KEY), 'speech': bool(KEY)})
        if not self._static_allowed():
            return self._json(404, {'error': 'Ressource introuvable'})
        return super().do_GET()

    def do_HEAD(self):
        if not self._authenticated():
            self.send_response(200 if urlsplit(self.path).path in ('/', '/index.html') else 401)
            self.send_header('Content-Length','0')
            self.end_headers()
            return
        if not self._static_allowed():
            self.send_error(404)
            return
        return super().do_HEAD()


    def do_POST(self):
        if urlsplit(self.path).path == '/login':
            return self._login()
        if not self._guard():
            return
        if self.path not in ("/api/tutor", "/api/voice"):
            return self._json(404, {"error": "Ressource introuvable"})
        if not KEY:
            return self._json(503, {"error": "Aucune clé API configurée sur le serveur"})
        if not self._quota("api_hour", PER_HOUR, 3600) or not self._quota("api_day", PER_DAY, 86400):
            return self._json(429, {"error": "Quota IA temporaire atteint ; réessaie plus tard."})
        if self.path == "/api/voice" and not self._quota("voice_day", VOICE_DAY, 86400):
            return self._json(429, {"error": "Quota vocal temporaire atteint."})
        try:
            ln = int(self.headers.get("Content-Length", "0"))
            if ln <= 0 or ln > 16000:
                return self._json(413, {"error": "Message trop volumineux"})
            data = json.loads(self.rfile.read(ln).decode("utf-8"))
            if not isinstance(data, dict):
                return self._json(400, {"error": "Format invalide"})
            if self.path == "/api/voice":
                phrase = str(data.get("text", ""))[:350]
                if not phrase.strip():
                    return self._json(400, {"error": "Texte manquant"})
                body = {"model": TTS_MODEL, "voice": "marin", "input": phrase, "response_format": "mp3", "instructions": "Speak natural Russian, clearly, at a learner-friendly pace. No translation."}
                audio = self._openai("https://api.openai.com/v1/audio/speech", body, binary=True)
                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(audio)))
                self.end_headers()
                self.wfile.write(audio)
                return
            txt = str(data.get("message", "")).strip()
            if len(txt) < 1 or len(txt) > 1000:
                return self._json(400, {"error": "Message limité à 1 000 caractères"})
            day = min(30, max(1, int(data.get("day", 1))))
            history = data.get("history", [])
            msgs = [{"role": "system", "content": SYS + f"\nL'élève est à la leçon {day} sur 30."}]
            if isinstance(history, list):
                for h in history[-12:]:
                    if not isinstance(h, dict):
                        continue
                    role, content = h.get("role"), h.get("text")
                    if role in ("user", "assistant") and isinstance(content, str):
                        msgs.append({"role": role, "content": content[:1500]})
            if not msgs or msgs[-1].get("role") != "user" or msgs[-1].get("content") != txt:
                msgs.append({"role": "user", "content": txt})
            payload = {"model": MODEL, "messages": msgs, "temperature": 0.35, "max_completion_tokens": 500}
            output = self._openai("https://api.openai.com/v1/chat/completions", payload, binary=False)
            answer = (output.get("choices") or [{}])[0].get("message", {}).get("content")
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError("Réponse vide du modèle")
            return self._json(200, {"reply": answer[:2000]})
        except (ValueError, TypeError, json.JSONDecodeError) as ex:
            return self._json(400, {"error": f"Requête invalide : {str(ex)[:100]}"})
        except HTTPError as ex:
            return self._json(502, {"error": f"Service IA HTTP {ex.code}"})
        except (URLError, TimeoutError, OSError) as ex:
            return self._json(502, {"error": "Service IA temporairement inaccessible"})
        except Exception:
            return self._json(500, {"error": "Erreur serveur"})

    def _openai(self, uri: str, payload: dict, binary: bool):
        req = Request(uri, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                      headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=35) as response:
            content = response.read(2_500_000)
        return content if binary else json.loads(content.decode("utf-8"))

if __name__ == "__main__":
    if not ACCESS_CODE or len(ACCESS_CODE) < 12:
        raise RuntimeError("Définis RUSSKI_ACCESS_CODE avec un mot de passe d'au moins 12 caractères avant le démarrage.")
    print(f"RUSSKI 30 SIGNATURE → http://{HOST}:{PORT}/")
    print("Professeur IA : activé" if KEY else "Professeur IA : désactivé (OPENAI_API_KEY absente)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
