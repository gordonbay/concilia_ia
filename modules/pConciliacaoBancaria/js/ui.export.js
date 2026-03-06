
/**
 * ConciliacaoUIExport — Gerador de Relatórios XLS (XML Spreadsheet 2003)
 * Responsabilidade: Gerar arquivo Excel robusto com estilos e filtros a partir dos dados atuais.
 */
var ConciliacaoUIExport = {

    /**
     * Gatilho principal chamado pelo menu
     */
    exportCurrent: function() {
        // Pega os dados armazenados no Main (precisa ser populado no loadData)
        const data = ConciliacaoMain.currentData;
        
        if (!data || data.length === 0) {
            ConciliacaoUISetup.notify('Não há dados visíveis para exportar.', 'warning');
            return;
        }

        const filename = `Conciliacao_Export_${moment().format('YYYY-MM-DD_HHmm')}.xls`;
        this._generateAndDownload(data, filename);
    },

    /**
     * Gera o XML e dispara o download
     */
    _generateAndDownload: function(rows, filename) {
        const xmlContent = this._buildXML(rows);
        const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    /**
     * Constrói a string XML no formato SpreadsheetML
     */
    _buildXML: function(rows) {
        // Definição de Estilos
        const styles = `
            <Styles>
                <Style ss:ID="Default" ss:Name="Normal">
                    <Alignment ss:Vertical="Center"/>
                    <Borders/>
                    <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
                    <Interior/>
                    <NumberFormat/>
                    <Protection/>
                </Style>
                <Style ss:ID="sHeader">
                    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
                    <Borders>
                        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
                        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
                        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
                        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
                    </Borders>
                    <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
                    <Interior ss:Color="#363636" ss:Pattern="Solid"/>
                </Style>
                <Style ss:ID="sRowEven">
                    <Borders>
                        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4D4D4"/>
                    </Borders>
                    <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
                </Style>
                <Style ss:ID="sRowOdd">
                    <Borders>
                        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D4D4D4"/>
                    </Borders>
                    <Interior ss:Color="#F3F3F3" ss:Pattern="Solid"/>
                </Style>
                <Style ss:ID="sDate">
                    <NumberFormat ss:Format="Short Date"/>
                </Style>
                <Style ss:ID="sCurrency">
                    <NumberFormat ss:Format="R$ #,##0.00;[Red]R$ \-#,##0.00"/>
                </Style>
                 <Style ss:ID="sStatus">
                    <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
                    <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1"/>
                </Style>
            </Styles>
        `;

        // Cabeçalho das colunas
        const columns = [
            { label: "ID", width: 50 },
            { label: "Data Criação", width: 100 },
            { label: "Status", width: 100 },
            { label: "Empresa (Pagador)", width: 200 },
            { label: "Recebedor", width: 200 },
            { label: "Documento/NF", width: 120 },
            { label: "Operação", width: 80 },
            { label: "Vencimento", width: 80 },
            { label: "Valor Total", width: 100 },
            { label: "Natureza Financeira", width: 150 },
            { label: "Observação/Anotação", width: 200 },
            { label: "Usuário", width: 120 }
        ];

        let colDefs = columns.map(c => `<Column ss:AutoFitWidth="0" ss:Width="${c.width}"/>`).join('');
        
        let headerRow = `<Row ss:AutoFitHeight="0" ss:Height="20">` + 
            columns.map(c => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${c.label}</Data></Cell>`).join('') + 
            `</Row>`;

        // Processamento das linhas
        let dataRows = rows.map((r, index) => {
            const styleId = (index % 2 === 0) ? 'sRowEven' : 'sRowOdd';
            
            // Tratamento de Status
            let status = 'Pendente';
            if (r.aprovado == 1) status = 'Concluído';
            else if (r.finalizado == 1) status = (r.adiantamento == 1) ? 'Pago (Adiant.)' : 'Pago';

            // Tratamento de Data
            const dtCriacao = r.data_criacao ? r.data_criacao.substring(0, 10) : ''; // YYYY-MM-DD
            
            // Tratamento Valor
            let valor = parseFloat(r.valor_total || 0);
            // Se tiver parcelas e valor total 0, soma parcelas
            if (valor === 0 && r.parcelas && r.parcelas.length > 0) {
                valor = r.parcelas.reduce((acc, p) => acc + parseFloat(p.valor || 0), 0);
            }
            // Se tiver fatura
             if (valor === 0 && r.fatura && r.fatura.length > 0) {
                valor = r.fatura.reduce((acc, f) => acc + parseFloat(f.valor || 0), 0);
            }

            // Tratamento Doc
            let doc = '-';
            if (r.anexos && r.anexos.length > 0) {
                 for(let a of r.anexos) {
                     if(a.solucoes_ia?.dados_fiscais?.numero) { doc = 'NF ' + a.solucoes_ia.dados_fiscais.numero; break; }
                 }
            }
            if (doc === '-' && r.operacao_extra) {
                doc = r.operacao_extra.num_documento || r.operacao_extra.nosso_numero || '-';
            }

            // Tratamento Vencimento
            const venc = r.data_vencimento || '';

            // Tratamento Natureza
            let nat = r.natureza_descricao || 'Não informada';
            if (r.fatura && r.fatura.length > 0) nat = 'Misto (Fatura)';

            // Helper XML
            const cellStr = (val) => `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${this._esc(val)}</Data></Cell>`;
            const cellNum = (val) => `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${val}</Data></Cell>`; // Usa estilo padrao ou específico se quiser
            const cellCur = (val) => `<Cell ss:StyleID="${styleId}" ss:Index="9"><Data ss:Type="Number">${val}</Data></Cell>`; // Index 9 é a coluna Valor, mas vamos aplicar style inline melhor

            return `<Row>
                ${cellStr(r.id)}
                <Cell ss:StyleID="${styleId}"><Data ss:Type="String">${dtCriacao}</Data></Cell>
                ${cellStr(status)}
                ${cellStr(r.empresa_nome || '')}
                ${cellStr(r.recebedor_nome || '')}
                ${cellStr(doc)}
                ${cellStr((r.operacao || '').toUpperCase())}
                <Cell ss:StyleID="${styleId}"><Data ss:Type="String">${venc ? moment(venc).format('DD/MM/YYYY') : ''}</Data></Cell>
                <Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${valor}</Data></Cell>
                ${cellStr(nat)}
                ${cellStr(r.anotacao || r.observacao || '')}
                ${cellStr((r.usuario_nome || '') + ' ' + (r.usuario_sobrenome || ''))}
            </Row>`;
        }).join('');

        // Montagem Final com AutoFilter
        return `<?xml version="1.0"?>
            <?mso-application progid="Excel.Sheet"?>
            <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
             xmlns:o="urn:schemas-microsoft-com:office:office"
             xmlns:x="urn:schemas-microsoft-com:office:excel"
             xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
             xmlns:html="http://www.w3.org/TR/REC-html40">
             ${styles}
             <Worksheet ss:Name="Conciliacao">
              <Table ss:ExpandedColumnCount="${columns.length}" ss:ExpandedRowCount="${rows.length + 1}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="15">
               ${colDefs}
               ${headerRow}
               ${dataRows}
              </Table>
              <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
               <PageSetup>
                <Header x:Margin="0.3"/>
                <Footer x:Margin="0.3"/>
               </PageSetup>
               <Selected/>
               <Panes>
                <Pane>
                 <Number>3</Number>
                 <ActiveRow>1</ActiveRow>
                </Pane>
               </Panes>
               <ProtectObjects>False</ProtectObjects>
               <ProtectScenarios>False</ProtectScenarios>
              </WorksheetOptions>
              <AutoFilter x:Range="R1C1:R1C${columns.length}" xmlns="urn:schemas-microsoft-com:office:excel"></AutoFilter>
             </Worksheet>
            </Workbook>`;
    },

    _esc: function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
};