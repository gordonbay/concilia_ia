/**
 * ConciliacaoAPI — Comunicação com o backend
 * Responsabilidade única: fetch/HTTP para todos os endpoints do módulo.
 */
var ConciliacaoAPI = {

    _fetch: async function(url, options = {}) {
        const defaults = {
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token'),
                ...options.headers
            }
        };
        return fetch(url, { ...options, ...defaults, headers: { ...defaults.headers, ...options.headers } });
    },

    /**
     * getData - Busca dados filtrados
     * Alterado para aceitar objeto de filtros extras (status, usuario, operação, etc)
     */
    getData: async function(startDate, endDate, filters = {}) {
        // Constrói QueryString com datas obrigatórias + filtros opcionais
        const params = new URLSearchParams({
            start: startDate,
            end: endDate,
            ...filters
        });
        
        const url = `modules/pConciliacaoBancaria/api/get.php?${params.toString()}`;
        const resp = await this._fetch(url);
        return resp.json();
    },

    /**
     * getOne - Busca um único registro (usado para refresh após salvar)
     * Novo método necessário para não perder os filtros da tabela ao editar um item.
     */
    getOne: async function(id) {
        // Busca com range amplo para garantir que o registro venha, filtrando pelo ID
        const url = `modules/pConciliacaoBancaria/api/get.php?id=${id}&start=2000-01-01&end=2099-12-31`;
        const resp = await this._fetch(url);
        const json = await resp.json();
        
        // O backend retorna uma lista, pegamos o item específico
        if (json.status === 'success' && Array.isArray(json.data)) {
            const item = json.data.find(r => r.id == id) || json.data[0];
            return { status: 'success', data: item };
        }
        return json;
    },

    getNaturezas: async function() {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/get_all_naturezas.php');
        return resp.json();
    },

    create: async function(payload) {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/create.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return resp.json();
    },

    update: async function(payload) {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/update.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return resp.json();
    },

    // ALTERADO: Agora aceita um objeto 'data' opcional com banco_id, conta e data_baixa
    finalize: async function(id, data = {}) {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/finalize.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ...data }) 
        });
        return resp.json();
    },

    unfinalize: async function(id) {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/unfinalize.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        return resp.json();
    },

    approve: async function(id) {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/approve.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        return resp.json();
    },

    unapprove: async function(id) {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/unapprove.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        return resp.json();
    },

    delete: async function(id) {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/delete.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        return resp.json();
    },

    analyzeAnexo: async function(formData) {
        return fetch('modules/pConciliacaoBancaria/api/analyze_anexo.php', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: formData
        });
    },

    /**
     * analyzeMestre — Consolida soluções de múltiplos anexos via IA.
     * Chama diretamente o proxy Python /analyze_master.
     * @param {Array} anexos — array de objetos anexo (com .solucoes_ia)
     */
    analyzeMestre: async function(anexos) {
        const empresas = (window._empresasCache || []).map(e => ({
            id:   e.id,
            nome: e.nome,
            cnpj: e.cnpj || ''
        }));

        return fetch('http://127.0.0.1:8080/analyze_master', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({
                anexos_ia: anexos.map(a => a.solucoes_ia || a),
                empresas:  JSON.stringify(empresas)
            })
        }).then(r => r.json());
    },

    updateBanks: async function() {
        const resp = await this._fetch('modules/pConciliacaoBancaria/api/update_banks.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        return resp.json();
    }
};