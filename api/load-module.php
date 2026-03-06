<?php
header('Access-Control-Allow-Origin: *');
header('Content-type: text/html; charset=utf-8');
date_default_timezone_set('America/Sao_Paulo');

include_once $_SERVER['DOCUMENT_ROOT'] . '/conn.php';

// 1. Autenticação
$token = null;
$headers = getallheaders(); // Assume ambiente Apache/CGI padrão
$authHeader = array_change_key_case($headers, CASE_LOWER)['authorization'] ?? '';

if (preg_match('/Bearer\s(\S+)/i', $authHeader, $matches)) {
    $token = $matches[1];
} else {
    $token = $_REQUEST['token'] ?? null;
}

if (!$token) {
    http_response_code(401);
    exit('<div class="alert alert-danger m-3">Não autorizado: Token ausente.</div>');
}

// 2. Validação DB
$mysqli = new mysqli($GLOBALS['enderecoLocal'], $GLOBALS['usuarioRoot'], $GLOBALS['senhaRoot'], $GLOBALS['dbGlobal']);
if ($mysqli->connect_error) {
    http_response_code(500);
    exit('<div class="alert alert-danger m-3">Erro interno de conexão.</div>');
}
$mysqli->set_charset("utf8mb4");

$stmt = $mysqli->prepare("SELECT id FROM usuarios WHERE token = ?");
$stmt->bind_param("s", $token);
$stmt->execute();
if (!$stmt->get_result()->fetch_assoc()) {
    http_response_code(401);
    $mysqli->close();
    exit('<div class="alert alert-danger m-3">Sessão expirada ou inválida.</div>');
}

// 3. Roteamento de Módulos
$moduleId = $_GET['module'] ?? '';
$modulesConfig = [
    'PBiGestaoFinanceira' => ['file' => '/PBiGestaoFinanceira.html', 'deps' => ['bootstrap.bundle.min.js', 'moment.min.js', 'bloodhound.min.js', 'typeahead.bundle.min.js', 'daterangepicker.js', 'select2.min.js', 'noty.js', 'popovers.js', 'd3v5.js']],
    'pBiFiscal'           => ['file' => '/pBiFiscal.html',           'deps' => ['bootstrap.bundle.min.js', 'moment.min.js', 'bloodhound.min.js', 'typeahead.bundle.min.js', 'daterangepicker.js', 'select2.min.js', 'noty.js', 'popovers.js', 'd3v5.js']],
    'pDataLake'           => ['file' => '/pDataLake.html',           'deps' => ['bootstrap.bundle.min.js', 'moment.min.js', 'bloodhound.min.js', 'typeahead.bundle.min.js', 'daterangepicker.js', 'select2.min.js', 'noty.js', 'popovers.js', 'd3v5.js']],
    'pProcessos'          => ['file' => '/pProcessos.html',          'deps' => ['bootstrap.bundle.min.js']],
    'pPlanejamentoEstrategico' => ['file' => '/pPlanejamentoEstrategico.html', 'deps' => ['bootstrap.bundle.min.js', 'typeahead.bundle.min.js', 'daterangepicker.js', 'select2.min.js', 'noty.js', 'popovers.js', 'd3v5.js']],
    'pFinancas'           => ['file' => '/pFinancas.html',           'deps' => ['bootstrap.bundle.min.js', 'popovers.js', 'd3v5.js']],
    'pDevolucoes'         => ['file' => '/pDevolucoes.html',         'deps' => ['jquery.min.js', 'bootstrap.bundle.min.js', 'typeahead.bundle.min.js', 'moment.min.js', 'daterangepicker.js', 'bootstrap_multiselect.js', 'noty.js', 'd3v5.js']],
    'pConciliacaoBancaria'=> ['file' => '/pConciliacaoBancaria.html','deps' => ['jquery.min.js', 'bootstrap.bundle.min.js', 'typeahead.bundle.min.js', 'moment.min.js', 'daterangepicker.js', 'select2.min.js', 'noty.js']],
];

if (!isset($modulesConfig[$moduleId])) {
    http_response_code(404);
    $mysqli->close();
    exit('<div class="alert alert-danger m-3">Módulo não encontrado.</div>');
}

$config = $modulesConfig[$moduleId];
$fullPath = $_SERVER['DOCUMENT_ROOT'] . '/modules' . $config['file'];

if (!file_exists($fullPath)) {
    http_response_code(404);
    $mysqli->close();
    exit('<div class="alert alert-warning m-3">Arquivo fonte do módulo não localizado.</div>');
}

// 4. Renderização
ob_start();
include $fullPath;
$html = ob_get_clean();

// Limpeza específica
if ($moduleId === 'PBIsSuprimentos') {
    $html = preg_replace('/<script\s+src="modules\/pBIsSuprimentos\/pBIsSuprimentos_.*?\.js"><\/script>/i', '', $html);
}

// Injeção de dependências
if (!empty($config['deps'])) {
    // Mapeia nome -> caminho (simplificação, assume padrão assets/)
    $depsMap = [];
    foreach ($config['deps'] as $dep) {
        $depsMap[$dep] = "/assets/$dep";
    }
    
    $jsonDeps = json_encode($depsMap);
    $fnName = "func{$moduleId}";
    
    $html .= <<<SCRIPT
    <script>
    (function() {
        const deps = $jsonDeps;
        const init = () => {
            if (typeof window['$fnName'] === 'function') window['$fnName']();
        };
        
        if (window.loadDependenciesAndRun) {
            window.loadDependenciesAndRun(deps, init);
        } else {
            console.error('Loader global ausente.');
        }
    })();
    </script>
SCRIPT;
}

echo $html;
$mysqli->close();
?>