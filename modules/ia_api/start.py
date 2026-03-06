import cgi
import sys
import json
import base64
import logging
import re
import ssl
import time
import threading
import io
import argparse

from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

import ocr_utils
import gemini
import lm_studio
from pdf_processor    import extrair_texto_pdf
from image_processor  import extrair_texto_imagem
from barcode_extractor import extrair_codigos
from groq_client      import chamar_groq, MODELO_PADRAO, MODELO_DOC
from prompts          import prompt_analyze_doc, prompt_analyze_master

PORTA        = 8080
SENHA_VALIDA = "123456Michael%"

ARG_LM_STUDIO = False
ARG_VISION = False

def _ler_config_conn_php() -> dict:
    import re as _re
    import os as _os

    base = _os.path.dirname(_os.path.abspath(__file__))
    conn_path = _os.path.normpath(_os.path.join(base, "..", "..", "conn.php"))

    defaults = {"host": "45.148.244.193", "user": "root", "password": ""}

    try:
        with open(conn_path, "r", encoding="utf-8") as f:
            php = f.read()
    except Exception as e:
        print(f"[config] Error reading conn.php: {e}")
        return defaults

    m = _re.search(r'\$ondeEstou\s*=\s*["\']([^"\']+)["\']', php)
    onde = m.group(1).strip() if m else "servidor"

    mapa_host = {
        "servidor":       "45.148.244.193",
        "desenvolvimento": "45.148.244.193",
    }
    host = mapa_host.get(onde, "45.148.244.193")

    m = _re.search(r"\$GLOBALS\['usuarioRoot'\]\s*=\s*[\"']([^\"']+)[\"']", php)
    user = m.group(1) if m else defaults["user"]

    m = _re.search(r"\$GLOBALS\['senhaRoot'\]\s*=\s*[\"']([^\"']+)[\"']", php)
    password = m.group(1) if m else defaults["password"]

    print(f"[config] Environment: {onde} | Host: {host}")
    return {"host": host, "user": user, "password": password}

_mysql_cfg  = _ler_config_conn_php()
MYSQL_HOST  = _mysql_cfg["host"]
MYSQL_PORT  = 3306
MYSQL_USER  = _mysql_cfg["user"]
MYSQL_PASS  = _mysql_cfg["password"]
MYSQL_DB    = "kaisan_beta"

POLL_INTERVAL = 2

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

def _criar_conexao_mysql():
    try:
        import pymysql
    except ImportError:
        log.error("pymysql not installed")
        raise

    while True:
        try:
            conn = pymysql.connect(
                host=MYSQL_HOST,
                port=MYSQL_PORT,
                user=MYSQL_USER,
                password=MYSQL_PASS,
                database=MYSQL_DB,
                charset="utf8mb4",
                autocommit=True,
                connect_timeout=10,
                read_timeout=30,
                write_timeout=30,
            )
            return conn
        except Exception as e:
            log.warning(f"MySQL connect failed: {e}. Retrying...")
            time.sleep(POLL_INTERVAL)

def _garantir_conexao(conn):
    try:
        conn.ping(reconnect=True)
        return conn
    except Exception:
        log.warning("MySQL connection lost. Reconnecting...")
        try:
            conn.close()
        except Exception:
            pass
        return _criar_conexao_mysql()

def _garantir_tabela(conn):
    sql = """
        CREATE TABLE IF NOT EXISTS `conciliacao_jobs_ia` (
            `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `job_id`        VARCHAR(64)  NOT NULL,
            `tipo`          VARCHAR(50)  NOT NULL,
            `arquivo_nome`  VARCHAR(255) DEFAULT NULL,
            `arquivo_mime`  VARCHAR(100) DEFAULT NULL,
            `empresas_json` MEDIUMTEXT   DEFAULT NULL,
            `arquivo_blob`  LONGBLOB     DEFAULT NULL,
            `resposta_json` LONGTEXT     DEFAULT NULL,
            `criado_em`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            INDEX `idx_job_tipo`   (`job_id`, `tipo`),
            INDEX `idx_tipo_criado`(`tipo`, `criado_em`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """
    with conn.cursor() as cur:
        cur.execute(sql)

