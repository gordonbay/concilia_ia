# groq_client.py
# -*- coding: utf-8 -*-
import ssl
import json
import base64
import logging
import http.client
import gemini

log = logging.getLogger("groq_client")

GROQ_API_KEYS = [
    "sen chave"
]
MODELO_PADRAO = "qwen/qwen3-32b"
MODELO_DOC    = "qwen/qwen3-32b"

_key_index = 0


def _montar_texto_consolidado(prompt: str, anexos: list) -> str:
    partes = []
    for anexo in (anexos or []):
        nome = anexo.get("nome", "arquivo")
        dados = anexo.get("conteudo", "")
        tipo = anexo.get("tipo", "")
        if not tipo.startswith("image/"):
            try:
                texto_anexo = base64.b64decode(dados).decode("utf-8", errors="replace")
                partes.append(f"[Anexo: {nome}]\n{texto_anexo}\n[/Anexo]")
            except Exception:
                pass
    partes.append(prompt)
    return "\n\n".join(partes)


def chamar_groq(prompt: str, model: str = MODELO_PADRAO, anexos: list = None) -> dict:
    global _key_index

    texto = _montar_texto_consolidado(prompt, anexos or [])
    corpo = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": texto}],
        "temperature": 0.2,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    ultimo_erro = None
    for tentativa in range(len(GROQ_API_KEYS)):
        idx = (_key_index + tentativa) % len(GROQ_API_KEYS)
        key = GROQ_API_KEYS[idx]
        try:
            ctx = ssl.create_default_context()
            conn = http.client.HTTPSConnection("api.groq.com", timeout=60, context=ctx)
            conn.request("POST", "/openai/v1/chat/completions", body=corpo, headers={
                "Content-Type": "application/json",
                "Content-Length": str(len(corpo)),
                "Authorization": f"Bearer {key}",
                "User-Agent": "GroqProxy/1.0",
            })
            resp = conn.getresponse()
            body = resp.read().decode("utf-8", errors="replace")
            conn.close()

            if resp.status == 200:
                data = json.loads(body)
                _key_index = idx
                uso = data.get("usage", {})
                return {
                    "resposta": data["choices"][0]["message"]["content"],
                    "model": data.get("model", model),
                    "tokens": {
                        "entrada": uso.get("prompt_tokens", 0),
                        "saida": uso.get("completion_tokens", 0),
                        "total": uso.get("total_tokens", 0),
                    },
                }

            log.warning(f"[Groq] chave {idx} HTTP {resp.status}, tentando próxima...")
            _key_index = (idx + 1) % len(GROQ_API_KEYS)
            ultimo_erro = f"HTTP {resp.status}"

        except Exception as e:
            log.warning(f"[Groq] erro na chave {idx}: {e}")
            _key_index = (idx + 1) % len(GROQ_API_KEYS)
            ultimo_erro = str(e)

    # nenhuma chave groq funcionou, tenta gemini
    log.error("Todas as chaves Groq falharam, usando Gemini como fallback")
    try:
        return gemini.chamar_gemini(texto)
    except Exception as gemini_error:
        raise RuntimeError(f"Falha total: Groq({ultimo_erro}) | Gemini({gemini_error})")