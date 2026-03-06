-- =============================================================================
-- MA Projetos — Schema MySQL
-- Database : kaisan_beta
-- Módulos  : Autenticação / Usuários + pConciliacaoBancaria
-- MySQL    : 8.0+ / 8.4 LTS  |  utf8mb4_unicode_ci
--
-- Uso:
--   mysql -u root -p < kaisan_beta_schema.sql
--
-- Idempotente: pode ser re-executado sem perda de dados.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `kaisan_beta`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `kaisan_beta`;

SET time_zone            = '-03:00';
SET FOREIGN_KEY_CHECKS   = 0;
SET sql_mode             = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =============================================================================
-- 1. AUTENTICAÇÃO E USUÁRIOS
-- Banco "global" no sistema original → unificado em kaisan_beta
-- Consultado em: api/auth.php, api/load-module.php e todos os módulos PHP
--   SELECT id, permissoes FROM usuarios WHERE token = ?
--   UPDATE usuarios SET ultimovisto = ? WHERE id = ?
--   SELECT * FROM usuarios WHERE token = ?
-- =============================================================================

CREATE TABLE IF NOT EXISTS `usuarios` (
    `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT,

    -- Credenciais
    `username`      VARCHAR(50)   NOT NULL                       COMMENT 'Login único',
    `password`      VARCHAR(255)  NOT NULL                       COMMENT 'Hash bcrypt',
    `token`         VARCHAR(512)  DEFAULT NULL                   COMMENT 'JWT de sessão ativo',

    -- Perfil
    `nome`          VARCHAR(100)  NOT NULL,
    `sobrenome`     VARCHAR(100)  NOT NULL DEFAULT '',
    `email`         VARCHAR(191)  NOT NULL DEFAULT '',
    `empresa`       VARCHAR(100)  NOT NULL DEFAULT ''            COMMENT 'Nome da empresa do usuário',
    `telefone`      VARCHAR(30)   DEFAULT NULL,
    `avatar`        VARCHAR(255)  DEFAULT NULL                   COMMENT 'Caminho relativo para foto (assets/pics/)',

    -- Controle de acesso
    -- Valores usados no código: conciliacao_adm | conciliacao_criar_nova |
    --   conciliacao_aprovar | conciliacao_pagar
    `permissoes`    VARCHAR(1000) NOT NULL DEFAULT ''            COMMENT 'Lista CSV de permissões',
    `ativo`         TINYINT(1)    NOT NULL DEFAULT 1,

    -- Timestamps
    `ultimovisto`   INT UNSIGNED  NOT NULL DEFAULT 0             COMMENT 'Unix timestamp do último acesso',
    `criado_em`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `atualizado_em` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_username` (`username`),
    KEY  `idx_token`         (`token`(191)),
    KEY  `idx_email`         (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Usuários da plataforma MA Projetos';


-- Usuário admin padrão (senha: admin123 — troque imediatamente em produção)
INSERT IGNORE INTO `usuarios`
    (`username`, `password`, `nome`, `sobrenome`, `email`, `permissoes`, `ativo`)
VALUES
    ('admin',
     '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt de "admin123"
     'Admin', '', 'admin@maprojetos.local',
     'conciliacao_adm,conciliacao_criar_nova,conciliacao_aprovar,conciliacao_pagar',
     1);


-- =============================================================================
-- 2. RECUPERAÇÃO DE SENHA
-- Fluxo de 3 passos em login.html: e-mail → código → nova senha
-- =============================================================================

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `usuario_id` INT UNSIGNED NOT NULL,
    `email`      VARCHAR(191) NOT NULL,
    `token`      VARCHAR(64)  NOT NULL UNIQUE                    COMMENT 'Código de 6 dígitos ou hash',
    `expira_em`  DATETIME     NOT NULL,
    `usado`      TINYINT(1)   NOT NULL DEFAULT 0,
    `criado_em`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_token`      (`token`),
    KEY `idx_usuario_id` (`usuario_id`),
    CONSTRAINT `fk_prt_usuario`
        FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tokens temporários para recuperação de senha';


-- =============================================================================
-- 3. MÓDULO: pConciliacaoBancaria
-- Banco "kaisan" no sistema original → unificado em kaisan_beta
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3a. Natureza Financeira
-- Usada em: search_natureza.php (typeahead Bloodhound)
--   SELECT id, text, instrucoes FROM natureza_financeira
--   WHERE text LIKE ? AND ativo = 1
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `naturezas_financeiras` (
    `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `descricao`  VARCHAR(255)  NOT NULL                          COMMENT 'Label exibido no typeahead (alias: text no search_natureza.php)',
    `instrucoes` TEXT          DEFAULT NULL                      COMMENT 'Dica exibida abaixo do nome no dropdown',
    `grupo`      VARCHAR(100)  DEFAULT NULL                      COMMENT 'Agrupador (ex: Custos Fixos, Receita)',
    `tipo`       ENUM('debito','credito','ambos')
                              NOT NULL DEFAULT 'ambos',
    `ativo`      TINYINT(1)    NOT NULL DEFAULT 1,
    `criado_em`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY          `idx_ativo`   (`ativo`),
    FULLTEXT KEY `ft_descricao` (`descricao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Plano de contas / naturezas financeiras';


-- Naturezas de exemplo (remova ou edite conforme necessidade)
INSERT IGNORE INTO `naturezas_financeiras` (`id`, `descricao`, `grupo`, `tipo`, `instrucoes`) VALUES
(1,  'Fornecedor - Matéria Prima',       'Custos de Produção', 'debito',  'Compra de insumos diretamente utilizados na produção.'),
(2,  'Fornecedor - Serviços Terceiros',  'Custos de Produção', 'debito',  'Pagamento de serviços prestados por terceiros (PJ/PF).'),
(3,  'Folha de Pagamento',               'Pessoal',            'debito',  'Salários, férias e 13º dos colaboradores CLT.'),
(4,  'Encargos Sociais (INSS/FGTS)',     'Pessoal',            'debito',  NULL),
(5,  'Impostos e Taxas',                 'Fiscal',             'debito',  'DARF, DAS, ISS, ICMS e demais obrigações fiscais.'),
(6,  'Aluguel',                          'Custos Fixos',       'debito',  NULL),
(7,  'Energia Elétrica',                 'Custos Fixos',       'debito',  NULL),
(8,  'Telefone / Internet',              'Custos Fixos',       'debito',  NULL),
(9,  'Logística / Frete',               'Custos Variáveis',   'debito',  NULL),
(10, 'Receita de Vendas',                'Receita',            'credito', NULL),
(11, 'Adiantamento a Fornecedor',        'Financeiro',         'debito',  'Pagamento antecipado — aguarda compensação futura.'),
(12, 'Transferência Entre Contas',       'Financeiro',         'ambos',   'Movimentação interna entre contas bancárias da empresa.'),
(13, 'Outros',                           'Geral',              'ambos',   NULL);


-- -----------------------------------------------------------------------------
-- 3b. conciliacao_bancaria
-- Tabela central do módulo. Todos os PHPs do módulo apontam para ela.
--
-- Colunas mapeadas de:
--   create.php  → INSERT
--   update.php  → UPDATE campos completos
--   finalize.php → UPDATE finalizado, finalizador, baixas, banco_id, banco_conta, data_baixa
--   approve.php  → UPDATE aprovado, aprovador
--   delete.php   → DELETE WHERE id
--   get.php      → SELECT com JOINs de usuarios e natureza_financeira
--
-- Adições incrementais que o código faz via ALTER TABLE (blindadas aqui):
--   anexos, anotacao, recebedor_doc, recebedor_nome, finalizado, finalizador,
--   adiantamento, tipo_lancamento, dados_fiscais_manual
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conciliacao_bancaria` (
    `id`                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,

    -- Identificação
    `empresa`               SMALLINT UNSIGNED NOT NULL DEFAULT 0  COMMENT 'ID da empresa (CONFIG_EMPRESAS)',
    `usuario`               INT UNSIGNED    NOT NULL               COMMENT 'FK usuarios.id — criador',

    -- Datas
    `data_criacao`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `data_vencimento`       DATE            DEFAULT NULL,
    `data_baixa`            DATE            DEFAULT NULL           COMMENT 'Data da última baixa efetiva',

    -- Dados financeiros
    `operacao`              VARCHAR(30)     NOT NULL DEFAULT 'pix'
                            COMMENT 'pix | boleto | DDA | transferencia | darf | outros',
    `valor_total`           DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
    `natureza_financeira`   INT UNSIGNED    DEFAULT NULL           COMMENT 'FK naturezas_financeiras.id',

    -- Recebedor
    `recebedor_nome`        VARCHAR(255)    DEFAULT NULL,
    `recebedor_doc`         VARCHAR(50)     DEFAULT NULL           COMMENT 'CPF/CNPJ do recebedor',

    -- Tipo fiscal
    `tipo_lancamento`       VARCHAR(50)     DEFAULT NULL           COMMENT 'NFS | NFE | pagamento | outros',

    -- Campos JSON
    `parcelas`              JSON            DEFAULT NULL
                            COMMENT '[{valor, data_vencimento}]',
    `fatura`                JSON            DEFAULT NULL
                            COMMENT '[{descricao, valor, natureza_financeira}]',
    `baixas`                JSON            DEFAULT NULL
                            COMMENT '[{indice, banco_id, banco_conta, data_baixa, usuario, data_op, estornado_em?, estornado_por?}]',
    `operacao_extra`        JSON            DEFAULT NULL
                            COMMENT 'Campos específicos: pix_chave, pix_tipo, boleto_linha, ted_banco, etc.',
    `dados_fiscais_manual`  JSON            DEFAULT NULL
                            COMMENT '{numero, serie, chave_acesso, valor_nf, data_emissao, competencia, ...}',
    `anexos`                JSON            DEFAULT NULL
                            COMMENT '[{hash, arquivo, nome_original, mime, solucoes_ia:{...}, ...}]',

    -- Texto livre
    `observacao`            TEXT            DEFAULT NULL,
    `anotacao`              TEXT            DEFAULT NULL,

    -- Dados bancários da baixa
    `banco_id`              VARCHAR(10)     DEFAULT NULL           COMMENT 'Código BACEN (ex: 341)',
    `banco_conta`           VARCHAR(50)     DEFAULT NULL,

    -- Flags de status
    `adiantamento`          TINYINT(1)      NOT NULL DEFAULT 0     COMMENT '1 = marcado como adiantamento',
    `finalizado`            TINYINT(1)      NOT NULL DEFAULT 0
                            COMMENT '0=Pendente | 1=Pago/Total | 2=Pago Parcial',
    `finalizador`           INT UNSIGNED    DEFAULT NULL           COMMENT 'FK usuarios.id — quem baixou',
    `aprovado`              TINYINT(1)      NOT NULL DEFAULT 0     COMMENT '1 = Concluído',
    `aprovador`             INT UNSIGNED    DEFAULT NULL           COMMENT 'FK usuarios.id — quem aprovou',

    PRIMARY KEY (`id`),
    KEY `idx_empresa_data`   (`empresa`, `data_criacao`),
    KEY `idx_vencimento`     (`data_vencimento`),
    KEY `idx_usuario`        (`usuario`),
    KEY `idx_natureza`       (`natureza_financeira`),
    KEY `idx_finalizado`     (`finalizado`),
    KEY `idx_aprovado`       (`aprovado`),

    CONSTRAINT `fk_cb_usuario`
        FOREIGN KEY (`usuario`)            REFERENCES `usuarios`            (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_cb_natureza`
        FOREIGN KEY (`natureza_financeira`) REFERENCES `naturezas_financeiras` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lançamentos financeiros — pagamentos, baixas e conciliação bancária';


-- -----------------------------------------------------------------------------
-- 3c. conciliacao_jobs_ia
-- Fila de processamento assíncrono de documentos pelo Python (Gaia/Groq).
-- Criada pelo groq_proxy_server.py via _garantir_tabela(); definida aqui
-- de forma definitiva com todos os status usados no código:
--   aguardando_analise → processando → resposta_ia  (ou erro)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conciliacao_jobs_ia` (
    `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `job_id`         VARCHAR(64)     NOT NULL                       COMMENT 'uniqid gerado pelo PHP',
    `tipo`           VARCHAR(50)     NOT NULL
                     COMMENT 'aguardando_analise | processando | resposta_ia | erro',
    `arquivo_nome`   VARCHAR(255)    DEFAULT NULL,
    `arquivo_mime`   VARCHAR(100)    DEFAULT NULL,
    `empresas_json`  MEDIUMTEXT      DEFAULT NULL                   COMMENT 'JSON com empresas para contexto da IA',
    `arquivo_blob`   LONGBLOB        DEFAULT NULL                   COMMENT 'Conteúdo binário do PDF/imagem',
    `resposta_json`  LONGTEXT        DEFAULT NULL                   COMMENT 'Resposta bruta da IA',
    `criado_em`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_job_tipo`    (`job_id`, `tipo`),
    KEY `idx_tipo_criado` (`tipo`,   `criado_em`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Fila assíncrona de análise de documentos pela IA (módulo Gaia)';


-- =============================================================================
SET FOREIGN_KEY_CHECKS = 1;
-- =============================================================================
-- Verificação rápida (opcional — rode manualmente para confirmar):
--   SELECT table_name, table_rows, table_comment
--   FROM   information_schema.tables
--   WHERE  table_schema = 'kaisan_beta'
--   ORDER  BY table_name;
-- =============================================================================