import requests
import json
import logging
import base64

log = logging.getLogger("lm_studio_client")

BASE_URL = "http://127.0.0.1:1234/v1"
MODEL_TEXT = "google/gemma-3-4b"
MODEL_VISION = "zai-org/glm-4.6v-flash"


def _check_server_health():
    try:
        requests.get(f"{BASE_URL}/models", timeout=2)
        return True
    except requests.RequestException:
        return False


def _ensure_model_loaded(model_id):
    if not _check_server_health():
        raise ConnectionError(f"LM Studio não acessível em {BASE_URL}")
    # manda um ping só pra garantir que o modelo tá carregado
    try:
        requests.post(f"{BASE_URL}/chat/completions", json={
            "model": model_id,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1
        }, timeout=5)
    except Exception:
        pass
    return True


def generate_text(prompt, model_id=MODEL_TEXT, temperature=0.2):
    _ensure_model_loaded(model_id)

    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": 3000,
        "stream": False
    }

    try:
        response = requests.post(f"{BASE_URL}/chat/completions", json=payload, timeout=600)
        if response.status_code != 200:
            log.error(f"LM Studio erro: {response.text}")
            response.raise_for_status()

        data = response.json()
        usage = data.get("usage", {})
        return {
            "resposta": data["choices"][0]["message"]["content"],
            "model": model_id,
            "tokens": {
                "entrada": usage.get("prompt_tokens", 0),
                "saida": usage.get("completion_tokens", 0),
                "total": usage.get("total_tokens", 0)
            }
        }
    except Exception as e:
        log.error(f"Erro ao gerar texto no LM Studio: {e}")
        raise


def generate_vision(image_bytes, prompt, model_id=MODEL_VISION):
    _ensure_model_loaded(model_id)

    b64 = base64.b64encode(image_bytes).decode('utf-8')
    payload = {
        "model": model_id,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
            ]
        }],
        "temperature": 0.1,
        "max_tokens": 3000,
        "stream": False
    }

    try:
        response = requests.post(f"{BASE_URL}/chat/completions", json=payload, timeout=600)
        if response.status_code != 200:
            log.error(f"LM Studio Vision erro: {response.text}")
            response.raise_for_status()

        data = response.json()
        usage = data.get("usage", {})
        return {
            "resposta": data["choices"][0]["message"]["content"],
            "model": model_id,
            "tokens": {
                "entrada": usage.get("prompt_tokens", 0),
                "saida": usage.get("completion_tokens", 0),
                "total": usage.get("total_tokens", 0)
            }
        }
    except Exception as e:
        log.error(f"Erro ao processar imagem no LM Studio: {e}")
        raise