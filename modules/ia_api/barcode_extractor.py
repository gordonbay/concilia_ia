# barcode_extractor.py
# -*- coding: utf-8 -*-
"""
Extração de códigos de pagamento brasileiros:
- Linha digitável (47/48 dígitos, validada por Módulo 10)
- PIX Copia e Cola (payload EMV)
- Código de barras numérico (44 dígitos)
- Leitura óptica via zxingcpp (imagens e PDFs)
"""
import io
import re
import logging

log = logging.getLogger("barcode_extractor")


def _limpar_numeros(v) -> str:
    return re.sub(r'\D', '', str(v))


def _validar_linha_digitavel(linha: str) -> bool:
    """Valida Módulo 10 no primeiro bloco (9 dígitos + 1 DV)."""
    if len(linha) < 10:
        return False

    bloco1  = linha[0:9]
    dv_real = int(linha[9])
    soma    = 0
    mult    = 2

    for digito in reversed(bloco1):
        temp  = int(digito) * mult
        soma += (temp // 10) + (temp % 10)
        mult  = 1 if mult == 2 else 2

    prox_dezena = ((soma // 10) + 1) * 10 if soma % 10 != 0 else soma
    dv_calc     = prox_dezena - soma

    return dv_real == dv_calc


def _processar_imagem_zxing(img) -> list:
    """Lê códigos de barras/QR em uma PIL Image via zxingcpp."""
    codigos = []
    try:
        import zxingcpp
        for res in zxingcpp.read_barcodes(img):
            fmt      = res.format.name.upper().replace('-', '_')
            val_bruto = res.text.strip()
            val_num   = _limpar_numeros(val_bruto)

            if fmt in ('QR_CODE', 'QRCODE', 'AZTEC'):
                if val_bruto.startswith('000201') and '6304' in val_bruto:
                    codigos.append({"tipo": "PIX_QR", "valor": val_bruto})
            else:
                if len(val_num) == 44:
                    codigos.append({"tipo": "CODIGO_BARRAS_44", "valor": val_num})
                elif len(val_num) in (47, 48):
                    codigos.append({"tipo": "LINHA_DIGITAVEL", "valor": val_num})
    except Exception as e:
        log.warning(f"[barcode_extractor] Erro zxing: {e}")
    return codigos


def extrair_codigos(texto: str, conteudo_bytes: bytes, tipo_mime: str) -> list:
    """
    Extrai códigos de pagamento válidos a partir de texto OCR e/ou binário do arquivo.
    Retorna lista de dicts: [{"tipo": "...", "valor": "..."}]
    """
    codigos = []
    seen    = set()

    def add(tipo, valor):
        if not valor or valor in seen:
            return
        if tipo == "LINHA_DIGITAVEL" and not _validar_linha_digitavel(valor):
            log.info(f"[barcode_extractor] Linha ignorada (Mod10 falhou): {valor}")
            return
        seen.add(valor)
        codigos.append({"tipo": tipo, "valor": valor})

    # ── 1. Linha digitável no texto ───────────────────────────────
    ld_pattern = (
        r'(\d{5}[\.\ s]?\d{5}[\s]?\d{5}[\.\ s]?\d{6}[\s]?\d{5}[\.\ s]?\d{6}[\s]?\d[\s]?\d{14})'
        r'|(\d{11}[-\s]?\d[\s]?\d{11}[-\s]?\d[\s]?\d{11}[-\s]?\d[\s]?\d{11}[-\s]?\d)'
    )
    for m in re.finditer(ld_pattern, texto):
        val = _limpar_numeros(m.group(0))
        if len(val) in (47, 48):
            add("LINHA_DIGITAVEL", val)

    # ── 2. PIX Copia e Cola (EMV) no texto ───────────────────────
    pix_pattern = r'(000201\S+6304[A-Fa-f0-9]{4})'
    for m in re.finditer(pix_pattern, texto.replace(' ', '').replace('\n', ''), re.IGNORECASE):
        add("PIX_QR", m.group(0))

    # ── 3. Código de barras 44 dígitos no texto ───────────────────
    for m in re.finditer(r'\b(\d{44})\b', _limpar_numeros(texto)):
        add("CODIGO_BARRAS_44", m.group(1))

    # ── 4. Leitura óptica (zxingcpp) ─────────────────────────────
    if tipo_mime.startswith("image/"):
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(conteudo_bytes))
            for c in _processar_imagem_zxing(img):
                add(c["tipo"], c["valor"])
        except Exception as e:
            log.warning(f"[barcode_extractor] Leitura óptica imagem: {e}")

    elif tipo_mime == "application/pdf":
        try:
            import fitz
            from PIL import Image
            doc = fitz.open(stream=conteudo_bytes, filetype="pdf")
            for page in doc:
                for img_info in page.get_images(full=True):
                    try:
                        base_image = doc.extract_image(img_info[0])
                        img = Image.open(io.BytesIO(base_image["image"]))
                        for c in _processar_imagem_zxing(img):
                            add(c["tipo"], c["valor"])
                    except Exception:
                        pass
        except ImportError:
            pass

    log.info(f"[barcode_extractor] {len(codigos)} código(s) válido(s) encontrado(s).")
    return codigos