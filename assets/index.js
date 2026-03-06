// File: assets/index.js
localStorage.removeItem('global_loaded_scripts_v2');

// --- Sistema de Fila de Carregamento ---
window.dependencyQueue = [];
window.isDependencyLoading = false;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function processDependencyQueue() {
    if (window.isDependencyLoading || window.dependencyQueue.length === 0) return;
    window.isDependencyLoading = true;

    const task = window.dependencyQueue.shift();
    const loadedScriptsOnPage = new Set();
    document.querySelectorAll('script[src]').forEach(script => {
        try { loadedScriptsOnPage.add(new URL(script.src, window.location.origin).pathname); } catch (e) {}
    });

    const scriptsToLoad = [];
    if (task.dependencies) {
        for (const [scriptName, scriptPath] of Object.entries(task.dependencies)) {
            const absoluteScriptPath = scriptPath.startsWith('/') ? scriptPath : '/' + scriptPath;
            if (!loadedScriptsOnPage.has(absoluteScriptPath)) scriptsToLoad.push(absoluteScriptPath);
        }
    }

    if (scriptsToLoad.length > 0) {
        for (const scriptPath of scriptsToLoad) {
            try { await loadScript(scriptPath); } catch (error) { console.error(`Failed to load ${scriptPath}`, error); }
        }
    }

    if (typeof task.callback === 'function') {
        try { task.callback(); } catch (e) { console.error("Callback error:", e); }
    }

    window.isDependencyLoading = false;
    setTimeout(processDependencyQueue, 0);
}

window.loadDependenciesAndRun = function(dependencies, callback) {
    window.dependencyQueue.push({ dependencies, callback });
    processDependencyQueue();
};

document.addEventListener('DOMContentLoaded', function() {

    function checkAuthentication() {
        const token = localStorage.getItem('token');
        if (!token) { window.location.href = '/login.html'; return; }

        fetch('/api/auth.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ token: token })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.authenticated) {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }

            const userData = data.user;

            // Atualiza nome e avatar no navbar
            document.getElementById('navUsername').textContent = (userData.nome || '') + ' ' + (userData.sobrenome || '');
            const navUserAvatarEl = document.getElementById('navUserAvatar');
            if (navUserAvatarEl) {
                navUserAvatarEl.src = userData.pic && userData.pic !== 'default'
                    ? `./assets/pics/${userData.pic}.jpg`
                    : './assets/pics/default.jpg';
            }

            initializeInterface(userData);
        })
        .catch(() => { window.location.href = '/login.html'; });
    }

    function userHasPermission(permissoes, prefix) {
    if (!permissoes) return false;
    // Suporta tanto string quanto array
    const lista = Array.isArray(permissoes) ? permissoes : permissoes.split(',');
    return lista.some(p => p.trim().toLowerCase().startsWith(prefix.toLowerCase()));
}

    function initializeInterface(userData) {
        const mainNavigation = document.getElementById('mainNavigation');
        // Limpa itens dinâmicos anteriores para evitar duplicação
        mainNavigation.querySelectorAll('.dynamic-module-link').forEach(item => item.remove());

        const permissoes = userData.permissoes || '';

        // LISTA COMPLETA DE MÓDULOS com seus prefixos de permissão
        const moduleConfig = [
           
            {
                id: 'pConciliacaoBancaria',
                iconClass: 'ph-bank',
                text: 'Conciliação Bancária',
                elementId: 'botaoCarregaConciliacao',
                permissionPrefix: 'conciliacao_'
            }
        ];

        // Filtra apenas os módulos que o usuário tem permissão
        const allowedModules = moduleConfig.filter(mod =>
            userHasPermission(permissoes, mod.permissionPrefix)
        );

        // Monta o HTML do menu apenas com os módulos permitidos
        let navItemsHtml = '';
        allowedModules.forEach(mod => {
            navItemsHtml += `
            <li class="nav-item dynamic-module-link">
                <a id="${mod.elementId}" data-id="${mod.id}" href="#" class="nav-link frameia">
                    <i class="${mod.iconClass} me-2"></i>
                    <span>${mod.text}</span>
                </a>
            </li>`;
        });

        mainNavigation.innerHTML += navItemsHtml;

        // Cria os containers de conteúdo apenas para módulos permitidos
        const contentContainers = document.getElementById('contentContainers');
        contentContainers.innerHTML = '';
        allowedModules.forEach(mod => {
            const container = document.createElement('div');
            container.className = 'content-wrapper quadrosPrincipais';
            container.id = mod.id;
            container.style.display = 'none';
            container.setAttribute('data-loaded', 'false');
            container.innerHTML = `<div class="d-flex justify-content-center align-items-center" style="height: 300px;"><div class="spinner-border text-primary"></div></div>`;
            contentContainers.appendChild(container);
        });

        initEventListeners();
    }

    function initEventListeners() {
        document.getElementById('mainNavigation').addEventListener('click', function(event) {
            const link = event.target.closest('.frameia');
            if (link) {
                event.preventDefault();
                const dataId = link.getAttribute('data-id');

                // Esconde todos os painéis
                document.querySelectorAll('.quadrosPrincipais').forEach(panel => panel.style.display = 'none');

                const selectedPanel = document.getElementById(dataId);
                if (selectedPanel) {
                    selectedPanel.style.display = 'block';

                    // LÓGICA DE CACHE: Só carrega se ainda não foi carregado
                    if (selectedPanel.getAttribute('data-loaded') !== 'true') {
                        loadModuleContent(dataId);
                    } else {
                        console.log(`Módulo ${dataId} recuperado do cache.`);
                    }
                }

                document.querySelectorAll('.frameia').forEach(item => item.classList.remove('active'));
                link.classList.add('active');
            }
        });

        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', function(e) {
                e.preventDefault();
                localStorage.clear();
                window.location.href = '/login.html';
            });
        }
    }

    function loadModuleContent(moduleId) {
        const contentContainer = document.getElementById(moduleId);

        fetch(`/api/load-module.php?module=${moduleId}`, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        })
        .then(response => response.text())
        .then(html => {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            contentContainer.innerHTML = '';

            const scripts = Array.from(tempDiv.querySelectorAll('script'));
            const nonScripts = Array.from(tempDiv.childNodes).filter(node => node.nodeName !== 'SCRIPT');
            nonScripts.forEach(node => contentContainer.appendChild(node));

            // Marca como carregado para evitar recargas futuras
            contentContainer.setAttribute('data-loaded', 'true');

            scripts.forEach(script => {
                const newScript = document.createElement('script');
                if (script.src) newScript.src = script.src;
                else newScript.textContent = script.textContent;
                contentContainer.appendChild(newScript);
            });
        });
    }

    checkAuthentication();
});