def _tentar_reparar_json(raw_str: str) -> dict:
    """
    Tenta corrigir erros comuns de JSON gerados por LLMs locais:
    1. Remove blocos Markdown.
    2. Remove vírgulas finais (trailing commas) que quebram o Python.
    3. Tenta fechar chaves/aspas se o texto foi cortado (truncado).
    """
    if not raw_str:
        return {}

    # Limpeza básica
    s = raw_str.replace("```json", "").replace("```", "").strip()
    
    # 1. Tentativa direta
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    # 2. Remove vírgulas antes de fechamentos: ", }" vira "}" e ", ]" vira "]"
    s = re.sub(r',\s*([}\]])', r'\1', s)

    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    # 3. Lógica de truncamento: Reconstrói a estrutura fechando o que estiver aberto
    pilha = []
    dentro_string = False
    escapado = False
    
    for char in s:
        if dentro_string:
            if char == '"' and not escapado:
                dentro_string = False
            elif char == '\\' and not escapado:
                escapado = True
            else:
                escapado = False
        else:
            if char == '"':
                dentro_string = True
            elif char == '{':
                pilha.append('}')
            elif char == '[':
                pilha.append(']')
            elif char == '}' or char == ']':
                if pilha and pilha[-1] == char:
                    pilha.pop()
    
    # Se parou no meio de uma string, fecha aspas
    if dentro_string:
        s += '"'
    
    # Fecha todas as estruturas abertas na ordem inversa
    while pilha:
        fechamento = pilha.pop()
        # Se antes de fechar tiver vírgula, remove
        if s.strip().endswith(','):
             s = s.strip()[:-1]
        s += fechamento

    try:
        return json.loads(s)
    except json.JSONDecodeError:
        log.error("JSON Repair failed.")
        return None

def _processar_job_fila(conn, job_id: str, arquivo_nome: str,
                         arquivo_mime: str, arquivo_blob: bytes,
                         empresas_json: str) -> dict:
    
    text_content = ""
    is_image = arquivo_mime.startswith("image/")
    
    if ARG_VISION and is_image:
        text_content = "[OCR via LM Studio Vision]"
    elif arquivo_mime == "application/pdf":
        text_content = extrair_texto_pdf(arquivo_blob)
    elif is_image:
        text_content = extrair_texto_imagem(arquivo_blob)

    codigos = extrair_codigos(text_content, arquivo_blob, arquivo_mime)
    codigos_str = json.dumps(codigos, ensure_ascii=False)

    # Reduzido para 2000 chars para economizar tokens em modelos locais
    texto_para_prompt = "" if (ARG_VISION and is_image) else text_content[:2000]
    prompt = prompt_analyze_doc(empresas_json, codigos_str, texto_para_prompt)

    resultado_final = {
        "fatura": [], "parcelas": [], "codigos_pagamentos": codigos,
        "transcricao": text_content,
        "solucoes_ia": {
            "tipo_documento": None, "solucao_geral": None,
            "dados_fiscais": None, "solucao_financeira": [],
            "solucao_fatura": None, "solucao_anotacao": None, "anotacao": "",
        },
        "solucoes_count": 0,
    }

    dados = None
    ia_utilizada = "unknown"
    raw_response_log = ""

    try:
        if ARG_VISION and is_image:
            res = lm_studio.generate_vision(arquivo_blob, prompt)
            raw_response_log = res["resposta"]
            ia_utilizada = res.get("model", "lm_studio_vision")
        elif ARG_LM_STUDIO:
            res = lm_studio.generate_text(prompt)
            raw_response_log = res["resposta"]
            ia_utilizada = res.get("model", "lm_studio_text")
        else:
            try:
                res = chamar_groq(prompt, MODELO_DOC, [])
                raw_response_log = res["resposta"]
                ia_utilizada = res.get("model", "groq")
            except Exception as e_groq:
                log.warning(f"Groq failed: {e_groq}")
                res_gem = gemini.chamar_gemini(prompt)
                raw_response_log = res_gem["resposta"]
                ia_utilizada = res_gem.get("model", "gemini")

        # Processamento do JSON com reparo robusto
        dados = _tentar_reparar_json(raw_response_log)
        
        if dados is None:
             log.error(f"Failed to parse JSON for job {job_id}. Raw len: {len(raw_response_log)}")
             if len(raw_response_log) > 20:
                 log.error(f"Raw start: {raw_response_log[:50]} ... Raw end: {raw_response_log[-50:]}")
             dados = {}

    except Exception as e_ia:
        log.error(f"IA processing failed in job {job_id}: {e_ia}")
        dados = {}

    try:
        tipo_doc      = dados.get("tipo_documento")
        dados_fiscais = dados.get("dados_fiscais")
        if tipo_doc in ("boleto", "transferencia", "fatura"):
            dados_fiscais = None
        
        sol_financeira = dados.get("solucao_financeira") or []
        sol_fatura     = dados.get("solucao_fatura") or {}
        sol_anotacao   = dados.get("solucao_anotacao") or {}

        sol = {
            "tipo_documento":     tipo_doc,
            "solucao_geral":      dados.get("solucao_geral"),
            "dados_fiscais":      dados_fiscais,
            "solucao_financeira": sol_financeira,
            "solucao_fatura":     sol_fatura,
            "solucao_anotacao":   sol_anotacao,
            "anotacao":           dados.get("anotacao", ""),
            "model_used":         ia_utilizada
        }

        valid_codes = {c["valor"] for c in codigos}
        
        if isinstance(sol_financeira, list):
            for sf in sol_financeira:
                extra = sf.get("operacao_extra", {})
                if "boleto_linha" in extra:
                    limpo = re.sub(r"\D", "", str(extra["boleto_linha"]))
                    if limpo not in valid_codes and codigos:
                        extra["boleto_linha"] = ""
        else:
            sol["solucao_financeira"] = []

        resultado_final["solucoes_ia"] = sol
        resultado_final["solucoes_count"] = sum([
            sol.get("solucao_geral", {}) is not None
            and (sol.get("solucao_geral") or {}).get("tomador_servico", {}).get("empresa_id") is not None,
            sol.get("dados_fiscais") is not None,
            len(sol.get("solucao_financeira", [])) > 0,
        ])

    except Exception as e_proc:
        log.error(f"Error processing IA JSON in job {job_id}: {e_proc}")

    return resultado_final

