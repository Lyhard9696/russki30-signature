#!/usr/bin/env python3
"""RUSSKI 30 SIGNATURE : site + professeur IA sur un domaine unique.
Authentification HTTP Basic obligatoire par mot de passe, quotas de requêtes.
Clé API uniquement côté serveur. Publier derrière HTTPS (Render).
"""
from __future__ import annotations
import json
import os
import base64
import hmac
import time
from collections import defaultdict, deque
from threading import Lock
from urllib.parse import unquote, urlsplit
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

    def _authenticated(self):
        # Le code d'accès reste uniquement dans les variables d'environnement Render.
        value = self.headers.get("Authorization", "")
        if not value.startswith("Basic "):
            return False
        try:
            raw = base64.b64decode(value[6:].strip(), validate=True).decode("utf-8")
            name, sep, password = raw.partition(":")
            return bool(sep and hmac.compare_digest(name, ACCESS_USER) and hmac.compare_digest(password, ACCESS_CODE))
        except (ValueError, UnicodeError):
            return False

    def _guard(self):
        if self._authenticated():
            return True
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="RUSSKI 30 SIGNATURE"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

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
        if not self._guard():
            return
        path = urlsplit(self.path).path
        if path == "/api/status":
            return self._json(200, {"enabled": bool(KEY), "tutor": bool(KEY), "speech": bool(KEY)})
        if not self._static_allowed():
            return self._json(404, {"error": "Ressource introuvable"})
        return super().do_GET()

    def do_HEAD(self):
        if not self._guard():
            return
        if not self._static_allowed():
            self.send_error(404)
            return
        return super().do_HEAD()


    def do_POST(self):
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
