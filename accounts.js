(() => {
  const $ = (selector) => document.querySelector(selector);
  const panel = $('#accountPanel');
  const desktop = $('.desktop');
  const form = $('#accountForm');
  const username = $('#accountUsername');
  const email = $('#accountEmail');
  const password = $('#accountPassword');
  const status = $('#accountStatus');
  const topTen = $('#leaderboard');
  const adminTools = $('#adminTools');
  const adminStatus = $('#adminStatus');
  const adminUsers = $('#adminUsers');
  let client = null;
  let user = null;
  let lastSavedCoins = null;
  let saveTimer = null;
  let mode = 'login';
  const authButtons = ['#accountLogin', '#accountSignup', '#accountCreate', '#accountCancel', '#accountLogout'].map($);
  authButtons.forEach((button) => { button.disabled = true; });

  const say = (text) => { status.textContent = text; };
  const coinsNow = () => Math.max(0, Math.floor(Number(window.getGameCoins?.()) || 0));
  const gameProgress = () => {
    const value = window.getGameProgress?.();
    return normalizeProgress(value || { coins: coinsNow(), coinsEarned: coinsNow(), bought: [] });
  };
  function normalizeProgress(value) {
    const progress = value && typeof value === 'object' ? value : {};
    return {
      coins: Math.max(0, Math.floor(Number(progress.coins) || 0)),
      coinsEarned: Math.max(0, Math.floor(Number(progress.coinsEarned) || 0)),
      bought: [...new Set(Array.isArray(progress.bought) ? progress.bought.filter(Number.isInteger).filter(index => index >= 0) : [])]
    };
  }

  panel.addEventListener('toggle', () => desktop.classList.toggle('account-open', panel.open));

  function setMode(nextMode) {
    mode = nextMode;
    const signingUp = mode === 'signup';
    $('#usernameLabel').classList.toggle('hidden', !signingUp);
    username.classList.toggle('hidden', !signingUp);
    username.required = signingUp;
    $('#accountLogin').classList.toggle('hidden', signingUp);
    $('#accountSignup').classList.toggle('hidden', signingUp);
    $('#accountCreate').classList.toggle('hidden', !signingUp);
    $('#accountCancel').classList.toggle('hidden', !signingUp);
  }

  function showSignedInState() {
    const signedIn = Boolean(user);
    $('#accountFields').classList.toggle('hidden', signedIn);
    $('#accountLogout').classList.toggle('hidden', !signedIn);
    const isAdmin = user?.user_metadata?.username?.trim().toLowerCase() === 'pedrozanivan';
    adminTools.classList.toggle('hidden', !isAdmin);
    if (isAdmin && client) void loadAdminUsers();
  }

  async function loadTopTen() {
    if (!client) return;
    try {
      const { data, error } = await client.from('leaderboard')
        .select('username,coins').gt('coins', 0)
        .order('coins', { ascending: false }).order('username', { ascending: true }).limit(10);
      if (error) throw error;
      topTen.replaceChildren();
      if (!data?.length) {
        const row = document.createElement('li');
        row.textContent = 'Ainda não há jogadores com moedas.';
        topTen.append(row);
        return;
      }
      for (const player of data) {
        const row = document.createElement('li');
        row.textContent = `${player.username} — ${Number(player.coins).toLocaleString('pt-BR')} moedas`;
        topTen.append(row);
      }
    } catch (error) {
      topTen.replaceChildren();
      const row = document.createElement('li');
      row.textContent = 'Ranking indisponível. O jogo continua funcionando.';
      topTen.append(row);
      console.error('Falha ao carregar Top 10:', error);
    }
  }

  async function syncProgressFromAccount() {
    if (!client || !user) return;
    const { data, error } = await client.from('leaderboard').select('coins,progress').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      const name = String(user.user_metadata?.username || 'Jogador').trim().slice(0, 20) || 'Jogador';
      const progress = gameProgress();
      const { error: insertError } = await client.from('leaderboard').insert({
        id: user.id, username: name, score: 0, coins: progress.coins, progress
      });
      if (insertError) throw insertError;
      lastSavedCoins = progress.coins;
      lastSavedProgress = JSON.stringify(progress);
      return;
    }
    const savedProgress = data.progress && typeof data.progress === 'object' && Object.keys(data.progress).length
      ? normalizeProgress(data.progress)
      : gameProgress();
    if (data.coins !== null && data.coins !== undefined) savedProgress.coins = Math.max(0, Math.floor(Number(data.coins) || 0));
    if (data.progress && Object.keys(data.progress).length) {
      lastSavedCoins = savedProgress.coins;
      lastSavedProgress = JSON.stringify(savedProgress);
      window.setGameProgressFromCloud?.(savedProgress);
    } else {
      lastSavedCoins = savedProgress.coins;
      lastSavedProgress = JSON.stringify(savedProgress);
      window.setGameProgressFromCloud?.(savedProgress);
      await writeProgress(savedProgress);
    }
  }

  async function handleAuthChange(session) {
    const nextUser = session?.user || null;
    const changed = user?.id !== nextUser?.id;
    user = nextUser;
    showSignedInState();
    if (!user) {
      lastSavedCoins = null;
      lastSavedProgress = null;
      say('Entre ou crie uma conta para salvar moedas no ranking mundial.');
      return;
    }
    say(`Conectado como ${user.user_metadata?.username || user.email}.`);
    if (changed) {
      try {
        await syncProgressFromAccount();
        await loadTopTen();
      } catch (error) {
        say('Conta conectada; não consegui sincronizar o progresso. Confira a tabela leaderboard no Supabase.');
        console.error('Falha ao sincronizar progresso:', error);
      }
    }
  }

  async function signIn() {
    if (!client) { say('A conexão com o Supabase ainda está iniciando.'); return; }
    if (!email.reportValidity() || !password.reportValidity()) return;
    say('Entrando…');
    const { data, error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (error) { say('Não foi possível entrar. Confira e-mail, senha e confirmação do e-mail.'); return; }
    password.value = '';
    await handleAuthChange(data.session);
  }

  async function signUp() {
    if (!client) { say('A conexão com o Supabase ainda está iniciando.'); return; }
    if (!form.reportValidity()) return;
    const name = username.value.trim();
    if (name.length < 3 || name.length > 20) { say('O nome precisa ter de 3 a 20 caracteres.'); return; }
    say('Criando conta…');
    const { data, error } = await client.auth.signUp({
      email: email.value.trim(), password: password.value,
      options: { data: { username: name } }
    });
    if (error) { say(`Não foi possível criar a conta: ${error.message}`); return; }
    password.value = '';
    if (!data.session) {
      say('Conta criada. Confirme o e-mail antes de entrar. Confira também a pasta de spam.');
      return;
    }
    await handleAuthChange(data.session);
  }

  let lastSavedProgress = null;

  async function writeProgress(progress) {
    if (!client || !user) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const currentUserId = user.id;
    const snapshot = normalizeProgress(progress);
    try {
      let result = await client.from('leaderboard').update({
        coins: snapshot.coins, progress: snapshot, updated_at: new Date().toISOString()
      })
        .eq('id', currentUserId).select('id').maybeSingle();
      if (!result.error && !result.data) {
        result = await client.from('leaderboard').insert({
          id: currentUserId,
          username: String(user.user_metadata?.username || user.email || 'Jogador').slice(0, 20),
          score: 0,
          coins: snapshot.coins,
          progress: snapshot
        }).select('id').maybeSingle();
      }
      if (result.error) throw result.error;
      if (user?.id !== currentUserId) return;
      lastSavedCoins = snapshot.coins;
      lastSavedProgress = JSON.stringify(snapshot);
      void loadTopTen();
    } catch (error) {
      say('O progresso continua salvo neste navegador; a sincronização mundial falhou.');
      console.error('Falha ao enviar progresso:', error);
    }
  }

  window.reportGameProgress = (value) => {
    if (!user || !client) return;
    const snapshot = normalizeProgress(value);
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSavedProgress) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void writeProgress(snapshot), 500);
  };

  async function loadSdk() {
    if (window.supabase?.createClient) return window.supabase.createClient;
    for (const source of [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
      'https://unpkg.com/@supabase/supabase-js@2'
    ]) {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = source;
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });
        if (window.supabase?.createClient) return window.supabase.createClient;
      } catch {}
    }
    throw new Error('A biblioteca do Supabase não carregou.');
  }

  async function callAdmin(action, details = {}) {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('Entre na conta administrativa.');
    const response = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: window.SUPABASE_PUBLIC_KEY,
        Authorization: `Bearer ${data.session.access_token}`
      },
      body: JSON.stringify({ action, ...details })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Falha na função administrativa (${response.status}).`);
    return result;
  }

  async function loadAdminUsers() {
    adminStatus.textContent = 'Carregando contas…';
    try {
      const { users } = await callAdmin('list');
      adminUsers.replaceChildren();
      for (const account of users) {
        const row = document.createElement('div');
        row.className = 'admin-user';
        const label = document.createElement('span');
        label.textContent = `${account.username} · ${account.email}${account.verified ? '' : ' · não verificada'}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Excluir';
        remove.addEventListener('click', async () => {
          if (!window.confirm(`Excluir a conta ${account.username}?`)) return;
          remove.disabled = true;
          try {
            await callAdmin('delete', { userId: account.id });
            await loadAdminUsers();
            await loadTopTen();
          } catch (error) { adminStatus.textContent = error.message; remove.disabled = false; }
        });
        row.append(label, remove);
        adminUsers.append(row);
      }
      adminStatus.textContent = `${users.length} conta(s).`;
    } catch (error) { adminStatus.textContent = error.message; }
  }

  $('#accountLogin').addEventListener('click', () => void signIn());
  $('#accountSignup').addEventListener('click', () => setMode('signup'));
  $('#accountCreate').addEventListener('click', () => void signUp());
  $('#accountCancel').addEventListener('click', () => setMode('login'));
  $('#accountLogout').addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) say('Não foi possível sair da conta.');
    else await handleAuthChange(null);
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  $('#adminCreateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const adminForm = event.currentTarget;
    if (!adminForm.reportValidity()) return;
    adminStatus.textContent = 'Criando conta…';
    try {
      const name = $('#newUsername').value.trim();
      await callAdmin('create', { username: name, email: $('#newEmail').value.trim(), password: $('#newPassword').value });
      adminForm.reset();
      await loadAdminUsers();
    } catch (error) { adminStatus.textContent = error.message; }
  });

  if (!window.SUPABASE_URL?.trim() || !window.SUPABASE_PUBLIC_KEY?.trim()) {
    say('Jogo local pronto. Para contas e ranking, configure a URL e a chave Publishable do Supabase.');
    setMode('login');
    return;
  }
  say('Conectando ao Supabase…');
  loadSdk().then((createClient) => {
    client = createClient(window.SUPABASE_URL, window.SUPABASE_PUBLIC_KEY);
    authButtons.forEach((button) => { button.disabled = false; });
    client.auth.onAuthStateChange((_event, session) => { void handleAuthChange(session); });
    return client.auth.getSession();
  }).then(({ data, error }) => {
    if (error) throw error;
    return handleAuthChange(data.session);
  }).then(() => loadTopTen()).catch((error) => {
    say('O jogo funciona, mas o Supabase não respondeu. Verifique a conexão e a configuração.');
    topTen.replaceChildren();
    const row = document.createElement('li');
    row.textContent = 'Ranking indisponível agora.';
    topTen.append(row);
    console.error('Falha na inicialização do Supabase:', error);
  });
  setInterval(() => void loadTopTen(), 60000);
  setMode('login');
})();
