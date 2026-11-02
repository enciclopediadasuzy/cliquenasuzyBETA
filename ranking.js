(() => {
  const search = document.querySelector('#playerSearch');
  const list = document.querySelector('#fullLeaderboard');
  const status = document.querySelector('#resultsStatus');
  const message = document.querySelector('#rankingMessage');
  const refresh = document.querySelector('#refreshRanking');
  let client = null;
  let players = [];
  let generation = 0;

  function render() {
    const query = search.value.trim().toLocaleLowerCase('pt-BR');
    const results = players.map((player, index) => ({ ...player, place: index + 1 }))
      .filter((player) => !query || player.username.toLocaleLowerCase('pt-BR').includes(query));
    list.replaceChildren();
    status.textContent = query
      ? `${results.length} resultado(s), entre ${players.length} jogadores.`
      : `${players.length} jogador(es) no ranking.`;
    message.textContent = results.length ? '' : (query ? 'Nenhum jogador encontrado.' : 'Ainda não há jogadores com moedas.');
    for (const player of results) {
      const row = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank-number';
      rank.textContent = `#${player.place}`;
      const name = document.createElement('span');
      name.className = 'rank-name';
      name.textContent = player.username;
      const coins = document.createElement('span');
      coins.className = 'rank-coins';
      coins.textContent = `${Number(player.coins).toLocaleString('pt-BR')} moedas`;
      row.append(rank, name, coins);
      list.append(row);
    }
  }

  async function load() {
    if (!client) return;
    const run = ++generation;
    refresh.disabled = true;
    status.textContent = 'Carregando ranking…';
    message.textContent = '';
    const pageSize = 1000;
    const all = [];
    try {
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client.from('leaderboard').select('username,coins')
          .gt('coins', 0).order('coins', { ascending: false }).order('username', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (run !== generation) return;
        if (error) throw error;
        all.push(...(data || []));
        if (data.length < pageSize) break;
      }
      if (run !== generation) return;
      players = all;
      render();
    } catch (error) {
      if (run !== generation) return;
      status.textContent = 'Falha ao carregar.';
      message.textContent = 'Confira a conexão e a política de leitura da tabela leaderboard no Supabase.';
      console.error('Falha ao carregar a lista mundial:', error);
    } finally {
      if (run === generation) refresh.disabled = false;
    }
  }

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

  search.addEventListener('input', render);
  refresh.addEventListener('click', () => void load());
  if (!window.SUPABASE_URL?.trim() || !window.SUPABASE_PUBLIC_KEY?.trim()) {
    status.textContent = 'Supabase não configurado.';
    message.textContent = 'Confira supabase-config.js.';
    refresh.disabled = true;
    return;
  }
  status.textContent = 'Conectando ao Supabase…';
  loadSdk().then((createClient) => {
    client = createClient(window.SUPABASE_URL, window.SUPABASE_PUBLIC_KEY);
    return load();
  }).catch((error) => {
    status.textContent = 'Não foi possível conectar.';
    message.textContent = 'Confira a conexão e a configuração do Supabase.';
    refresh.disabled = false;
    console.error('Falha na inicialização do ranking:', error);
  });
  setInterval(() => void load(), 60000);
})();
