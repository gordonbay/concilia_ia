/**
 * ConciliacaoUISetup — Inicialização de componentes de UI reutilizáveis
 * Responsabilidade: date range picker, injeção do menu de bancos, notify.
 * Depende de: jQuery, moment, Bootstrap
 */
var ConciliacaoUISetup = {

    notify: function(text, type = 'success') {
        new Noty({ text, type, timeout: 2000, layout: 'bottomRight' }).show();
    },

    setupDateRange: function(onApply) {
        const start = moment().subtract(29, 'days');
        const end   = moment();
        $('#dateRangeConciliacao span').html(start.format('DD/MM/YYYY') + ' - ' + end.format('DD/MM/YYYY'));

        if ($.fn.daterangepicker) {
            $('#dateRangeConciliacao').daterangepicker({
                startDate: start,
                endDate:   end,
                ranges: {
                    'Hoje':           [moment(), moment()],
                    'Ontem':          [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                    'Últimos 7 Dias': [moment().subtract(6, 'days'), moment()],
                    'Últimos 30 Dias':[moment().subtract(29, 'days'), moment()],
                    'Este Mês':       [moment().startOf('month'), moment().endOf('month')],
                    'Mês Passado':    [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
                },
                locale: {
                    format: 'DD/MM/YYYY',
                    applyLabel: 'Aplicar',
                    cancelLabel: 'Cancelar',
                    customRangeLabel: 'Customizado',
                    daysOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
                    monthNames: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
                }
            }, function(s, e) {
                $('#dateRangeConciliacao span').html(s.format('DD/MM/YYYY') + ' - ' + e.format('DD/MM/YYYY'));
                onApply(s.format('YYYY-MM-DD'), e.format('YYYY-MM-DD'));
            });
        }

        return { start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') };
    },

    injectBankUpdateMenu: function() {
        const headerBtns = document.querySelector('.d-flex.align-items-center.gap-2.flex-wrap');
        if (headerBtns && !document.getElementById('btnUpdateBanks')) {
            headerBtns.insertAdjacentHTML('beforeend', `
                <div class="dropdown d-inline-block ms-1" id="btnUpdateBanks">
                    <button class="btn btn-light btn-sm btn-icon rounded-pill border-transparent" type="button" data-bs-toggle="dropdown">
                        <i class="ph-gear"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li><a class="dropdown-item" href="#" onclick="ConciliacaoUIExport.exportCurrent()">
                            <i class="ph-file-xls me-2"></i>Exportar XLS (Lista Atual)
                        </a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item" href="#" onclick="ConciliacaoMain.updateBanksJson()">
                            <i class="ph-bank me-2"></i>Atualizar Json Bancário
                        </a></li>
                    </ul>
                </div>`);
        }
    }
};