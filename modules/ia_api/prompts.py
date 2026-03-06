# prompts.py
# -*- coding: utf-8 -*-
"""
Centraliza todos os prompts enviados à IA.
Cada função recebe os parâmetros dinâmicos e retorna a string do prompt pronta.
"""


def prompt_analyze_doc(empresas_json: str, codigos_str: str, texto_doc: str) -> str:
    """Prompt principal de análise de documento financeiro (NFS, NFE, boleto, etc.)."""
    return f"""Você é um assistente financeiro especializado em documentos brasileiros.

PASSO 1 — CLASSIFICAÇÃO OBRIGATÓRIA:
Antes de tudo, classifique o documento em uma das categorias abaixo:
- "NFS"           → Nota Fiscal de Serviço (NFS-e)
- "NFE"           → Nota Fiscal de Produto (NF-e)
- "FGTS"          → Guia de recolhimento do FGTS/GFip
- "boleto"        → Boleto bancário (PRIORIDADE TOTAL se houver código de barras/linha digitável)
- "transferencia" → Comprovante/dados de transferência (TED, PIX, etc.)
- "fatura"        → Fatura (cartão, conta de consumo) sem boleto bancário anexo.

Retorne APENAS um JSON com esta estrutura exata (sem markdown).

EXEMPLO PARA UMA NFS-e COM PIX E TRANSFERÊNCIA DESCRITOS:
{{
  "tipo_documento": "NFS",
  "solucao_geral": {{
    "tomador_servico":   {{ "empresa_id": 1, "razao_social": "EMPRESA PAGADORA LTDA" }},
    "prestador_servico": {{ "nome": "PRESTADOR SILVA", "doc_cpf_cnpj": "123.456.789-00" }},
    "confianca": 1.0,
    "justificativa": "Tomador identificado pelo CNPJ na lista de empresas."
  }},
  "dados_fiscais": {{
    "tipo": "NFS",
    "numero": "42",
    "serie": "1",
    "data_emissao": "2026-03-02",
    "competencia": "02/2026",
    "valor_nf": 5000.00,
    "chave_acesso": "",
    "codigo_verificacao": "ABCD1234",
    "discriminacao_servicos": "Serviços de secretaria ref. 02/2026",
    "cnaes": ["8211-3/00"],
    "email_prestador": "prestador@email.com",
    "informacoes_complementares": "",
    "outras_informacoes": "",
    "local_incidencia_iss": "São Paulo - SP",
    "local_prestacao_servico": "Rio de Janeiro - RJ"
  }},
  "solucao_financeira": [
    {{
      "tipo_operacao": "pix",
      "confianca": 1.0,
      "valor_total": 5000.00,
      "data_vencimento": "2026-03-02",
      "capa_documento": {{ "cod_documento": "", "num_documento": "", "data_documento": "" }},
      "operacao_extra": {{
        "pix_tipo": "cpf", "pix_chave": "12345678900",
        "ted_banco": "", "ted_agencia": "", "ted_conta": "",
        "ted_tipo": "corrente", "ted_favorecido": "", "ted_doc": "",
        "boleto_linha": "", "nosso_numero": ""
      }},
      "ativar_parcelas": false,
      "parcelas": []
    }},
    {{
      "tipo_operacao": "DDA",
      "confianca": 1.0,
      "valor_total": 5000.00,
      "data_vencimento": "2026-03-02",
      "capa_documento": {{ "cod_documento": "", "num_documento": "", "data_documento": "" }},
      "operacao_extra": {{}},
      "ativar_parcelas": true,
      "parcelas": [
        {{ "valor": 2500.00, "data_vencimento": "2026-03-02" }},
        {{ "valor": 2500.00, "data_vencimento": "2026-04-02" }}
      ]
    }}
  ],
  "solucao_fatura":   {{ "ativar_fatura": false, "confianca": 0.0, "itens": [] }},
  "solucao_anotacao": {{ "texto": "Prestador X emitiu NFS-e 42 Ref. 02/2026", "confianca": 1.0 }}
}}

CONTEXTO - EMPRESAS (TOMADORES/PAGADORES):
{empresas_json}

CÓDIGOS VALIDADOS (PYTHON):
{codigos_str}

OCR DO DOCUMENTO:
{texto_doc}

REGRAS OBRIGATÓRIAS:

1. CLASSIFICAÇÃO (tipo_documento):
  - Se o documento mencionar "FGTS Digital", "Guia de Recolhimento do FGTS", classifique como "FGTS".
   Classifique SEMPRE em: NFS, NFE, boleto, transferencia ou fatura.
   IMPORTANTE: Se houver linha digitável ou código de barras bancário, classifique como "boleto", mesmo que o título seja "Fatura".

2. DADOS FISCAIS — preencher SOMENTE se NFS ou NFE; caso contrário retorne null.
   - "FGTS", "boleto", "transferencia" → dados_fiscais = null.
   - NFS-e: preencha os campos (discriminacao_servicos, cnaes, email_prestador,
     informacoes_complementares, outras_informacoes, local_incidencia_iss,
     local_prestacao_servico, codigo_verificacao, competencia, valor_nf).

     REGRAS DE MAPEAMENTO DE CAMPOS (FRONTEND):
     1. CNAES: Capture o valor de "Código de Tributação Nacional".
     2. CÓDIGO DE VERIFICAÇÃO (CRÍTICO):
        - O sistema exige que o identificador principal esteja neste campo.
        - Se a NFS-e tiver uma "Chave de Acesso" longa (44 a 50 dígitos), COPIE A CHAVE DE ACESSO PARA DENTRO DO CAMPO 'codigo_verificacao'.
        - Se for nota municipal com código de verificação curto, use o código curto.
        - Resumo: 'codigo_verificacao' = Chave de Acesso OU Código de Verificação.

   - NF-e: preencha chave_acesso (44 dígitos), numero, serie, data_emissao, valor_nf.
   - boleto / transferencia / fatura: dados_fiscais = null.

   *** ATENÇÃO — campo 'serie' ***:
   - Série é quase sempre um número pequeno (ex: 1, 2, 3).
   - NUNCA coloque "FOLHA 1/1" ou "PAGINA 1" no campo série.
   - Se OCR disser "SÉRIE 3 FOLHA 1/1", a série é apenas "3".

3. PAPÉIS E ENTIDADES (OBRIGATÓRIO PREENCHER 'solucao_geral'):
   - PREENCHA SEMPRE "solucao_geral", independentemente do tipo do documento.
   - **SE FOR FGTS:**
     * "Tomador" (Pagador) = A empresa empregadora (procure Razão Social no topo).
     * "Prestador" (Recebedor) = 
       - Nome: "MINISTÉRIO DO TRABALHO E EMPREGO"
       - **Doc/CPF/CNPJ: Capture o nome do trabalhador (campo "Tag") e o campo "Identificador" e monte Nome do trabalhador - Identificador**
         (Ex: Se o nome for "DOUGLAS SILVA" e o identificador "0126030323664838-2", o resultado deve ser "DOUGLAS DA SILVA - 0126030323664838-2").
   - Mapeamento para Boletos:
     * "Pagador" / "Sacado" = tomador_servico (procure o nome logo abaixo ou ao lado do rótulo "Pagador").
     * "Beneficiário" / "Cedente" = prestador_servico.
   - EXTRAÇÃO DE CNPJ/CPF (CRÍTICO):
     * O CNPJ do Beneficiário quase sempre está presente. Procure por rótulos "CNPJ / CPF" ou "Agência / Código" próximos ao nome do Beneficiário.
     * Se houver um número no formato XX.XXX.XXX/0001-XX ou XXX.XXX.XXX-XX no bloco do beneficiário, capture-o.

4. CAPA DO DOCUMENTO (boleto e DDA):
   Preencha cod_documento, nosso_numero, num_documento e data_documento quando visíveis.

5. FATURA / ITENS DE COBRANÇA:
   - Se houver uma tabela descrevendo itens, ative "ativar_fatura": true e liste no array "itens".
   - IMPORTANTE - ESTRUTURA DO ITEM:
     Use EXATAMENTE as chaves: {{"descricao": "Nome do Item", "valor": 100.00}}.
     O campo do preço deve se chamar "valor" (não use "valor_unitario" ou "valor_total").
   - ATENÇÃO AOS VALORES COM 4 CASAS DECIMAIS: "616,0000" deve ser lido como 616.00 (float).

6. MÚLTIPLAS SOLUÇÕES FINANCEIRAS — REGRA MAIS IMPORTANTE:
   ═══════════════════════════════════════════════════════════
   CADA forma de pagamento mencionada = UM item separado em solucao_financeira.
   NUNCA misture PIX e transferência no mesmo item.
   ═══════════════════════════════════════════════════════════
   - Leia TODA a descrição do serviço / Informações Complementares.
   - Ex.: "Pix CPF: 02698598107 ou transferência: BANCO XP (348), AGENCIA 0001, CONTA 1215920-2"
     → Item 1: tipo_operacao="pix",          pix_tipo="cpf", pix_chave="02698598107"
     → Item 2: tipo_operacao="transferencia", ted_banco="348", ted_agencia="0001", ted_conta="1215920-2"
   - valor_total de cada item = valor total da nota (formas alternativas de pagar).
   - data_vencimento = data de emissão quando não houver vencimento explícito.
   - FGTS Digital geralmente usa PIX (QR Code). Se houver código PIX ("000201..."), crie um item "pix".

7. CÓDIGOS DE PAGAMENTO (REGRA DE OURO - NÃO ALUCINE):
   - O bloco 'CÓDIGOS VALIDADOS (PYTHON)' contém a leitura técnica perfeita (via software).
   - O bloco 'OCR DO DOCUMENTO' contém leitura visual que transforma QR Codes em "sopa de letrinhas" (ex: "00,1010...").
   - **ORDEM DE PRIORIDADE ABSOLUTA:**
     1. Se houver código no bloco CÓDIGOS VALIDADOS, copie-o e use-o EXATAMENTE como está.
     2. JAMAIS use o texto bagunçado do OCR se houver um código válido no bloco Python.
     3. Apenas se o bloco CÓDIGOS VALIDADOS estiver vazio, tente extrair do texto.

8. FALLBACK PIX (Quando não há dados de pagamento):
   SOMENTE se não houver nenhuma forma de pagamento explícita, assuma PIX via CNPJ do prestador.
   Neste caso (fallback), defina 'data_vencimento' para 10 dias após a 'data_emissao'.

9. FORMATO:
   - Valores: float (ex: 2500.50). Datas: YYYY-MM-DD.
   - solucao_anotacao.texto: resumo curto (ex: "Prestador X emitiu NFS-e Y Ref. Mês/Ano").
"""

