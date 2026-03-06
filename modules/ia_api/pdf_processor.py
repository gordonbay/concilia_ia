# pdf_processor.py
# -*- coding: utf-8 -*-
"""
Processamento de PDFs: tenta extração rápida via PyMuPDF;
se o texto estiver corrompido, faz fallback para EasyOCR página a página.
"""
import io
import logging
from ocr_utils import get_easyocr_reader, validar_qualidade_texto

log = logging.getLogger("pdf_processor")


def extrair_texto_pdf(conteudo_bytes: bytes) -> str:
    """
    Estratégia híbrida:
      1. PyMuPDF (rápido, < 1s) — texto puro dos metadados.
      2. Heurística: se palavras estiverem grudadas, descarta.
      3. EasyOCR por página (lento, ~30-60s) como fallback.
    """
    try:
        import fitz          # PyMuPDF
        import numpy as np
        from PIL import Image

        doc = fitz.open(stream=conteudo_bytes, filetype="pdf")

        # ── Tentativa 1: extração rápida ──────────────────────────
        texto_rapido = "\n".join(
            page.get_text("text", sort=True) for page in doc
        )

        if validar_qualidade_texto(texto_rapido):
            log.info("[pdf_processor] Modo RÁPIDO bem-sucedido.")
            return texto_rapido

        log.warning("[pdf_processor] Texto corrompido; iniciando OCR (lento)...")

        # ── Tentativa 2: EasyOCR por página ───────────────────────
        reader = get_easyocr_reader()
        if reader is None:
            log.error("[pdf_processor] EasyOCR não disponível; retornando texto rápido mesmo ruim.")
            return texto_rapido

        paginas = []
        log.info(f"[pdf_processor] OCR em {len(doc)} páginas...")

        for i, page in enumerate(doc):
            matriz = fitz.Matrix(2, 2)          # zoom 2× para letras pequenas
            pix    = page.get_pixmap(matrix=matriz)
            img    = Image.open(io.BytesIO(pix.tobytes("png")))

            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            resultados = reader.readtext(np.array(img), detail=0, paragraph=True)
            paginas.append(f"=== PÁGINA {i+1} (OCR) ===\n" + "\n".join(resultados))

        texto_final = "\n\n".join(paginas)
        log.info(f"[pdf_processor] OCR concluído — {len(texto_final)} chars")
        return texto_final

    except ImportError:
        msg = "Instale: pip install pymupdf pillow numpy easyocr"
        log.error(f"[pdf_processor] {msg}")
        return f"[Erro] {msg}"
    except Exception as e:
        log.error(f"[pdf_processor] Erro genérico: {e}")
        return f"[Erro ao processar PDF] {str(e)}"