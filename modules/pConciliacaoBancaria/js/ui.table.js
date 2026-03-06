/**
 * ConciliacaoUITable — Renderização da tabela principal e linha de edição
 * Responsabilidade: buildTableRow, buildEditForm e helpers de células.
 * Depende de: ConciliacaoUtils, ConciliacaoUIForm, ConciliacaoMain (via this._s())
 */
var ConciliacaoUITable = {

    _s: function() { return ConciliacaoMain; },

    notify: function(text, type = 'success') {
        new Noty({ text, type, timeout: 2000, layout: 'bottomRight' }).show();
    },

    // ── Injeta CSS para o tema Light do Tippy (Remove a borda preta) ──────────
    _injectTippyStyles: function() {
        if (document.getElementById('tippy-light-theme-style')) return;
        const style = document.createElement('style');
        style.id = 'tippy-light-theme-style';
        style.innerHTML = `
            .tippy-box[data-theme~='light'] {
                background-color: #ffffff;
                color: #212529;
                box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
                border: 1px solid #dee2e6;
                border-radius: 4px;
            }
            .tippy-box[data-theme~='light'][data-placement^='top'] > .tippy-arrow::before { border-top-color: #ffffff; }
            .tippy-box[data-theme~='light'][data-placement^='bottom'] > .tippy-arrow::before { border-bottom-color: #ffffff; }
            .tippy-box[data-theme~='light'][data-placement^='left'] > .tippy-arrow::before { border-left-color: #ffffff; }
            .tippy-box[data-theme~='light'][data-placement^='right'] > .tippy-arrow::before { border-right-color: #ffffff; }
            .tippy-content { padding: 0; }
        `;
        document.head.appendChild(style);
    },

    renderTable: function(list) {
        // Garante que o estilo light exista
        this._injectTippyStyles();

        const tbody = document.getElementById('tbodyConciliacao');
        const info  = document.getElementById('conciliacaoInfo');
        
        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Nenhum registro encontrado neste período.</td></tr>';
            info.textContent = 'Mostrando 0 registros';
            return;
        }
        info.textContent = `Mostrando ${list.length} registros`;
        tbody.innerHTML  = list.map(r => this.buildTableRow(r)).join('');
        ConciliacaoUITypeahead.initAll();
        
        // Inicializa Tooltips/Popovers do Bootstrap (legado/ícones)
        [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]')).map(el => new bootstrap.Tooltip(el));
        [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]')).map(el => new bootstrap.Popover(el));

        // Inicializa Tippy.js
        if (typeof tippy !== 'undefined') {
            tippy('[data-tippy-content]', { 
                allowHTML: true, 
                interactive: true, 
                maxWidth: 600,
                theme: 'light', // Usa o tema injetado acima
                placement: 'auto',
                arrow: true,
                offset: [0, 10]
            });
        }
    },

    setLoading: function() {
        document.getElementById('tbodyConciliacao').innerHTML =
            '<tr><td colspan="11" class="text-center py-4"><div class="spinner-border text-primary"></div></td></tr>';
    },

    setError: function(msg) {
        document.getElementById('tbodyConciliacao').innerHTML =
            `<tr><td colspan="11" class="text-center text-danger py-4">${msg || 'Erro ao carregar dados'}</td></tr>`;
    },

    // ── Helper: Gera HTML do Relatório de Parcelas (Tippy Content - Light Theme) ──
    _buildParcelasTooltip: function(r) {
        if (!r.parcelas || r.parcelas.length === 0) return '';

        // Normaliza baixas
        let baixas = r.baixas || [];
        if (typeof baixas === 'string') { try { baixas = JSON.parse(baixas); } catch(e){ baixas = []; } }
        const baixasMap = {}; 
        baixas.forEach(b => { if(!b.estornado_em) baixasMap[b.indice] = b; });

        const rows = r.parcelas.map((p, i) => {
            const baixa = baixasMap[i];
            const valor = parseFloat(p.valor || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            const venc  = p.data_vencimento ? moment(p.data_vencimento).format('DD/MM/YY') : '-';
            
            let dtBaixa = '-';
            let status  = '<span style="color:#dc3545; font-weight:500;">Pendente</span>'; // Red default

            if (baixa) {
                dtBaixa = moment(baixa.data_baixa).format('DD/MM/YY');
                status  = '<span style="color:#198754; font-weight:bold;">Pago</span>'; // Green
            } else {
                // Verifica atraso
                if (p.data_vencimento && moment().startOf('day').isAfter(p.data_vencimento)) {
                    status = '<span style="color:#dc3545; font-weight:bold;">Atrasado</span>'; // Red Bold
                } else if (p.data_vencimento && moment(p.data_vencimento).diff(moment().startOf('day'), 'days') <= 2) {
                    status = '<span style="color:#fd7e14; font-weight:bold;">Vence Breve</span>'; // Orange
                }
            }

            // Estilo zebra leve para linhas
            const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fa';

            return `
                <tr style="border-bottom:1px solid #e9ecef; background-color:${bg};">
                    <td style="padding:6px 8px; text-align:center; color:#6c757d;">${i + 1}</td>
                    <td style="padding:6px 8px; text-align:right; font-weight:600; color:#495057;">${valor}</td>
                    <td style="padding:6px 8px; text-align:center; color:#495057;">${venc}</td>
                    <td style="padding:6px 8px; text-align:center; color:#495057;">${dtBaixa}</td>
                    <td style="padding:6px 8px; text-align:center;">${status}</td>
                </tr>`;
        }).join('');

        return `
            <div style="text-align:left; font-size:12px; color:#212529; padding:0;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid #dee2e6; background-color:#e9ecef;">
                            <th style="padding:6px; font-weight:bold; color:#495057;">ID</th>
                            <th style="padding:6px; font-weight:bold; color:#495057;">Valor</th>
                            <th style="padding:6px; font-weight:bold; color:#495057;">Venc.</th>
                            <th style="padding:6px; font-weight:bold; color:#495057;">Baixa</th>
                            <th style="padding:6px; font-weight:bold; color:#495057;">Status</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    },

    // ── Helper: Lógica de Status para Parcelas (Urgência 2 dias) ─────────────
    _getParcelaStatusInfo: function(r) {
        // Normaliza baixas
        let baixas = r.baixas || [];
        if (typeof baixas === 'string') { try { baixas = JSON.parse(baixas); } catch(e){ baixas = []; } }
        const indicesPagos = baixas.filter(b => !b.estornado_em).map(b => parseInt(b.indice));
        
        const total = r.parcelas.length;
        const pagos = indicesPagos.length;
        
        // Verifica urgência nas pendentes (vence em <= 2 dias ou vencida)
        let isUrgent = false;
        const limiteAlerta = moment().add(2, 'days').endOf('day');

        r.parcelas.forEach((p, i) => {
            if (!indicesPagos.includes(i) && p.data_vencimento) {
                const venc = moment(p.data_vencimento);
                if (venc.isSameOrBefore(limiteAlerta)) {
                    isUrgent = true;
                }
            }
        });

        return {
            total: total,
            pagos: pagos,
            isUrgent: isUrgent,
            isTotal: pagos === total && total > 0,
            isParcial: pagos > 0 && pagos < total
        };
    },

    // ── Helper centralizado para criar o HTML do Badge (Status) ──────────────
    _buildStatusBadgeHtml: function(r) {
        const isNew = r.id.toString().startsWith('new_');
        const isAprovado = r.aprovado == 1;
        const isAdiantamento = r.adiantamento == 1;
        
        if (isNew || r._em_edicao) return '<span class="badge bg-secondary">Em edição</span>';

        const hasParcelas = r.parcelas && r.parcelas.length > 0;
        
        // Lógica para Múltiplas Parcelas
        if (hasParcelas) {
            const pInfo = this._getParcelaStatusInfo(r);
            const tippyContent = this._buildParcelasTooltip(r).replace(/"/g, '&quot;');
            const tippyAttr = `data-tippy-content="${tippyContent}" data-tippy-theme="light" style="cursor:help"`;

            if (pInfo.isTotal) {
                return `<span class="badge bg-success" ${tippyAttr}>Pago Total</span>`;
            } 
            
            // Texto do badge (Pago X/Y ou Pendente X/Y)
            const label = pInfo.pagos > 0 ? `Pago ${pInfo.pagos}/${pInfo.total}` : `Pendente ${pInfo.pagos}/${pInfo.total}`;
            
            // Cor baseada APENAS na urgência
            const bgClass = pInfo.isUrgent ? 'bg-warning text-dark' : 'bg-info text-dark';
            
            return `<span class="badge ${bgClass}" ${tippyAttr}>${label}</span>`;
        }

        // Lógica para Pagamento Único
        if (r.finalizado == 1) {
            let baixas = r.baixas || [];
            if (typeof baixas === 'string') { try { baixas = JSON.parse(baixas); } catch(e){ baixas = []; } }
            const ultima = baixas.filter(b => !b.estornado_em).pop();
            const dtBaixa = ultima ? moment(ultima.data_baixa).format('DD/MM/YYYY') : 'Data n/d';
            
            const content = `<div style='padding:5px; color:#333; font-size:12px;'><b>Baixado em:</b> ${dtBaixa}</div>`;
            const tippyAttr = `data-tippy-content="${content.replace(/"/g, '&quot;')}" data-tippy-theme="light" style="cursor:help"`;

            if (isAdiantamento) return `<span class="badge bg-warning text-dark" ${tippyAttr}>Pago - Adiant.</span>`;
            return `<span class="badge bg-info text-dark" ${tippyAttr}>Pago</span>`;
        }

        if (isAprovado) return '<span class="badge bg-success">Concluído</span>';

        return '<span class="badge bg-warning text-dark">Pendente</span>';
    },

    // ── Helper para criar HTML da Coluna Parcelas ────────────────────────────
    _buildParcelasColumnHtml: function(r) {
        if (r.parcelas && r.parcelas.length > 0) {
            const tippyContent = this._buildParcelasTooltip(r).replace(/"/g, '&quot;');
            return `<div class="fw-semibold text-primary" 
                         style="cursor:help; text-decoration:underline dotted; text-underline-offset:3px;" 
                         data-tippy-content="${tippyContent}" 
                         data-tippy-theme="light">
                            ${r.parcelas.length}x Parcelas
                    </div>`;
        } else {
            const venc = r.data_vencimento ? moment(r.data_vencimento).format('DD/MM/YYYY') : '-';
            return `<div class="text-muted text-xs">Venc: ${venc}</div>`;
        }
    },

    // ── Atualizações em Tempo Real ───────────────────────────────────────────

    // Atualiza Badge de Status e Tippy
    refreshStatusBadge: function(id, aprovado, finalizado) {
        const cell = document.querySelector(`#row-${id} td:nth-child(3)`); // Coluna 3 é Status
        const rowEl = document.getElementById(`row-${id}`);
        if (!cell || !rowEl) return;
        
        if (rowEl._rowData) {
            rowEl._rowData.aprovado = aprovado;
            rowEl._rowData.finalizado = finalizado;
        }
        
        const r = rowEl._rowData;
        cell.innerHTML = this._buildStatusBadgeHtml(r);

        // Re-inicializa Tippy
        if (typeof tippy !== 'undefined') {
            const el = cell.querySelector('[data-tippy-content]');
            if (el) tippy(el, { allowHTML: true, interactive: true, maxWidth: 600, theme: 'light', arrow: true });
        }
    },

    // Atualiza a célula da coluna "Parcelas"
    refreshParcelasCell: function(id) {
        const cell = document.querySelector(`#row-${id} td:nth-child(8)`); // Coluna 8 é Parcelas
        const rowEl = document.getElementById(`row-${id}`);
        if (!cell || !rowEl || !rowEl._rowData) return;

        cell.innerHTML = this._buildParcelasColumnHtml(rowEl._rowData);

        // Re-inicializa Tippy
        if (typeof tippy !== 'undefined') {
            const el = cell.querySelector('[data-tippy-content]');
            if (el) tippy(el, { allowHTML: true, interactive: true, maxWidth: 600, theme: 'light', arrow: true });
        }
    },

    // Atualiza célula de ações
    refreshActionCell: function(id, aprovado, finalizado) {
        const cell = document.querySelector(`#row-${id} .actions-cell`);
        if (!cell) return;
        const s = this._s();
        const rowEl = document.getElementById(`row-${id}`);
        
        if (rowEl && rowEl._rowData) {
            rowEl._rowData.aprovado = aprovado;
            rowEl._rowData.finalizado = finalizado;
        }
        
        const isNew = id.toString().startsWith('new_');
        cell.innerHTML = this._buildActionsHtml(
            id, aprovado == 1, finalizado == 1, isNew,
            s.currentUser.canAprove || s.currentUser.isAdmin,
            s.currentUser.canPagar || s.currentUser.isAdmin,
            s.currentUser.canEdit || s.currentUser.isAdmin,
            rowEl && rowEl.dataset.usuario == s.currentUser.id,
            s.currentUser.isAdmin
        );
        
        // Também atualiza a coluna de parcelas e status, pois o estado mudou
        this.refreshParcelasCell(id);
        this.refreshStatusBadge(id, aprovado, finalizado);
    },

    refreshStatusIcon: function(id, aprovado, finalizado) {
        const cell = document.querySelector(`#row-${id} .status-icon-cell`);
        if (!cell) return;
        const rowEl = document.getElementById(`row-${id}`);
        if (rowEl && rowEl._rowData) {
            rowEl._rowData.aprovado = aprovado;
            rowEl._rowData.finalizado = finalizado;
            cell.innerHTML = this._buildStatusIcon(rowEl._rowData);
            [].slice.call(cell.querySelectorAll('[data-bs-toggle="tooltip"]')).map(el => new bootstrap.Tooltip(el));
        }
    },

    // ── Resto dos Helpers de Construção ──────────────────────────────────────

    _buildStatusIcon: function(r) {
        const isFinalizado = r.finalizado == 1;
        const isAdiantamento = r.adiantamento == 1;
        
        if (isFinalizado) {
            if (isAdiantamento) return '<i class="ph-check text-warning fs-base" data-bs-toggle="tooltip" title="Pago - Adiantamento"></i>';
            return '<i class="ph-check text-success fs-base" title="Pago"></i>';
        }
        if (r.aprovado == 1) return '<i class="ph-checks text-success fs-base" title="Concluído"></i>';

        let critFaltando = 0;
        const hasParcelas = r.parcelas && r.parcelas.length > 0;
        const hasValor    = parseFloat(r.valor_total || 0) > 0 || (hasParcelas && r.parcelas.some(p => parseFloat(p.valor || 0) > 0));
        
        if (!hasValor) critFaltando++;
        if (!r.empresa) critFaltando++;
        if (!r.recebedor_nome) critFaltando++;
        if (!hasParcelas && !r.data_vencimento) critFaltando++;

        if (critFaltando >= 1) return '<i class="ph-check text-danger fs-base" title="Campos críticos incompletos"></i>';
        
        return '<i class="ph-check text-success fs-base" title="Pronto para finalizar"></i>';
    },

    _iconLoading: function(btnEl) {
        btnEl.classList.add('loading');
        btnEl.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    },

    _iconRestore: function(btnEl, iconClass, title) {
        btnEl.classList.remove('loading');
        btnEl.innerHTML = `<i class="${iconClass}"></i>`;
        btnEl.title = title;
    },

    _buildActionsHtml: function(id, isAprovado, isFinalizado, isNew, canAprove, canPagar, canEdit, isOwner, isAdmin) {
        let html = '<div class="d-inline-flex gap-1 align-items-center">';
        const rowEl = document.getElementById(`row-${id}`);
        const r = rowEl ? rowEl._rowData : {};
        const isParcelado = (r.parcelas && r.parcelas.length > 0);
        const statusFin = r.finalizado || 0; 

        if (!isNew) {
            if (canAprove) {
                if (isAprovado) {
                    html += `<button id="btn-unapprove-${id}" class="action-icon unapprove" title="Reabrir" onclick="event.stopPropagation(); ConciliacaoMain.unapproveRow('${id}', this)"><i class="ph-arrow-u-up-left"></i></button>`;
                } else {
                    html += `<button id="btn-aprovar-${id}" class="action-icon approve" title="Concluir" onclick="event.stopPropagation(); ConciliacaoMain.approveRow('${id}', this)"><i class="ph-checks"></i></button>`;
                }
            }

            if (canPagar && !isAprovado) {
                if (!isParcelado) {
                    if (isFinalizado) {
                        html += `<button id="btn-unfinalize-${id}" class="action-icon unfinalize" title="Estornar" onclick="event.stopPropagation(); ConciliacaoMain.unfinalizeRow('${id}', this)"><i class="ph-arrow-counter-clockwise"></i></button>`;
                    } else {
                        html += `<button id="btn-finalizar-${id}" class="action-icon finalize" title="Baixar" onclick="event.stopPropagation(); ConciliacaoMain.finalizeRow('${id}', this)"><i class="ph-coins"></i></button>`;
                    }
                } else {
                    let icon = 'ph-coins';
                    let btnClass = 'finalize';
                    let title = 'Gerenciar Parcelas';

                    if (statusFin == 1) { // Total
                        icon = 'ph-list-checks';
                        btnClass = 'unfinalize';
                        title = 'Ver/Estornar Parcelas';
                    }
                    html += `<button id="btn-finalizar-${id}" class="action-icon ${btnClass}" title="${title}" onclick="event.stopPropagation(); ConciliacaoMain.finalizeRow('${id}', this)"><i class="${icon}"></i></button>`;
                }
            }

            if ((isAdmin || isOwner) && canEdit) {
                html += `<button id="btn-excluir-${id}" class="action-icon del" title="Excluir" onclick="event.stopPropagation(); ConciliacaoMain.deleteRow('${id}', this)"><i class="ph-trash"></i></button>`;
            }
        }
        html += '</div>';
        return html;
    },

    _extractDocNum: function(r) {
        if (r.recebedor_nome === 'MINISTÉRIO DO TRABALHO E EMPREGO' && r.recebedor_doc) return r.recebedor_doc;
        if (r.anexos && r.anexos.length > 0) {
            for (const a of r.anexos) {
                if (a.solucoes_ia?.dados_fiscais?.numero) return `NF ${a.solucoes_ia.dados_fiscais.numero}`;
            }
        }
        if (r.operacao_extra) {
            if (r.operacao_extra.num_documento) return r.operacao_extra.num_documento;
            if (r.operacao_extra.nosso_numero) return r.operacao_extra.nosso_numero;
        }
        return '-';
    },

    // ── Linha principal da tabela ─────────────────────────────────────────────
    buildTableRow: function(r) {
        const s = this._s();
        const dataCriacao = moment(r.data_criacao).format('DD/MM/YYYY HH:mm');
        const userName    = `${r.usuario_nome || ''} ${r.usuario_sobrenome || ''}`.trim() || 'Usuário';
        const opType      = (r.operacao || '-').toUpperCase();
        
        let valorTotal  = parseFloat(r.valor_total || 0);
        const hasParcelas = r.parcelas && r.parcelas.length > 0;
        const hasFatura   = r.fatura && r.fatura.length > 0;

        if (hasFatura   && valorTotal === 0) valorTotal = r.fatura.reduce((acc, f) => acc + parseFloat(f.valor || 0), 0);
        if (hasParcelas && valorTotal === 0) valorTotal = r.parcelas.reduce((acc, p) => acc + parseFloat(p.valor || 0), 0);

        // Gera HTML das colunas principais usando os novos helpers
        const parcelasCol = this._buildParcelasColumnHtml(r);
        const stBadge     = this._buildStatusBadgeHtml(r);

        const valorStr     = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const naturezaCell = this._buildNaturezaCell(r, valorTotal, hasFatura);
        const empresaNome  = r.empresa_nome || (s.empresas.find(e => e.id == r.empresa)?.nome) || '';
        const empresaObj   = s.empresas.find(e => e.id == r.empresa);
        let contaLabel     = '';
        if (empresaObj?.contas?.length > 0) {
            const contaPadrao = empresaObj.contas.find(c => c.conta_padrao == 1) || empresaObj.contas[0];
            if (contaPadrao?.conta) contaLabel = `<span class="text-muted text-xs">${ConciliacaoUtils.esc(contaPadrao.conta)}</span>`;
        }

        const pagadorCell = `<div class="fw-semibold text-dark text-sm">${ConciliacaoUtils.esc(empresaNome)}</div>${contaLabel}`;
        const recebedorCell = r.recebedor_nome ? `<div class="text-dark text-sm">${ConciliacaoUtils.esc(r.recebedor_nome)}</div>` : `<span class="text-muted text-xs fst-italic">Não informado</span>`;
        const docNum  = this._extractDocNum(r);
        const docCell = `<span class="text-xs font-monospace text-dark" title="${ConciliacaoUtils.esc(docNum)}">${ConciliacaoUtils.esc(docNum)}</span>`;
        
        const actionsHtml = this._buildActionsHtml(
            r.id, r.aprovado == 1, (r.finalizado == 1 || r.finalizado == 2), r.id.toString().startsWith('new_'),
            s.currentUser.canAprove || s.currentUser.isAdmin,
            s.currentUser.canPagar || s.currentUser.isAdmin,
            s.currentUser.canEdit || s.currentUser.isAdmin,
            r.usuario == s.currentUser.id,
            s.currentUser.isAdmin
        );

        const statusIcon = this._buildStatusIcon(r);
        const clickAttr = `onclick="if(!event.target.closest('input,button,.actions-cell,textarea,.tt-menu')) ConciliacaoMain.toggleEditRow('${r.id}')"`;

        const rowHtml = `
        <tr class="main-row cursor-pointer" id="row-${r.id}" data-usuario="${r.usuario}" ${clickAttr}>
            <td class="text-center status-icon-cell ps-2">${statusIcon}</td>
            <td><div class="text-dark text-sm">${dataCriacao}</div><div class="text-muted text-xs"><i class="ph-user me-1"></i>${userName}</div></td>
            <td>${stBadge}</td>
            <td>${pagadorCell}</td>
            <td>${recebedorCell}</td>
            <td>${docCell}</td>
            <td><span class="badge bg-soft-secondary text-secondary">${opType}</span></td>
            <td>${parcelasCol}</td>
            <td class="text-end fw-bold fs-6">${valorStr}</td>
            <td>${naturezaCell}</td>
            <td class="actions-cell" onclick="event.stopPropagation()">${actionsHtml}</td>
        </tr>
        <tr class="edit-row" id="edit-row-${r.id}" style="display:none;">
            <td colspan="11" class="p-0 border-bottom-0">${ConciliacaoUIForm.buildEditForm(r)}</td>
        </tr>`;

        setTimeout(() => { const el = document.getElementById(`row-${r.id}`); if (el) el._rowData = r; }, 0);
        return rowHtml;
    },

    _buildNaturezaCell: function(r, valorTotal, hasFatura) {
        const s = this._s();
        if (hasFatura) {
            const natMap = {};
            r.fatura.forEach(f => {
                const natId = f.natureza_financeira;
                let natName = 'Sem natureza';
                if (natId && s.allNaturezas) {
                    const found = s.allNaturezas.find(n => n.id == natId);
                    natName = found ? found.text : natId;
                }
                natMap[natName] = (natMap[natName] || 0) + parseFloat(f.valor || 0);
            });
            const total = valorTotal || 1;
            const popLines = Object.entries(natMap).map(([k, v]) => `${k}: ${((v / total) * 100).toFixed(1)}% (${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`).join('<br>');
            return `<span class="badge bg-soft-info text-info px-2 py-1" data-bs-toggle="popover" data-bs-trigger="hover focus" data-bs-html="true" data-bs-content="${popLines.replace(/"/g, '&quot;')}" title="Distribuição" style="cursor:help"><i class="ph-info me-1"></i>Misto</span>`;
        }
        const desc = r.natureza_descricao || '';
        const instr = r.natureza_instrucoes ? ConciliacaoUtils.esc(r.natureza_instrucoes) : '';
        if (r.natureza_financeira) {
            const infoIcon = instr ? `<i class="ph-info text-muted ms-1 cursor-pointer" data-bs-toggle="popover" data-bs-trigger="hover focus" title="Instruções" data-bs-content="${instr}"></i>` : '';
            return `<span class="text-sm text-dark fw-medium d-flex align-items-center">${ConciliacaoUtils.esc(desc)} ${infoIcon}</span>`;
        }
        return `<span class="text-sm text-muted fst-italic">Não informada</span>`;
    }
};