# MA Projetos — Sistema de Gestão

Sistema interno de gestão financeira com módulo de conciliação bancária e análise de documentos via IA.

## Estrutura

```
www2/
├── index.html              # Shell da aplicação (SPA)
├── login.html              # Tela de login/cadastro/recuperação de senha
├── conn.php                # Configurações de banco, SMTP e APIs (não versionar com dados reais)
├── schema.sql              # Schema completo do MySQL
├── extractor.py            # Utilitário para dump do código em CONTEXTO.txt
├── assets/                 # CSS, JS, imagens
├── api/                    # Endpoints PHP (auth, módulos)
└── modules/
    ├── pConciliacaoBancaria/   # Módulo principal de conciliação
    │   ├── js/                 # main.js, utils.js, typeahead.js, etc.
    │   └── api/                # PHP endpoints do módulo
    └── ia_api/                 # Servidor Python de análise de documentos
        ├── start.py            # Servidor HTTP + worker de fila
        ├── groq_client.py      # Cliente Groq com fallback para Gemini
        ├── gemini.py           # Cliente Gemini
        ├── lm_studio.py        # Cliente LM Studio (local)
        ├── prompts.py          # Prompts de análise de documentos
        ├── pdf_processor.py    # Extração de texto de PDFs (PyMuPDF + EasyOCR)
        ├── image_processor.py  # OCR de imagens via EasyOCR
        ├── barcode_extractor.py # Extração de boletos, PIX, códigos de barras
        └── ocr_utils.py        # Singleton EasyOCR e helpers
```

## Setup

### 1. Banco de dados

```bash
mysql -u root -p < schema.sql
```

### 2. Configuração

Copie `conn.php` e preencha com suas credenciais:

```bash
# O arquivo já está no formato de template
# Edite diretamente — não commite dados reais
```

Variáveis que precisam ser preenchidas em `conn.php`:
- `$GLOBALS['usuarioRoot']` / `$GLOBALS['senhaRoot']` — credenciais MySQL
- `$GLOBALS['SMTP_*']` — configurações de e-mail
- `$GLOBALS['GEMINI_API_KEY']`, `$GLOBALS['GROK_API_KEY_A']` etc — chaves de API

### 3. Servidor Python (módulo IA)

```bash
cd modules/ia_api
pip install pymysql easyocr pymupdf zxingcpp pillow requests

# Modo padrão (usa Groq/Gemini via API)
python start.py

# Com LM Studio local (precisa do servidor rodando na 1234)
python start.py --lm-studio

# Com visão (imagens processadas pelo modelo vision)
python start.py --vision
```

O servidor sobe na porta `8080` e fica em loop processando a fila `conciliacao_jobs_ia`.

### 4. Web

Sirva a pasta `www2/` com Apache/Nginx apontando para PHP. O `index.html` é o ponto de entrada.

## Variáveis de ambiente do Python

O `start.py` lê as credenciais do MySQL diretamente do `conn.php` (dois níveis acima). Se precisar sobrescrever, edite `_ler_config_conn_php()` no início do arquivo.

## Senha padrão

O `schema.sql` insere um usuário `admin` com senha `admin123`. **Troque antes de ir pra produção.**

## .gitignore recomendado

```
conn.php
CONTEXTO.txt
*.pyc
__pycache__/
assets/pics/
```
