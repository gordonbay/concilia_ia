/**
 * ConciliacaoUtils — Utilitários puros e compartilhados
 * Responsabilidade: helpers sem dependência de DOM ou estado global.
 */
var ConciliacaoUtils = {

    /**
     * Escapa HTML para exibição segura.
     */
    esc: function(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;');
    },

    /**
     * Converte qualquer formato de data para DD/MM/YYYY.
     * Suporta YYYY-MM-DD (ISO backend) e DD/MM/YYYY.
     */
    toDisplayDate: function(val) {
        if (!val) return '';
        let m = moment(val, 'YYYY-MM-DD', true);
        if (m.isValid()) return m.format('DD/MM/YYYY');
        m = moment(val, 'DD/MM/YYYY', true);
        if (m.isValid()) return m.format('DD/MM/YYYY');
        m = moment(val);
        return m.isValid() ? m.format('DD/MM/YYYY') : '';
    },

    /**
     * Converte DD/MM/YYYY para YYYY-MM-DD (formato ISO para o backend).
     * Retorna null se inválido.
     */
    toIsoDate: function(val) {
        if (!val || val.length !== 10) return null;
        const iso = moment(val, 'DD/MM/YYYY').format('YYYY-MM-DD');
        return iso === 'Invalid date' ? null : iso;
    },

    /**
     * Conta quantas soluções IA têm confiança suficiente (>= 50%).
     * Atualizado para usar tipo_documento e dados_fiscais como objeto (não mais is_nota_fiscal).
     */
    contarSolucoes: function(sol) {
        let c = 0;
        const tomador   = sol?.solucao_geral?.tomador_servico  || {};
        const prestador = sol?.solucao_geral?.prestador_servico || {};
        const conf      = sol?.solucao_geral?.confianca || 0;

        if ((tomador.empresa_id || prestador.nome || sol?.solucao_geral?.empresa_id) && conf >= 0.5) c++;
        (sol?.solucao_financeira || []).forEach(sf => { if ((sf.confianca || 0) >= 0.5) c++; });

        // Conta dados fiscais se presente (NFS ou NFE — quando dados_fiscais não é null)
        if (sol?.dados_fiscais !== null && sol?.dados_fiscais !== undefined &&
            (sol.dados_fiscais.numero || sol.dados_fiscais.chave_acesso)) {
            c++;
        }

        if (sol?.solucao_fatura?.ativar_fatura && (sol.solucao_fatura.confianca || 0) >= 0.5) c++;
        return c;
    },

    /**
     * Retorna a classe de badge Bootstrap conforme nível de confiança (0–100).
     */
    confBadgeClass: function(conf) {
        if (conf >= 70) return 'bg-success';
        if (conf >= 40) return 'bg-warning text-dark';
        return 'bg-secondary';
    }
};