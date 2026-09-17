import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Privacidade — Capital',
  description: 'Como o Capital trata os seus dados, incluindo o acesso ao Gmail.',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-foreground text-lg font-semibold">{title}</h2>
      <div className="text-muted flex flex-col gap-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * The public privacy policy, linked from Google's consent screen (required to publish the OAuth
 * app used by the Gmail monitor). Reachable without signing in (see PUBLIC_PREFIXES in proxy.ts).
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-primary text-sm font-semibold">Capital</p>
        <h1 className="text-foreground text-2xl font-bold">Política de privacidade</h1>
        <p className="text-muted text-sm">Última atualização: 17 de setembro de 2026.</p>
      </header>

      <Section title="O que é o Capital">
        <p>
          O Capital é um app de orçamento doméstico. Ele roda num servidor próprio, com banco de dados
          próprio: os dados não ficam em serviços de banco na nuvem e não são vendidos nem compartilhados com
          ninguém. Cada conta só enxerga os próprios dados.
        </p>
      </Section>

      <Section title="O que guardamos">
        <ul className="list-disc pl-5">
          <li>Da sua conta: nome, e-mail e a senha em forma cifrada (hash).</li>
          <li>O que você lança: categorias, rendas, gastos, lembretes e os demais módulos que ligar.</li>
          <li>
            Para as notificações: o endereço de inscrição do navegador de cada aparelho em que você as ativar.
          </li>
          <li>Um cookie de sessão, só para manter você conectado.</li>
        </ul>
      </Section>

      <Section title="Lançar por voz ou texto">
        <p>
          O áudio ou o texto é analisado por uma IA que roda no próprio servidor do Capital. O áudio não é
          guardado: só o gasto que você conferir e salvar fica registrado.
        </p>
      </Section>

      <Section title="Monitor de Gmail">
        <p>
          Se você ligar o monitor e conectar o seu Gmail, o Capital pede ao Google só a permissão de leitura (
          <code>gmail.readonly</code>). Ele usa essa permissão apenas para isto: a cada minuto, ler o assunto,
          o remetente e a prévia dos e-mails novos, comparar com as palavras-chave que você cadastrou e avisar
          você no celular quando alguma aparecer.
        </p>
        <ul className="list-disc pl-5">
          <li>
            O Capital não apaga, não envia, não marca e não altera nada na sua caixa, e não guarda o conteúdo
            dos e-mails.
          </li>
          <li>
            Dos e-mails que tiverem uma palavra-chave, guarda só o assunto, o remetente, a data e as palavras
            encontradas, para mostrar o seu histórico de alertas.
          </li>
          <li>
            A autorização do Google fica guardada cifrada no servidor e nunca é mostrada nem enviada a
            terceiros.
          </li>
          <li>
            Os dados do Gmail não são usados para publicidade, não são vendidos, não são usados para treinar
            modelos de IA e não são lidos por pessoas, exceto quando você pedir ajuda ou quando a lei exigir.
          </li>
        </ul>
        <p>
          O uso e a transferência de informações recebidas das APIs do Google seguem a{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-primary underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de uso limitado.
        </p>
        <p>
          Você pode tocar em &quot;Desconectar&quot; no Monitor de Gmail a qualquer momento, e também remover
          o acesso do Capital na sua Conta Google, em{' '}
          <a
            href="https://myaccount.google.com/connections"
            className="text-primary underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            myaccount.google.com
          </a>
          .
        </p>
      </Section>

      <Section title="Apagar os seus dados">
        <p>
          Em Mais → Configurações você pode apagar os dados do orçamento, e em Mais → Módulos, desligar
          qualquer módulo. Para apagar a conta inteira, fale com quem administra o Capital (o contato aparece
          na tela de autorização do Google).
        </p>
      </Section>

      <p className="text-muted text-sm">
        {/* "/" opens the app for a signed-in person and the login for anyone else (see proxy.ts). */}
        <Link href="/" className="text-primary underline">
          Voltar ao Capital
        </Link>
      </p>
    </main>
  );
}
