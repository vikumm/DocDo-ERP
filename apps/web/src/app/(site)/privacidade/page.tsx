import type { Metadata } from "next";
import Link from "next/link";
import { CONSENT_VERSION } from "@/lib/constants";

export const metadata: Metadata = { title: "Política de Privacidade" };

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Quem trata seus dados",
    body: (
      <p>
        O DocDo é operado por [RAZÃO SOCIAL], CNPJ [00.000.000/0001-00], com sede em [ENDEREÇO] (“DocDo”). O encarregado pelo tratamento de dados pessoais
        (DPO) pode ser contatado em [E-MAIL DO ENCARREGADO].
      </p>
    ),
  },
  {
    title: "2. Quais dados coletamos",
    body: (
      <ul>
        <li><b>Cadastro:</b> nome, e-mail, telefone e, para médicos, CRM, especialidade e instituição.</li>
        <li><b>Dados de saúde:</b> arquivos de exames (DICOM), que podem conter seu nome e dados clínicos, e os modelos 3D reconstruídos a partir deles.</li>
        <li><b>Pagamentos:</b> plano escolhido, valor, forma e situação do pagamento.</li>
        <li><b>Registros de uso:</b> sessões abertas (data, IP e navegador) e quem abriu ou baixou cada exame.</li>
      </ul>
    ),
  },
  {
    title: "3. Para que usamos e com qual base legal",
    body: (
      <ul>
        <li>Reconstruir seus exames em 3D e disponibilizá-los a você e aos profissionais vinculados ao caso: consentimento (LGPD, art. 11, I) e tutela da saúde (art. 11, II, “f”).</li>
        <li>Criar e manter sua conta, cobrar e atender você: execução de contrato (art. 7º, V).</li>
        <li>Segurança, prevenção a fraudes e registros de acesso: cumprimento de obrigação legal e legítimo interesse (art. 7º, II e IX).</li>
      </ul>
    ),
  },
  {
    title: "4. Com quem compartilhamos",
    body: (
      <ul>
        <li>Com quem você vincula ao caso: o paciente, o médico responsável e as pessoas a quem você ou a equipe DocDo liberarem acesso.</li>
        <li>Com fornecedores que operam o serviço para nós (hospedagem e envio de e-mail), sob contrato e só para essa finalidade.</li>
        <li>Na <b>galeria pública</b>, apenas modelos 3D anonimizados, sem nome, data ou qualquer dado que identifique o paciente, e só com autorização.</li>
      </ul>
    ),
  },
  {
    title: "5. Como protegemos",
    body: (
      <p>
        Os arquivos de exames e modelos são cifrados (AES-256) no armazenamento, as senhas são guardadas com hash bcrypt, o tráfego usa HTTPS, o acesso a cada caso é
        verificado a cada requisição, administradores usam verificação em duas etapas e todo acesso a exames fica registrado.
      </p>
    ),
  },
  {
    title: "6. Por quanto tempo guardamos",
    body: <p>Enquanto sua conta estiver ativa ou pelo prazo exigido por lei. Ao pedir a exclusão, eliminamos seus dados em até 15 dias, exceto o que a lei obrigar a manter.</p>,
  },
  {
    title: "7. Seus direitos",
    body: (
      <ul>
        <li><b>Acesso e portabilidade:</b> baixe uma cópia dos seus dados em Perfil → Meus dados.</li>
        <li><b>Correção:</b> edite seus dados em Perfil.</li>
        <li><b>Eliminação e revogação do consentimento:</b> peça a exclusão da conta em Perfil → Excluir conta.</li>
        <li><b>Informação sobre compartilhamento:</b> cada caso mostra quem o acessou.</li>
        <li>Para outros pedidos, escreva para [E-MAIL DO ENCARREGADO]. Você também pode reclamar à ANPD.</li>
      </ul>
    ),
  },
  {
    title: "8. Cookies",
    body: <p>Usamos apenas um cookie essencial de sessão (para manter você conectado) e guardamos no seu navegador a preferência de tema claro ou escuro. Não usamos cookies de publicidade.</p>,
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-32 pb-24 sm:px-6">
      <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
        Minuta para revisão jurídica: os campos entre colchetes precisam ser preenchidos antes da publicação.
      </p>
      <h1 className="mt-8 text-4xl font-bold tracking-tight text-ink-50">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-ink-400">Versão {CONSENT_VERSION}</p>
      <div className="mt-10 space-y-8 text-ink-200 [&_li]:mt-2 [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="mb-3 text-lg font-semibold text-ink-50">{s.title}</h2>
            {s.body}
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-ink-400">
        Dúvidas? <Link href="/#contato" className="font-semibold text-brand-400">Fale com a gente</Link>.
      </p>
    </article>
  );
}
