import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

/** Logo do v4: "doc" branco no tema escuro, versão grafite no claro. */
export function Logo({ href = "/", className, mark = false }: { href?: string; className?: string; mark?: boolean }) {
  return (
    <Link href={href} className={clsx("inline-flex shrink-0 items-center", className)} aria-label="DocDo — início">
      {mark ? (
        <Image src="/brand/logo-mark.png" alt="DocDo" width={36} height={36} priority />
      ) : (
        <>
          <Image src="/brand/logo-light.png" alt="DocDo" width={122} height={40} priority className="only-light h-8 w-auto" />
          <Image src="/brand/logo.png" alt="DocDo" width={122} height={40} priority className="only-dark h-8 w-auto" />
        </>
      )}
    </Link>
  );
}
