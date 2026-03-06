# -*- coding: utf-8 -*-
import json
import logging
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

MODELO_GEMINI = "gemini-2.5-flash"

# pode adicionar mais chaves aqui se precisar de mais cota
GEMINI_KEYS = [
    "chave"
]

log = logging.getLogger("gemini_module")
_current_key_idx = 0


def _get_next_key():
    global _current_key_idx
    key = GEMINI_KEYS[_current_key_idx]
    _current_key_idx = (_current_key_idx + 1) % len(GEMINI_KEYS)
    return key


def chamar_gemini(texto_completo: str) -> dict:
    payload = {
        "contents": [{"parts": [{"text": texto_completo}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.2
        }
    }
    dados_json = json.dumps(payload).encode("utf-8")
    erros = []

    for _ in range(3):
        key = _get_next_key()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO_GEMINI}:generateContent?key={key}"
        req = Request(url, data=dados_json, method="POST")
        req.add_header("Content-Type", "application/json")

        try:
            with urlopen(req, timeout=60) as response:
                if response.status == 200:
                    resp_json = json.loads(response.read().decode("utf-8"))
                    content = resp_json["candidates"][0]["content"]["parts"][0]["text"]
                    usage = resp_json.get("usageMetadata", {})
                    log.info(f"[Gemini] ok, chave ...{key[-4:]}")
                    return {
                        "resposta": content,
                        "model": MODELO_GEMINI,
                        "tokens": {
                            "entrada": usage.get("promptTokenCount", 0),
                            "saida": usage.get("candidatesTokenCount", 0),
                            "total": usage.get("totalTokenCount", 0)
                        }
                    }
        except HTTPError as e:
            msg = f"HTTP {e.code}: {e.read().decode('utf-8')}"
            log.warning(f"[Gemini] chave ...{key[-4:]} falhou: {msg}")
            erros.append(msg)
        except Exception as e:
            log.warning(f"[Gemini] erro: {e}")
            erros.append(str(e))

        time.sleep(1)

    raise RuntimeError(f"Todas as tentativas Gemini falharam: {'; '.join(erros)}")