# image_processor.py
# -*- coding: utf-8 -*-
"""
Processamento de imagens: extrai texto via EasyOCR.
"""
import io
import logging
from ocr_utils import get_easyocr_reader, get_easyocr_load_error

log = logging.getLogger("image_processor")


def extrair_texto_imagem(conteudo_bytes: bytes) -> str:
    """
    Recebe os bytes de uma imagem e retorna o texto extraído via EasyOCR.
    """
    try:
        import numpy as np
        from PIL import Image

        reader = get_easyocr_reader()
        if reader is None:
            erro = get_easyocr_load_error()
            log.error(f"[image_processor] EasyOCR indisponível: {erro}")
            return f"[Erro] EasyOCR não carregado: {erro}"

        img = Image.open(io.BytesIO(conteudo_bytes))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        resultados = reader.readtext(np.array(img), detail=0, paragraph=True)
        texto = "\n".join(resultados)

        log.info(f"[image_processor] OCR concluído — {len(texto)} chars")
        return texto

    except Exception as e:
        log.error(f"[image_processor] Erro: {e}")
        return f"[Erro ao processar imagem] {str(e)}"