def _worker_loop():
    log.info("Starting worker loop...")
    conn = _criar_conexao_mysql()
    _garantir_tabela(conn)

    while True:
        try:
            conn = _garantir_conexao(conn)

            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, job_id, arquivo_nome, arquivo_mime,
                           arquivo_blob, empresas_json
                    FROM   conciliacao_jobs_ia
                    WHERE  tipo = 'aguardando_analise'
                    ORDER  BY criado_em ASC
                    LIMIT  1
                    FOR UPDATE SKIP LOCKED
                """)
                row = cur.fetchone()

            if row is None:
                time.sleep(POLL_INTERVAL)
                continue

            (row_id, job_id, arquivo_nome,
             arquivo_mime, arquivo_blob, empresas_json) = row

            log.info(f"Processing job {job_id}...")

            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE conciliacao_jobs_ia SET tipo = 'processando' WHERE id = %s",
                    (row_id,)
                )

            if isinstance(arquivo_blob, (memoryview, bytearray)):
                arquivo_blob = bytes(arquivo_blob)

            try:
                resultado = _processar_job_fila(
                    conn, job_id, arquivo_nome, arquivo_mime,
                    arquivo_blob, empresas_json or "[]"
                )
                resposta_json = json.dumps(resultado, ensure_ascii=False)

                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO conciliacao_jobs_ia
                            (job_id, tipo, resposta_json)
                        VALUES
                            (%s, 'resposta_ia', %s)
                    """, (job_id, resposta_json))

                with conn.cursor() as cur:
                    cur.execute("""
                        DELETE FROM conciliacao_jobs_ia
                        WHERE id = %s
                    """, (row_id,))

                log.info(f"Job {job_id} completed.")

            except Exception as e:
                log.error(f"Job {job_id} failed: {e}")
                try:
                    conn = _garantir_conexao(conn)
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE conciliacao_jobs_ia SET tipo = 'aguardando_analise' WHERE id = %s",
                            (row_id,)
                        )
                except Exception:
                    pass
                time.sleep(POLL_INTERVAL)

        except Exception as e:
            log.error(f"Worker loop error: {e}")
            try:
                conn = _garantir_conexao(conn)
            except Exception:
                pass
            time.sleep(POLL_INTERVAL)

