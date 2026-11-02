# Clique na Suzy — pacote com contas reconstruídas

Este pacote parte da cópia de segurança `cliquenasuzy-github 2`. O sistema de contas está implementado do zero em `accounts.js`; ele não depende da antiga implementação de contas. O jogo salva moedas e itens no cookie e, quando há sessão, sincroniza o progresso com a conta. Abrir a loja não envia uma gravação.

## Publicar no GitHub Pages

Envie todos os arquivos desta pasta para a raiz do repositório publicado pelo GitHub Pages. Não envie a pasta de backup `cliquenasuzy-github 2` por cima dela.

## Supabase

O `supabase-config.js` já tem a URL do projeto e uma chave Publishable. Essa chave é própria para o navegador; não coloque uma chave `service_role` ou `secret` nesse arquivo.

1. No painel Supabase, abra **SQL Editor** e execute `supabase-setup.sql` uma vez.
2. Confirme que **Authentication → Providers → Email** está habilitado.
3. Configure os endereços do GitHub Pages em **Authentication → URL Configuration**. Para exigir verificação, configure também o SMTP de envio de e-mails.
4. A conta, o Top 10 e a lista completa usam a tabela `public.leaderboard` e suas políticas RLS. Nomes de contas que não confirmarem o e-mail são liberados para novo cadastro após dez minutos quando alguém tenta registrar o mesmo nome.

A leitura pública do ranking está prevista no SQL. Cada jogador só pode inserir/atualizar a própria linha.

## Administração de contas

A interface administrativa aparece para `PedroZanivan`, mas a autorização real é feita no servidor pela Edge Function `admin-users`, comparando o UID autenticado com o secret `ADMIN_USER_ID`. Para habilitar criar/excluir contas, publique `supabase/functions/admin-users/index.ts` como a função `admin-users` e configure `ADMIN_USER_ID` nos secrets. A função também precisa do URL e das chaves administrativas disponibilizadas nos secrets gerenciados pelo Supabase. Nunca exponha a chave secreta no site.
