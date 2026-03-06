/**
 * ConciliacaoMain — Orquestrador principal v12
 * Responsabilidade: estado global, fluxo de dados e coordenação entre submódulos.
 * Submódulos: ConciliacaoAPI, ConciliacaoUtils, ConciliacaoUITable,
 *             ConciliacaoUIForm, ConciliacaoUIAnexos, ConciliacaoUITypeahead, ConciliacaoUISetup
 */
var ConciliacaoMain = {

    // ── Estado ────────────────────────────────────────────────────────────────
    startDate:    null,
    endDate:      null,
    vencStart:    '', 
    vencEnd:      '', 
    currentUser:  {},
    empresas:     [],
    allNaturezas: [],
    _uploadQueue: {},

    // ── Permissões ────────────────────────────────────────────────────────────
    _canEdit:     function() { return this.currentUser.canEdit     || this.currentUser.isAdmin; },
    _canFinalize: function() { return this.currentUser.canFinalize || this.currentUser.isAdmin; },
    _canAprove:   function() { return this.currentUser.canAprove   || this.currentUser.isAdmin; },
    _canPagar:    function() { return this.currentUser.canPagar    || this.currentUser.isAdmin; },
    _canCreate:   function() { return this.currentUser.canCreate   || this.currentUser.isAdmin; },

    // ── Inicialização ─────────────────────────────────────────────────────────
    init: async function() {
        const ranges = ConciliacaoUISetup.setupDateRange((s, e) => {
            this.startDate = s; 
            this.endDate = e; 
        });
        this.startDate = ranges.start;
        this.endDate   = ranges.injectBankUpdateMenuend;

        this._setupVencimentoPicker();

        try {
            const j = await ConciliacaoAPI.getNaturezas();
            if (j.status === 'success') this.allNaturezas = j.data;
        } catch (e) { console.error('Erro ao carregar naturezas', e); }

        ConciliacaoUISetup.injectBankUpdateMenu();
        this.loadData();
    },

    _setupVencimentoPicker: function() {
        if (!$.fn.daterangepicker) return;
        
        const updateLabel = (start, end) => {
            if (!start) {
                $('#dateRangeVencimento span').html('Todos');
                this.vencStart = ''; 
                this.vencEnd = '';
            } else {
                $('#dateRangeVencimento span').html(start.format('DD/MM/YYYY') + ' - ' + end.format('DD/MM/YYYY'));
                this.vencStart = start.format('YYYY-MM-DD');
                this.vencEnd   = end.format('YYYY-MM-DD');
            }
        };

        $('#dateRangeVencimento').daterangepicker({
            autoUpdateInput: false,
            locale: {
                format: 'DD/MM/YYYY',
                applyLabel: 'Aplicar',
                cancelLabel: 'Limpar',
                customRangeLabel: 'Customizado',
                daysOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
                monthNames: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
            }
        });

        $('#dateRangeVencimento').on('apply.daterangepicker', function(ev, picker) {
            updateLabel(picker.startDate, picker.endDate);
        });

        $('#dateRangeVencimento').on('cancel.daterangepicker', function(ev, picker) {
            updateLabel(null, null);
        });
    },

    // ── Dados ─────────────────────────────────────────────────────────────────
    loadData: async function() {
        ConciliacaoUITable.setLoading();
        
        const filters = {
            status:    document.getElementById('filtro_status')?.value || '',
            empresa:   document.getElementById('filtro_empresa')?.value || '',
            usuario:   document.getElementById('filtro_usuario')?.value || '',
            operacao:  document.getElementById('filtro_operacao')?.value || '',
            recebedor: document.getElementById('filtro_recebedor')?.value || '',
            // O status estava duplicado no código original, removi a duplicata e mantive a ordem
            doc:       document.getElementById('filtro_doc')?.value || '',
            // ADICIONADO AQUI:
            valor:     document.getElementById('filtro_valor')?.value || '', 
            
            venc_start: this.vencStart,
            venc_end:   this.vencEnd
        };

        try {
            const json = await ConciliacaoAPI.getData(this.startDate, this.endDate, filters);
            
            if (json.status === 'success') {
                this.currentUser      = json.currentUser;
                this.empresas         = json.empresas;
                this.currentData      = json.data; // <--- ADICIONAR ESTA LINHA: Armazena dados para exportação
                window._empresasCache = json.empresas;
                this._populateFilterSelects(json.empresas, json.activeUsers);
                ConciliacaoUITable.renderTable(json.data);
            } else {
                ConciliacaoUITable.setError(json.message);
                this.currentData = []; // Limpa se der erro
            }
        } catch (e) {
            console.error(e);
            ConciliacaoUITable.setError('Erro de conexão.');
            this.currentData = []; // Limpa se der erro
        }
    },

    _populateFilterSelects: function(empresas, activeUsers) {
        const selEmp = document.getElementById('filtro_empresa');
        if (selEmp && selEmp.options.length <= 1) { 
            empresas.forEach(e => {
                const group = document.createElement('optgroup');
                group.label = e.nome;
                const optGeral = document.createElement('option');
                optGeral.value = e.cnpj || e.id; 
                optGeral.textContent = `Todos - ${e.nome}`;
                optGeral.style.fontWeight = 'bold';
                group.appendChild(optGeral);

                if (e.contas && e.contas.length > 0) {
                    e.contas.forEach(c => {
                        const optConta = document.createElement('option');
                        const val = `ACC|${e.cnpj}|${c.banco_id}|${c.conta}`;
                        const isPadrao = c.conta_padrao == 1 ? ' (Padrão)' : '';
                        optConta.value = val;
                        optConta.textContent = `↳ ${c.banco_nome} - Ag ${c.agencia} Cc ${c.conta}${isPadrao}`;
                        group.appendChild(optConta);
                    });
                }
                selEmp.appendChild(group);
            });
        }
        
        const selUser = document.getElementById('filtro_usuario');
        if (selUser && selUser.options.length <= 1 && activeUsers) {
            activeUsers.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.nome;
                selUser.appendChild(opt);
            });
        }
    },

    // ── Bancos BrasilAPI ──────────────────────────────────────────────────────
    updateBanksJson: async function() {
        if (!confirm('Isso irá baixar a lista atualizada de bancos da BrasilAPI. Continuar?')) return;
        ConciliacaoUISetup.notify('Atualizando bancos...', 'info');
        try {
            const resp = await ConciliacaoAPI.updateBanks();
            const json = await resp.json();
            ConciliacaoUISetup.notify(
                json.status === 'success' ? json.message : (json.message || 'Erro ao atualizar bancos'),
                json.status === 'success' ? 'success' : 'error'
            );
        } catch (e) {
            ConciliacaoUISetup.notify('Erro de conexão.', 'error');
        }
    },

    // ── Validação de Banco ────────────────────────────────────────────────────
    validateBankField: function(id, inputEl) {
        const val      = inputEl.value;
        const hiddenEl = document.getElementById(`ted_banco_${id}`);
        if (hiddenEl) hiddenEl.value = val;
        const isCode = /^\d+/.test(val);
        if (val && !isCode) {
            inputEl.classList.add('is-invalid');
            inputEl.title = 'Selecione um banco da lista para validar o código.';
        } else {
            inputEl.classList.remove('is-invalid');
            inputEl.title = '';
        }
    },

    // ── Visibilidade de linhas ────────────────────────────────────────────────
    toggleEditRow: function(id) {
        const el        = document.getElementById(`edit-row-${id}`);
        const isOpening = el.style.display === 'none';
        el.style.display = isOpening ? 'table-row' : 'none';

        if (isOpening) {
            if ($.fn.select2) {
                $(el).find('.select2-empresa').select2({
                    width: '100%',
                    theme: 'bootstrap-5',
                    placeholder: 'Selecione...'
                });
            }

            const anexosInput = document.getElementById(`anexos_data_${id}`);
            if (anexosInput) {
                try {
                    const anexos = JSON.parse(anexosInput.value || '[]');
                    if (anexos.length > 0) ConciliacaoUIAnexos.renderList(id, anexos);
                } catch (e) {}
            }
            ConciliacaoUIForm.initPasteAnexo(id);
        } else {
            ConciliacaoUIForm.destroyPasteAnexo(id);
        }
    },

    toggleParcelasMode: function(id) {
        const checked = document.getElementById(`hasParcelas_${id}`).checked;
        document.querySelectorAll(`.single-group-${id}`).forEach(el => el.style.display = checked ? 'none'  : 'block');
        document.querySelectorAll(`.multi-group-${id}`).forEach(el  => el.style.display = checked ? 'block' : 'none');
    },

    toggleFaturaMode: function(id) {
        const checked = document.getElementById(`isFatura_${id}`).checked;
        document.querySelectorAll(`.fatura-section-${id}`).forEach(el => el.style.display = checked ? 'block' : 'none');
        const natMain = document.querySelector(`.natureza-main-${id}`);
        if (natMain) natMain.style.display = checked ? 'none' : 'block';
    },

    addParcelaRow: function(id) {
        document.getElementById(`plist_${id}`)
            .insertAdjacentHTML('beforeend', ConciliacaoUIForm.buildParcelaRow('', ''));
    },

    addFaturaItem: function(id) {
        const list = document.getElementById(`fatura-list-${id}`);
        list.insertAdjacentHTML('beforeend', ConciliacaoUIForm.buildFaturaItemRow());
        ConciliacaoUITypeahead.initForFaturaItems(list);
    },

    // ── Anexos e Upload ───────────────────────────────────────────────────────
    uploadAnexo: async function(id) {
        const fileInput = document.getElementById(`file_upload_${id}`);
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            ConciliacaoUISetup.notify('Selecione um arquivo primeiro.', 'error');
            return;
        }

        const files   = Array.from(fileInput.files);
        const btn     = document.getElementById(`btn_upload_${id}`);
        const spinner = document.getElementById(`spinner_upload_${id}`);
        btn.disabled  = true;
        spinner.classList.remove('d-none');

        const anexosInput   = document.getElementById(`anexos_data_${id}`);
        let anexosExistentes = [];
        try { anexosExistentes = JSON.parse(anexosInput.value || '[]'); } catch(e) {}

        const novosAnexos = [];

        for (const file of files) {
            const formData = new FormData();
            formData.append('arquivo', file);
            try {
                const resp = await ConciliacaoAPI.analyzeAnexo(formData);
                const json = await resp.json();

                if (json.status === 'success') {
                    anexosExistentes.push(json.anexo);
                    novosAnexos.push(json.anexo);
                    anexosInput.value = JSON.stringify(anexosExistentes);
                    ConciliacaoUIAnexos.renderList(id, anexosExistentes);
                    fileInput.value = '';
                } else {
                    ConciliacaoUISetup.notify(json.message || 'Erro ao analisar arquivo', 'error');
                }
            } catch (e) {
                ConciliacaoUISetup.notify('Erro de conexão ao enviar arquivo.', 'error');
            }
        }

        btn.disabled = false;
        spinner.classList.add('d-none');

        if (novosAnexos.length === 0) return;

        this._checkMasterButton(id, anexosExistentes);

        if (anexosExistentes.length === 1) {
            const anexo = anexosExistentes[0];
            const sol   = anexo.solucoes_ia || {};
            const count = anexo.solucoes_count || 0;
            if (count === 0) {
                ConciliacaoUISetup.notify('Análise concluída. Sem soluções da IA para aplicar.', 'warning');
            } else {
                ConciliacaoUIAnexos.openSolutionsModal(id, sol, null, anexo);
            }
        } else {
            ConciliacaoUISetup.notify(
                `${novosAnexos.length} arquivo(s) analisado(s). Use "🧠 Analisar Tudo" para consolidar.`,
                'info'
            );
        }
    },

    _checkMasterButton: function(id, anexos) {
        const btnId   = `btn_analisar_tudo_${id}`;
        const existing = document.getElementById(btnId);
        if (existing) existing.remove();

        if (!anexos || anexos.length < 2) return;

        const container = document.getElementById(`anexos_list_${id}`);
        if (!container) return;

        const btn = document.createElement('button');
        btn.id        = btnId;
        btn.type      = 'button';
        btn.className = 'btn btn-sm btn-warning w-100 mb-2 d-flex align-items-center justify-content-center gap-2';
        btn.innerHTML = `<i class="ph-brain"></i> 🧠 Analisar Tudo (${anexos.length} anexos)`;
        btn.onclick   = () => {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Consolidando...`;
            ConciliacaoMain._analisarMestre(id, anexos).finally(() => {
                btn.disabled = false;
                btn.innerHTML = `<i class="ph-brain"></i> 🧠 Analisar Tudo (${anexos.length} anexos)`;
            });
        };
        container.insertAdjacentElement('beforebegin', btn);
    },

    _analisarMestre: async function(id, anexos) {
        try {
            const json = await ConciliacaoAPI.analyzeMestre(anexos);
            if (json.status === 'success' && json.solucao_mestre) {
                const mestre = json.solucao_mestre;
                const count  = ConciliacaoUtils.contarSolucoes(mestre);
                if (count === 0) {
                    ConciliacaoUISetup.notify('Análise mestre concluída. Sem soluções consolidadas.', 'warning');
                } else {
                    ConciliacaoUIAnexos.openSolutionsModal(id, null, mestre, null);
                }
                return mestre;
            } else {
                ConciliacaoUISetup.notify('Erro ao consolidar soluções.', 'error');
                return null;
            }
        } catch (e) {
            console.error('Erro ao buscar solução mestre', e);
            ConciliacaoUISetup.notify('Erro de conexão ao consolidar.', 'error');
            return null;
        }
    },

    removeAnexo: function(id, idx) {
        if (!confirm('Remover este anexo?')) return;
        const anexosInput = document.getElementById(`anexos_data_${id}`);
        let anexos = JSON.parse(anexosInput.value || '[]');
        anexos.splice(idx, 1);
        anexosInput.value = JSON.stringify(anexos);
        ConciliacaoUIAnexos.renderList(id, anexos);
        this._checkMasterButton(id, anexos);
    },

    _tryOpenModal: function(id, solJson, anexoJson, count) {
        if (count === 0) { ConciliacaoUISetup.notify('Sem soluções da IA para este arquivo.', 'warning'); return; }
        try {
            const sol   = JSON.parse(decodeURIComponent(solJson));
            const anexo = JSON.parse(decodeURIComponent(anexoJson));
            ConciliacaoUIAnexos.openSolutionsModal(id, sol, null, anexo);
        } catch (e) {
            console.error('Erro ao parsear soluções', e);
            ConciliacaoUISetup.notify('Erro ao abrir soluções (formato inválido)', 'error');
        }
    },

    _onSolFinRadioChange: function(idx) {
        const radio = document.getElementById(`sol_fin_chk_${idx}`);
        if (radio && radio._wasChecked) {
            radio.checked     = false;
            radio._wasChecked = false;
        } else if (radio) {
            radio._wasChecked = true;
            document.querySelectorAll('.sol-fin-radio').forEach(r => { if (r !== radio) r._wasChecked = false; });
        }
    },

    _applyFromModal: function(id) {
        const { sol, fs } = window._solucaoAtual || { sol: {}, fs: [] };
        this.applySolution(id, sol, fs);
    },

    applySolution: function(id, sol, financeiras) {
        // Checagem do Checkbox Mestre Financeiro
        const masterFinChk = document.getElementById('sol_financeira_master_chk');
        const shouldApplyFin = masterFinChk ? masterFinChk.checked : true;

        if (document.getElementById('sol_anotacao_chk')?.checked) {
            const txt = document.getElementById('sol_anotacao_texto')?.value;
            const el  = document.getElementById(`anotacao_${id}`);
            if (el && txt) el.value = txt;
        }

        if (document.getElementById('sol_geral_chk')?.checked) {
            const empIdModal = document.getElementById('sol_empresa_select')?.value;

            if (empIdModal) {
                const empEl      = $(`#emp_${id}`);
                const empresaObj = this.empresas.find(e => String(e.id) === String(empIdModal));

                if (empresaObj) {
                    let targetVal = empIdModal;
                    if (empresaObj.contas && empresaObj.contas.length > 0) {
                        const contaAlvo = empresaObj.contas.find(c => c.conta_padrao == 1) || empresaObj.contas[0];
                        targetVal = JSON.stringify({
                            cnpj:     empresaObj.cnpj || '',
                            banco_id: String(contaAlvo.banco_id || ''),
                            conta:    contaAlvo.conta || ''
                        });
                    } else {
                        targetVal = JSON.stringify({ cnpj: empresaObj.cnpj || '', banco_id: '', conta: '' });
                    }
                    if (empEl.length) empEl.val(targetVal).trigger('change');
                }
            }

            const setField = (solId, fieldId) => {
                const val = document.getElementById(solId)?.value;
                const el  = document.getElementById(fieldId);
                if (el && val !== undefined) el.value = val;
            };
            setField('sol_rec_nome', `rec_nome_${id}`);
            setField('sol_rec_doc',  `rec_doc_${id}`);
        }

        const tipoDocIA = (sol.tipo_documento || '').toLowerCase();
        // Mapeamento atualizado para incluir 'pagamento'
        const tipoLancamentoMap = { 
            'nfs': 'NFS', 'nfse': 'NFS', 'nfe': 'NFE', 
            'boleto': 'pagamento', 'dda': 'pagamento', 'pagamento': 'pagamento',
            'transferencia': 'outros', 'fatura': 'outros'
        };
        const tipoLancamentoAlvo = tipoLancamentoMap[tipoDocIA] || null;

        if (tipoLancamentoAlvo) {
            const hidden = document.getElementById(`tipo_lancamento_${id}`);
            if (hidden) hidden.value = tipoLancamentoAlvo;

            const container = document.getElementById(`tipo_lancamento_btns_${id}`);
            if (container) {
                container.querySelectorAll('.tipo-lancamento-btn').forEach(b => {
                    b.classList.remove('active');
                    if (b.dataset.tipo === tipoLancamentoAlvo) {
                        b.classList.add('active');
                        ConciliacaoUIForm.onTipoLancamentoChange(id, tipoLancamentoAlvo, b);
                    }
                });
            }
        }

        if (document.getElementById('sol_fiscal_chk')?.checked !== false &&
            sol.dados_fiscais && (sol.dados_fiscais.numero || sol.dados_fiscais.chave_acesso || sol.dados_fiscais.codigo_verificacao)) {
            setTimeout(() => {
                const df  = sol.dados_fiscais;
                
                // CORREÇÃO: Fallback se a IA inverteu os campos para NFE
                const tipoDocIA = (sol.tipo_documento || '').toLowerCase();
                if ((tipoDocIA === 'nfe' || tipoDocIA === 'nf-e') && !df.chave_acesso && df.codigo_verificacao && String(df.codigo_verificacao).replace(/\D/g, '').length === 44) {
                    df.chave_acesso = df.codigo_verificacao;
                }

                const set = (elId, val) => { const el = document.getElementById(elId); if (el && val != null) el.value = val; };

                set(`df_numero_${id}`,       df.numero || '');
                set(`df_serie_${id}`,        df.serie  || '');
                set(`df_valor_nf_${id}`,     df.valor_nf ? parseFloat(df.valor_nf).toFixed(2) : '');
                set(`df_competencia_${id}`,  df.competencia || '');
                if (df.data_emissao) set(`df_data_emissao_${id}`, ConciliacaoUtils.toDisplayDate(df.data_emissao));

                if (df.chave_acesso) set(`df_chave_acesso_${id}`, df.chave_acesso);

                if (df.codigo_verificacao)         set(`df_codigo_verificacao_${id}`,  df.codigo_verificacao);
                if (df.email_prestador)            set(`df_email_prestador_${id}`,      df.email_prestador);
                if (df.discriminacao_servicos)     set(`df_discriminacao_${id}`,        df.discriminacao_servicos);
                if (df.local_incidencia_iss)       set(`df_local_iss_${id}`,            df.local_incidencia_iss);
                if (df.local_prestacao_servico)    set(`df_local_prestacao_${id}`,      df.local_prestacao_servico);
                if (df.informacoes_complementares) set(`df_info_complementar_${id}`,   df.informacoes_complementares);
                if (df.outras_informacoes)         set(`df_outras_info_${id}`,          df.outras_informacoes);
                if (df.cnaes && df.cnaes.length)   set(`df_cnaes_${id}`,               df.cnaes.join(', '));

                const bloco = document.getElementById(`bloco_fiscal_${id}`);
                if (bloco) {
                    bloco.querySelectorAll('.badge.bg-secondary').forEach(b => {
                        if (b.textContent.includes('Preenchimento manual')) {
                            b.className   = 'badge bg-success ms-2 text-xs';
                            b.textContent = 'Preenchido pela IA';
                        }
                    });
                }
            }, 200);
        }

        // APLICAÇÃO FINANCEIRA (Condicionada ao master checkbox)
        if (shouldApplyFin) {
            const selectedRadio = document.querySelector('.sol-fin-radio:checked');
            const selectedIdx   = selectedRadio ? parseInt(selectedRadio.value) : -1;

            // FIX: If the AI returned an empty financial list (common in NF-e fallback scenarios),
            // we create a dummy array to force the loop to run once (index 0) and grab the values from the DOM inputs.
            const listaParaIterar = (financeiras && financeiras.length > 0) ? financeiras : [{}];

            listaParaIterar.forEach((sf, i) => {
                if (i !== selectedIdx) return;
                
                // Retrieve values from the Modal DOM inputs
                // Using optional chaining because inputs might not exist depending on the tab
                const tipoInput  = document.getElementById(`sol_op_${i}`);
                const valorInput = document.getElementById(`sol_valor_${i}`);
                const vencInput  = document.getElementById(`sol_venc_${i}`);
                
                // Priority: Modal Input > AI Object > Default
                const tipo  = tipoInput?.value  || sf.tipo_operacao || 'pix';
                const valor = valorInput?.value || sf.valor_total;
                const venc  = vencInput?.value  || sf.data_vencimento;
                const extra = sf.operacao_extra || {};

                // Update Operation Dropdown
                const opEl = document.getElementById(`op_${id}`);
                if (opEl) { opEl.value = tipo; ConciliacaoUIForm.onOperacaoChange(id, tipo); }

                setTimeout(() => {
                    // Update Value and Due Date
                    if (valor) { const v = document.getElementById(`val_${id}`); if (v) v.value = valor; }
                    if (venc)  { const ve = document.getElementById(`venc_${id}`); if (ve) ve.value = ConciliacaoUtils.toDisplayDate(venc); }

                    // Update specific fields based on operation type
                    if (tipo === 'boleto' || tipo === 'DDA') {
                        const bl = document.getElementById(`boleto_linha_${id}`);
                        // Grab from modal input specifically
                        if (bl) bl.value = document.getElementById(`sol_boleto_${i}`)?.value || '';

                        const codDoc = document.getElementById(`sol_cod_doc_${i}`)?.value;
                        const numDoc = document.getElementById(`sol_num_doc_${i}`)?.value;
                        const dtDoc  = document.getElementById(`sol_dt_doc_${i}`)?.value;
                        if (codDoc) { const el = document.getElementById(`nosso_numero_${id}`); if (el) el.value = codDoc; }
                        if (numDoc) { const el = document.getElementById(`num_documento_${id}`); if (el) el.value = numDoc; }
                        if (dtDoc)  { const el = document.getElementById(`data_documento_${id}`); if (el) el.value = dtDoc; }

                    } else if (tipo === 'pix') {
                        const pk = document.getElementById(`pix_chave_${id}`);
                        const pt = document.getElementById(`pix_tipo_${id}`);
                        // Grab from modal input or AI object
                        if (pk) pk.value = document.getElementById(`sol_pix_chave_${i}`)?.value || extra.pix_chave || '';
                        if (pt) pt.value = document.getElementById(`sol_pix_tipo_${i}`)?.value  || extra.pix_tipo  || 'aleatoria';

                    } else if (tipo === 'transferencia') {
                        const setVal = (key, val) => { const el = document.getElementById(`${key}_${id}`); if (el) el.value = val; };
                        const bankInput = document.getElementById(`ted_banco_input_${id}`);
                        if (bankInput) { bankInput.value = extra.ted_banco || ''; this.validateBankField(id, bankInput); }
                        setVal('ted_agencia',    extra.ted_agencia    || '');
                        setVal('ted_conta',      extra.ted_conta      || '');
                        setVal('ted_favorecido', extra.ted_favorecido || '');
                        setVal('ted_doc',        extra.ted_doc        || '');
                        const tedTipo = document.getElementById(`ted_tipo_${id}`);
                        if (tedTipo) tedTipo.value = extra.ted_tipo || 'corrente';
                    }

                    // Handle Installments if applicable
                    if (sf.ativar_parcelas && sf.parcelas?.length > 0) {
                        const hpEl = document.getElementById(`hasParcelas_${id}`);
                        if (hpEl) { hpEl.checked = true; this.toggleParcelasMode(id); }
                        const plist = document.getElementById(`plist_${id}`);
                        if (plist) {
                            plist.innerHTML = '';
                            sf.parcelas.forEach(p => plist.insertAdjacentHTML('beforeend', ConciliacaoUIForm.buildParcelaRow(p.valor, p.data_vencimento)));
                        }
                    }
                }, 150);
            });
        }

        if (document.getElementById('sol_fatura_chk')?.checked && sol.solucao_fatura?.ativar_fatura) {
            const ifEl = document.getElementById(`isFatura_${id}`);
            if (ifEl) { ifEl.checked = true; this.toggleFaturaMode(id); }
            const flist = document.getElementById(`fatura-list-${id}`);
            if (flist && sol.solucao_fatura.itens) {
                flist.innerHTML = '';
                sol.solucao_fatura.itens.forEach(item => {
                    flist.insertAdjacentHTML('beforeend', ConciliacaoUIForm.buildFaturaItemRow(item));
                });
                ConciliacaoUITypeahead.initForFaturaItems(flist);
            }
        }

        bootstrap.Modal.getInstance(document.getElementById('solutionsModal'))?.hide();
        ConciliacaoUISetup.notify('Soluções aplicadas!', 'success');
    },

    // ── Nova Linha ────────────────────────────────────────────────────────────
    addNewRow: async function() {
        let fresh = this.currentUser;
        try { const j = await ConciliacaoAPI.getData(this.startDate, this.endDate); if (j.status === 'success') fresh = j.currentUser; } catch (e) {}
        if (!fresh.canCreate && !fresh.isAdmin) {
            ConciliacaoUISetup.notify('Sem permissão para criar.', 'error');
            return;
        }

        const tempId     = 'new_' + Date.now();
        const mockRecord = {
            id: tempId, empresa: (this.empresas[0]?.id || ''), empresa_nome: (this.empresas[0]?.nome || ''),
            usuario: fresh.id, usuario_nome: '', usuario_sobrenome: '',
            data_criacao: new Date().toISOString(), operacao: 'pix', valor_total: 0,
            data_vencimento: null, parcelas: null, fatura: null, natureza_financeira: null,
            anotacao: '', operacao_extra: null, aprovado: 0, finalizado: 0, anexos: [], _em_edicao: true,
            recebedor_nome: '', recebedor_doc: '', adiantamento: 0 // NOVO
        };

        const tbody = document.getElementById('tbodyConciliacao');
        if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';

        tbody.insertAdjacentHTML('afterbegin', ConciliacaoUITable.buildTableRow(mockRecord));
        ConciliacaoUITypeahead.initForRow(tempId);
        this.toggleEditRow(tempId);
    },

    // ── Salvar ────────────────────────────────────────────────────────────────
    saveRow: async function(id) {
        const isNew = id.toString().startsWith('new_');
        if (!this._canEdit()) { ConciliacaoUISetup.notify('Sem permissão para salvar.', 'error'); return; }

        const empresa        = $(`#emp_${id}`).val();
        const operacao       = document.getElementById(`op_${id}`).value;
        const hasParcelas    = document.getElementById(`hasParcelas_${id}`).checked;
        const isFatura       = document.getElementById(`isFatura_${id}`)?.checked || false;
        const isAdiantamento = document.getElementById(`isAdiantamento_${id}`)?.checked || false; // NOVO

        const operacaoExtra  = ConciliacaoUIForm.collectOperacaoFields(id, operacao);
        const recebedor_nome = document.getElementById(`rec_nome_${id}`)?.value || null;
        const recebedor_doc  = document.getElementById(`rec_doc_${id}`)?.value  || null;
        const recebedor_empresa_json = document.getElementById(`rec_emp_json_${id}`)?.value || null;

        let valor_total = 0, data_vencimento = null, parcelas = null, fatura = null;

        if (isFatura) {
            fatura = [];
            document.getElementById(`fatura-list-${id}`).querySelectorAll('.fatura-item').forEach(item => {
                const desc = item.querySelector('.fatura-desc').value;
                const val  = item.querySelector('.fatura-val').value;
                const nat  = item.querySelector('.fatura-nat-hidden').value;
                if (desc || val) { fatura.push({ descricao: desc, valor: parseFloat(val) || 0, natureza_financeira: nat || null }); valor_total += parseFloat(val) || 0; }
            });
            if (fatura.length === 0) fatura = null;

        } else if (hasParcelas) {
            parcelas = [];
            document.getElementById(`plist_${id}`).querySelectorAll('.parcela-item').forEach(item => {
                const v = item.querySelector('.p-val').value;
                const d = item.querySelector('.p-date').value;
                const dateIso = ConciliacaoUtils.toIsoDate(d);
                if (v) { parcelas.push({ valor: parseFloat(v), data_vencimento: dateIso }); valor_total += parseFloat(v); }
            });
            if (parcelas.length === 0) parcelas = null;

        } else {
            valor_total     = document.getElementById(`val_${id}`).value || 0;
            const vText     = document.getElementById(`venc_${id}`).value || '';
            data_vencimento = ConciliacaoUtils.toIsoDate(vText);
        }

        const natureza_financeira = document.getElementById(`nat_hidden_${id}`)?.value || null;
        const anotacao            = document.getElementById(`anotacao_${id}`)?.value || '';
        const anexosInput         = document.getElementById(`anexos_data_${id}`);
        const anexos              = anexosInput?.value ? JSON.parse(anexosInput.value) : null;

        const tipo_lancamento   = document.getElementById(`tipo_lancamento_${id}`)?.value || null;
        const dados_fiscais_manual = ConciliacaoUIForm.collectDadosFiscais(id, tipo_lancamento);

        const payload = {
            empresa,
            operacao, valor_total, data_vencimento, parcelas, fatura,
            natureza_financeira, anotacao, anexos, ...operacaoExtra,
            recebedor_nome,
            recebedor_doc,
            recebedor_empresa_json,
            tipo_lancamento,
            dados_fiscais_manual: dados_fiscais_manual ? JSON.stringify(dados_fiscais_manual) : null,
            adiantamento: isAdiantamento ? 1 : 0 // NOVO
        };
        if (!isNew) payload.id = id;

        try {
            const json = isNew ? await ConciliacaoAPI.create(payload) : await ConciliacaoAPI.update(payload);
            if (json.status === 'success') {
                ConciliacaoUISetup.notify('Salvo com sucesso!');
                const savedId = isNew ? json.id : id;
                await this._refreshSingleRow(savedId, isNew ? id : null);
            } else {
                ConciliacaoUISetup.notify(json.message || 'Erro ao salvar', 'error');
            }
        } catch (e) {
            ConciliacaoUISetup.notify('Erro de conexão', 'error');
        }
    },

    // ── Atualiza uma única linha após salvar ──────────────────────────────────
    _refreshSingleRow: async function(id, tempId) {
        try {
            const json = await ConciliacaoAPI.getOne(id);
            
            // Se falhar (ex: filtrado fora da visão), recarrega tabela completa
            if (!json || json.status === 'error' || !json.data) {
                console.warn('[Conciliacao] _refreshSingleRow falhou ou item não encontrado nos filtros atuais.');
                this.loadData();
                return;
            }

            const r = json.data;

            if (tempId) {
                const tempMainRow = document.getElementById(`row-${tempId}`);
                const tempEditRow = document.getElementById(`edit-row-${tempId}`);
                if (tempMainRow) tempMainRow.remove();
                if (tempEditRow) { ConciliacaoUIForm.destroyPasteAnexo(tempId); tempEditRow.remove(); }
            }

            const existingMainRow = document.getElementById(`row-${id}`);
            const existingEditRow = document.getElementById(`edit-row-${id}`);

            if (existingMainRow) {
                const newHtml = ConciliacaoUITable.buildTableRow(r);
                const wrapper = document.createElement('tbody');
                wrapper.innerHTML = newHtml;
                existingMainRow.outerHTML = wrapper.querySelector(`#row-${id}`)?.outerHTML || existingMainRow.outerHTML;
                if (existingEditRow) {
                    ConciliacaoUIForm.destroyPasteAnexo(id);
                    existingEditRow.outerHTML = wrapper.querySelector(`#edit-row-${id}`)?.outerHTML || existingEditRow.outerHTML;
                }
            } else {
                const tbody = document.getElementById('tbodyConciliacao');
                if (tbody) {
                    if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
                    tbody.insertAdjacentHTML('afterbegin', ConciliacaoUITable.buildTableRow(r));
                }
            }

            ConciliacaoUITypeahead.initForRow(id);
            $(`#row-${id} [data-bs-toggle="popover"]`).popover();

            const info  = document.getElementById('conciliacaoInfo');
            const tbody = document.getElementById('tbodyConciliacao');
            if (info && tbody) {
                const count = tbody.querySelectorAll('.main-row').length;
                info.textContent = `Mostrando ${count} registros`;
            }

            setTimeout(() => {
                const el = document.getElementById(`row-${id}`);
                if (el) el._rowData = r;
            }, 0);

        } catch (e) {
            console.warn('[Conciliacao] _refreshSingleRow erro, recarregando tabela.', e);
            this.loadData();
        }
    },

    // ── Update de campo inline ────────────────────────────────────────────────
    updateField: async function(id, field, value) {
        if (!this._canEdit()) return;
        try {
            const json = await ConciliacaoAPI.update({ id, [field]: value });
            if (json.status !== 'success') ConciliacaoUISetup.notify(json.message || 'Erro ao atualizar', 'error');
        } catch (e) { ConciliacaoUISetup.notify('Erro de conexão', 'error'); }
    },

    // ── Aprovar (Concluir) ────────────────────────────────────────────────────
    approveRow: async function(id, btnEl) {
        ConciliacaoUITable._iconLoading(btnEl);
        try {
            const json = await ConciliacaoAPI.approve(id);
            if (json.status === 'success') {
                ConciliacaoUISetup.notify('Registro concluído!', 'success');
                ConciliacaoUITable.refreshStatusBadge(id, 1, 0);
                ConciliacaoUITable.refreshActionCell(id, 1, 0);
                ConciliacaoUITable.refreshStatusIcon(id, 1, 0);
            } else {
                ConciliacaoUISetup.notify(json.message || 'Erro ao concluir', 'error');
                ConciliacaoUITable._iconRestore(btnEl, 'ph-checks', 'Marcar como Concluído');
            }
        } catch (e) {
            ConciliacaoUISetup.notify('Erro de conexão', 'error');
            ConciliacaoUITable._iconRestore(btnEl, 'ph-checks', 'Marcar como Concluído');
        }
    },

    // ── Desaprovar (Reabrir) ──────────────────────────────────────────────────
    unapproveRow: async function(id, btnEl) {
        ConciliacaoUITable._iconLoading(btnEl);
        try {
            const json = await ConciliacaoAPI.unapprove(id);
            if (json.status === 'success') {
                ConciliacaoUISetup.notify('Conclusão revertida.', 'success');
                ConciliacaoUITable.refreshStatusBadge(id, 0, 0);
                ConciliacaoUITable.refreshActionCell(id, 0, 0);
                ConciliacaoUITable.refreshStatusIcon(id, 0, 0);
            } else {
                ConciliacaoUISetup.notify(json.message || 'Erro ao reverter conclusão', 'error');
                ConciliacaoUITable._iconRestore(btnEl, 'ph-arrow-u-up-left', 'Reabrir (Desconcluir)');
            }
        } catch (e) {
            ConciliacaoUISetup.notify('Erro de conexão', 'error');
            ConciliacaoUITable._iconRestore(btnEl, 'ph-arrow-u-up-left', 'Reabrir (Desconcluir)');
        }
    },

    finalizeRow: function(id, btnEl) {
        const rowEl = document.getElementById(`row-${id}`);
        if (!rowEl || !rowEl._rowData) return;
        const r = rowEl._rowData;

        // Descobre empresa para listar contas
        let cnpjEmpresa = null;
        if (r.empresa) {
            if (String(r.empresa).trim().startsWith('{')) {
                try { cnpjEmpresa = JSON.parse(r.empresa).cnpj; } catch(e){}
            } else {
                const empObj = this.empresas.find(e => e.id == r.empresa);
                if (empObj) cnpjEmpresa = empObj.cnpj;
            }
        }
        const empresaObj = this.empresas.find(e => e.cnpj === cnpjEmpresa);
        
        if (!empresaObj) { ConciliacaoUISetup.notify('Empresa inválida.', 'error'); return; }
        if (!empresaObj.contas || empresaObj.contas.length === 0) {
            ConciliacaoUISetup.notify('Empresa sem contas cadastradas.', 'warning'); return;
        }

        this._openFinalizeModal(id, empresaObj);
    },


    _openFinalizeModal: function(id, empresaObj) {
        const rowEl = document.getElementById(`row-${id}`);
        const r = rowEl._rowData;
        const parcelas = r.parcelas || [];
        const baixasAtivas = (r.baixas || []).filter(b => !b.estornado_em);
        const isParcelado = parcelas.length > 0;
        const titulo = isParcelado ? 'Gerenciar Pagamento de Parcelas' : 'Baixar Pagamento Único';
        const hoje = moment().format('DD/MM/YYYY');

        // Gera options das contas
        const contasOpts = empresaObj.contas.map(c => {
            const label = `${c.banco_nome} - Ag ${c.agencia} Cc ${c.conta} ${c.conta_padrao == 1 ? '(Padrão)' : ''}`;
            return `<option value="${c.banco_id}|${c.conta}" ${c.conta_padrao == 1 ? 'selected' : ''}>${label}</option>`;
        }).join('');

        let htmlCorpo = '';

        if (isParcelado) {
            const rows = parcelas.map((p, idx) => {
                const valorFmt = parseFloat(p.valor || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
                const vencFmt  = ConciliacaoUtils.toDisplayDate(p.data_vencimento);
                const estaPago = baixasAtivas.find(b => b.indice == idx);
                const checked  = estaPago ? 'checked' : '';
                
                // Se já pago, mostra data fixa. Se não, input editável com data de hoje.
                let dateInput = '';
                if (estaPago) {
                    const dataPaga = moment(estaPago.data_baixa).format('DD/MM/YYYY');
                    dateInput = `<span class="text-success text-xs fw-bold"><i class="ph-check me-1"></i>${dataPaga}</span>
                                 <input type="hidden" class="input-data-baixa" value="${dataPaga}">`; // Hidden pra manter lógica
                } else {
                    dateInput = `<input type="text" class="form-control form-control-sm input-data-baixa datepicker-sm" 
                                        style="width:105px;" value="${hoje}" placeholder="DD/MM/YYYY">`;
                }

                return `
                <tr data-idx="${idx}">
                    <td class="text-center align-middle">
                        <input class="form-check-input chk-parcela-baixa" type="checkbox" value="${idx}" ${checked}>
                    </td>
                    <td class="text-xs align-middle text-center">${idx + 1}ª</td>
                    <td class="text-xs align-middle">${vencFmt}</td>
                    <td class="text-xs fw-bold align-middle">${valorFmt}</td>
                    <td class="align-middle">${dateInput}</td>
                </tr>`;
            }).join('');

            htmlCorpo = `
            <div class="mb-3 border rounded p-0 bg-white">
                <div class="bg-light px-2 py-1 border-bottom d-flex justify-content-between align-items-center">
                    <span class="text-xs fw-bold text-primary">Selecione para baixar:</span>
                    <small class="text-muted" style="font-size:10px;">Desmarque para estornar</small>
                </div>
                <div class="table-responsive" style="max-height: 250px; overflow-y: auto;">
                    <table class="table table-sm table-hover mb-0 align-middle">
                        <thead class="sticky-top bg-light text-muted text-xs">
                            <tr>
                                <th class="text-center" style="width:30px;"></th>
                                <th class="text-center" style="width:30px;">#</th>
                                <th>Venc.</th>
                                <th>Valor</th>
                                <th>Data Baixa</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
        } else {
            // Pagamento Único
            htmlCorpo = `
            <div class="mb-3">
                <label class="form-label text-xs fw-bold">Data da Baixa</label>
                <div class="input-group input-group-sm">
                    <span class="input-group-text"><i class="ph-calendar"></i></span>
                    <input type="text" class="form-control datepicker-sm" id="baixa_data_unica" value="${hoje}">
                </div>
            </div>`;
        }

        const modalId = 'modalBaixa';
        const old = document.getElementById(modalId);
        if (old) old.remove();

        const html = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog ${isParcelado ? 'modal-lg' : 'modal-sm'} modal-dialog-centered">
                <div class="modal-content shadow-lg">
                    <div class="modal-header bg-success text-white py-2">
                        <h6 class="modal-title fs-6"><i class="ph-coins me-2"></i>${titulo}</h6>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body pb-0">
                        <div class="mb-3">
                            <label class="form-label text-xs fw-bold text-muted text-uppercase">Conta de Saída (Global)</label>
                            <select class="form-select form-select-sm" id="baixa_conta_global">${contasOpts}</select>
                        </div>
                        ${htmlCorpo}
                    </div>
                    <div class="modal-footer py-2 bg-light">
                        <button type="button" class="btn btn-light btn-sm" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-success btn-sm fw-bold px-3" onclick="ConciliacaoMain._confirmFinalize('${id}', ${isParcelado})">
                            <i class="ph-check me-1"></i> Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        
        // Inicializa DatePickers
        if ($.fn.daterangepicker) {
            $('.datepicker-sm').daterangepicker({
                singleDatePicker: true, autoApply: true,
                locale: { format: 'DD/MM/YYYY', daysOfWeek: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'], monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] }
            });
        }
        new bootstrap.Modal(document.getElementById(modalId)).show();
    },



    // ── Finalizar (Marcar Pago) - Abre Modal ────────────────────────────────
    finalizeRow: function(id, btnEl) {
        // 1. Encontra os dados da linha
        const rowEl = document.getElementById(`row-${id}`);
        if (!rowEl || !rowEl._rowData) {
            ConciliacaoUISetup.notify('Erro ao localizar dados da linha. Tente recarregar.', 'error');
            return;
        }
        const r = rowEl._rowData;

        // 2. Descobre a empresa selecionada para listar as contas
        let cnpjEmpresa = null;
        if (r.empresa) {
            if (String(r.empresa).trim().startsWith('{')) {
                try { cnpjEmpresa = JSON.parse(r.empresa).cnpj; } catch(e){}
            } else {
                // Tenta achar pelo ID legado (número inteiro)
                const empObj = this.empresas.find(e => e.id == r.empresa);
                if (empObj) cnpjEmpresa = empObj.cnpj;
            }
        }

        // 3. Encontra o objeto empresa na lista global
        const empresaObj = this.empresas.find(e => e.cnpj === cnpjEmpresa);
        
        if (!empresaObj) {
            ConciliacaoUISetup.notify('Selecione uma empresa válida (Pagador) antes de dar baixa.', 'warning');
            return;
        }

        if (!empresaObj.contas || empresaObj.contas.length === 0) {
            ConciliacaoUISetup.notify(`A empresa "${empresaObj.nome}" não possui contas bancárias cadastradas no sistema.`, 'warning');
            return;
        }

        // 4. Abre o Modal
        this._openFinalizeModal(id, empresaObj);
    },

    // ── Desfinalizar (Reverter) ─────────────────────────────────────────────
    unfinalizeRow: async function(id, btnEl) {
        const rowEl = document.getElementById(`row-${id}`);
        const r = rowEl._rowData;
        const parcelas = r.parcelas || [];
        
        // SE FOR PARCELADO: Abre o mesmo modal de baixa para o usuário desmarcar
        if (parcelas.length > 0) {
            this.finalizeRow(id, btnEl); 
            return;
        }

        // SE FOR PAGAMENTO ÚNICO: Estorna direto
        if (!confirm('Deseja realmente estornar este pagamento único?')) return;

        ConciliacaoUITable._iconLoading(btnEl);
        try {
            const json = await ConciliacaoAPI.unfinalize(id);
            if (json.status === 'success') {
                ConciliacaoUISetup.notify('Pagamento estornado.', 'success');
                
                if(rowEl._rowData) {
                    rowEl._rowData.finalizado = 0;
                    rowEl._rowData.baixas = [];
                }

                ConciliacaoUITable.refreshStatusBadge(id, 0, 0);
                ConciliacaoUITable.refreshActionCell(id, 0, 0);
                ConciliacaoUITable.refreshStatusIcon(id, 0, 0);
            } else {
                ConciliacaoUISetup.notify(json.message || 'Erro', 'error');
                ConciliacaoUITable._iconRestore(btnEl, 'ph-arrow-counter-clockwise', 'Desmarcar Pago');
            }
        } catch (e) {
            ConciliacaoUISetup.notify('Erro de conexão', 'error');
            ConciliacaoUITable._iconRestore(btnEl, 'ph-arrow-counter-clockwise', 'Desmarcar Pago');
        }
    },

    // ── Monta e Exibe o Modal de Baixa ──────────────────────────────────────
    _openFinalizeModal: function(id, empresaObj) {
        const rowEl = document.getElementById(`row-${id}`);
        const r = rowEl._rowData;
        const parcelas = r.parcelas || [];
        const baixasAtivas = (r.baixas || []).filter(b => !b.estornado_em);
        const isParcelado = parcelas.length > 0;
        const titulo = isParcelado ? 'Gerenciar Pagamento de Parcelas' : 'Baixar Pagamento Único';
        const hoje = moment().format('DD/MM/YYYY');

        // Gera options das contas
        const contasOpts = empresaObj.contas.map(c => {
            const label = `${c.banco_nome} - Ag ${c.agencia} Cc ${c.conta} ${c.conta_padrao == 1 ? '(Padrão)' : ''}`;
            return `<option value="${c.banco_id}|${c.conta}" ${c.conta_padrao == 1 ? 'selected' : ''}>${label}</option>`;
        }).join('');

        let htmlCorpo = '';
        const modalSizeClass = isParcelado ? 'modal-lg' : 'modal-sm';

        if (isParcelado) {
            const rows = parcelas.map((p, idx) => {
                const valorFmt = parseFloat(p.valor || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
                const vencFmt  = ConciliacaoUtils.toDisplayDate(p.data_vencimento);
                const estaPago = baixasAtivas.find(b => b.indice == idx);
                const checked  = estaPago ? 'checked' : '';
                
                const statusHtml = estaPago 
                    ? `<span class="badge bg-success text-xs"><i class="ph-check me-1"></i>Pago</span>`
                    : `<span class="badge bg-warning text-dark text-xs">Pendente</span>`;

                let dateInputHtml = '';
                if (estaPago) {
                    const dataPaga = moment(estaPago.data_baixa).format('DD/MM/YYYY');
                    dateInputHtml = `<span class="text-success text-xs fw-bold">${dataPaga}</span>
                                     <input type="hidden" class="input-data-baixa" value="${dataPaga}">`;
                } else {
                    dateInputHtml = `<input type="text" class="form-control form-control-sm text-center input-data-baixa datepicker-sm" 
                                           value="${hoje}" placeholder="__/__/____" style="max-width: 100px;">`;
                }

                return `
                <tr data-idx="${idx}">
                    <td class="text-center align-middle">
                        <input class="form-check-input chk-parcela-baixa" type="checkbox" value="${idx}" ${checked}>
                    </td>
                    <td class="text-center text-xs align-middle text-muted">${idx + 1}</td>
                    <td class="text-center text-xs align-middle">${vencFmt}</td>
                    <td class="text-end text-xs fw-bold align-middle text-dark">${valorFmt}</td>
                    <td class="text-center align-middle">${statusHtml}</td>
                    <td class="text-center align-middle">${dateInputHtml}</td>
                </tr>`;
            }).join('');

            htmlCorpo = `
            <div class="mb-3 border rounded p-0 bg-white">
                <div class="bg-light px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
                    <span class="text-sm fw-bold text-primary">Selecione as parcelas:</span>
                    <small class="text-muted text-xs">Desmarque para estornar</small>
                </div>
                <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                    <table class="table table-sm table-hover mb-0 align-middle">
                        <thead class="sticky-top bg-light text-muted text-xs border-bottom">
                            <tr>
                                <th class="text-center" style="width:30px;"></th>
                                <th class="text-center" style="width:30px;">#</th>
                                <th class="text-center">Venc.</th>
                                <th class="text-end">Valor</th>
                                <th class="text-center">Status</th>
                                <th class="text-center">Data Baixa</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
        } else {
            // Pagamento Único
            htmlCorpo = `
            <div class="mb-3">
                <label class="form-label text-xs fw-bold">Data da Baixa</label>
                <div class="input-group input-group-sm">
                    <span class="input-group-text"><i class="ph-calendar"></i></span>
                    <input type="text" class="form-control datepicker-sm" id="baixa_data_unica" value="${hoje}">
                </div>
            </div>`;
        }

        const modalId = 'modalBaixa';
        const old = document.getElementById(modalId);
        if (old) old.remove();

        const html = `
        <div class="modal fade" id="${modalId}" tabindex="-1">
            <div class="modal-dialog ${modalSizeClass} modal-dialog-centered">
                <div class="modal-content shadow-lg">
                    <div class="modal-header bg-success text-white py-2">
                        <h6 class="modal-title fs-6"><i class="ph-coins me-2"></i>${titulo}</h6>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body pb-0">
                        <div class="mb-3 p-2 bg-soft-success rounded border border-success border-opacity-25">
                            <label class="form-label text-xs fw-bold text-success text-uppercase mb-1">Conta de Saída (Global)</label>
                            <select class="form-select form-select-sm border-success border-opacity-25" id="baixa_conta_global">${contasOpts}</select>
                        </div>
                        ${htmlCorpo}
                    </div>
                    <div class="modal-footer py-2 bg-light">
                        <button type="button" class="btn btn-light btn-sm" data-bs-dismiss="modal">Cancelar</button>
                        <button type="button" class="btn btn-success btn-sm fw-bold px-4" onclick="ConciliacaoMain._confirmFinalize('${id}', ${isParcelado})">
                            <i class="ph-check me-1"></i> Salvar
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        
        if ($.fn.daterangepicker) {
            $('.datepicker-sm').daterangepicker({
                singleDatePicker: true, autoApply: true, opens: 'left',
                locale: { format: 'DD/MM/YYYY', daysOfWeek: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'], monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'] }
            });
        }
        new bootstrap.Modal(document.getElementById(modalId)).show();
    },

    // ── Confirmação e Envio (Corrigido IDs) ─────────────────────────────────
    _confirmFinalize: async function(id, isParcelado) {
        const btn = document.querySelector(`#modalBaixa .btn-success`);
        if(btn) btn.disabled = true;

        // CORREÇÃO: Usa o ID correto gerado pelo modal (_openFinalizeModal)
        const contaVal = document.getElementById('baixa_conta_global').value;
        const [banco_id, banco_conta] = contaVal.split('|');
        
        let baixasDetalhes = []; 

        if (isParcelado) {
            const rows = document.querySelectorAll('#modalBaixa tbody tr');
            rows.forEach(tr => {
                const chk = tr.querySelector('.chk-parcela-baixa');
                if (chk && chk.checked) {
                    const idx = parseInt(chk.value);
                    const dateInput = tr.querySelector('.input-data-baixa');
                    const rawDate = dateInput ? dateInput.value : moment().format('DD/MM/YYYY');
                    
                    baixasDetalhes.push({
                        indice: idx,
                        data_baixa: ConciliacaoUtils.toIsoDate(rawDate)
                    });
                }
            });
        } else {
            // Pagamento Único: usa o ID específico de data única
            const dateVal = document.getElementById('baixa_data_unica').value;
            baixasDetalhes.push({
                indice: -1,
                data_baixa: ConciliacaoUtils.toIsoDate(dateVal)
            });
        }

        try {
            const json = await ConciliacaoAPI.finalize(id, {
                banco_id, 
                banco_conta, 
                baixas_detalhes: baixasDetalhes
            });

            if (json.status === 'success') {
                ConciliacaoUISetup.notify('Salvo com sucesso!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('modalBaixa')).hide();

                const rowEl = document.getElementById(`row-${id}`);
                if(rowEl && rowEl._rowData) {
                    rowEl._rowData.finalizado = json.finalizado;
                    rowEl._rowData.baixas = json.baixas;
                    
                    if (json.baixas.length > 0) {
                        const ultima = json.baixas.filter(b => !b.estornado_em).pop();
                        if (ultima) {
                            rowEl._rowData.banco_id = ultima.banco_id;
                            rowEl._rowData.banco_conta = ultima.banco_conta;
                            rowEl._rowData.data_baixa = ultima.data_baixa;
                        }
                    }
                }

                ConciliacaoUITable.refreshStatusBadge(id, 0, json.finalizado); 
                ConciliacaoUITable.refreshActionCell(id, 0, json.finalizado); 
                ConciliacaoUITable.refreshStatusIcon(id, 0, json.finalizado);

            } else {
                ConciliacaoUISetup.notify(json.message, 'error');
                if(btn) btn.disabled = false;
            }
        } catch (e) {
            console.error(e);
            ConciliacaoUISetup.notify('Erro de conexão', 'error');
            if(btn) btn.disabled = false;
        }
    },

    // ── Excluir ───────────────────────────────────────────────────────────────
    deleteRow: async function(id, btnEl) {
        if (!confirm('Deseja excluir este registro permanentemente?')) return;
        if (!this._canEdit() && !this.currentUser.isAdmin) {
            ConciliacaoUISetup.notify('Sem permissão para excluir.', 'error');
            return;
        }
        ConciliacaoUITable._iconLoading(btnEl);
        try {
            const json = await ConciliacaoAPI.delete(id);
            if (json.status === 'success') {
                ConciliacaoUISetup.notify('Registro excluído!', 'success');
                const mainRow = document.getElementById(`row-${id}`);
                const editRow = document.getElementById(`edit-row-${id}`);
                if (mainRow) mainRow.remove();
                if (editRow) { ConciliacaoUIForm.destroyPasteAnexo(id); editRow.remove(); }
                
                const tbody = document.getElementById('tbodyConciliacao');
                const info  = document.getElementById('conciliacaoInfo');
                if (tbody) {
                    const count = tbody.querySelectorAll('.main-row').length;
                    if (info) info.textContent = `Mostrando ${count} registros`;
                    if (count === 0) tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Nenhum registro encontrado.</td></tr>';
                }
            } else {
                ConciliacaoUISetup.notify(json.message || 'Erro ao excluir', 'error');
                ConciliacaoUITable._iconRestore(btnEl, 'ph-trash', 'Excluir');
            }
        } catch (e) {
            ConciliacaoUISetup.notify('Erro de conexão', 'error');
            ConciliacaoUITable._iconRestore(btnEl, 'ph-trash', 'Excluir');
        }
    },

    _esc: function(s) { return ConciliacaoUtils.esc(s); },
    _toDisplayDate: function(v) { return ConciliacaoUtils.toDisplayDate(v); }
};