import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { getMe, homeFor } from "@/lib/auth";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <>
      <Navbar loggedHref={me ? homeFor(me.user.role) : null} />
      <main>{children}</main>
      <Footer />
    </>
  );
}
