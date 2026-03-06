/**
 * ConciliacaoUIAnexos — Renderização de anexos e modal de soluções IA
 * Responsabilidade: lista de anexos, preview de soluções, modal de aplicação.
 * Depende de: ConciliacaoUtils, ConciliacaoMain
 */
var ConciliacaoUIAnexos = {

    _s: function() { return ConciliacaoMain; },

    // ── Lista de Anexos ───────────────────────────────────────────────────────
    renderList: function(id, anexos) {
        const listEl = document.getElementById(`anexos_list_${id}`);
        if (!listEl) return;

        if (!anexos || anexos.length === 0) {
            listEl.innerHTML = '<span class="text-muted text-xs">Nenhum anexo adicionado.</span>';
            return;
        }

        listEl.innerHTML = anexos.map((a, idx) => this._buildAnexoCard(id, a, idx)).join('');
    },

    _buildAnexoCard: function(id, a, idx) {
        const dados       = a.dados || {};
        const codigos     = a.codigos || a.codigos_pagamentos || [];
        const transcricao = a.transcricao || '';
        const solucoes    = a.solucoes_ia || {};
        const solCount    = a.solucoes_count || 0;
        const anotacao    = solucoes.solucao_anotacao?.texto || solucoes.anotacao || '';
        const tipoDoc     = solucoes.tipo_documento || '';

        const nomeOrig = dados.nome_original || a.nome_original || '';
        const arquivo  = dados.arquivo       || a.arquivo       || '';
        const dataAnal = dados.data_analise  || a.data_analise  || '';
        const formato  = (dados.formato || '').toUpperCase();

        const colId    = `anx_body_${id}_${idx}`;
        const colCodId = `anx_cod_${id}_${idx}`;
        const colSolId = `anx_sol_${id}_${idx}`;
        const colTrId  = `anx_tr_${id}_${idx}`;
        const colAnotId= `anx_an_${id}_${idx}`;

        const codigosBadge   = codigos.length > 0
            ? `<span class="badge bg-soft-info text-info ms-1"><i class="ph-barcode"></i> ${codigos.length}</span>` : '';
        const tipoDocBadge   = tipoDoc
            ? `<span class="badge bg-soft-secondary text-secondary ms-1" title="Tipo classificado pela IA">${tipoDoc.toUpperCase()}</span>` : '';
        const btnAplicarClass = solCount > 0 ? 'btn-outline-success' : 'btn-outline-secondary';
        const btnAplicarTitle = solCount > 0 ? `${solCount} solução(ões) disponível(is)` : 'Sem soluções IA';
        const solBadge = solCount > 0
            ? `<span class="badge bg-soft-success text-success ms-1" title="${solCount} solução(ões) IA">🧠 ${solCount}</span>` : '';

        const codigosHtml = codigos.map(c =>
            `<div class="d-flex gap-2 align-items-start mb-1">
                <span class="badge bg-secondary text-xs py-1" style="white-space:nowrap;">${c.tipo}</span>
                <code class="text-xs text-break" style="font-size:10px;word-break:break-all;">${ConciliacaoUtils.esc(c.valor)}</code>
            </div>`
        ).join('') || '<span class="text-muted text-xs">Nenhum código detectado.</span>';

        const solucoesHtml = this.buildSolucoesPreview(solucoes);

        const transcricaoHtml = transcricao
            ? `<pre class="bg-light border rounded p-2 text-xs" style="white-space:pre-wrap;max-height:150px;overflow-y:auto;font-size:11px;">${ConciliacaoUtils.esc(transcricao)}</pre>`
            : '<span class="text-muted text-xs">Sem transcrição disponível.</span>';

        const anotacaoHtml = anotacao
            ? `<p class="mb-0 text-sm">${ConciliacaoUtils.esc(anotacao)}</p>`
            : '<span class="text-muted text-xs">Sem anotação.</span>';

        const solJson   = encodeURIComponent(JSON.stringify(solucoes)).replace(/'/g, "%27");
        const anexoJson = encodeURIComponent(JSON.stringify(a)).replace(/'/g, "%27");

        return `
        <div class="border rounded mb-2 bg-light">
            <div class="d-flex align-items-center justify-content-between p-2">
                <div class="d-flex align-items-center gap-2 flex-wrap flex-grow-1"
                     style="cursor:pointer;"
                     onclick="new bootstrap.Collapse(document.getElementById('${colId}')).toggle()">
                    <i class="ph-file-${formato === 'PDF' ? 'pdf' : 'image'} text-primary"></i>
                    <span class="fw-semibold text-dark text-sm">${ConciliacaoUtils.esc(nomeOrig)}</span>
                    <span class="text-xs text-muted">${formato}</span>
                    ${tipoDocBadge}${codigosBadge}${solBadge}
                    <span class="text-xs text-muted">${dataAnal}</span>
                </div>
                <div class="d-flex gap-1 ms-2">
                    <button type="button" class="btn btn-xs btn-outline-primary"
                            title="Abrir arquivo"
                            onclick="window.open('/uploads/conciliacao_bancaria/${arquivo}', '_blank')">
                        <i class="ph-arrow-square-out"></i> Abrir
                    </button>
                    <button type="button"
                            class="btn btn-xs ${btnAplicarClass}"
                            title="${btnAplicarTitle}"
                            onclick="ConciliacaoMain._tryOpenModal('${id}', '${solJson}', '${anexoJson}', ${solCount})">
                        🧠 Ver Soluções
                    </button>
                    <button type="button" class="btn btn-xs btn-light text-danger"
                            title="Excluir anexo"
                            onclick="ConciliacaoMain.removeAnexo('${id}', ${idx})">
                        <i class="ph-trash"></i>
                    </button>
                    <div style="cursor:pointer; padding-left:5px;" onclick="new bootstrap.Collapse(document.getElementById('${colId}')).toggle()">
                        <i class="ph-caret-down text-muted align-self-center"></i>
                    </div>
                </div>
            </div>

            <div class="collapse" id="${colId}">
                <div class="p-2 border-top" style="font-size:13px;">
                    ${this._buildSection(colAnotId, 'ph-note-pencil text-warning', 'Anotação', anotacaoHtml, true)}
                    ${this._buildSection(colCodId, 'ph-barcode text-info', `Códigos Detectados (${codigos.length})`, codigosHtml)}
                    ${this._buildSection(colSolId, null, `🧠 Soluções IA (${solCount})`, solucoesHtml)}
                    ${transcricao ? this._buildSection(colTrId, 'ph-text-aa text-secondary', 'Transcrição OCR', transcricaoHtml) : ''}
                </div>
            </div>
        </div>`;
    },

    _buildSection: function(colId, iconClass, label, bodyHtml, open = false) {
        const iconHtml = iconClass ? `<i class="${iconClass}"></i> ` : '';
        return `
        <div class="mb-1">
            <div class="d-flex align-items-center gap-1 py-1 text-xs fw-bold text-muted"
                 style="cursor:pointer;" data-bs-toggle="collapse" data-bs-target="#${colId}">
                ${iconHtml}${label}
                <i class="ph-caret-down ms-auto"></i>
            </div>
            <div class="collapse ${open ? 'show' : ''}" id="${colId}">
                <div class="ps-3 pb-1">${bodyHtml}</div>
            </div>
        </div>`;
    },

    // ── Preview de Soluções ───────────────────────────────────────────────────
    buildSolucoesPreview: function(sol) {
        if (!sol || Object.keys(sol).length === 0) return '<span class="text-muted text-xs">Sem soluções.</span>';
        let html = '';
        const g         = sol.solucao_geral || {};
        const pagador   = g.tomador_servico?.razao_social || g.empresa_nome;
        const recebedor = g.prestador_servico?.nome || g.recebedor_nome;
        const tipoDoc   = sol.tipo_documento;

        if (tipoDoc) html += `<div class="text-xs mb-1"><i class="ph-tag-simple text-secondary me-1"></i><strong>Tipo:</strong> <span class="badge bg-secondary">${ConciliacaoUtils.esc(tipoDoc.toUpperCase())}</span></div>`;
        if (pagador)   html += `<div class="text-xs mb-1"><i class="ph-buildings text-primary me-1"></i><strong>Pagador:</strong> ${ConciliacaoUtils.esc(pagador)} <span class="text-muted">(${Math.round((g.confianca || 0) * 100)}%)</span></div>`;
        if (recebedor) html += `<div class="text-xs mb-1"><i class="ph-storefront text-info me-1"></i><strong>Recebedor:</strong> ${ConciliacaoUtils.esc(recebedor)}</div>`;

        if (sol.dados_fiscais && sol.dados_fiscais !== null) {
            const df = sol.dados_fiscais;
            html += `<div class="text-xs mb-1"><i class="ph-file-text text-secondary me-1"></i><strong>Fiscal:</strong> ${df.tipo || 'NF'} nº ${ConciliacaoUtils.esc(df.numero || '-')}</div>`;
        }

        (sol.solucao_financeira || []).forEach(sf => {
            html += `<div class="text-xs mb-1"><i class="ph-currency-circle-dollar text-success me-1"></i><strong>${(sf.tipo_operacao || '').toUpperCase()}</strong>: R$ ${parseFloat(sf.valor_total || 0).toFixed(2)} <span class="text-muted">(${Math.round((sf.confianca || 0) * 100)}%)</span></div>`;
        });

        const f = sol.solucao_fatura;
        if (f?.ativar_fatura) html += `<div class="text-xs mb-1"><i class="ph-receipt text-warning me-1"></i><strong>Fatura:</strong> ${(f.itens || []).length} item(ns) <span class="text-muted">(${Math.round((f.confianca || 0) * 100)}%)</span></div>`;
        return html || '<span class="text-muted text-xs">Nenhuma solução deduzida.</span>';
    },

    // ── Modal de Soluções ─────────────────────────────────────────────────────
    openSolutionsModal: function(id, solucoes_ia, solucao_mestre, anexo) {
        const sol     = solucao_mestre || solucoes_ia || {};
        const g       = sol.solucao_geral      || {};
        const df      = sol.dados_fiscais;       // pode ser null — intencional
        const fs      = sol.solucao_financeira || [];
        const ft      = sol.solucao_fatura     || {};
        const sanot   = sol.solucao_anotacao   || { texto: sol.anotacao || '', confianca: 1 };
        const tipoDoc = sol.tipo_documento     || '';

        const codigosDetectados = anexo?.codigos || anexo?.codigos_pagamentos || [];

        // Check de segurança: registro pago?
        const rowEl = document.getElementById(`row-${id}`);
        // Tenta pegar do DOM ou assume não pago se novo
        const isPago = rowEl && rowEl._rowData && rowEl._rowData.finalizado == 1;

        const tomador   = g.tomador_servico   || {};
        const prestador = g.prestador_servico || {};
        const empresaId = tomador.empresa_id !== undefined ? tomador.empresa_id : g.empresa_id;
        const recNome   = prestador.nome || g.recebedor_nome || '';
        const recDoc    = prestador.doc_cpf_cnpj || g.recebedor_doc || '';
        const confGer   = Math.round((g.confianca || 0) * 100);

        const s = this._s();
        const empresaOpts = s.empresas.map(e =>
            `<option value="${e.id}" ${empresaId == e.id ? 'selected' : ''}>${e.nome}</option>`
        ).join('');

        const dadosFiscaisHtml = this._buildDadosFiscaisSection(df, tipoDoc);
        const financeirasHtml  = this._buildFinanceirasSection(fs, df, codigosDetectados, tipoDoc, recDoc);

        const faturaItensHtml = ft.ativar_fatura && ft.itens?.length > 0
            ? ft.itens.map(item => `<div class="d-flex gap-3 text-xs"><span class="flex-grow-1">${ConciliacaoUtils.esc(item.descricao || '')}</span><span class="fw-semibold">R$ ${parseFloat(item.valor || 0).toFixed(2)}</span></div>`).join('')
            : '';

        const confFat      = Math.round((ft.confianca || 0) * 100);
        const confGerClass = ConciliacaoUtils.confBadgeClass(confGer);
        const confFatClass = ConciliacaoUtils.confBadgeClass(confFat);
        const modalId      = 'solutionsModal';
        const nomeArquivo  = ConciliacaoUtils.esc(anexo?.dados?.nome_original || anexo?.nome_original || 'Documentos Consolidados');

        // Badge de tipo de documento
        const tipoDocBadgeHtml = tipoDoc ? `
        <div class="alert alert-secondary py-1 px-2 text-xs mb-3 d-flex align-items-center gap-2">
            <i class="ph-tag-simple"></i>
            <strong>Documento classificado como:</strong>
            <span class="badge bg-secondary">${ConciliacaoUtils.esc(tipoDoc.toUpperCase())}</span>
            <small class="text-muted ms-auto">Classificado pela IA</small>
        </div>` : '';

        // Checkbox Master Financeiro (Desabilitado se PAGO)
        const finDisabledAttr = isPago ? 'disabled' : '';
        const finCheckedAttr  = isPago ? '' : 'checked';
        const finWarningHtml  = isPago ? '<div class="px-3 pt-2 text-xs text-warning"><i class="ph-warning"></i> Registro marcado como Pago. Dados financeiros protegidos.</div>' : '';
        const finTitleAttr    = isPago ? 'Movimentação Paga - Alteração financeira bloqueada' : 'Aplicar solução financeira';

        const modalHtml = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">🧠 Soluções Inteligentes — ${nomeArquivo}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">

                        ${tipoDocBadgeHtml}

                        ${sanot.texto ? `
                        <div class="card mb-3 border-warning">
                            <div class="card-header py-2 bg-soft-warning d-flex align-items-center justify-content-between">
                                <div class="form-check mb-0">
                                    <input class="form-check-input" type="checkbox" id="sol_anotacao_chk" checked>
                                    <label class="form-check-label fw-bold text-dark" for="sol_anotacao_chk">
                                        <i class="ph-note-pencil me-1 text-warning"></i>Anotação do Registro
                                    </label>
                                </div>
                            </div>
                            <div class="card-body p-2">
                                <textarea class="form-control form-control-sm" id="sol_anotacao_texto" rows="2">${ConciliacaoUtils.esc(sanot.texto)}</textarea>
                            </div>
                        </div>` : ''}

                        <div class="card mb-3 border-primary">
                            <div class="card-header bg-soft-primary d-flex align-items-center justify-content-between py-2">
                                <div class="form-check mb-0">
                                    <input class="form-check-input" type="checkbox" id="sol_geral_chk" ${(empresaId || recNome || recDoc) ? 'checked' : ''}>
                                    <label class="form-check-label fw-bold text-primary" for="sol_geral_chk">
                                        <i class="ph-buildings me-1"></i>Entidades (Pagador e Recebedor)
                                    </label>
                                </div>
                                <span class="badge ${confGerClass}">${confGer}% confiança</span>
                            </div>
                            <div class="card-body pb-2">
                                <div class="row g-2">
                                    <div class="col-md-4">
                                        <label class="form-label text-xs fw-bold text-danger">Pagador (Tomador)</label>
                                        <select class="form-select form-select-sm" id="sol_empresa_select">
                                            <option value="">Selecione...</option>
                                            ${empresaOpts}
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label text-xs fw-bold text-success">Recebedor (Prestador)</label>
                                        <input type="text" class="form-control form-control-sm" id="sol_rec_nome" value="${ConciliacaoUtils.esc(recNome)}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label text-xs">Recebedor CPF/CNPJ</label>
                                        <input type="text" class="form-control form-control-sm" id="sol_rec_doc" value="${ConciliacaoUtils.esc(recDoc)}">
                                    </div>
                                </div>
                            </div>
                        </div>

                        ${dadosFiscaisHtml}

                        <div class="card mb-3 border-success">
                            <div class="card-header py-2 bg-soft-success d-flex align-items-center justify-content-between">
                                <div class="form-check mb-0">
                                    <input class="form-check-input" type="checkbox" id="sol_financeira_master_chk" 
                                           ${finCheckedAttr} ${finDisabledAttr}>
                                    <label class="form-check-label fw-bold text-success" for="sol_financeira_master_chk" title="${finTitleAttr}">
                                        <i class="ph-currency-circle-dollar me-1"></i>Solução Financeira
                                    </label>
                                </div>
                                <span class="badge bg-success bg-opacity-75">${fs.length > 0 ? fs.length + ' opção(ões)' : 'Sugerido'}</span>
                            </div>
                            ${finWarningHtml}
                            <div class="card-body pb-1">${financeirasHtml}</div>
                        </div>

                        <div class="card mb-3 border-warning">
                            <div class="card-header bg-soft-warning d-flex align-items-center justify-content-between py-2">
                                <div class="form-check mb-0">
                                    <input class="form-check-input" type="checkbox" id="sol_fatura_chk" ${ft.ativar_fatura ? 'checked' : ''}>
                                    <label class="form-check-label fw-bold text-warning" for="sol_fatura_chk">
                                        <i class="ph-receipt me-1"></i>Solução Fatura (É Fatura?)
                                    </label>
                                </div>
                                <span class="badge ${confFatClass}">${confFat}% confiança</span>
                            </div>
                            <div class="card-body pb-1">
                                ${ft.ativar_fatura
                                    ? `<div class="text-xs text-muted mb-1">${(ft.itens || []).length} item(ns) detectado(s):</div><div class="border rounded p-2 bg-light">${faturaItensHtml}</div>`
                                    : '<span class="text-muted text-xs">Não identificado como fatura.</span>'}
                            </div>
                        </div>

                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btn_apply_sol"
                                onclick="ConciliacaoMain._applyFromModal('${id}', ${fs.length})">
                            <i class="ph-check me-1"></i> Aplicar Soluções Selecionadas
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        const oldModal = document.getElementById(modalId);
        if (oldModal) { bootstrap.Modal.getInstance(oldModal)?.hide(); oldModal.remove(); }
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        window._solucaoAtual = { sol, fs };
        new bootstrap.Modal(document.getElementById(modalId)).show();
    },

    // ── Bloco Fiscal — toggle por tipo de documento ───────────────────────────
    _buildDadosFiscaisSection: function(df, tipoDoc) {
        // Boleto, transferencia e fatura não têm dados fiscais
        if (!df || df === null) return '';
        if (tipoDoc && ['boleto', 'transferencia', 'fatura', 'pagamento'].includes(tipoDoc.toLowerCase())) return '';

        const tipo  = df.tipo || tipoDoc || 'NFS';
        const isNFS = tipo.toUpperCase() === 'NFS';

        // CORREÇÃO: Fallback caso a IA coloque a chave de acesso no campo errado
        if (!isNFS && !df.chave_acesso && df.codigo_verificacao && String(df.codigo_verificacao).replace(/\D/g, '').length === 44) {
            df.chave_acesso = df.codigo_verificacao;
        }

        const camposNFE = `
            <div class="row g-2">
                <div class="col-md-3">
                    <label class="form-label text-xs">Número NF</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.numero || '')}">
                </div>
                <div class="col-md-2">
                    <label class="form-label text-xs">Série</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.serie || '')}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-xs">Emissão</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.toDisplayDate(df.data_emissao)}">
                </div>
                <div class="col-md-4">
                    <label class="form-label text-xs">Valor NF (R$)</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${parseFloat(df.valor_nf || 0).toFixed(2)}">
                </div>
                <div class="col-12">
                    <label class="form-label text-xs">Chave de Acesso (44 dígitos)</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-light"><i class="ph-key"></i></span>
                        <input type="text" class="form-control font-monospace text-xs" readonly value="${ConciliacaoUtils.esc(df.chave_acesso || '')}">
                        <button class="btn btn-outline-secondary" type="button" title="Copiar"
                                onclick="navigator.clipboard.writeText('${ConciliacaoUtils.esc(df.chave_acesso || '')}')"><i class="ph-copy"></i></button>
                    </div>
                </div>
            </div>`;

        const camposNFS = `
            <div class="row g-2">
                <div class="col-md-3">
                    <label class="form-label text-xs">Número NFS</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.numero || '')}">
                </div>
                <div class="col-md-2">
                    <label class="form-label text-xs">Série</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.serie || '')}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-xs">Competência</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.competencia || '')}">
                </div>
                <div class="col-md-2">
                    <label class="form-label text-xs">Emissão</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.toDisplayDate(df.data_emissao)}">
                </div>
                <div class="col-md-2">
                    <label class="form-label text-xs">Valor NF (R$)</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${parseFloat(df.valor_nf || 0).toFixed(2)}">
                </div>

                <div class="col-md-6">
                    <label class="form-label text-xs">Código de Verificação</label>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text bg-light"><i class="ph-key"></i></span>
                        <input type="text" class="form-control font-monospace text-xs" readonly value="${ConciliacaoUtils.esc(df.codigo_verificacao || '')}">
                        <button class="btn btn-outline-secondary" type="button" title="Copiar"
                                onclick="navigator.clipboard.writeText('${ConciliacaoUtils.esc(df.codigo_verificacao || '')}')"><i class="ph-copy"></i></button>
                    </div>
                </div>
                <div class="col-md-6">
                    <label class="form-label text-xs">E-mail Prestador</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.email_prestador || '')}">
                </div>

                <div class="col-12">
                    <label class="form-label text-xs">Discriminação dos Serviços</label>
                    <textarea class="form-control form-control-sm" rows="3" readonly>${ConciliacaoUtils.esc(df.discriminacao_servicos || '')}</textarea>
                </div>

                <div class="col-md-6">
                    <label class="form-label text-xs">CNAEs</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc((df.cnaes || []).join(', '))}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-xs">Local Incidência ISS</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.local_incidencia_iss || '')}">
                </div>
                <div class="col-md-3">
                    <label class="form-label text-xs">Local Prestação Serviço</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(df.local_prestacao_servico || '')}">
                </div>

                <div class="col-md-6">
                    <label class="form-label text-xs">Informações Complementares</label>
                    <textarea class="form-control form-control-sm" rows="2" readonly>${ConciliacaoUtils.esc(df.informacoes_complementares || '')}</textarea>
                </div>
                <div class="col-md-6">
                    <label class="form-label text-xs">Outras Informações</label>
                    <textarea class="form-control form-control-sm" rows="2" readonly>${ConciliacaoUtils.esc(df.outras_informacoes || '')}</textarea>
                </div>
            </div>`;

        return `
        <div class="card mb-3 border-info">
            <div class="card-header py-2 bg-soft-info d-flex align-items-center justify-content-between">
                <div class="form-check mb-0">
                    <input class="form-check-input" type="checkbox" id="sol_fiscal_chk" checked>
                    <label class="form-check-label fw-bold text-info" for="sol_fiscal_chk">
                        <i class="ph-file-text me-1"></i>Dados Fiscais
                    </label>
                </div>
                <span class="badge bg-info">${isNFS ? 'NFS-e' : 'NF-e'}</span>
            </div>
            <div class="card-body pb-2">
                ${isNFS ? camposNFS : camposNFE}
            </div>
        </div>`;
    },

    // ── Seção de Soluções Financeiras ─────────────────────────────────────────
    // ALTERADO: Adicionado tratamento prioritário para PIX extraído via Regex/Zxing
    _buildFinanceirasSection: function(fs, df, codigosDetectados, tipoDoc, recDoc) {
        if (!fs || !fs.length) {
            const td = (tipoDoc || '').toUpperCase();

            // NFE → sem financeiro no OCR → provavelmente está no DDA
            if (td === 'NFE' || td === 'NF-E') {
                return `
                <div class="alert alert-info py-2 px-3 mb-2 text-xs d-flex align-items-start gap-2">
                    <i class="ph-info text-info mt-1" style="font-size:15px;flex-shrink:0;"></i>
                    <div>
                        <strong>Nenhum dado financeiro detectado no documento.</strong><br>
                        Este é um <strong>documento de insumo (NF-e)</strong> — o pagamento provavelmente está
                        registrado no <strong>DDA</strong> do banco. Confirme a linha digitável lá e preencha abaixo.
                    </div>
                </div>
                <div class="border rounded p-2 mb-2 bg-light sol-fin-item" data-sol-idx="0">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="form-check mb-0">
                            <input class="form-check-input sol-fin-radio" type="radio" name="sol_fin_radio"
                                   id="sol_fin_chk_0" value="0" checked
                                   onchange="ConciliacaoMain._onSolFinRadioChange(0)">
                            <label class="form-check-label fw-semibold text-sm" for="sol_fin_chk_0">
                                <span class="badge bg-soft-warning text-warning">DDA</span>
                                <span class="text-muted text-xs ms-1">— Sugestão IA</span>
                            </label>
                        </div>
                        <span class="badge bg-secondary ms-auto">Sugerido</span>
                    </div>
                    <div class="row g-2">
                        <div class="col-md-4"><label class="form-label text-xs">Valor (R$)</label>
                            <input type="number" step="0.01" class="form-control form-control-sm" id="sol_valor_0"
                                   value="${df && df.valor_nf ? parseFloat(df.valor_nf).toFixed(2) : ''}"></div>
                        <div class="col-md-4"><label class="form-label text-xs">Vencimento</label>
                            <input type="text" class="form-control form-control-sm" id="sol_venc_0"
                                   value="" placeholder="DD/MM/YYYY"></div>
                        <div class="col-md-4"><label class="form-label text-xs">Tipo Operação</label>
                            <select class="form-select form-select-sm" id="sol_op_0">
                                <option value="pix">PIX</option>
                                <option value="boleto">Boleto</option>
                                <option value="DDA" selected>DDA (Linha Digitável)</option>
                                <option value="transferencia">Transferência</option>
                                <option value="darf">DARF</option>
                            </select></div>
                    </div>
                    <div class="mt-2">
                        <label class="form-label text-xs">Linha Digitável (DDA)</label>
                        <input type="text" class="form-control form-control-sm" id="sol_boleto_0"
                               value="" placeholder="Consultar no DDA do banco...">
                        <div class="form-text text-xs text-warning">
                            <i class="ph-warning me-1"></i>Linha digitável não disponível no documento. Consulte o DDA.
                        </div>
                    </div>
                </div>`;
            }

            // NFS → sem financeiro no OCR → provavelmente PIX CNPJ do prestador
            if (td === 'NFS' || td === 'NFS-E' || td === 'NFSE') {
                // Pré-preencher chave PIX com CNPJ do prestador (se disponível)
                const pixChavePreFill = recDoc ? recDoc.replace(/[.\-\/]/g, '') : '';
                const pixTipoPreFill  = pixChavePreFill && pixChavePreFill.length === 14 ? 'cnpj'
                                      : pixChavePreFill && pixChavePreFill.length === 11 ? 'cpf'
                                      : 'aleatoria';

                // Vencimento = data_emissao + 10 dias
                let vencPreFill = '';
                if (df && df.data_emissao) {
                    const emissao = moment(df.data_emissao, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
                    if (emissao.isValid()) {
                        vencPreFill = emissao.add(10, 'days').format('DD/MM/YYYY');
                    }
                }

                const cnpjFormatado = pixChavePreFill && pixChavePreFill.length === 14
                    ? pixChavePreFill.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
                    : pixChavePreFill;

                return `
                <div class="alert alert-info py-2 px-3 mb-2 text-xs d-flex align-items-start gap-2">
                    <i class="ph-info text-info mt-1" style="font-size:15px;flex-shrink:0;"></i>
                    <div>
                        <strong>Nenhum dado financeiro detectado no documento.</strong><br>
                        Este é um <strong>documento de serviço (NFS-e)</strong> — o pagamento provavelmente
                        é feito via <strong>PIX CNPJ</strong> do prestador.
                        ${cnpjFormatado ? `Chave sugerida: <code class="text-dark">${cnpjFormatado}</code>` : 'Confirme a chave PIX abaixo.'}
                        ${vencPreFill ? `Vencimento sugerido: <strong>${vencPreFill}</strong> (emissão + 10 dias).` : ''}
                    </div>
                </div>
                <div class="border rounded p-2 mb-2 bg-light sol-fin-item" data-sol-idx="0">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="form-check mb-0">
                            <input class="form-check-input sol-fin-radio" type="radio" name="sol_fin_radio"
                                   id="sol_fin_chk_0" value="0" checked
                                   onchange="ConciliacaoMain._onSolFinRadioChange(0)">
                            <label class="form-check-label fw-semibold text-sm" for="sol_fin_chk_0">
                                <span class="badge bg-soft-success text-success">PIX</span>
                                <span class="text-muted text-xs ms-1">— Sugestão IA</span>
                            </label>
                        </div>
                        <span class="badge bg-secondary ms-auto">Sugerido</span>
                    </div>
                    <div class="row g-2">
                        <div class="col-md-4"><label class="form-label text-xs">Valor (R$)</label>
                            <input type="number" step="0.01" class="form-control form-control-sm" id="sol_valor_0"
                                   value="${df && df.valor_nf ? parseFloat(df.valor_nf).toFixed(2) : ''}"></div>
                        <div class="col-md-4"><label class="form-label text-xs">Vencimento</label>
                            <input type="text" class="form-control form-control-sm" id="sol_venc_0"
                                   value="${vencPreFill}" placeholder="DD/MM/YYYY"></div>
                        <div class="col-md-4"><label class="form-label text-xs">Tipo Operação</label>
                            <select class="form-select form-select-sm" id="sol_op_0">
                                <option value="pix" selected>PIX</option>
                                <option value="boleto">Boleto</option>
                                <option value="DDA">DDA (Linha Digitável)</option>
                                <option value="transferencia">Transferência</option>
                                <option value="darf">DARF</option>
                            </select></div>
                    </div>
                    <div class="row g-2 mt-1">
                        <div class="col-md-4"><label class="form-label text-xs">Tipo PIX</label>
                            <select class="form-select form-select-sm" id="sol_pix_tipo_0">
                                <option value="cpf"       ${pixTipoPreFill === 'cpf'       ? 'selected' : ''}>CPF</option>
                                <option value="cnpj"      ${pixTipoPreFill === 'cnpj'      ? 'selected' : ''}>CNPJ</option>
                                <option value="email"                                                       >E-mail</option>
                                <option value="celular"                                                     >Celular</option>
                                <option value="aleatoria" ${pixTipoPreFill === 'aleatoria' ? 'selected' : ''}>Aleatória</option>
                            </select></div>
                        <div class="col-md-8"><label class="form-label text-xs">Chave PIX</label>
                            <input type="text" class="form-control form-control-sm" id="sol_pix_chave_0"
                                   value="${cnpjFormatado}" placeholder="Chave PIX do prestador de serviço..."></div>
                    </div>
                </div>`;
            }

            // Tipo desconhecido ou sem tipo
            return '<div class="text-muted text-sm">Nenhuma solução financeira detectada.</div>';
        }

        let maxConfiancaIdx = -1;
        let maxConfianca    = -1;
        fs.forEach((sf, i) => {
            if ((sf.confianca || 0) > maxConfianca) { maxConfianca = sf.confianca || 0; maxConfiancaIdx = i; }
        });

        return fs.map((sf, i) => {
            const tipo       = sf.tipo_operacao || 'pix';
            const conf       = Math.round((sf.confianca || 0) * 100);
            const valorStr   = parseFloat(sf.valor_total || 0).toFixed(2);
            const venc       = ConciliacaoUtils.toDisplayDate(sf.data_vencimento);
            const extra      = sf.operacao_extra || {};
            const capa       = sf.capa_documento || {};
            const isChecked  = (i === maxConfiancaIdx && maxConfianca >= 0.5);
            const confClass  = ConciliacaoUtils.confBadgeClass(conf);

            let boletoLinha = extra.boleto_linha || '';

            // Fallback: busca linha digitável nos códigos detectados
            if ((tipo === 'boleto' || tipo === 'DDA') && !boletoLinha && codigosDetectados?.length > 0) {
                const codigoEncontrado = codigosDetectados.find(c =>
                    c.tipo === 'LINHA_DIGITAVEL' || c.tipo === 'CODIGO_BARRAS'
                );
                if (codigoEncontrado) boletoLinha = codigoEncontrado.valor;
            }

            // Evita confundir chave de NF com linha de boleto
            if (df && df.chave_acesso && boletoLinha.replace(/\D/g, '') === df.chave_acesso.replace(/\D/g, '')) {
                boletoLinha = '';
            }

            // ── NOVA CORREÇÃO PIX (Sobrescreve lixo OCR com leitura precisa) ──
            if (tipo === 'pix' && codigosDetectados?.length > 0) {
                const pixEncontrado = codigosDetectados.find(c => 
                    c.tipo === 'PIX_QR' || (c.valor && c.valor.startsWith('000201'))
                );
                if (pixEncontrado) {
                    extra.pix_chave = pixEncontrado.valor; 
                }
            }
            // ────────────────────────────────────────

            const extraFields    = this._buildExtraFieldsModal(tipo, i, extra, capa, df, boletoLinha);
            const parcelasPreview = sf.ativar_parcelas && sf.parcelas?.length > 0
                ? sf.parcelas.map(p => `<div class="text-xs text-muted">R$ ${parseFloat(p.valor || 0).toFixed(2)} — ${ConciliacaoUtils.toDisplayDate(p.data_vencimento) || '-'}</div>`).join('')
                : '';

            return `
            <div class="border rounded p-2 mb-2 bg-light sol-fin-item" data-sol-idx="${i}">
                <div class="d-flex align-items-center gap-2 mb-2">
                    <div class="form-check mb-0">
                        <input class="form-check-input sol-fin-radio" type="radio" name="sol_fin_radio"
                               id="sol_fin_chk_${i}" value="${i}" ${isChecked ? 'checked' : ''}
                               onchange="ConciliacaoMain._onSolFinRadioChange(${i})">
                        <label class="form-check-label fw-semibold text-sm" for="sol_fin_chk_${i}">
                            <span class="badge bg-soft-primary text-primary">${tipo.toUpperCase()}</span>
                        </label>
                    </div>
                    <span class="badge ${confClass} ms-auto">${conf}% confiança</span>
                </div>
                <div class="row g-2">
                    <div class="col-md-4"><label class="form-label text-xs">Valor (R$)</label>
                        <input type="number" step="0.01" class="form-control form-control-sm" id="sol_valor_${i}" value="${valorStr}"></div>
                    <div class="col-md-4"><label class="form-label text-xs">Vencimento</label>
                        <input type="text" class="form-control form-control-sm" id="sol_venc_${i}" value="${venc}" placeholder="DD/MM/YYYY"></div>
                    <div class="col-md-4"><label class="form-label text-xs">Tipo Operação</label>
                        <select class="form-select form-select-sm" id="sol_op_${i}">
                            <option value="pix"            ${tipo === 'pix'            ? 'selected' : ''}>PIX</option>
                            <option value="boleto"         ${tipo === 'boleto'         ? 'selected' : ''}>Boleto</option>
                            <option value="DDA"            ${tipo === 'DDA'            ? 'selected' : ''}>DDA (Linha Digitável)</option>
                            <option value="transferencia"  ${tipo === 'transferencia'  ? 'selected' : ''}>Transferência</option>
                            <option value="darf"           ${tipo === 'darf'           ? 'selected' : ''}>DARF</option>
                        </select></div>
                </div>
                ${extraFields}
                ${sf.ativar_parcelas ? `<div class="mt-2"><div class="text-xs fw-bold mb-1">Parcelas sugeridas:</div>${parcelasPreview}</div>` : ''}
            </div>`;
        }).join('');
    },

    _buildExtraFieldsModal: function(tipo, i, extra, capa, df, boletoLinha) {
        // Capa do documento — apenas para boleto e DDA
        const capaHtml = (tipo === 'boleto' || tipo === 'DDA') ? `
            <div class="row g-2 mt-1 pt-2 border-top">
                <div class="col-12 text-xs fw-bold text-muted mb-0">
                    <i class="ph-file me-1"></i>Dados do Documento (Capa do Boleto)
                </div>
                <div class="col-md-4">
                    <label class="form-label text-xs">Nosso Número / Cód. Documento</label>
                    <input type="text" class="form-control form-control-sm" id="sol_cod_doc_${i}"
                           value="${ConciliacaoUtils.esc(extra.nosso_numero || capa.cod_documento || '')}">
                </div>
                <div class="col-md-4">
                    <label class="form-label text-xs">N° do Documento</label>
                    <input type="text" class="form-control form-control-sm" id="sol_num_doc_${i}"
                           value="${ConciliacaoUtils.esc(capa.num_documento || '')}">
                </div>
                <div class="col-md-4">
                    <label class="form-label text-xs">Data do Documento</label>
                    <input type="text" class="form-control form-control-sm" id="sol_dt_doc_${i}"
                           value="${ConciliacaoUtils.toDisplayDate(capa.data_documento || '')}" placeholder="DD/MM/YYYY">
                </div>
            </div>` : '';

        switch (tipo) {
            case 'boleto':
            case 'DDA': {
                const label       = tipo === 'DDA' ? 'Linha Digitável (DDA)' : 'Linha Digitável';
                const placeholder = boletoLinha ? '' : 'Aguardando leitura ou digitação manual...';
                const warning     = !boletoLinha
                    ? '<div class="form-text text-xs text-warning"><i class="ph-warning me-1"></i>Código de barras não validado.</div>' : '';
                return `<div class="mt-2">
                    <label class="form-label text-xs">${label}</label>
                    <input type="text" class="form-control form-control-sm" id="sol_boleto_${i}"
                           value="${ConciliacaoUtils.esc(boletoLinha)}" placeholder="${placeholder}">
                    ${warning}
                    ${capaHtml}
                </div>`;
            }
            case 'pix':
                return `<div class="row g-2 mt-1">
                    <div class="col-md-4"><label class="form-label text-xs">Tipo PIX</label>
                    <select class="form-select form-select-sm" id="sol_pix_tipo_${i}">
                        <option value="cpf"       ${extra.pix_tipo == 'cpf'       ? 'selected' : ''}>CPF</option>
                        <option value="cnpj"      ${extra.pix_tipo == 'cnpj'      ? 'selected' : ''}>CNPJ</option>
                        <option value="email"     ${extra.pix_tipo == 'email'     ? 'selected' : ''}>E-mail</option>
                        <option value="celular"   ${extra.pix_tipo == 'celular'   ? 'selected' : ''}>Celular</option>
                        <option value="aleatoria" ${!extra.pix_tipo || extra.pix_tipo == 'aleatoria' ? 'selected' : ''}>Aleatória</option>
                    </select></div>
                    <div class="col-md-8"><label class="form-label text-xs">Chave PIX</label>
                    <input type="text" class="form-control form-control-sm" id="sol_pix_chave_${i}"
                           value="${ConciliacaoUtils.esc(extra.pix_chave || '')}"></div>
                </div>`;
            case 'transferencia':
                return `<div class="row g-2 mt-1">
                    <div class="col-md-4"><label class="form-label text-xs">Banco</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(extra.ted_banco || '')}"></div>
                    <div class="col-md-2"><label class="form-label text-xs">Agência</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(extra.ted_agencia || '')}"></div>
                    <div class="col-md-3"><label class="form-label text-xs">Conta</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(extra.ted_conta || '')}"></div>
                    <div class="col-md-3"><label class="form-label text-xs">Favorecido</label>
                    <input type="text" class="form-control form-control-sm" readonly value="${ConciliacaoUtils.esc(extra.ted_favorecido || '')}"></div>
                </div>`;
            default:
                return '';
        }
    }
};