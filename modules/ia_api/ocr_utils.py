# ocr_utils.py
# -*- coding: utf-8 -*-
"""
Utilitários compartilhados de OCR: singleton do EasyOCR e validação de qualidade de texto.
"""
import logging

log = logging.getLogger("ocr_utils")

_easyocr_reader     = None
_easyocr_load_error = None


def get_easyocr_reader():
    """Retorna o singleton do EasyOCR Reader (PT, CPU). Carrega na 1ª chamada."""
    global _easyocr_reader, _easyocr_load_error

    if _easyocr_reader is not None:
        return _easyocr_reader
    if _easyocr_load_error is not None:
        return None
    try:
        import easyocr
        _easyocr_reader = easyocr.Reader(['pt'], gpu=False, verbose=False)
        log.info("[easyocr] Reader carregado (pt, cpu)")
    except ImportError as e:
        _easyocr_load_error = f"ImportError: {e} — execute: pip install easyocr"
        log.error(f"[easyocr] {_easyocr_load_error}")
    except Exception as e:
        _easyocr_load_error = str(e)
        log.error(f"[easyocr] Falha ao inicializar: {e}")
    return _easyocr_reader


def get_easyocr_load_error() -> str | None:
    return _easyocr_load_error


def validar_qualidade_texto(texto: str) -> bool:
    """
    Heurística: verifica se o texto extraído possui espaçamento adequado.
    Retorna True se ok; False se palavras estiverem grudadas.
    """
    if not texto or len(texto.strip()) < 50:
        return False

    texto_limpo  = texto.replace("\n", " ").strip()
    total_chars  = len(texto_limpo)
    total_spaces = texto_limpo.count(" ")

    if total_spaces == 0:
        return False

    ratio = total_chars / total_spaces
    if ratio > 15.0:
        log.warning(f"[validar_texto] Reprovado: 1 espaço a cada {ratio:.1f} chars.")
        return False

    palavras_gigantes = [p for p in texto_limpo.split() if len(p) > 35]
    if len(palavras_gigantes) > 3:
        log.warning(f"[validar_texto] Reprovado: {len(palavras_gigantes)} palavras gigantes.")
        return False

    return True


def precarregar():
    """Pré-aquece o singleton — chamar no startup do servidor."""
    log.info("[startup] Pré-carregando EasyOCR...")
    get_easyocr_reader()