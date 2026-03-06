/**
 * ConciliacaoUIForm — Formulário de edição e campos de operação
 * Responsabilidade: buildEditForm, buildOperacaoFields, collectOperacaoFields,
 *                   buildParcelaRow, buildFaturaItemRow.
 * Depende de: ConciliacaoUtils, ConciliacaoMain
 */
var ConciliacaoUIForm = {

    _s: function() { return ConciliacaoMain; },

    // ── Helper: monta <optgroup> por empresa, <option> por conta bancária ─────
    // Apenas a função _buildEmpOptions foi alterada, o restante permanece igual.
// Substitua o método no arquivo ui.form.js

    // ── Helper: monta <option> por empresa (Apenas CNPJ, sem contas) ─────
    _buildEmpOptions: function(emps, selectedValue) {
        let selCnpj = null;

        // Tenta extrair o CNPJ do valor selecionado (seja JSON ou string)
        if (selectedValue) {
            const sv = String(selectedValue).trim();
            if (sv.startsWith('{')) {
                try { 
                    const parsed = JSON.parse(sv); 
                    selCnpj = parsed.cnpj;
                } catch(e) {}
            } else {
                // Legado ou ID direto
                selCnpj = sv;
            }
        }

        let html = '<option value="">Selecione a empresa...</option>';
        
        emps.forEach(function(e) {
            const nfEsc = ConciliacaoUtils.esc(e.nome || '');
            const cnpj  = e.cnpj || '';
            
            // Valor agora é apenas o JSON com CNPJ (ou ID se preferir, mas user pediu JSON)
            // O user pediu: {"cnpj":"..."}
            const val = JSON.stringify({ cnpj: cnpj });
            
            // Verifica seleção: compara CNPJ do objeto ou ID legado
            let isSel = false;
            if (selCnpj) {
                isSel = (selCnpj === cnpj) || (String(selCnpj) === String(e.id));
            }

            html += `<option value='${ConciliacaoUtils.esc(val)}' ${isSel ? 'selected' : ''}>${nfEsc} (${cnpj})</option>`;
        });
        return html;
    },

    // ── Tipos de lançamento disponíveis ──────────────────────────────────────
    TIPOS_LANCAMENTO: [
        { value: 'NFS',           label: 'Nota de Serviço',  icon: 'ph-file-text',    color: 'info'    },
        { value: 'NFE',           label: 'Nota de Insumo',   icon: 'ph-package',      color: 'primary' },
        { value: 'pagamento',     label: 'Pagamento',        icon: 'ph-money',        color: 'success' },
        // ALTERAÇÃO: Adicionado tipo FGTS
        { value: 'FGTS',          label: 'Guia FGTS',        icon: 'ph-newspaper',    color: 'indigo'  },
        { value: 'outros',        label: 'Outros',           icon: 'ph-dots-three',   color: 'secondary'},
    ],

    // ── Detecta tipo de lançamento salvo nos dados do registro ────────────────
    _detectTipoLancamento: function(r, anexos) {
        // 1. Salvo explicitamente no registro
        if (r.tipo_lancamento) {
            return r.tipo_lancamento === 'boleto' ? 'pagamento' : r.tipo_lancamento;
        }
        // 2. Detectado pela IA nos anexos
        for (const a of (anexos || [])) {
            const td = a.solucoes_ia?.tipo_documento;
            if (!td) continue;

            const upper = td.toUpperCase();
            // Correção: Mapeia tipos bancários da IA para 'pagamento'
            if (upper === 'BOLETO' || upper === 'DDA' || upper === 'TRANSFERENCIA' || upper === 'TRANSFERÊNCIA') {
                return 'pagamento';
            }
            if (upper.includes('FGTS')) return 'FGTS';
            
            return td;
        }
        return 'outros';
    },

    // ── Toggle de Tipo de Lançamento ──────────────────────────────────────────
    _buildTipoLancamentoToggle: function(id, tipoAtual) {
        const tipos = this.TIPOS_LANCAMENTO;
        const bts = tipos.map(t => {
            const active = tipoAtual === t.value ? 'active' : '';
            // Ajuste para suportar cor 'indigo' (customizada ou fallback primary) se não existir no bootstrap padrão
            const btnColor = t.color === 'indigo' ? 'primary' : t.color; 
            
            return `<button type="button"
                        class="btn btn-sm btn-outline-${btnColor} ${active} tipo-lancamento-btn"
                        data-tipo="${t.value}"
                        onclick="ConciliacaoUIForm.onTipoLancamentoChange('${id}', '${t.value}', this)">
                        <i class="${t.icon} me-1"></i>${t.label}
                    </button>`;
        }).join('');

        return `
        <div class="col-12">
            <input type="hidden" id="tipo_lancamento_${id}" value="${tipoAtual}">
            <label class="form-label text-xs fw-bold">
                <i class="ph-tag-simple me-1 text-secondary"></i>Tipo de Lançamento
            </label>
            <div class="d-flex gap-2 flex-wrap" id="tipo_lancamento_btns_${id}">
                ${bts}
            </div>
        </div>`;
    },

    // ── Reage ao clique no toggle ─────────────────────────────────────────────
    onTipoLancamentoChange: function(id, tipo, btnEl) {
        // Atualiza hidden
        const hidden = document.getElementById(`tipo_lancamento_${id}`);
        if (hidden) hidden.value = tipo;

        // Atualiza visual dos botões
        const container = document.getElementById(`tipo_lancamento_btns_${id}`);
        if (container) {
            container.querySelectorAll('.tipo-lancamento-btn').forEach(b => b.classList.remove('active'));
            if (btnEl) btnEl.classList.add('active');
        }

        // Re-renderiza bloco fiscal
        const bloco = document.getElementById(`bloco_fiscal_${id}`);
        if (bloco) bloco.innerHTML = this._buildBlocoFiscalManual(id, tipo, null);

        // ALTERAÇÃO: Lógica específica para FGTS (Autopreenchimento e Labels)
        const lblDoc   = document.querySelector(`label[for="rec_doc_${id}"]`);
        const inpDoc   = document.getElementById(`rec_doc_${id}`);
        const inpNome  = document.getElementById(`rec_nome_${id}`);

        if (tipo === 'FGTS') {
            // Ajusta Label para TAG
            if (lblDoc) {
                lblDoc.innerHTML = 'Identificador / Tag (Colaborador)';
                lblDoc.className = 'form-label text-xs fw-bold text-primary'; // Destaque
            }
            // Ajusta Placeholder
            if (inpDoc) inpDoc.placeholder = 'Ex: Nome do Colaborador...';
            
            // Autopreenchimento do Ministério
            if (inpNome && (!inpNome.value || inpNome.value.trim() === '')) {
                inpNome.value = 'MINISTÉRIO DO TRABALHO E EMPREGO';
            }
        } else {
            // Restaura padrão
            if (lblDoc) {
                lblDoc.innerHTML = 'Recebedor CPF/CNPJ';
                lblDoc.className = 'form-label text-xs fw-bold text-info';
            }
            if (inpDoc) inpDoc.placeholder = 'CPF ou CNPJ...';
        }
    },

    // ── Bloco fiscal — lido dos anexos IA ou manual ───────────────────────────
    _buildDadosFiscaisForm: function(id, anexos, tipoLancamento) {
        // Tenta pegar df da IA
        let df = null;
        for (const a of (anexos || [])) {
            const sol = a.solucoes_ia || {};
            if (sol.dados_fiscais && (sol.dados_fiscais.numero || sol.dados_fiscais.chave_acesso)) {
                df = sol.dados_fiscais;
                break;
            }
        }
        return this._buildBlocoFiscalManual(id, tipoLancamento, df);
    },

    // ── Monta o bloco fiscal (modo readonly se IA preencheu, editável se manual) ──
    _buildBlocoFiscalManual: function(id, tipo, df) {
        // ALTERADO: Adicionado 'FGTS' para ocultar bloco fiscal
        if (tipo === 'pagamento' || tipo === 'boleto' || tipo === 'outros' || tipo === 'FGTS') return '';

        const isNFS  = tipo === 'NFS';
        const ro     = df ? 'readonly' : '';           // readonly se veio da IA
        const badge  = df ? '<span class="badge bg-success ms-2 text-xs">Preenchido pela IA</span>' : '<span class="badge bg-secondary ms-2 text-xs">Preenchimento manual</span>';

        const f = df || {};  // fallback vazio para campos manuais

        // CORREÇÃO: Fallback caso a IA inverta os campos
        if (!isNFS && !f.chave_acesso && f.codigo_verificacao && String(f.codigo_verificacao).replace(/\D/g, '').length === 44) {
            f.chave_acesso = f.codigo_verificacao;
        }

        const camposComuns = `
            <div class="col-md-3">
                <label class="form-label text-xs">Número ${isNFS ? 'NFS' : 'NF'} <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" id="df_numero_${id}" ${ro} value="${ConciliacaoUtils.esc(f.numero || '')}">
            </div>
            <div class="col-md-2">
                <label class="form-label text-xs">Série</label>
                <input type="text" class="form-control form-control-sm" id="df_serie_${id}" ${ro} value="${ConciliacaoUtils.esc(f.serie || '')}">
            </div>
            <div class="col-md-3">
                <label class="form-label text-xs">Data Emissão</label>
                <input type="text" class="form-control form-control-sm" id="df_data_emissao_${id}" ${ro}
                       placeholder="DD/MM/YYYY" value="${ConciliacaoUtils.toDisplayDate(f.data_emissao)}">
            </div>
            <div class="col-md-2">
                <label class="form-label text-xs">Valor NF (R$)</label>
                <input type="number" step="0.01" class="form-control form-control-sm" id="df_valor_nf_${id}" ${ro}
                       value="${f.valor_nf ? parseFloat(f.valor_nf).toFixed(2) : ''}">
            </div>`;

        const camposNFE = `
            <div class="row g-2">
                ${camposComuns}
                <div class="col-md-2">
                    <label class="form-label text-xs">Competência</label>
                    <input type="text" class="form-control form-control-sm" id="df_competencia_${id}" ${ro}
                           placeholder="MM/AAAA" value="${ConciliacaoUtils.esc(f.competencia || '')}">
                </div>
                <div class="col-12">
                    <label class="form-label text-xs">Chave de Acesso (44 dígitos) <span class="text-danger">*</span></label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-light"><i class="ph-key"></i></span>
                        <input type="text" class="form-control font-monospace text-xs" id="df_chave_acesso_${id}" ${ro}
                               placeholder="00000000000000000000000000000000000000000000"
                               value="${ConciliacaoUtils.esc(f.chave_acesso || '')}">
                        ${f.chave_acesso ? `<button class="btn btn-outline-secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('df_chave_acesso_${id}').value)"><i class="ph-copy"></i></button>` : ''}
                    </div>
                </div>
            </div>`;

        const camposNFS = `
            <div class="row g-2">
                ${camposComuns}
                <div class="col-md-2">
                    <label class="form-label text-xs">Competência</label>
                    <input type="text" class="form-control form-control-sm" id="df_competencia_${id}" ${ro}
                           placeholder="MM/AAAA" value="${ConciliacaoUtils.esc(f.competencia || '')}">
                </div>
                <div class="col-md-6">
                    <label class="form-label text-xs">Código de Verificação <span class="text-danger">*</span></label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-light"><i class="ph-key"></i></span>
                        <input type="text" class="form-control font-monospace text-xs" id="df_codigo_verificacao_${id}" ${ro}
                               placeholder="Código de verificação da NFS-e"
                               value="${ConciliacaoUtils.esc(f.codigo_verificacao || '')}">
                        ${f.codigo_verificacao ? `<button class="btn btn-outline-secondary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('df_codigo_verificacao_${id}').value)"><i class="ph-copy"></i></button>` : ''}
                    </div>
                </div>
                <div class="col-md-6">
                    <label class="form-label text-xs">E-mail Prestador</label>
                    <input type="text" class="form-control form-control-sm" id="df_email_prestador_${id}" ${ro}
                           placeholder="email@prestador.com" value="${ConciliacaoUtils.esc(f.email_prestador || '')}">
                </div>
                <div class="col-12">
                    <label class="form-label text-xs">Discriminação dos Serviços</label>
                    <textarea class="form-control form-control-sm" id="df_discriminacao_${id}" rows="3" ${ro}
                              placeholder="Descrição detalhada dos serviços prestados...">${ConciliacaoUtils.esc(f.discriminacao_servicos || '')}</textarea>
                </div>
                <div class="col-md-6">
                    <label class="form-label text-xs">CNAEs</label>
                    <input type="text" class="form-control form-control-sm" id="df_cnaes_${id}" ${ro}
                           placeholder="Ex: 6201-5/01, 6202-3/00"
                           value="${ConciliacaoUtils.esc((f.cnaes || []).join(', '))}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-xs">Local Incidência ISS</label>
                    <input type="text" class="form-control form-control-sm" id="df_local_iss_${id}" ${ro}
                           placeholder="Município" value="${ConciliacaoUtils.esc(f.local_incidencia_iss || '')}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-xs">Local Prestação Serviço</label>
                    <input type="text" class="form-control form-control-sm" id="df_local_prestacao_${id}" ${ro}
                           placeholder="Município" value="${ConciliacaoUtils.esc(f.local_prestacao_servico || '')}">
                </div>
                <div class="col-md-6">
                    <label class="form-label text-xs">Informações Complementares</label>
                    <textarea class="form-control form-control-sm" id="df_info_complementar_${id}" rows="2" ${ro}
                              placeholder="Informações adicionais...">${ConciliacaoUtils.esc(f.informacoes_complementares || '')}</textarea>
                </div>
                <div class="col-md-6">
                    <label class="form-label text-xs">Outras Informações</label>
                    <textarea class="form-control form-control-sm" id="df_outras_info_${id}" rows="2" ${ro}
                              placeholder="Outras observações...">${ConciliacaoUtils.esc(f.outras_informacoes || '')}</textarea>
                </div>
            </div>`;

        const borderColor = isNFS ? 'info' : 'primary';
        const titulo      = isNFS ? 'Nota Fiscal de Serviço (NFS-e)' : 'Nota Fiscal de Insumo/Produto (NF-e)';
        const iconeTitulo = isNFS ? 'ph-file-text' : 'ph-package';

        return `
        <div class="card border-${borderColor} mt-1">
            <div class="card-header py-2 bg-soft-${borderColor} d-flex align-items-center">
                <span class="fw-bold text-${borderColor} text-xs">
                    <i class="${iconeTitulo} me-1"></i>${titulo}
                </span>
                ${badge}
            </div>
            <div class="card-body pb-2 pt-2">
                ${isNFS ? camposNFS : camposNFE}
            </div>
        </div>`;
    },

    // ── Coleta campos fiscais manuais para salvar ─────────────────────────────
    collectDadosFiscais: function(id, tipo) {
        // ALTERADO: Adicionado 'FGTS' para pular coleta
        if (tipo === 'pagamento' || tipo === 'boleto' || tipo === 'outros' || tipo === 'FGTS') return null;
        
        const g = (elId) => { const el = document.getElementById(elId); return el ? el.value.trim() : ''; };
        const isNFS = tipo === 'NFS';
        const base = {
            tipo,
            numero:        g(`df_numero_${id}`),
            serie:         g(`df_serie_${id}`),
            data_emissao:  ConciliacaoUtils.toIsoDate(g(`df_data_emissao_${id}`)) || g(`df_data_emissao_${id}`),
            valor_nf:      parseFloat(g(`df_valor_nf_${id}`)) || 0,
            competencia:   g(`df_competencia_${id}`),
        };
        if (isNFS) {
            return { ...base,
                codigo_verificacao:      g(`df_codigo_verificacao_${id}`),
                email_prestador:         g(`df_email_prestador_${id}`),
                discriminacao_servicos:  g(`df_discriminacao_${id}`),
                cnaes:                   g(`df_cnaes_${id}`).split(',').map(s => s.trim()).filter(Boolean),
                local_incidencia_iss:    g(`df_local_iss_${id}`),
                local_prestacao_servico: g(`df_local_prestacao_${id}`),
                informacoes_complementares: g(`df_info_complementar_${id}`),
                outras_informacoes:      g(`df_outras_info_${id}`),
            };
        }
        return { ...base, chave_acesso: g(`df_chave_acesso_${id}`) };
    },

    // ── Formulário principal de edição ────────────────────────────────────────
    buildEditForm: function(r) {
        const s         = this._s();
        const isNew     = r.id.toString().startsWith('new_');
        const parcelas  = r.parcelas || [];
        const hasParcelas = parcelas.length > 0;
        const hasFatura   = !!(r.fatura && r.fatura.length > 0);
        
        // NOVO: Adiantamento
        const isAdiantamento = r.adiantamento == 1;

        let _emps = s.empresas && s.empresas.length > 0 ? s.empresas : (window._empresasCache || []);
        if (!_emps || _emps.length === 0) _emps = [];

        const _empAtual  = (r.empresa !== undefined && r.empresa !== null && r.empresa !== '') ? r.empresa : null;
        const empOptions = ConciliacaoUIForm._buildEmpOptions(_emps, _empAtual);

        // Dropdown "Nossas Empresas" no Recebedor
        const empDropdownItems = _emps.flatMap(function(e) {
            const nfEsc   = ConciliacaoUtils.esc(e.nome || '');
            const cnpjEsc = ConciliacaoUtils.esc(e.cnpj || '');
            const contas  = e.contas || [];
            const searchText = (nfEsc + ' ' + cnpjEsc).toLowerCase();

            if (contas.length === 0) {
                const valJson = ConciliacaoUtils.esc(JSON.stringify({ cnpj: e.cnpj || '', banco_id: '', conta: '' }));
                return [`<li class="recebedor-item" data-search="${searchText}">
                    <a class="dropdown-item text-xs py-1" href="#"
                       onclick="ConciliacaoUIForm.selecionarRecebedorEmpresa('${r.id}', '${valJson}', '${nfEsc}', '${cnpjEsc}'); return false;">
                        <i class="ph-buildings me-1 text-info"></i>${nfEsc}
                        ${e.cnpj ? `<span class="text-muted d-block" style="font-size:10px;">${cnpjEsc}</span>` : ''}
                    </a></li>`];
            }

            const header = `<li class="recebedor-header" data-search="${searchText}"><h6 class="dropdown-header text-xs py-0 mt-1" style="color:#0d6efd;">`
                         + `<i class="ph-buildings me-1"></i>${nfEsc}</h6></li>`;

            const items = contas.map(function(cb) {
                const bancoEsc = ConciliacaoUtils.esc(cb.banco_nome || cb.banco_id || '');
                const label    = `${nfEsc} - ${bancoEsc}`;
                const valJson  = ConciliacaoUtils.esc(JSON.stringify({
                    cnpj:     e.cnpj    || '',
                    banco_id: String(cb.banco_id || ''),
                    conta:    cb.conta  || ''
                }));
                const itemSearch = (searchText + ' ' + bancoEsc).toLowerCase();
                return `<li class="recebedor-item" data-search="${itemSearch}">
                    <a class="dropdown-item text-xs py-1 ps-4" href="#"
                       onclick="ConciliacaoUIForm.selecionarRecebedorEmpresa('${r.id}', '${valJson}', '${label}', '${cnpjEsc}'); return false;">
                        <i class="ph-bank me-1 text-secondary" style="font-size:10px;"></i>${nfEsc}
                        <span class="text-muted"> — ${bancoEsc}</span>
                    </a></li>`;
            });

            return [header, ...items];
        }).join('');

        const vencFormatado      = r.data_vencimento ? moment(r.data_vencimento).format('DD/MM/YYYY') : '';
        const parcelasHtml       = hasParcelas ? parcelas.map(p => this.buildParcelaRow(p.valor, p.data_vencimento)).join('') : this.buildParcelaRow('', '');
        const faturaHtml         = hasFatura   ? r.fatura.map(f => this.buildFaturaItemRow(f)).join('') : this.buildFaturaItemRow();
        const operacaoFieldsHtml = this.buildOperacaoFields(r);

        const anexos        = r.anexos || [];
        const totalCodigos  = anexos.reduce((acc, a) => acc + ((a.codigos || a.codigos_pagamentos || []).length), 0);
        const totalSolucoes = anexos.reduce((acc, a) => acc + (a.solucoes_count || 0), 0);

        const labelExtras = [
            anexos.length  > 0 ? `<span class="badge bg-soft-info text-info ms-2"><i class="ph-paperclip"></i> ${anexos.length}</span>` : '',
            totalCodigos   > 0 ? `<span class="badge bg-soft-secondary text-secondary ms-1"><i class="ph-barcode"></i> ${totalCodigos} código(s)</span>` : '',
            totalSolucoes  > 0 ? `<span class="badge bg-soft-success text-success ms-1">🧠 ${totalSolucoes} solução(ões)</span>` : '',
        ].join('');

        const anexosInputHidden = `<input type="hidden" id="anexos_data_${r.id}" value='${JSON.stringify(anexos).replace(/'/g, "&#39;")}'>`;
        const anexosListHtml    = anexos.length > 0
            ? '<!-- anexos serão renderizados pelo JS ao abrir o collapsable -->'
            : '<span class="text-muted text-xs">Nenhum anexo adicionado.</span>';

        // Tipo de lançamento e bloco fiscal dinâmico
        const tipoLancamento  = this._detectTipoLancamento(r, anexos);
        const tipoToggleHtml  = this._buildTipoLancamentoToggle(r.id, tipoLancamento);
        const blocoFiscalHtml = this._buildDadosFiscaisForm(r.id, anexos, tipoLancamento);

        // Lógica de exibição do Recebedor
        let recNomeVal = r.recebedor_nome || '';
        let recDocVal  = r.recebedor_doc  || '';
        let recEmpJson = '';
        if (recDocVal.trim().startsWith('{')) {
            try {
                const rd = JSON.parse(recDocVal);
                if (rd.cnpj) {
                    recEmpJson = recDocVal;
                    recDocVal  = rd.cnpj;
                    if (!recNomeVal) {
                        const empFound = _emps.find(function(e) {
                            return (e.cnpj || '').replace(/\D/g,'') === rd.cnpj.replace(/\D/g,'');
                        });
                        if (empFound) {
                            const cbFound = (empFound.contas || []).find(function(cb) {
                                return String(cb.banco_id) === String(rd.banco_id);
                            });
                            recNomeVal = empFound.nome + (cbFound ? ' - ' + (cbFound.banco_nome || cbFound.banco_id) : '');
                        }
                    }
                }
            } catch(e) {}
        }

        // ALTERAÇÃO: Configuração do Rótulo e Placeholder do Recebedor baseada no Tipo
        const isFGTS = tipoLancamento === 'FGTS';
        const labelRecDoc = isFGTS ? 'Identificador / Tag (Colaborador)' : 'Recebedor CPF/CNPJ';
        const classRecDoc = isFGTS ? 'text-primary' : 'text-info';
        const placeRecDoc = isFGTS ? 'Ex: Nome do Colaborador...' : 'CPF ou CNPJ...';

        return `
        <div class="p-3 m-2 bg-white rounded shadow-sm border">
            <h6 class="mb-3 text-primary">
                <i class="ph-pencil-simple me-2"></i>
                ${isNew ? 'Nova Conciliação' : 'Editar Conciliação #' + r.id}
            </h6>
            <div class="row g-3">

                ${anexosInputHidden}

                <!-- ── Seção Anexos ───────────────────────────────────── -->
                <div class="col-12 p-3 border rounded bg-soft-secondary">
                    <div class="d-flex align-items-center mb-2 flex-wrap gap-1">
                        <label class="form-label fw-bold mb-0 text-xs">
                            <i class="ph-paperclip me-1"></i>Anexos e Extração Inteligente
                        </label>
                        ${labelExtras}
                    </div>
                    <div id="anexos_list_${r.id}" class="mb-2">${anexosListHtml}</div>
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <input type="file" class="form-control form-control-sm" style="max-width:260px;"
                               id="file_upload_${r.id}" multiple accept=".pdf,.png,.jpg,.jpeg">
                        <button type="button" class="btn btn-sm btn-primary" id="btn_upload_${r.id}"
                                onclick="event.stopPropagation(); ConciliacaoMain.uploadAnexo('${r.id}')">
                            <i class="ph-upload-simple me-1"></i> Analisar com IA
                        </button>
                        <div class="spinner-border spinner-border-sm text-primary d-none" id="spinner_upload_${r.id}" role="status"></div>
                    </div>
                    <small class="text-muted d-block mt-1">Aceita múltiplos arquivos. Você também pode <strong>colar uma imagem</strong> (Ctrl+V) para enviar direto da área de transferência.</small>
                </div>

                <!-- ── Toggle Tipo de Lançamento ─────────────────────── -->
                ${tipoToggleHtml}

                <!-- ── Bloco Fiscal dinâmico (atualizado pelo toggle) ──── -->
                <div class="col-12" id="bloco_fiscal_${r.id}">
                    ${blocoFiscalHtml}
                </div>

                <!-- ── Anotação ───────────────────────────────────────── -->
                <div class="col-12">
                    <label class="form-label text-xs fw-bold">
                        <i class="ph-note-pencil me-1 text-warning"></i>Anotação do Registro
                    </label>
                    <textarea class="form-control form-control-sm" id="anotacao_${r.id}" rows="2"
                              placeholder="Anotação livre sobre este registro...">${r.anotacao || ''}</textarea>
                </div>

                <!-- ── Campos principais ───────────────────────────────── -->
                <div class="col-md-3">
                    <label class="form-label text-xs fw-bold text-primary">Pagador/Tomador</label>
                    <select class="form-select form-select-sm select2-empresa" id="emp_${r.id}" style="width:100%">
                        ${empOptions}
                    </select>
                </div>

                <div class="col-md-3">
                    <label class="form-label text-xs fw-bold text-info">Recebedor/Fornecedor Nome</label>
                    <div class="input-group input-group-sm">
                        <input type="text" class="form-control" id="rec_nome_${r.id}"
                               value="${ConciliacaoUtils.esc(recNomeVal)}"
                               placeholder="Nome do recebedor...">
                        <input type="hidden" id="rec_emp_json_${r.id}" value="${ConciliacaoUtils.esc(recEmpJson)}">
                        <button class="btn btn-outline-info dropdown-toggle px-2"
                                type="button"
                                title="Selecionar empresa nossa"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                data-bs-auto-close="outside">
                            <i class="ph-buildings"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm" style="min-width:260px; max-height:320px; overflow-y:auto;" id="dropdown_rec_${r.id}">
                            <li class="sticky-top bg-white pt-2 px-2 pb-1 border-bottom">
                                <input type="text" class="form-control form-control-sm mb-1"
                                       placeholder="Filtrar empresa..."
                                       onkeyup="ConciliacaoUIForm.filterDropdown(this)"
                                       onclick="event.stopPropagation()">
                            </li>
                            <li class="pt-1"><h6 class="dropdown-header text-xs">Nossas Empresas</h6></li>
                            ${empDropdownItems}
                        </ul>
                    </div>
                </div>

                <div class="col-md-3">
                    <label class="form-label text-xs fw-bold ${classRecDoc}" for="rec_doc_${r.id}">${labelRecDoc}</label>
                    <input type="text" class="form-control form-control-sm" id="rec_doc_${r.id}"
                           value="${ConciliacaoUtils.esc(recDocVal)}"
                           placeholder="${placeRecDoc}">
                </div>

                <!-- ── Operação — inclui DDA ──────────────────────────── -->
                <div class="col-md-3">
                    <label class="form-label text-xs">Operação</label>
                    <select class="form-select form-select-sm" id="op_${r.id}"
                            onchange="ConciliacaoUIForm.onOperacaoChange('${r.id}', this.value)">
                        <option value="pix"           ${r.operacao == 'pix'           ? 'selected' : ''}>PIX</option>
                        <option value="transferencia" ${r.operacao == 'transferencia' ? 'selected' : ''}>Transferência</option>
                        <option value="boleto"        ${r.operacao == 'boleto'        ? 'selected' : ''}>Boleto</option>
                        <option value="DDA"           ${r.operacao == 'DDA'           ? 'selected' : ''}>DDA (Linha Digitável)</option>
                        <option value="darf"          ${r.operacao == 'darf'          ? 'selected' : ''}>DARF</option>
                    </select>
                </div>

                <!-- NOVO: Toggles Atualizados com Adiantamento -->
                <div class="col-12 mt-2 d-flex align-items-end gap-4 flex-wrap">
                    <div class="form-check form-switch mb-1">
                        <input class="form-check-input" type="checkbox" id="hasParcelas_${r.id}"
                               ${hasParcelas ? 'checked' : ''}
                               onchange="ConciliacaoMain.toggleParcelasMode('${r.id}')">
                        <label class="form-check-label text-xs" for="hasParcelas_${r.id}">Múltiplas Parcelas</label>
                    </div>
                    <div class="form-check form-switch mb-1">
                        <input class="form-check-input" type="checkbox" id="isFatura_${r.id}"
                               ${hasFatura ? 'checked' : ''}
                               onchange="ConciliacaoMain.toggleFaturaMode('${r.id}')">
                        <label class="form-check-label text-xs" for="isFatura_${r.id}">É Fatura?</label>
                    </div>
                    <!-- Toggle Adiantamento -->
                    <div class="form-check form-switch mb-1">
                        <input class="form-check-input" type="checkbox" id="isAdiantamento_${r.id}"
                               ${isAdiantamento ? 'checked' : ''}>
                        <label class="form-check-label text-xs fw-bold text-warning" for="isAdiantamento_${r.id}">É Adiantamento?</label>
                    </div>
                </div>

                <div class="col-12" id="operacao-fields-${r.id}">${operacaoFieldsHtml}</div>

                <div class="col-md-3 single-group-${r.id}" style="display:${hasParcelas ? 'none' : 'block'};">
                    <label class="form-label text-xs">Valor Total (R$)</label>
                    <input type="number" step="0.01" class="form-control form-control-sm" id="val_${r.id}"
                           value="${parseFloat(r.valor_total || 0).toFixed(2)}">
                </div>
                <div class="col-md-3 single-group-${r.id}" style="display:${hasParcelas ? 'none' : 'block'};">
                    <label class="form-label text-xs">Vencimento</label>
                    <input type="text" class="form-control form-control-sm" id="venc_${r.id}"
                           placeholder="DD/MM/YYYY" value="${vencFormatado}">
                </div>

                <!-- Parcelas -->
                <div class="col-12 multi-group-${r.id}" style="display:${hasParcelas ? 'block' : 'none'};">
                    <label class="form-label text-xs fw-bold">Parcelas</label>
                    <div id="plist_${r.id}">${parcelasHtml}</div>
                    <button type="button" class="btn btn-xs btn-outline-primary mt-1"
                            onclick="ConciliacaoMain.addParcelaRow('${r.id}')">
                        <i class="ph-plus me-1"></i> Adicionar Parcela
                    </button>
                </div>

                <!-- Natureza Principal -->
                <div class="col-md-6 natureza-main-${r.id}" style="display:${hasFatura ? 'none' : 'block'};">
                    <!-- LABEL SHORTENED TO PREVENT WRAPPING -->
                    <label class="form-label text-xs">Natureza Financeira</label>
                    <div class="position-relative">
                        <input type="text" class="form-control form-control-sm typeahead-main-nat" data-id="${r.id}"
                               placeholder="Buscar natureza..."
                               value="${r.natureza_financeira ? r.natureza_financeira + ' - ' + (r.natureza_descricao || '') : ''}">
                        <input type="hidden" id="nat_hidden_${r.id}" value="${r.natureza_financeira || ''}">
                    </div>
                </div>

                <!-- Fatura -->
                <div class="col-12 fatura-section-${r.id}" style="display:${hasFatura ? 'block' : 'none'};">
                    <label class="form-label text-xs fw-bold">Itens da Fatura</label>
                    <table class="table table-sm table-bordered mb-2">
                        <thead class="table-light">
                            <tr>
                                <th>Descrição</th>
                                <th style="width:130px;">Valor (R$)</th>
                                <th style="width:300px;">Natureza</th>
                                <th style="width:50px;"></th>
                            </tr>
                        </thead>
                        <tbody id="fatura-list-${r.id}">${faturaHtml}</tbody>
                    </table>
                    <button type="button" class="btn btn-xs btn-outline-primary"
                            onclick="ConciliacaoMain.addFaturaItem('${r.id}')">
                        <i class="ph-plus me-1"></i> Adicionar Item
                    </button>
                </div>

                <!-- Salvar / Cancelar -->
                <div class="col-12 d-flex gap-2 pt-2 border-top">
                    <button type="button" class="btn btn-primary btn-sm"
                            onclick="event.stopPropagation(); ConciliacaoMain.saveRow('${r.id}')">
                        <i class="ph-floppy-disk me-1"></i> Salvar
                    </button>
                    <button type="button" class="btn btn-light btn-sm"
                            onclick="event.stopPropagation(); ConciliacaoMain.toggleEditRow('${r.id}')">
                        Cancelar
                    </button>
                </div>

            </div>
        </div>`;
    },

    // ── Função de filtro para o dropdown customizado ──────────────────────────
    filterDropdown: function(input) {
        const filter = input.value.toLowerCase();
        const dropdownMenu = input.closest('.dropdown-menu');
        const items = dropdownMenu.querySelectorAll('.recebedor-item, .recebedor-header');
        items.forEach(el => {
            const searchData = el.getAttribute('data-search') || '';
            el.style.display = searchData.indexOf(filter) > -1 ? '' : 'none';
        });
    },

    onOperacaoChange: function(id, op) {
        const container = document.getElementById(`operacao-fields-${id}`);
        if (!container) return;
        container.innerHTML = this.buildOperacaoFields({ id, operacao: op, operacao_extra: null });
        ConciliacaoUITypeahead.initForRow(id);

        // CORREÇÃO: Força a atualização da visibilidade dos campos Valor Total/Vencimento
        // Isso garante que eles apareçam corretamente mesmo que o layout do Boleto os empurre
        if (typeof ConciliacaoMain !== 'undefined') {
            ConciliacaoMain.toggleParcelasMode(id);
            ConciliacaoMain.toggleFaturaMode(id);
        }
    },

    // ── Campos específicos por tipo de operação ───────────────────────────────
    buildOperacaoFields: function(r) {
        const id = r.id;
        const v  = this._parseExtra(r.operacao_extra);
        const op = r.operacao || 'pix';

        switch (op) {
            case 'pix':
                return `
                <div class="row g-2">
                    <div class="col-md-3"><label class="form-label text-xs">Tipo de Chave PIX</label>
                        <select class="form-select form-select-sm" id="pix_tipo_${id}">
                            <option value="cpf"       ${v.pix_tipo == 'cpf'       ? 'selected' : ''}>CPF</option>
                            <option value="cnpj"      ${v.pix_tipo == 'cnpj'      ? 'selected' : ''}>CNPJ</option>
                            <option value="email"     ${v.pix_tipo == 'email'     ? 'selected' : ''}>E-mail</option>
                            <option value="celular"   ${v.pix_tipo == 'celular'   ? 'selected' : ''}>Celular</option>
                            <option value="aleatoria" ${!v.pix_tipo || v.pix_tipo == 'aleatoria' ? 'selected' : ''}>Aleatória</option>
                        </select></div>
                    <div class="col-md-9"><label class="form-label text-xs">Chave PIX / Payload EMV</label>
                        <input type="text" class="form-control form-control-sm" id="pix_chave_${id}" value="${v.pix_chave || ''}"></div>
                </div>`;

            case 'boleto':
            case 'DDA': {
                const label = op === 'DDA' ? 'Linha Digitável (DDA)' : 'Linha Digitável';
                return `
                <div class="row g-2">
                    <div class="col-12">
                        <label class="form-label text-xs">${label}</label>
                        <input type="text" class="form-control form-control-sm" id="boleto_linha_${id}" value="${v.boleto_linha || ''}">
                    </div>
                    <!-- Capa do Documento -->
                    <div class="col-12">
                        <div class="text-xs fw-bold text-muted mb-1 mt-1">
                            <i class="ph-file me-1"></i>Dados da Capa do Boleto
                        </div>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label text-xs">Nosso Número / Cód. Documento</label>
                        <input type="text" class="form-control form-control-sm" id="nosso_numero_${id}" value="${ConciliacaoUtils.esc(v.nosso_numero || '')}">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label text-xs">N° do Documento</label>
                        <input type="text" class="form-control form-control-sm" id="num_documento_${id}" value="${ConciliacaoUtils.esc(v.num_documento || '')}">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label text-xs">Data do Documento</label>
                        <input type="text" class="form-control form-control-sm" id="data_documento_${id}"
                               placeholder="DD/MM/YYYY"
                               value="${v.data_documento ? ConciliacaoUtils.toDisplayDate(v.data_documento) : ''}">
                    </div>
                </div>`;
            }

            case 'transferencia': {
                const bancoVal   = v.ted_banco || '';
                const isNumeric  = /^\d+$/.test(bancoVal);
                const invalidClass = (bancoVal && !isNumeric) ? 'is-invalid' : '';
                return `
                <div class="row g-2">
                    <div class="col-md-4">
                        <label class="form-label text-xs">Banco <span class="text-danger">*</span></label>
                        <div class="position-relative">
                            <input type="text" class="form-control form-control-sm typeahead-banco ${invalidClass}"
                                   id="ted_banco_input_${id}"
                                   placeholder="Digite cód ou nome..."
                                   value="${bancoVal}"
                                   onchange="ConciliacaoMain.validateBankField('${id}', this)">
                            <input type="hidden" id="ted_banco_${id}" value="${bancoVal}">
                        </div>
                        <div class="invalid-feedback text-xs">Selecione um banco da lista.</div>
                    </div>
                    <div class="col-md-2"><label class="form-label text-xs">Agência <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" id="ted_agencia_${id}" value="${v.ted_agencia || ''}"></div>
                    <div class="col-md-3"><label class="form-label text-xs">Conta <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" id="ted_conta_${id}" value="${v.ted_conta || ''}"></div>
                    <div class="col-md-2"><label class="form-label text-xs">Tipo <span class="text-danger">*</span></label>
                        <select class="form-select form-select-sm" id="ted_tipo_${id}">
                            <option value="corrente" ${v.ted_tipo == 'corrente' ? 'selected' : ''}>Corrente</option>
                            <option value="poupanca" ${v.ted_tipo == 'poupanca' ? 'selected' : ''}>Poupança</option>
                        </select></div>
                    <div class="col-md-3"><label class="form-label text-xs">Favorecido <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" id="ted_favorecido_${id}" value="${v.ted_favorecido || ''}"></div>
                    <div class="col-md-3"><label class="form-label text-xs">CPF/CNPJ Favorecido <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" id="ted_doc_${id}" value="${v.ted_doc || ''}"></div>
                </div>`;
            }

            case 'darf':
                return `
                <div class="row g-2">
                    <div class="col-md-3"><label class="form-label text-xs">Código da Receita <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" id="darf_codigo_${id}" value="${v.darf_codigo || ''}"></div>
                    <div class="col-md-3"><label class="form-label text-xs">Período de Apuração <span class="text-danger">*</span></label>
                        <input type="month" class="form-control form-control-sm" id="darf_periodo_${id}" value="${v.darf_periodo || ''}"></div>
                    <div class="col-md-3"><label class="form-label text-xs">CPF/CNPJ Contribuinte <span class="text-danger">*</span></label>
                        <input type="text" class="form-control form-control-sm" id="darf_doc_${id}" value="${v.darf_doc || ''}"></div>
                    <div class="col-md-3"><label class="form-label text-xs">Número de Referência</label>
                        <input type="text" class="form-control form-control-sm" id="darf_ref_${id}" value="${v.darf_ref || ''}"></div>
                </div>`;

            default:
                return '';
        }
    },

    collectOperacaoFields: function(id, op) {
        const g = (elId) => { const el = document.getElementById(elId); return el ? el.value : ''; };
        switch (op) {
            case 'pix':
                return { operacao_extra: JSON.stringify({ pix_tipo: g(`pix_tipo_${id}`), pix_chave: g(`pix_chave_${id}`) }) };
            case 'boleto':
            case 'DDA':
                return { operacao_extra: JSON.stringify({
                    boleto_linha:   g(`boleto_linha_${id}`),
                    nosso_numero:   g(`nosso_numero_${id}`),
                    num_documento:  g(`num_documento_${id}`),
                    data_documento: ConciliacaoUtils.toIsoDate(g(`data_documento_${id}`)) || g(`data_documento_${id}`)
                })};
            case 'transferencia':
                return { operacao_extra: JSON.stringify({
                    ted_banco:      g(`ted_banco_${id}`),
                    ted_agencia:    g(`ted_agencia_${id}`),
                    ted_conta:      g(`ted_conta_${id}`),
                    ted_tipo:       g(`ted_tipo_${id}`),
                    ted_favorecido: g(`ted_favorecido_${id}`),
                    ted_doc:        g(`ted_doc_${id}`)
                })};
            case 'darf':
                return { operacao_extra: JSON.stringify({
                    darf_codigo:  g(`darf_codigo_${id}`),
                    darf_periodo: g(`darf_periodo_${id}`),
                    darf_doc:     g(`darf_doc_${id}`),
                    darf_ref:     g(`darf_ref_${id}`)
                })};
            default:
                return {};
        }
    },

    buildFaturaItemRow: function(item) {
        item = item || {};
        let natText = '';
        let natId   = item.natureza_financeira || '';
        if (natId && ConciliacaoMain.allNaturezas) {
            const found = ConciliacaoMain.allNaturezas.find(n => n.id == natId);
            natText = found ? found.text : natId;
        }
        return `
        <tr class="fatura-item align-middle">
            <td><input type="text" class="form-control form-control-sm fatura-desc" placeholder="Descrição" value="${ConciliacaoUtils.esc(item.descricao || '')}"></td>
            <td><input type="number" step="0.01" class="form-control form-control-sm fatura-val" placeholder="0,00" value="${item.valor ? parseFloat(item.valor).toFixed(2) : ''}"></td>
            <td>
                <div class="position-relative">
                    <input type="text" class="form-control form-control-sm typeahead-fatura-nat" placeholder="Buscar natureza..." value="${natText}">
                    <input type="hidden" class="fatura-nat-hidden" value="${natId}">
                </div>
            </td>
            <td class="text-center"><button type="button" class="btn btn-xs btn-light text-danger" onclick="this.closest('.fatura-item').remove()"><i class="ph-trash"></i></button></td>
        </tr>`;
    },

    buildParcelaRow: function(val, date) {
        const v = val  ? parseFloat(val).toFixed(2) : '';
        const d = date ? moment(date).format('DD/MM/YYYY') : '';
        return `
        <div class="row g-2 mb-2 parcela-item align-items-end">
            <div class="col-md-3"><label class="form-label text-xs mb-1">Valor (R$)</label>
                <input type="number" step="0.01" class="form-control form-control-sm p-val" value="${v}"></div>
            <div class="col-md-3"><label class="form-label text-xs mb-1">Vencimento</label>
                <input type="text" class="form-control form-control-sm p-date" placeholder="DD/MM/YYYY" value="${d}"></div>
            <div class="col-md-auto">
                <button type="button" class="btn btn-sm btn-light text-danger" onclick="this.closest('.parcela-item').remove()"><i class="ph-trash"></i></button>
            </div>
        </div>`;
    },

    // ── Selecionar empresa nossa no Recebedor ─────────────────────────────────
    selecionarRecebedorEmpresa: function(id, valJson, label, cnpj) {
        const nomeInput  = document.getElementById(`rec_nome_${id}`);
        const docInput   = document.getElementById(`rec_doc_${id}`);
        const hiddenJson = document.getElementById(`rec_emp_json_${id}`);

        const decode = function(str) {
            return String(str || '')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g,  '&')
                .replace(/&lt;/g,   '<')
                .replace(/&gt;/g,   '>')
                .replace(/&quot;/g, '"');
        };

        if (nomeInput)  nomeInput.value  = decode(label);
        if (docInput)   docInput.value   = decode(cnpj) || '';
        if (hiddenJson) hiddenJson.value = decode(valJson);

        const toggleBtn = nomeInput
            ?.closest('.input-group')
            ?.querySelector('.dropdown-toggle');
        if (toggleBtn && typeof bootstrap !== 'undefined') {
            const dd = bootstrap.Dropdown.getInstance(toggleBtn);
            if (dd) dd.hide();
        }
    },

    // ── Paste de imagem como anexo ────────────────────────────────────────────
    _pasteHandlers: {},

    initPasteAnexo: function(id) {
        this.destroyPasteAnexo(id);

        const editRowId = `edit-row-${id}`;
        const handler = function(e) {
            const row = document.getElementById(editRowId);
            if (!row || row.style.display === 'none') {
                document.removeEventListener('paste', handler);
                delete ConciliacaoUIForm._pasteHandlers[id];
                return;
            }

            const active = document.activeElement;
            const isTextField = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
            if (isTextField) return;

            const items = e.clipboardData?.items;
            if (!items) return;

            const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
            if (!imageItem) return;

            e.preventDefault();

            const file = imageItem.getAsFile();
            if (!file) return;

            const ext       = file.type.split('/')[1] || 'png';
            const name      = `clipboard_${Date.now()}.${ext}`;
            const namedFile = new File([file], name, { type: file.type });

            const fileInput = document.getElementById(`file_upload_${id}`);
            if (!fileInput) return;

            try {
                const dt = new DataTransfer();
                dt.items.add(namedFile);
                fileInput.files = dt.files;
            } catch (err) {
                console.warn('[Conciliacao] DataTransfer não suportado:', err);
                return;
            }

            ConciliacaoUISetup.notify('Imagem colada — analisando com IA...', 'info');
            ConciliacaoMain.uploadAnexo(id);
        };

        this._pasteHandlers[id] = handler;
        document.addEventListener('paste', handler);
    },

    destroyPasteAnexo: function(id) {
        const handler = this._pasteHandlers[id];
        if (handler) {
            document.removeEventListener('paste', handler);
            delete this._pasteHandlers[id];
        }
    },

    _parseExtra: function(raw) {
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try { return JSON.parse(raw); } catch (e) { return {}; }
    },

    // Alias para uso em ui.anexos.js (toDisplayDate via Utils)
    toDisplayDate: function(v) { return ConciliacaoUtils.toDisplayDate(v); }
};