def iniciar_worker():
    t = threading.Thread(target=_worker_loop, name="ia-queue-worker", daemon=True)
    t.start()
    log.info("Worker thread started.")

def responder(handler, status: int, payload: dict):
    corpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(corpo)))
    handler.end_headers()
    handler.wfile.write(corpo)

def _validar(dados: dict):
    req_id = dados.get("id", "").strip()
    senha  = dados.get("senha", "")
    prompt = dados.get("prompt", "").strip()
    model  = (dados.get("model", MODELO_PADRAO) or MODELO_PADRAO).strip()
    anexos = dados.get("anexos", []) or []

    if senha != SENHA_VALIDA:
        return False, "Senha incorreta", {}
    if not prompt and not anexos:
        return False, "Prompt/Anexos faltantes", {}
    return True, "OK", {"req_id": req_id, "prompt": prompt, "model": model, "anexos": anexos}

def _processar_prompt(handler, req_id, prompt, model, anexos):
    try:
        if ARG_LM_STUDIO:
            res = lm_studio.generate_text(prompt)
        else:
            res = chamar_groq(prompt, model, anexos)
            
        responder(handler, 200, {
            "id":      req_id,
            "resposta": res["resposta"],
            "model":   res["model"],
            "usage":   res["tokens"],
        })
    except Exception as e:
        responder(handler, 500, {"erro": str(e)})

class ProxyHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        log.info(f'{self.client_address[0]} - "{fmt % args}"')

    def do_GET(self):
        rota = urlparse(self.path).path
        if rota == "/health":
            responder(self, 200, {"status": "ok", "porta": PORTA})
        elif rota == "/diag":
            self._handle_diag()
        else:
            responder(self, 404, {"erro": "Not Found"})

    def do_POST(self):
        rota = urlparse(self.path).path
        rotas = {
            "/prompt":         self._handle_prompt_json,
            "/upload":         self._handle_upload_multipart,
            "/analyze_doc":    self._handle_analyze_doc,
            "/analyze_master": self._handle_analyze_master,
        }
        handler_fn = rotas.get(rota)
        if handler_fn:
            handler_fn()
        else:
            responder(self, 404, {"erro": "Not Found"})

    def _handle_diag(self):
        info = {"python": sys.version, "libs": {}}
        checks = [
            ("pillow",    "from PIL import Image; import PIL; v=PIL.__version__"),
            ("numpy",     "import numpy as np; v=np.__version__"),
            ("easyocr",   "import easyocr; v=easyocr.__version__"),
            ("pymupdf",   "import fitz; v=fitz.__version__"),
            ("zxingcpp",  "import zxingcpp; v='ok'"),
            ("pdfplumber","import pdfplumber; v=pdfplumber.__version__"),
            ("pymysql",   "import pymysql; v=pymysql.__version__"),
            ("requests",  "import requests; v=requests.__version__"),
        ]
        for lib, check in checks:
            try:
                loc = {}
                exec(check, {}, loc)
                info["libs"][lib] = loc.get("v", "ok")
            except Exception as e:
                info["libs"][lib] = f"ERROR: {e}"

        info["mode"] = {
            "lm_studio": ARG_LM_STUDIO,
            "lm_studio_vision": ARG_VISION
        }
        responder(self, 200, info)

    def _handle_prompt_json(self):
        tamanho = int(self.headers.get("Content-Length", 0))
        if tamanho == 0:
            responder(self, 400, {"erro": "Empty Body"}); return
        try:
            dados = json.loads(self.rfile.read(tamanho).decode("utf-8"))
        except json.JSONDecodeError:
            responder(self, 400, {"erro": "Invalid JSON"}); return

        ok, msg, campos = _validar(dados)
        if not ok:
            responder(self, 401 if "senha" in msg.lower() else 400, {"erro": msg}); return
        _processar_prompt(self, **campos)

    def _handle_upload_multipart(self):
        content_type = self.headers.get("Content-Type", "")
        try:
            form = cgi.FieldStorage(
                fp=self.rfile, headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE":   content_type,
                    "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
                },
            )
        except Exception:
            responder(self, 400, {"erro": "Form Error"}); return

        dados  = {k: form.getvalue(k, d) for k, d in
                  [("id",""),("senha",""),("prompt",""),("model", MODELO_PADRAO)]}
        anexos = []
        if "arquivo" in form:
            campo = form["arquivo"]
            anexos.append({
                "nome":     campo.filename or "arquivo",
                "tipo":     campo.type or "application/octet-stream",
                "conteudo": base64.b64encode(campo.file.read()).decode("utf-8"),
            })
        dados["anexos"] = anexos

        ok, msg, campos = _validar(dados)
        if not ok:
            responder(self, 401 if "senha" in msg.lower() else 400, {"erro": msg}); return
        _processar_prompt(self, **campos)

    def _handle_analyze_doc(self):
        content_type = self.headers.get("Content-Type", "")
        try:
            form = cgi.FieldStorage(
                fp=self.rfile, headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE":   content_type,
                    "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
                },
            )
        except Exception:
            responder(self, 400, {"erro": "Form Error"}); return

        if "arquivo" not in form:
            responder(self, 400, {"erro": "Missing 'arquivo'"}); return

        campo          = form["arquivo"]
        conteudo_bytes = campo.file.read()
        tipo_mime      = campo.type or "application/octet-stream"
        empresas_json  = form.getvalue("empresas", "[]")

        resultado_final = _processar_job_fila(
            None, "direto", campo.filename or "arquivo",
            tipo_mime, conteudo_bytes, empresas_json
        )
        responder(self, 200, resultado_final)

    def _handle_analyze_master(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            responder(self, 400, {"erro": "Empty Body"}); return
        try:
            dados = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            responder(self, 400, {"erro": "Invalid JSON"}); return

        anexos_ia     = dados.get("anexos_ia", [])
        empresas_json = dados.get("empresas", "[]")

        if not anexos_ia:
            responder(self, 400, {"erro": "No attachments"}); return

        prompt = prompt_analyze_master(
            empresas_json,
            json.dumps(anexos_ia, ensure_ascii=False),
        )

        solucao_mestre = {}
        try:
            if ARG_LM_STUDIO:
                res = lm_studio.generate_text(prompt)
                txt = res["resposta"].replace("```json", "").replace("```", "").strip()
                solucao_mestre = json.loads(txt)
            else:
                res = chamar_groq(prompt, MODELO_DOC, [])
                txt = res["resposta"].replace("```json", "").replace("```", "").strip()
                solucao_mestre = json.loads(txt)
                
            responder(self, 200, {"status": "success", "solucao_mestre": solucao_mestre})
        except Exception as e:
            log.error(f"Analyze master error: {e}")
            responder(self, 500, {"erro": str(e)})

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Groq/LM Studio Proxy Server")
    parser.add_argument("--lm_studio", action="store_true", help="Enable LM Studio for text generation")
    parser.add_argument("--lm_studio_vision", action="store_true", help="Enable LM Studio Vision for OCR/Analysis")
    
    args = parser.parse_args()
    
    ARG_LM_STUDIO = args.lm_studio
    ARG_VISION = args.lm_studio_vision

    if ARG_VISION:
        log.info("Mode: LM Studio Vision ENABLED (OCR via zai-org/glm-4.6v-flash)")
        ARG_LM_STUDIO = True 

    if ARG_LM_STUDIO:
        log.info("Mode: LM Studio Text ENABLED (google/gemma-3-4b)")
    else:
        log.info("Mode: Standard (Groq/Gemini)")

    ocr_utils.precarregar()

    iniciar_worker()

    server = HTTPServer(("0.0.0.0", PORTA), ProxyHandler)
    log.info(f"Server running on port {PORTA}...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()
    log.info("Server stopped.")