def prompt_analyze_master(empresas_json: str, anexos_ia_json: str) -> str:
    """Prompt de consolidação mestre de múltiplos documentos."""
    return f"""Você é um assistente financeiro. Foram analisados múltiplos documentos e cada um
gerou suas próprias soluções individuais. Consolide tudo em uma solução mestre única e coerente.

EMPRESAS DISPONÍVEIS:
{empresas_json}

SOLUÇÕES INDIVIDUAIS DOS ANEXOS:
{anexos_ia_json}

Retorne APENAS este JSON (sem markdown):
{{
  "tipo_documento": "",
  "solucao_geral": {{
    "tomador_servico":   {{"empresa_id": null, "razao_social": ""}},
    "prestador_servico": {{"nome": "", "doc_cpf_cnpj": ""}},
    "confianca": 0.0,
    "justificativa": ""
  }},
  "dados_fiscais": null,
  "solucao_financeira": [
    {{
      "tipo_operacao": "",
      "confianca": 0.0,
      "valor_total": 0.0,
      "data_vencimento": null,
      "capa_documento": {{"cod_documento": "", "num_documento": "", "data_documento": null}},
      "operacao_extra": {{}},
      "ativar_parcelas": false,
      "parcelas": []
    }}
  ],
  "solucao_fatura":   {{"ativar_fatura": false, "confianca": 0.0, "itens": []}},
  "solucao_anotacao": {{"texto": "Resumo consolidado em 2-3 frases.", "confianca": 1.0}}
}}

REGRAS:
- tipo_documento: use o tipo dominante entre os anexos.
- dados_fiscais:  consolide se houver NFS ou NFE; caso contrário null.
- solucao_financeira: todas as formas de pagamento únicas encontradas,
  incluindo as mencionadas na descrição de NFS-e/NF-e.
- Priorize os dados de maior confiança entre os anexos.
"""