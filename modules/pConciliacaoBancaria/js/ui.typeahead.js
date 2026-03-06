/**
 * ConciliacaoUITypeahead — Inicialização do Typeahead.js
 * Responsabilidade: configurar Bloodhound engines e bindings para:
 *   - Natureza financeira (campos principais e itens de fatura)
 *   - Bancos (campo de transferência)
 * Depende de: Bloodhound/Typeahead (Twitter), jQuery, ConciliacaoMain
 */
var ConciliacaoUITypeahead = {

    initAll: function() {
        document.querySelectorAll('.main-row').forEach(row => {
            this.initForRow(row.id.replace('row-', ''));
        });
        $('[data-bs-toggle="popover"]').popover();
    },

    initForRow: function(id) {
        const userToken = localStorage.getItem('token') || '';

        const naturezaEngine = this._buildNaturezaEngine(userToken);
        const banksEngine    = this._buildBanksEngine(userToken);

        const editRow = $(`#edit-row-${id}`);
        if (!editRow.length) return;

        this._bindNaturezaMain(editRow, id, naturezaEngine);
        this._bindBancos(editRow, id, banksEngine);
        this.initForFaturaItems(editRow, naturezaEngine);
    },

    initForFaturaItems: function(container, engine) {
        if (!engine) {
            engine = this._buildNaturezaEngine(localStorage.getItem('token') || '');
        }

        $(container).find('.typeahead-fatura-nat:not(.tt-input)').typeahead({
            hint: true, highlight: true, minLength: 1
        }, {
            name: 'naturezas-fatura',
            display: 'text',
            limit: 30, // ALTERADO: Limite aumentado para 30
            source: engine.ttAdapter(),
            templates: {
                suggestion: function(data) {
                    const instr = data.instrucoes 
                        ? `<div class="text-xs text-muted text-wrap mt-1" style="font-size:11px; line-height:1.2;"><i class="ph-info me-1"></i>${data.instrucoes}</div>` 
                        : '';
                    
                    return `<div class="p-2 border-bottom">
                                <div class="fw-semibold text-dark text-sm">${data.text}</div>
                                ${instr}
                            </div>`;
                }
            }
        }).bind('typeahead:select', function(ev, suggestion) {
            $(this).closest('.position-relative').find('.fatura-nat-hidden').val(suggestion.id);
        }).bind('input clear', function() {
            if ($(this).val().trim() === '') {
                $(this).closest('.position-relative').find('.fatura-nat-hidden').val('');
            }
        });
    },

    // ── Builders de Engine ────────────────────────────────────────────────────
    _buildNaturezaEngine: function(userToken) {
        const engine = new Bloodhound({
            datumTokenizer: Bloodhound.tokenizers.obj.whitespace('text'),
            queryTokenizer: Bloodhound.tokenizers.whitespace,
            remote: {
                url: `modules/pConciliacaoBancaria/api/search_natureza.php?q=%QUERY&token=${userToken}`,
                wildcard: '%QUERY',
                transform: function(response) { return response.items || []; }
            }
        });
        engine.initialize();
        return engine;
    },

    _buildBanksEngine: function(userToken) {
        const engine = new Bloodhound({
            datumTokenizer: Bloodhound.tokenizers.obj.whitespace('text'),
            queryTokenizer: Bloodhound.tokenizers.whitespace,
            identify: function(obj) { return obj.id; },
            remote: {
                url: `modules/pConciliacaoBancaria/api/search_banks.php?q=%QUERY&token=${encodeURIComponent(userToken)}`,
                wildcard: '%QUERY',
                cache: false,
                transform: function(response) { return response && response.items ? response.items : []; }
            }
        });
        engine.initialize();
        return engine;
    },

    // ── Bindings ──────────────────────────────────────────────────────────────
    _bindNaturezaMain: function(editRow, id, engine) {
        editRow.find('.typeahead-main-nat:not(.tt-input)').typeahead({
            hint: true, highlight: true, minLength: 1
        }, {
            name: 'naturezas',
            display: 'text',
            limit: 30, // ALTERADO: Limite aumentado para 30
            source: engine.ttAdapter(),
            templates: {
                empty: '<div class="p-2 text-muted text-xs">Nenhuma natureza encontrada</div>',
                suggestion: function(data) {
                    const instr = data.instrucoes 
                        ? `<div class="text-xs text-muted text-wrap mt-1" style="font-size:11px; line-height:1.2;"><i class="ph-info me-1"></i>${data.instrucoes}</div>` 
                        : '';
                    
                    return `<div class="p-2 border-bottom">
                                <div class="fw-semibold text-dark text-sm">${data.text}</div>
                                ${instr}
                            </div>`;
                }
            }
        }).bind('typeahead:select', function(ev, suggestion) {
            $(this).closest('.position-relative').find('input[type="hidden"]').val(suggestion.id);
            if (!id.toString().startsWith('new_')) {
                ConciliacaoMain.updateField(id, 'natureza_financeira', suggestion.id);
            }
        }).bind('input clear', function() {
            if ($(this).val().trim() === '') {
                $(this).closest('.position-relative').find('input[type="hidden"]').val('');
                if (!id.toString().startsWith('new_')) {
                    ConciliacaoMain.updateField(id, 'natureza_financeira', null);
                }
            }
        });
    },

    _bindBancos: function(editRow, id, engine) {
        editRow.find('.typeahead-banco:not(.tt-input)').typeahead({
            hint: true, highlight: true, minLength: 1
        }, {
            name: 'bancos',
            display: 'text',
            limit: 20,
            source: engine.ttAdapter(),
            templates: {
                empty: '<div class="p-2 text-muted text-xs text-danger">Banco não encontrado</div>',
                suggestion: function(data) {
                    return `<div><strong>${data.id}</strong> - ${data.text.replace(data.id + ' - ', '')}</div>`;
                }
            }
        }).bind('typeahead:select', function(ev, suggestion) {
            $(this).val(suggestion.text);
            $(this).closest('.position-relative').find('input[type="hidden"]').val(suggestion.id);
            $(this).removeClass('is-invalid');
        }).bind('input', function() {
            $(this).closest('.position-relative').find('input[type="hidden"]').val($(this).val());
        });

        // Validação inicial dos campos já preenchidos
        editRow.find('.typeahead-banco').each(function() {
            if (ConciliacaoMain.validateBankField) ConciliacaoMain.validateBankField(id, this);
        });
    }
};